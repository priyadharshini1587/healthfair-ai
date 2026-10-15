from __future__ import annotations
from typing import Dict, List, Any, Optional
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, accuracy_score
from app.onnx_runner import OnnxModelRunner

def compute_permutation_importance(
    runner: OnnxModelRunner,
    df: pd.DataFrame,
    feature_columns: List[str],
    target_column: str,
    positive_label: str,
    group_columns: List[str],
    min_group_size: int = 5,
    max_eval_rows: int = 5000,
    n_repeats: int = 5
) -> Dict[str, Any]:
    # Cap evaluation rows for performance
    if len(df) > max_eval_rows:
        sample_df = df.sample(n=max_eval_rows, random_state=42).reset_index(drop=True)
    else:
        sample_df = df.copy().reset_index(drop=True)

    y_true = (sample_df[target_column].astype(str) == str(positive_label)).astype(int).to_numpy()
    X_orig = sample_df[feature_columns].to_numpy(dtype=np.float32)

    # Base inference
    probs_orig, labels_orig = runner.run(X_orig)
    has_auc = probs_orig is not None and len(np.unique(y_true)) > 1

    def eval_metric(y_t: np.ndarray, p_arr: Optional[np.ndarray], l_arr: np.ndarray) -> float:
        if has_auc and p_arr is not None:
            try:
                return float(roc_auc_score(y_t, p_arr))
            except Exception:
                pass
        return float(accuracy_score(y_t, l_arr))

    base_metric_overall = eval_metric(y_true, probs_orig, labels_orig)

    # Base metric per group
    base_metric_by_group: Dict[str, Dict[str, float]] = {}
    for attr in group_columns:
        if attr not in sample_df.columns:
            continue
        base_metric_by_group[attr] = {}
        for g, gdf in sample_df.groupby(attr):
            if len(gdf) >= min_group_size:
                idx = gdf.index.to_numpy()
                pg = probs_orig[idx] if probs_orig is not None else None
                lg = labels_orig[idx]
                yg = y_true[idx]
                base_metric_by_group[attr][str(g)] = eval_metric(yg, pg, lg)

    overall_importance: Dict[str, float] = {}
    by_group_importance: Dict[str, Dict[str, Dict[str, float]]] = {
        attr: {str(g): {} for g in base_metric_by_group[attr]} for attr in base_metric_by_group
    }

    n_features = len(feature_columns)

    for col_idx, col_name in enumerate(feature_columns):
        overall_drops = []
        group_drops: Dict[str, Dict[str, List[float]]] = {
            attr: {str(g): [] for g in base_metric_by_group[attr]} for attr in base_metric_by_group
        }

        for rep in range(n_repeats):
            rng = np.random.RandomState(42 + rep * 100 + col_idx)
            X_shuffled = X_orig.copy()
            shuffled_col = X_shuffled[:, col_idx].copy()
            rng.shuffle(shuffled_col)
            X_shuffled[:, col_idx] = shuffled_col

            p_shuf, l_shuf = runner.run(X_shuffled)

            # Overall drop
            metric_shuf = eval_metric(y_true, p_shuf, l_shuf)
            overall_drops.append(max(0.0, base_metric_overall - metric_shuf))

            # Group drops
            for attr in group_columns:
                if attr not in base_metric_by_group:
                    continue
                for g, gdf in sample_df.groupby(attr):
                    g_str = str(g)
                    if g_str in base_metric_by_group[attr]:
                        idx = gdf.index.to_numpy()
                        pg = p_shuf[idx] if p_shuf is not None else None
                        lg = l_shuf[idx]
                        yg = y_true[idx]
                        g_shuf_metric = eval_metric(yg, pg, lg)
                        group_drops[attr][g_str].append(
                            max(0.0, base_metric_by_group[attr][g_str] - g_shuf_metric)
                        )

        overall_importance[col_name] = round(float(np.mean(overall_drops)), 4)
        for attr in group_columns:
            if attr not in base_metric_by_group:
                continue
            for g_str in base_metric_by_group[attr]:
                avg_drop = float(np.mean(group_drops[attr][g_str])) if group_drops[attr][g_str] else 0.0
                by_group_importance[attr][g_str][col_name] = round(avg_drop, 4)

    return {
        "overall": overall_importance,
        "by_group": by_group_importance
    }

def compute_proxy_checks(
    df: pd.DataFrame,
    feature_columns: List[str],
    group_columns: List[str],
    proxy_threshold: float = 0.30
) -> List[Dict[str, Any]]:
    proxy_items: List[Dict[str, Any]] = []

    for feat in feature_columns:
        if feat not in df.columns:
            continue
        feat_series = pd.to_numeric(df[feat], errors="coerce").fillna(0.0).to_numpy(dtype=float)

        for attr in group_columns:
            if attr not in df.columns or attr == feat:
                continue
            attr_series = df[attr]
            if pd.api.types.is_numeric_dtype(attr_series):
                attr_vals = attr_series.fillna(0.0).to_numpy(dtype=float)
            else:
                attr_vals = pd.factorize(attr_series)[0].astype(float)

            # Pearson correlation
            std_feat = np.std(feat_series)
            std_attr = np.std(attr_vals)
            if std_feat > 1e-8 and std_attr > 1e-8:
                corr = float(np.corrcoef(feat_series, attr_vals)[0, 1])
                if np.isnan(corr):
                    corr = 0.0
            else:
                corr = 0.0

            corr_rounded = round(corr, 3)
            is_proxy = abs(corr) >= proxy_threshold

            proxy_items.append({
                "feature": feat,
                "attribute": attr,
                "correlation": corr_rounded,
                "is_proxy": is_proxy
            })

    # Sort so proxies and highest correlations come first
    proxy_items.sort(key=lambda x: (-abs(x["correlation"]), x["feature"], x["attribute"]))
    return proxy_items
