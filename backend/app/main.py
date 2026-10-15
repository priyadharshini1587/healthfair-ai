from __future__ import annotations
import io
import json
import time
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from app.schemas import (
    InspectResponse, ColumnInspectInfo, OnnxInspectInfo,
    AuditConfig, AuditReport, MitigationResponse
)
from app.onnx_runner import OnnxModelRunner
from app.metrics import compute_group_metrics, compute_disparity_and_flags, bin_numeric_column
from app.mitigation import (
    apply_equal_opportunity_thresholds,
    apply_demographic_parity_thresholds,
    apply_reweighing_and_retrain
)
from app.explain import compute_permutation_importance, compute_proxy_checks

app = FastAPI(title="HealthFair AI API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_MODEL_SIZE = 100 * 1024 * 1024  # 100 MB
MAX_CSV_SIZE = 25 * 1024 * 1024     # 25 MB

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0"}

def validate_files_raw(model_file: UploadFile, dataset_file: UploadFile, model_bytes: bytes, csv_bytes: bytes):
    if not (model_file.filename or "").lower().endswith(".onnx"):
        raise HTTPException(status_code=400, detail="Model file must be a .onnx file.")
    if not (dataset_file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Dataset file must be a .csv file.")
    if len(model_bytes) == 0:
        raise HTTPException(status_code=400, detail="Model file is empty.")
    if len(csv_bytes) == 0:
        raise HTTPException(status_code=400, detail="Dataset file is empty.")
    if len(model_bytes) > MAX_MODEL_SIZE:
        raise HTTPException(status_code=400, detail="Model file exceeds 100 MB limit.")
    if len(csv_bytes) > MAX_CSV_SIZE:
        raise HTTPException(status_code=400, detail="Dataset file exceeds 25 MB limit.")

def parse_csv_df(csv_bytes: bytes) -> pd.DataFrame:
    try:
        return pd.read_csv(io.BytesIO(csv_bytes))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV file: {e}")

@app.post("/api/inspect", response_model=InspectResponse)
async def inspect_files(
    model: UploadFile = File(...),
    dataset: UploadFile = File(...)
):
    model_bytes = await model.read()
    csv_bytes = await dataset.read()
    validate_files_raw(model, dataset, model_bytes, csv_bytes)

    try:
        runner = OnnxModelRunner(model_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ONNX model: {e}")

    df = parse_csv_df(csv_bytes)

    columns_info: List[ColumnInspectInfo] = []
    for col in df.columns:
        is_num = pd.api.types.is_numeric_dtype(df[col])
        missing_count = int(df[col].isnull().sum())
        unique_count = int(df[col].nunique(dropna=False))
        # sample 5 unique non-null values
        sample_vals = df[col].dropna().unique()[:5].tolist()
        sample_clean = [
            None if (isinstance(v, float) and np.isnan(v)) else (int(v) if isinstance(v, (np.integer, int)) else v)
            for v in sample_vals
        ]

        columns_info.append(ColumnInspectInfo(
            name=str(col),
            dtype=str(df[col].dtype),
            is_numeric=bool(is_num),
            missing=missing_count,
            unique=unique_count,
            sample=sample_clean
        ))

    preview_rows = df.head(5).replace({np.nan: None}).to_dict(orient="records")

    return InspectResponse(
        rows=len(df),
        columns=columns_info,
        preview=preview_rows,
        onnx=OnnxInspectInfo(
            input_name=runner.input_name,
            input_shape=list(runner.input_shape),
            n_features=runner.get_expected_feature_count(),
            output_names=runner.output_names
        )
    )

def validate_and_prepare_audit(df: pd.DataFrame, runner: OnnxModelRunner, config: AuditConfig):
    # 1. Feature count check
    expected_m = runner.get_expected_feature_count()
    actual_n = len(config.feature_columns)
    if expected_m is not None and actual_n != expected_m:
        raise HTTPException(
            status_code=400,
            detail=f"The model expects {expected_m} input features but {actual_n} were selected."
        )

    # 2. Check feature columns exist
    for col in config.feature_columns:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Feature column '{col}' not found in dataset.")

    # 3. Check all selected features are numeric
    for col in config.feature_columns:
        if not pd.api.types.is_numeric_dtype(df[col]):
            raise HTTPException(
                status_code=400,
                detail="All selected model features must be numeric. Encode categorical features as required by your model."
            )

    # 4. Check for missing values in selected feature columns
    missing_in_features = df[config.feature_columns].isnull().sum().sum()
    if missing_in_features > 0:
        raise HTTPException(
            status_code=400,
            detail="Selected feature columns contain missing values. Impute or remove missing rows first."
        )

    # 5. Check target column exists
    if config.target_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Target column '{config.target_column}' not found in dataset."
        )

    # 6. Drop rows where target column is missing, and record rows dropped
    initial_rows = len(df)
    target_missing = int(df[config.target_column].isnull().sum())
    clean_df = df.dropna(subset=[config.target_column]).copy().reset_index(drop=True)
    rows_dropped = target_missing

    if len(clean_df) == 0:
        raise HTTPException(status_code=400, detail="Target column has only missing values.")

    # 7. Check positive label
    clean_target_strs = clean_df[config.target_column].astype(str).tolist()
    unique_target_vals = set(clean_target_strs)
    if str(config.positive_label) not in unique_target_vals:
        raise HTTPException(
            status_code=400,
            detail=f"Positive label '{config.positive_label}' not found in target column."
        )

    y = (clean_df[config.target_column].astype(str) == str(config.positive_label)).astype(int).to_numpy()
    if len(np.unique(y)) < 2:
        raise HTTPException(
            status_code=400,
            detail="Target column contains only one class after filtering."
        )

    return clean_df, y, rows_dropped

@app.post("/api/audit", response_model=AuditReport)
async def audit_model(
    model: UploadFile = File(...),
    dataset: UploadFile = File(...),
    config: str = Form(...)
):
    model_bytes = await model.read()
    csv_bytes = await dataset.read()
    validate_files_raw(model, dataset, model_bytes, csv_bytes)

    try:
        config_dict = json.loads(config)
        audit_config = AuditConfig(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config JSON: {e}")

    try:
        runner = OnnxModelRunner(model_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ONNX model: {e}")

    df = parse_csv_df(csv_bytes)
    clean_df, y, rows_dropped = validate_and_prepare_audit(df, runner, audit_config)

    # Process group columns: handle numeric binning
    processed_df = clean_df.copy()
    bin_edges_meta: Dict[str, List[float]] = {}
    for col in audit_config.group_columns:
        if col in processed_df.columns:
            binned_col, edges = bin_numeric_column(processed_df[col], max_unique=8, n_bins=4)
            processed_df[col] = binned_col
            if edges:
                bin_edges_meta[col] = edges

    # Run inference
    X = processed_df[audit_config.feature_columns].to_numpy(dtype=np.float32)
    probs, labels = runner.run(X)

    # Compute overall metrics
    overall_metrics = compute_group_metrics(y, labels, probs)

    # Compute group metrics
    group_metrics_map: Dict[str, Dict[str, Any]] = {}
    for attr in audit_config.group_columns:
        if attr not in processed_df.columns:
            continue
        group_metrics_map[attr] = {}
        for g, gdf in processed_df.groupby(attr):
            idx = gdf.index.to_numpy()
            is_exc = bool(len(idx) < audit_config.min_group_size)
            pg = probs[idx] if probs is not None else None
            group_metrics_map[attr][str(g)] = compute_group_metrics(
                y[idx], labels[idx], pg, is_excluded=is_exc
            )

    # Compute disparity & flags
    disparity_map, flags_list = compute_disparity_and_flags(
        group_metrics_map,
        flag_threshold=audit_config.flag_threshold,
        min_group_size=audit_config.min_group_size
    )

    # Explainability: Permutation importance & proxy checks
    importance_result = compute_permutation_importance(
        runner=runner,
        df=processed_df,
        feature_columns=audit_config.feature_columns,
        target_column=audit_config.target_column,
        positive_label=audit_config.positive_label,
        group_columns=audit_config.group_columns,
        min_group_size=audit_config.min_group_size
    )

    proxy_checks = compute_proxy_checks(
        df=processed_df,
        feature_columns=audit_config.feature_columns,
        group_columns=audit_config.group_columns,
        proxy_threshold=0.30
    )

    meta = {
        "total_rows": len(df),
        "evaluated_rows": len(clean_df),
        "rows_dropped": rows_dropped,
        "bin_edges": bin_edges_meta,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "model_name": model.filename or "model.onnx",
        "dataset_name": dataset.filename or "dataset.csv",
        "onnx_input_name": runner.input_name,
        "onnx_output_names": runner.output_names,
    }

    return AuditReport(
        overall=overall_metrics,
        groups=group_metrics_map,
        disparity=disparity_map,
        flags=flags_list,
        importance=importance_result,
        proxy_check=proxy_checks,
        config=audit_config,
        meta=meta
    )

@app.post("/api/mitigate", response_model=MitigationResponse)
async def mitigate_bias(
    model: UploadFile = File(...),
    dataset: UploadFile = File(...),
    config: str = Form(...),
    method: str = Form("equal_opportunity"),
    attribute: str = Form("age_group")
):
    model_bytes = await model.read()
    csv_bytes = await dataset.read()
    validate_files_raw(model, dataset, model_bytes, csv_bytes)

    try:
        config_dict = json.loads(config)
        audit_config = AuditConfig(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config JSON: {e}")

    try:
        runner = OnnxModelRunner(model_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ONNX model: {e}")

    df = parse_csv_df(csv_bytes)
    clean_df, y, _ = validate_and_prepare_audit(df, runner, audit_config)

    # Bin numeric attribute if needed
    processed_df = clean_df.copy()
    if attribute in processed_df.columns:
        binned_col, _ = bin_numeric_column(processed_df[attribute], max_unique=8, n_bins=4)
        processed_df[attribute] = binned_col

    if method == "reweighing":
        result = apply_reweighing_and_retrain(
            df=processed_df,
            feature_columns=audit_config.feature_columns,
            target_column=audit_config.target_column,
            attribute=attribute,
            positive_label=audit_config.positive_label
        )
        return MitigationResponse(**result)

    # Post-processing methods: need model probability output
    X = processed_df[audit_config.feature_columns].to_numpy(dtype=np.float32)
    probs, labels_orig = runner.run(X)

    if probs is None:
        raise HTTPException(
            status_code=400,
            detail="Model does not provide continuous probabilities; post-processing threshold mitigation requires probability outputs."
        )

    overall_before = compute_group_metrics(y, labels_orig, probs)
    groups_before = {}
    for g, gdf in processed_df.groupby(attribute):
        idx = gdf.index.to_numpy()
        groups_before[str(g)] = compute_group_metrics(y[idx], labels_orig[idx], probs[idx])

    recalls_before = [m["recall"] for m in groups_before.values()]
    fprs_before = [m["fpr"] for m in groups_before.values()]
    sels_before = [m["selection_rate"] for m in groups_before.values()]

    if method == "equal_opportunity":
        new_preds, thresholds = apply_equal_opportunity_thresholds(
            df=processed_df,
            attribute=attribute,
            y_true=y,
            probs=probs,
            baseline_recall=overall_before["recall"]
        )
        notes = f"Adjusted decision thresholds per {attribute} group to match the baseline overall recall ({overall_before['recall']*100:.1f}%)."
    elif method == "demographic_parity":
        new_preds, thresholds = apply_demographic_parity_thresholds(
            df=processed_df,
            attribute=attribute,
            probs=probs,
            baseline_selection_rate=overall_before["selection_rate"]
        )
        notes = f"Adjusted decision thresholds per {attribute} group to equalize selection rates to baseline ({overall_before['selection_rate']*100:.1f}%)."
    else:
        raise HTTPException(status_code=400, detail=f"Unknown mitigation method: {method}")

    overall_after = compute_group_metrics(y, new_preds, probs)
    groups_after = {}
    for g, gdf in processed_df.groupby(attribute):
        idx = gdf.index.to_numpy()
        groups_after[str(g)] = compute_group_metrics(y[idx], new_preds[idx], probs[idx])

    recalls_after = [m["recall"] for m in groups_after.values()]
    fprs_after = [m["fpr"] for m in groups_after.values()]
    sels_after = [m["selection_rate"] for m in groups_after.values()]

    return MitigationResponse(
        method=method,
        attribute=attribute,
        thresholds=thresholds,
        before={
            "overall": overall_before,
            "groups": groups_before,
            "equal_opportunity_diff": float(max(recalls_before) - min(recalls_before)),
            "fpr_gap": float(max(fprs_before) - min(fprs_before)),
            "demographic_parity_diff": float(max(sels_before) - min(sels_before)),
        },
        after={
            "overall": overall_after,
            "groups": groups_after,
            "equal_opportunity_diff": float(max(recalls_after) - min(recalls_after)),
            "fpr_gap": float(max(fprs_after) - min(fprs_after)),
            "demographic_parity_diff": float(max(sels_after) - min(sels_after)),
        },
        notes=notes
    )

@app.post("/api/mitigate/predictions")
async def export_mitigated_predictions(
    model: UploadFile = File(...),
    dataset: UploadFile = File(...),
    config: str = Form(...),
    method: str = Form("equal_opportunity"),
    attribute: str = Form("age_group")
):
    model_bytes = await model.read()
    csv_bytes = await dataset.read()
    validate_files_raw(model, dataset, model_bytes, csv_bytes)

    try:
        config_dict = json.loads(config)
        audit_config = AuditConfig(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid config JSON: {e}")

    try:
        runner = OnnxModelRunner(model_bytes)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ONNX model: {e}")

    df = parse_csv_df(csv_bytes)
    clean_df, y, _ = validate_and_prepare_audit(df, runner, audit_config)

    processed_df = clean_df.copy()
    if attribute in processed_df.columns:
        binned_col, _ = bin_numeric_column(processed_df[attribute], max_unique=8, n_bins=4)
        processed_df[attribute] = binned_col

    X = processed_df[audit_config.feature_columns].to_numpy(dtype=np.float32)
    probs, labels_orig = runner.run(X)

    if probs is None:
        raise HTTPException(status_code=400, detail="Model does not provide continuous probabilities.")

    baseline_recall = float(np.sum((y == 1) & (labels_orig == 1)) / max(1, np.sum(y == 1)))
    baseline_sel = float(np.mean(labels_orig))

    if method == "equal_opportunity":
        new_preds, thresholds = apply_equal_opportunity_thresholds(
            df=processed_df,
            attribute=attribute,
            y_true=y,
            probs=probs,
            baseline_recall=baseline_recall
        )
    elif method == "demographic_parity":
        new_preds, thresholds = apply_demographic_parity_thresholds(
            df=processed_df,
            attribute=attribute,
            probs=probs,
            baseline_selection_rate=baseline_sel
        )
    else:
        # Default fallback
        new_preds, thresholds = apply_equal_opportunity_thresholds(
            df=processed_df,
            attribute=attribute,
            y_true=y,
            probs=probs,
            baseline_recall=baseline_recall
        )

    out_df = clean_df.copy()
    out_df["original_probability"] = np.round(probs, 4)
    out_df["original_prediction"] = labels_orig
    out_df["mitigated_group"] = processed_df[attribute]
    out_df["mitigated_threshold"] = processed_df[attribute].map(thresholds).fillna(0.35)
    out_df["mitigated_prediction"] = new_preds

    stream = io.StringIO()
    out_df.to_csv(stream, index=False)
    stream.seek(0)

    filename = f"healthfair_{method}_{attribute}_predictions.csv"
    return StreamingResponse(
        iter([stream.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
