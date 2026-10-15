# HealthFair AI — Bias & Fairness Auditor for Health Models

A full-stack, local-first web application for auditing demographic bias and fairness in healthcare machine learning models (SDG 3: HealthTech for Well-Being, Problem HT-25).

Users upload an **ONNX** health prediction model and a labelled **CSV** dataset with demographic attributes. HealthFair AI evaluates group-level error rates, flags disparities across sensitive attributes (age, gender, region), explains what drives those disparities with explainable AI (permutation importance and proxy detection), and provides three algorithmic mitigation methods with before-and-after benchmarking.

---

## Key Features

1. **In-Memory & Privacy-First**: Models and datasets are processed strictly in memory and never written to disk. Session history resides in frontend memory.
2. **Comprehensive Metrics**:
   - Diagnostic performance: Accuracy, Precision, Recall (TPR), False Positive Rate (FPR), F1 Score, Selection Rate, and ROC-AUC.
   - Disparity criteria: Demographic Parity Difference, Disparate Impact Ratio (four-fifths rule), Equal Opportunity Difference (Recall Gap), Equalized Odds, FPR Gap, Accuracy Gap.
3. **Automated Auditing & Flagging**: High and Moderate severity flags for performance gaps exceeding user-defined thresholds (1–50%).
4. **Explainable AI (XAI)**:
   - Model-agnostic Permutation Feature Importance (overall and per demographic group).
   - Sensitive proxy correlation check (|r| ≥ 0.30 warning badges).
5. **Algorithmic Mitigation & Benchmarking**:
   - **Method 1**: Equal Opportunity Thresholds (post-processing, group quantile calibration to baseline TPR).
   - **Method 2**: Demographic Parity Thresholds (post-processing, group quantile calibration to baseline selection rate).
   - **Method 3**: Reweighing + Retrain (pre-processing, Kamiran–Calders weights on 70/30 stratified train/test split).
   - Side-by-side before/after comparisons and mitigated predictions CSV export.
6. **Model Benchmarking & Comparison**: Compare any two audit runs on compatible datasets with performance shift deltas.
7. **Exportable Reports**: Formal fairness screening documentation (PDF / print-friendly HTML and complete JSON audit reports).

---

## Tech Stack

- **Frontend**: React 18, Vite, Recharts, Lucide React, Custom Responsive Design System ("Plus Jakarta Sans", clean card aesthetics, dark/light contrast). Runs at `http://localhost:5173`.
- **Backend**: Python 3.11+, FastAPI, Uvicorn, Pandas, NumPy, Scikit-Learn, ONNX Runtime, Python-Multipart. Runs at `http://127.0.0.1:8000`.

---

## Quick Start

### 1. Backend Setup
```bash
# In project root
python -m uvicorn backend.app.main:app --reload --port 8000
```
Backend health check is accessible at `http://127.0.0.1:8000/api/health`.

### 2. Frontend Setup
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Acceptance Testing

Run the automated backend test suite:
```bash
python -m pytest backend/tests -v
```

All 9 acceptance tests verify exact metric parity against `sample_data/expected_results.json`:
- Overall accuracy 79.3%, precision 54.5%, recall 55.1%, FPR 13.6%, F1 54.8%, selection rate 23.1%, ROC-AUC 0.827.
- Group recalls: 18-30 (77.7%), 31-45 (60.1%), 46-60 (45.6%), 60+ (68.1%), Female (68.4%), Male (53.1%), Other (40.5%), Rural (71.3%), Semi-Urban (48.9%), Urban (56.5%).
- Disparity gaps: age_group 32.2%, gender 27.9%, region 22.3%.
- Mitigation recall gap reduced to < 1.0% with accuracy preserved > 80.5%.
- Exact failure messages for missing values, non-numeric features, and mismatched dimensions.

---

## Disclaimer

**Fairness screening, not clinical certification.** HealthFair AI is a decision-support and audit prototype for detecting statistical disparities in health models. It does not certify clinical safety or replace institutional review boards.
