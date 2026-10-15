from __future__ import annotations
from typing import Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.model_selection import train_test_split
from app.metrics import compute_group_metrics

def apply_equal_opportunity_thresholds(
    df: pd.DataFrame,
    attribute: str,
    y_true: np.ndarray,
    probs: np.ndarray,
    baseline_recall: float,
    min_positives: int = 5,
    default_threshold: float = 0.35
) -> Tuple[np.ndarray, Dict[str, float]]:
    new_preds = np.zeros(len(y_true), dtype=int)
    thresholds: Dict[str, float] = {}

    for g, gdf in df.groupby(attribute):
        idx = gdf.index.to_numpy()
        yg = y_true[idx]
        pg = probs[idx]
        pos_mask = (yg == 1)

        if pos_mask.sum() >= min_positives:
            # (1 - target_TPR) quantile of actual positives predicted probabilities
            t_g = float(np.quantile(pg[pos_mask], max(0.0, min(1.0, 1.0 - baseline_recall))))
        else:
            t_g = default_threshold

        thresholds[str(g)] = round(t_g, 4)
        new_preds[idx] = (pg >= t_g).astype(int)

    return new_preds, thresholds

def apply_demographic_parity_thresholds(
    df: pd.DataFrame,
    attribute: str,
    probs: np.ndarray,
    baseline_selection_rate: float,
    default_threshold: float = 0.35
) -> Tuple[np.ndarray, Dict[str, float]]:
    new_preds = np.zeros(len(df), dtype=int)
    thresholds: Dict[str, float] = {}

    for g, gdf in df.groupby(attribute):
        idx = gdf.index.to_numpy()
        pg = probs[idx]

        if len(pg) >= 5:
            # (1 - target_SR) quantile of all probabilities in group
            t_g = float(np.quantile(pg, max(0.0, min(1.0, 1.0 - baseline_selection_rate))))
        else:
            t_g = default_threshold

        thresholds[str(g)] = round(t_g, 4)
        new_preds[idx] = (pg >= t_g).astype(int)

    return new_preds, thresholds

def apply_reweighing_and_retrain(
    df: pd.DataFrame,
    feature_columns: list[str],
    target_column: str,
    attribute: str,
    positive_label: str = "1"
) -> Dict[str, Any]:
    X = df[feature_columns].to_numpy(dtype=np.float32)
    y = (df[target_column].astype(str) == str(positive_label)).astype(int).to_numpy()
    groups = df[attribute].astype(str).to_numpy()

    # Stratified 70/30 train/test split
    indices = np.arange(len(df))
    train_idx, test_idx = train_test_split(
        indices, test_size=0.30, random_state=42, stratify=y
    )

    X_train, X_test = X[train_idx], X[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]
    g_train, g_test = groups[train_idx], groups[test_idx]
    df_test = df.iloc[test_idx].reset_index(drop=True)

    # Compute Kamiran-Calders reweighing weights on train set:
    # w(g, y) = P(g) * P(y) / P(g, y) = (n_g * n_y) / (n * n_gy)
    n_train = len(train_idx)
    sample_weights = np.ones(n_train, dtype=np.float64)

    unique_groups = np.unique(g_train)
    for g_val in unique_groups:
        for y_val in [0, 1]:
            mask = (g_train == g_val) & (y_train == y_val)
            n_gy = np.sum(mask)
            if n_gy > 0:
                n_g = np.sum(g_train == g_val)
                n_y = np.sum(y_train == y_val)
                weight = (n_g * n_y) / (n_train * n_gy)
                sample_weights[mask] = weight

    # Unweighted baseline model
    model_unweighted = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, random_state=42))
    model_unweighted.fit(X_train, y_train)

    probs_before = model_unweighted.predict_proba(X_test)[:, 1]
    preds_before = model_unweighted.predict(X_test)

    # Weighted model
    model_weighted = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, random_state=42))
    model_weighted.fit(X_train, y_train, logisticregression__sample_weight=sample_weights)

    probs_after = model_weighted.predict_proba(X_test)[:, 1]
    preds_after = model_weighted.predict(X_test)

    # Compute metrics on test set
    overall_before = compute_group_metrics(y_test, preds_before, probs_before)
    overall_after = compute_group_metrics(y_test, preds_after, probs_after)

    groups_before = {}
    groups_after = {}

    for g_val in unique_groups:
        mask_test = (g_test == g_val)
        if mask_test.sum() > 0:
            groups_before[str(g_val)] = compute_group_metrics(
                y_test[mask_test], preds_before[mask_test], probs_before[mask_test]
            )
            groups_after[str(g_val)] = compute_group_metrics(
                y_test[mask_test], preds_after[mask_test], probs_after[mask_test]
            )

    recalls_before = [m["recall"] for m in groups_before.values()]
    recalls_after = [m["recall"] for m in groups_after.values()]
    fprs_before = [m["fpr"] for m in groups_before.values()]
    fprs_after = [m["fpr"] for m in groups_after.values()]
    sels_before = [m["selection_rate"] for m in groups_before.values()]
    sels_after = [m["selection_rate"] for m in groups_after.values()]

    return {
        "method": "reweighing",
        "attribute": attribute,
        "thresholds": {str(g): 0.5 for g in unique_groups},
        "before": {
            "overall": overall_before,
            "groups": groups_before,
            "equal_opportunity_diff": float(max(recalls_before) - min(recalls_before)),
            "fpr_gap": float(max(fprs_before) - min(fprs_before)),
            "demographic_parity_diff": float(max(sels_before) - min(sels_before)),
        },
        "after": {
            "overall": overall_after,
            "groups": groups_after,
            "equal_opportunity_diff": float(max(recalls_after) - min(recalls_after)),
            "fpr_gap": float(max(fprs_after) - min(fprs_after)),
            "demographic_parity_diff": float(max(sels_after) - min(sels_after)),
        },
        "notes": "Pre-processing reweighing (Kamiran-Calders) trained a new LogisticRegression model on a 70% stratified training split with sample weights and evaluated on the held-out 30% test split."
    }
