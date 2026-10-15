from __future__ import annotations
from typing import Dict, List, Tuple, Any, Optional
import numpy as np
import pandas as pd
from sklearn.metrics import confusion_matrix, roc_auc_score

def compute_group_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: Optional[np.ndarray] = None,
    is_excluded: bool = False
) -> Dict[str, Any]:
    n = int(len(y_true))
    if n == 0:
        return {
            "n": 0, "tp": 0, "fp": 0, "tn": 0, "fn": 0,
            "accuracy": 0.0, "precision": 0.0, "recall": 0.0,
            "fpr": 0.0, "f1": 0.0, "selection_rate": 0.0,
            "auc": None, "is_excluded": is_excluded
        }

    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = [int(v) for v in cm.ravel()]

    accuracy = (tp + tn) / n if n > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    selection_rate = (tp + fp) / n if n > 0 else 0.0

    auc: Optional[float] = None
    if y_prob is not None and len(np.unique(y_true)) > 1:
        try:
            auc_val = float(roc_auc_score(y_true, y_prob))
            auc = round(auc_val, 3)
        except Exception:
            auc = None

    return {
        "n": n, "tp": tp, "fp": fp, "tn": tn, "fn": fn,
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "fpr": float(fpr),
        "f1": float(f1),
        "selection_rate": float(selection_rate),
        "auc": auc,
        "is_excluded": is_excluded
    }

def compute_disparity_and_flags(
    group_metrics: Dict[str, Dict[str, Any]],
    flag_threshold: float = 0.10,
    min_group_size: int = 5
) -> Tuple[Dict[str, Dict[str, float]], List[Dict[str, Any]]]:
    disparity_results: Dict[str, Dict[str, float]] = {}
    flags: List[Dict[str, Any]] = []

    metrics_to_check = ["accuracy", "precision", "recall", "fpr", "selection_rate", "f1"]

    for attr, groups in group_metrics.items():
        # Filter eligible groups (n >= min_group_size)
        eligible = {g: m for g, m in groups.items() if m["n"] >= min_group_size and not m.get("is_excluded", False)}
        if len(eligible) < 2:
            # Need at least two groups to compute gaps
            disparity_results[attr] = {
                "demographic_parity_diff": 0.0,
                "disparate_impact_ratio": 1.0,
                "equal_opportunity_diff": 0.0,
                "fpr_gap": 0.0,
                "equalized_odds_diff": 0.0,
                "accuracy_gap": 0.0,
            }
            continue

        sel_rates = [m["selection_rate"] for m in eligible.values()]
        recalls = [m["recall"] for m in eligible.values()]
        fprs = [m["fpr"] for m in eligible.values()]
        accs = [m["accuracy"] for m in eligible.values()]

        max_sel = max(sel_rates)
        min_sel = min(sel_rates)
        dp_diff = max_sel - min_sel
        di_ratio = (min_sel / max_sel) if max_sel > 0 else (1.0 if min_sel == 0 else 0.0)
        eo_diff = max(recalls) - min(recalls)
        fpr_gap = max(fprs) - min(fprs)
        eq_odds = max(eo_diff, fpr_gap)
        acc_gap = max(accs) - min(accs)

        disparity_results[attr] = {
            "demographic_parity_diff": float(dp_diff),
            "disparate_impact_ratio": float(di_ratio),
            "equal_opportunity_diff": float(eo_diff),
            "fpr_gap": float(fpr_gap),
            "equalized_odds_diff": float(eq_odds),
            "accuracy_gap": float(acc_gap),
        }

        # Check metric gaps
        for m_name in metrics_to_check:
            vals = {g: m[m_name] for g, m in eligible.items()}
            sorted_groups = sorted(vals.items(), key=lambda x: x[1])
            min_g, min_val = sorted_groups[0]
            max_g, max_val = sorted_groups[-1]
            gap = max_val - min_val

            if gap >= flag_threshold:
                severity = "High" if gap >= (2.0 * flag_threshold) else "Moderate"
                # For FPR, lower is generally better
                if m_name == "fpr":
                    best_group = min_g
                    worst_group = max_g
                else:
                    best_group = max_g
                    worst_group = min_g

                flags.append({
                    "metric": m_name,
                    "attribute": attr,
                    "best_group": best_group,
                    "worst_group": worst_group,
                    "gap": float(gap),
                    "severity": severity,
                    "ratio": None
                })

        # Disparate impact ratio flag (four-fifths rule: < 0.8)
        if di_ratio < 0.80:
            severity = "High" if di_ratio < 0.60 else "Moderate"
            # find best and worst selection groups
            sels = {g: m["selection_rate"] for g, m in eligible.items()}
            sorted_sels = sorted(sels.items(), key=lambda x: x[1])
            flags.append({
                "metric": "disparate_impact_ratio",
                "attribute": attr,
                "best_group": sorted_sels[-1][0],
                "worst_group": sorted_sels[0][0],
                "gap": float(1.0 - di_ratio),
                "severity": severity,
                "ratio": float(di_ratio)
            })

    # Sort flags by severity (High first) then gap descending
    severity_order = {"High": 0, "Moderate": 1}
    flags.sort(key=lambda f: (severity_order.get(f["severity"], 2), -f["gap"]))

    return disparity_results, flags

def bin_numeric_column(series: pd.Series, max_unique: int = 8, n_bins: int = 4) -> Tuple[pd.Series, Optional[List[float]]]:
    if pd.api.types.is_numeric_dtype(series) and series.nunique() > max_unique:
        try:
            binned, bin_edges = pd.qcut(series, q=n_bins, retbins=True, duplicates="drop")
            labels = []
            for cat in binned.cat.categories:
                labels.append(f"{cat.left:.1f}–{cat.right:.1f}")
            binned_named = binned.cat.rename_categories(labels).astype(str)
            return binned_named, [float(e) for e in bin_edges]
        except Exception:
            return series.astype(str), None
    return series.astype(str), None
