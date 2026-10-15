from __future__ import annotations
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field

class ColumnInspectInfo(BaseModel):
    name: str
    dtype: str
    is_numeric: bool
    missing: int
    unique: int
    sample: List[Any]

class OnnxInspectInfo(BaseModel):
    input_name: str
    input_shape: List[Any]
    n_features: Optional[int] = None
    output_names: List[str]

class InspectResponse(BaseModel):
    rows: int
    columns: List[ColumnInspectInfo]
    preview: List[Dict[str, Any]]
    onnx: OnnxInspectInfo

class AuditConfig(BaseModel):
    feature_columns: List[str]
    target_column: str
    positive_label: str = "1"
    group_columns: List[str]
    flag_threshold: float = 0.10
    min_group_size: int = 5

class GroupMetrics(BaseModel):
    n: int
    tp: int
    fp: int
    tn: int
    fn: int
    accuracy: float
    precision: float
    recall: float
    fpr: float
    f1: float
    selection_rate: float
    auc: Optional[float] = None
    is_excluded: bool = False

class DisparityMetrics(BaseModel):
    demographic_parity_diff: float
    disparate_impact_ratio: float
    equal_opportunity_diff: float
    fpr_gap: float
    equalized_odds_diff: float
    accuracy_gap: float

class DisparityFlag(BaseModel):
    metric: str
    attribute: str
    best_group: str
    worst_group: str
    gap: float
    severity: str  # "High" or "Moderate"
    ratio: Optional[float] = None

class ImportanceResult(BaseModel):
    overall: Dict[str, float]
    by_group: Dict[str, Dict[str, Dict[str, float]]]

class ProxyCheckItem(BaseModel):
    feature: str
    attribute: str
    correlation: float
    is_proxy: bool

class AuditReport(BaseModel):
    overall: GroupMetrics
    groups: Dict[str, Dict[str, GroupMetrics]]
    disparity: Dict[str, DisparityMetrics]
    flags: List[DisparityFlag]
    importance: ImportanceResult
    proxy_check: List[ProxyCheckItem]
    config: AuditConfig
    meta: Dict[str, Any]

class MitigationResponse(BaseModel):
    method: str
    attribute: str
    thresholds: Dict[str, float]
    before: Dict[str, Any]
    after: Dict[str, Any]
    notes: str
