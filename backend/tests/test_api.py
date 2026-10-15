from __future__ import annotations
import json
import os
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

SAMPLE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "health_bias_model.onnx")
SAMPLE_DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "health_fairness_dataset.csv")

CONFIG = {
    "feature_columns": [
        "age", "bmi", "fasting_glucose", "systolic_bp",
        "cholesterol", "smoker", "physical_activity_hrs_week", "family_history"
    ],
    "target_column": "diabetes_risk",
    "positive_label": "1",
    "group_columns": ["age_group", "gender", "region"],
    "flag_threshold": 0.10,
    "min_group_size": 5
}

def test_health_check():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": "1.0"}

def test_inspect_endpoint():
    with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
        res = client.post(
            "/api/inspect",
            files={
                "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                "dataset": ("health_fairness_dataset.csv", df, "text/csv")
            }
        )
    assert res.status_code == 200
    data = res.json()
    assert data["rows"] == 12000
    assert len(data["columns"]) == 13
    assert len(data["preview"]) == 5
    assert data["onnx"]["n_features"] == 8
    assert "probability" in data["onnx"]["output_names"]
    assert "label" in data["onnx"]["output_names"]

def test_mitigate_predictions_download():
    with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
        res = client.post(
            "/api/mitigate/predictions",
            files={
                "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                "dataset": ("health_fairness_dataset.csv", df, "text/csv")
            },
            data={
                "config": json.dumps(CONFIG),
                "method": "equal_opportunity",
                "attribute": "age_group"
            }
        )
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    lines = res.text.strip().splitlines()
    header = [c.strip() for c in lines[0].split(",")]
    assert "original_prediction" in header
    assert "mitigated_prediction" in header
    assert len(lines) == 12001 # 12000 rows + header
