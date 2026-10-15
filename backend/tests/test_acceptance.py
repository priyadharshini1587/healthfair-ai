from __future__ import annotations
import json
import os
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

SAMPLE_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "health_bias_model.onnx")
SAMPLE_DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "health_fairness_dataset.csv")
SAMPLE_MISSING_DATASET_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "health_fairness_dataset_missing.csv")
EXPECTED_RESULTS_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "sample_data", "expected_results.json")

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

@pytest.fixture(scope="module")
def audit_response():
    with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
        res = client.post(
            "/api/audit",
            files={
                "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                "dataset": ("health_fairness_dataset.csv", df, "text/csv")
            },
            data={"config": json.dumps(CONFIG)}
        )
    assert res.status_code == 200, res.text
    return res.json()

@pytest.fixture(scope="module")
def expected_results():
    with open(EXPECTED_RESULTS_PATH, "r") as f:
        return json.load(f)

def test_overall_metrics(audit_response, expected_results):
    overall = audit_response["overall"]
    exp = expected_results["overall"]
    tol = 0.002

    assert overall["n"] == 12000
    assert overall["accuracy"] == pytest.approx(0.793, abs=tol)
    assert overall["precision"] == pytest.approx(0.545, abs=tol)
    assert overall["recall"] == pytest.approx(0.551, abs=tol)
    assert overall["fpr"] == pytest.approx(0.136, abs=tol)
    assert overall["f1"] == pytest.approx(0.548, abs=tol)
    assert overall["selection_rate"] == pytest.approx(0.231, abs=tol)
    assert overall["auc"] == pytest.approx(0.827, abs=tol)

def test_recall_by_group(audit_response):
    groups = audit_response["groups"]
    tol = 0.002

    # age_group recall
    assert groups["age_group"]["18-30"]["recall"] == pytest.approx(0.777, abs=tol)
    assert groups["age_group"]["31-45"]["recall"] == pytest.approx(0.601, abs=tol)
    assert groups["age_group"]["46-60"]["recall"] == pytest.approx(0.456, abs=tol)
    assert groups["age_group"]["60+"]["recall"] == pytest.approx(0.681, abs=tol)

    # gender recall
    assert groups["gender"]["Female"]["recall"] == pytest.approx(0.684, abs=tol)
    assert groups["gender"]["Male"]["recall"] == pytest.approx(0.531, abs=tol)
    assert groups["gender"]["Other"]["recall"] == pytest.approx(0.405, abs=tol)

    # region recall
    assert groups["region"]["Rural"]["recall"] == pytest.approx(0.713, abs=tol)
    assert groups["region"]["Semi-Urban"]["recall"] == pytest.approx(0.489, abs=tol)
    assert groups["region"]["Urban"]["recall"] == pytest.approx(0.565, abs=tol)

def test_other_group_figures(audit_response):
    groups = audit_response["groups"]
    tol = 0.002

    # 60+ precision 25.3 % and F1 36.8 %
    assert groups["age_group"]["60+"]["precision"] == pytest.approx(0.253, abs=tol)
    assert groups["age_group"]["60+"]["f1"] == pytest.approx(0.368, abs=tol)

    # Female precision 29.6 %
    assert groups["gender"]["Female"]["precision"] == pytest.approx(0.296, abs=tol)

    # Rural precision 27.0 %
    assert groups["region"]["Rural"]["precision"] == pytest.approx(0.270, abs=tol)

    # accuracy for Female 83.5 % vs Male 76.5 %
    assert groups["gender"]["Female"]["accuracy"] == pytest.approx(0.835, abs=tol)
    assert groups["gender"]["Male"]["accuracy"] == pytest.approx(0.765, abs=tol)

def test_disparity_and_flags(audit_response):
    disp = audit_response["disparity"]
    flags = audit_response["flags"]
    tol = 0.002

    # Disparity (equal-opportunity difference):
    assert disp["age_group"]["equal_opportunity_diff"] == pytest.approx(0.322, abs=tol)
    assert disp["gender"]["equal_opportunity_diff"] == pytest.approx(0.279, abs=tol)
    assert disp["region"]["equal_opportunity_diff"] == pytest.approx(0.223, abs=tol)

    # Disparate-impact ratio:
    assert disp["age_group"]["disparate_impact_ratio"] == pytest.approx(0.69, abs=0.01)
    assert disp["gender"]["disparate_impact_ratio"] == pytest.approx(0.77, abs=0.01)
    assert disp["region"]["disparate_impact_ratio"] == pytest.approx(0.87, abs=0.01)

    # Disparate impact ratio flags: age_group and gender flagged (< 0.8), region not flagged
    di_flags = [f for f in flags if f["metric"] == "disparate_impact_ratio"]
    di_attrs = [f["attribute"] for f in di_flags]
    assert "age_group" in di_attrs
    assert "gender" in di_attrs
    assert "region" not in di_attrs

    # The audit must produce flags for recall on all three attributes, rated High (gap >= 20%)
    recall_flags = [f for f in flags if f["metric"] == "recall"]
    recall_attrs = [f["attribute"] for f in recall_flags]
    assert "age_group" in recall_attrs
    assert "gender" in recall_attrs
    assert "region" in recall_attrs
    for rf in recall_flags:
        assert rf["severity"] == "High"
        assert rf["gap"] >= 0.20

def test_mitigation_method_1():
    # Test each attribute for method 1 (equal-opportunity thresholds)
    expected_thresholds = {
        "age_group": {"18-30": 0.517, "31-45": 0.385, "46-60": 0.287, "60+": 0.451},
        "gender": {"Female": 0.453, "Male": 0.337, "Other": 0.302},
        "region": {"Rural": 0.517, "Semi-Urban": 0.313, "Urban": 0.360}
    }
    expected_acc_after = {
        "age_group": 0.810,
        "gender": 0.811,
        "region": 0.805
    }

    for attr, target_thresh in expected_thresholds.items():
        with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
            res = client.post(
                "/api/mitigate",
                files={
                    "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                    "dataset": ("health_fairness_dataset.csv", df, "text/csv")
                },
                data={
                    "config": json.dumps(CONFIG),
                    "method": "equal_opportunity",
                    "attribute": attr
                }
            )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["method"] == "equal_opportunity"
        assert data["attribute"] == attr

        # Check thresholds within ±0.01
        for g, exp_t in target_thresh.items():
            assert g in data["thresholds"]
            assert data["thresholds"][g] == pytest.approx(exp_t, abs=0.01)

        # Gap after must be below 2 % (0.02)
        gap_after = data["after"]["equal_opportunity_diff"]
        assert gap_after < 0.02

        # Overall accuracy after must not drop below 79 %
        acc_after = data["after"]["overall"]["accuracy"]
        assert acc_after >= 0.79
        assert acc_after == pytest.approx(expected_acc_after[attr], abs=0.005)

def test_failure_paths():
    # 1. Missing values in feature column: returns exactly
    # "Selected feature columns contain missing values. Impute or remove missing rows first."
    if os.path.exists(SAMPLE_MISSING_DATASET_PATH):
        with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_MISSING_DATASET_PATH, "rb") as df:
            res = client.post(
                "/api/audit",
                files={
                    "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                    "dataset": ("health_fairness_dataset.csv", df, "text/csv")
                },
                data={"config": json.dumps(CONFIG)}
            )
            assert res.status_code == 400
            assert res.json()["detail"] == "Selected feature columns contain missing values. Impute or remove missing rows first."

    # 2. Selecting gender (non-numeric) as a feature: returns exactly
    # "All selected model features must be numeric. Encode categorical features as required by your model."
    bad_config_feat = dict(CONFIG)
    bad_config_feat["feature_columns"] = [
        "age", "gender", "fasting_glucose", "systolic_bp",
        "cholesterol", "smoker", "physical_activity_hrs_week", "family_history"
    ]
    with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
        res = client.post(
            "/api/audit",
            files={
                "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                "dataset": ("health_fairness_dataset.csv", df, "text/csv")
            },
            data={"config": json.dumps(bad_config_feat)}
        )
        assert res.status_code == 400
        assert res.json()["detail"] == "All selected model features must be numeric. Encode categorical features as required by your model."

    # 3. Selecting 7 features instead of 8: returns exactly
    # "The model expects 8 input features but 7 were selected."
    bad_config_count = dict(CONFIG)
    bad_config_count["feature_columns"] = CONFIG["feature_columns"][:7]
    with open(SAMPLE_MODEL_PATH, "rb") as mf, open(SAMPLE_DATASET_PATH, "rb") as df:
        res = client.post(
            "/api/audit",
            files={
                "model": ("health_bias_model.onnx", mf, "application/octet-stream"),
                "dataset": ("health_fairness_dataset.csv", df, "text/csv")
            },
            data={"config": json.dumps(bad_config_count)}
        )
        assert res.status_code == 400
        assert res.json()["detail"] == "The model expects 8 input features but 7 were selected."
