import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileBarChart,
  Check,
  AlertTriangle,
  FlaskConical,
  Shield,
  ArrowUp,
  ArrowDown,
  Loader2,
  Cpu,
  Table,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { useAudit } from '../context/AuditContext';
import { inspectFiles, runAudit } from '../lib/api';
import { useNavigate } from '../lib/router';
import { formatFileSize } from '../lib/utils';

export default function NewAudit() {
  const { addAudit, showError, clearError, cachedFiles } = useAudit();
  const navigate = useNavigate();

  // Files state
  const [modelFile, setModelFile] = useState(cachedFiles?.modelFile || null);
  const [datasetFile, setDatasetFile] = useState(cachedFiles?.datasetFile || null);

  // Inspect state
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectData, setInspectData] = useState(null);

  // Column mapping state
  const [targetColumn, setTargetColumn] = useState('');
  const [positiveLabel, setPositiveLabel] = useState('1');
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);

  // Sensitivity settings
  const [flagThreshold, setFlagThreshold] = useState(10); // 10%
  const [minGroupSize, setMinGroupSize] = useState(5);

  // Audit running state
  const [auditLoading, setAuditLoading] = useState(false);

  // Handle Inspect call whenever both files are present
  useEffect(() => {
    if (!modelFile || !datasetFile) {
      setInspectData(null);
      return;
    }

    let isCancelled = false;
    async function doInspect() {
      clearError();
      setInspectLoading(true);
      try {
        const data = await inspectFiles(modelFile, datasetFile);
        if (isCancelled) return;
        setInspectData(data);

        // 1. Auto-select Target Column
        const targetCandidate = data.columns.find(c =>
          /target|label|outcome|^y$|diagnosis|_risk$/i.test(c.name)
        );
        const autoTarget = targetCandidate ? targetCandidate.name : data.columns[data.columns.length - 1].name;
        setTargetColumn(autoTarget);

        // 2. Positive label default
        const targetInfo = data.columns.find(c => c.name === autoTarget);
        if (targetInfo && targetInfo.sample && targetInfo.sample.length > 0) {
          const sampleStrs = targetInfo.sample.map(String);
          if (sampleStrs.includes('1')) setPositiveLabel('1');
          else if (sampleStrs.includes('yes')) setPositiveLabel('yes');
          else if (sampleStrs.includes('true')) setPositiveLabel('true');
          else setPositiveLabel(sampleStrs[0]);
        } else {
          setPositiveLabel('1');
        }

        // 3. Auto-suggest M numeric features
        const expectedM = data.onnx.n_features;
        const nonIdNumericCols = data.columns.filter(c =>
          c.is_numeric &&
          c.name !== autoTarget &&
          !/^(id|patient_id|uuid|row_id)$/i.test(c.name)
        ).map(c => c.name);

        if (expectedM && nonIdNumericCols.length === expectedM) {
          setSelectedFeatures(nonIdNumericCols);
        } else if (expectedM && nonIdNumericCols.length > expectedM) {
          setSelectedFeatures(nonIdNumericCols.slice(0, expectedM));
        } else {
          setSelectedFeatures(nonIdNumericCols);
        }

        // 4. Auto-suggest Sensitive / Group columns
        const groupCandidates = data.columns.filter(c =>
          /age_group|gender|sex|region|race|ethnicity/i.test(c.name) &&
          c.name !== autoTarget
        ).map(c => c.name);

        if (groupCandidates.length > 0) {
          setSelectedGroups(groupCandidates);
        } else {
          // Fallback to columns with 2 to 10 unique values
          const lowCardinality = data.columns.filter(c =>
            c.unique >= 2 && c.unique <= 10 && c.name !== autoTarget
          ).map(c => c.name);
          setSelectedGroups(lowCardinality.slice(0, 3));
        }

      } catch (err) {
        if (!isCancelled) {
          showError(err.message);
        }
      } finally {
        if (!isCancelled) setInspectLoading(false);
      }
    }

    doInspect();
    return () => {
      isCancelled = true;
    };
  }, [modelFile, datasetFile]);

  // File Handlers
  const handleModelDrop = (e) => {
    e.preventDefault();
    clearError();
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.onnx')) {
      showError('Model file must be a .onnx file.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showError('Model file exceeds 100 MB limit.');
      return;
    }
    setModelFile(file);
  };

  const handleDatasetDrop = (e) => {
    e.preventDefault();
    clearError();
    const file = e.dataTransfer ? e.dataTransfer.files[0] : e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showError('Dataset file must be a .csv file.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showError('Dataset file exceeds 25 MB limit.');
      return;
    }
    setDatasetFile(file);
  };

  // Reorder features
  const moveFeature = (index, direction) => {
    const newFeatures = [...selectedFeatures];
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= newFeatures.length) return;
    const temp = newFeatures[index];
    newFeatures[index] = newFeatures[targetIdx];
    newFeatures[targetIdx] = temp;
    setSelectedFeatures(newFeatures);
  };

  const toggleFeature = (colName) => {
    if (selectedFeatures.includes(colName)) {
      setSelectedFeatures(selectedFeatures.filter(f => f !== colName));
    } else {
      setSelectedFeatures([...selectedFeatures, colName]);
    }
  };

  const toggleGroup = (colName) => {
    if (selectedGroups.includes(colName)) {
      setSelectedGroups(selectedGroups.filter(g => g !== colName));
    } else {
      setSelectedGroups([...selectedGroups, colName]);
    }
  };

  // Validation logic
  const expectedFeatureCount = inspectData?.onnx?.n_features;
  const isFeatureCountMatched = expectedFeatureCount ? selectedFeatures.length === expectedFeatureCount : selectedFeatures.length > 0;
  const isFormValid = modelFile && datasetFile && inspectData && targetColumn && isFeatureCountMatched && selectedGroups.length > 0;

  // Run Audit
  const handleRunAudit = async () => {
    clearError();

    // Client validation checks
    if (!modelFile || !datasetFile) {
      showError('Please upload both the model (.onnx) and dataset (.csv) files.');
      return;
    }

    if (expectedFeatureCount && selectedFeatures.length !== expectedFeatureCount) {
      showError(`The model expects ${expectedFeatureCount} input features but ${selectedFeatures.length} were selected.`);
      return;
    }

    // Check if any non-numeric selected
    if (inspectData) {
      const nonNumericSelected = selectedFeatures.filter(f => {
        const colInfo = inspectData.columns.find(c => c.name === f);
        return colInfo && !colInfo.is_numeric;
      });
      if (nonNumericSelected.length > 0) {
        showError('All selected model features must be numeric. Encode categorical features as required by your model.');
        return;
      }

      // Check missing values in selected features
      const missingSelected = selectedFeatures.filter(f => {
        const colInfo = inspectData.columns.find(c => c.name === f);
        return colInfo && colInfo.missing > 0;
      });
      if (missingSelected.length > 0) {
        showError('Selected feature columns contain missing values. Impute or remove missing rows first.');
        return;
      }
    }

    const config = {
      feature_columns: selectedFeatures,
      target_column: targetColumn,
      positive_label: positiveLabel,
      group_columns: selectedGroups,
      flag_threshold: flagThreshold / 100, // convert percent to ratio
      min_group_size: Number(minGroupSize)
    };

    setAuditLoading(true);
    try {
      const report = await runAudit(modelFile, datasetFile, config);
      addAudit(report, modelFile, datasetFile);
      navigate('/analysis');
    } catch (err) {
      showError(err.message || 'Audit execution failed');
    } finally {
      setAuditLoading(false);
    }
  };

  // Stepper calculations
  const step1Complete = Boolean(modelFile && datasetFile);
  const step2Complete = Boolean(step1Complete && inspectData && isFeatureCountMatched && targetColumn);
  const currentStep = !step1Complete ? 1 : !step2Complete ? 2 : 3;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="eyebrow mb-1">AUDIT WORKFLOW</div>
        <h1 className="text-3xl font-extrabold text-heading">Create a new audit</h1>
        <p className="text-sm text-muted mt-1">
          Provide a trained model and labeled data, then define how groups should be evaluated.
        </p>
      </div>

      {/* Stepper Card */}
      <div className="p-4 sm:p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
              step1Complete ? 'bg-success text-white' : currentStep === 1 ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-slate-100 text-muted'
            }`}
          >
            {step1Complete ? <Check className="w-4 h-4" /> : '1'}
          </div>
          <div>
            <div className="text-xs font-bold text-heading">1 Upload files</div>
            <div className="text-[11px] text-muted hidden sm:block">Model + dataset</div>
          </div>
        </div>

        <div className="h-0.5 flex-1 bg-slate-200" />

        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
              step2Complete ? 'bg-success text-white' : currentStep === 2 ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-slate-100 text-muted'
            }`}
          >
            {step2Complete ? <Check className="w-4 h-4" /> : '2'}
          </div>
          <div>
            <div className="text-xs font-bold text-heading">2 Map columns</div>
            <div className="text-[11px] text-muted hidden sm:block">Outcome + groups</div>
          </div>
        </div>

        <div className="h-0.5 flex-1 bg-slate-200" />

        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
              currentStep === 3 ? 'bg-primary text-white ring-4 ring-primary/20' : 'bg-slate-100 text-muted'
            }`}
          >
            3
          </div>
          <div>
            <div className="text-xs font-bold text-heading">3 Run audit</div>
            <div className="text-[11px] text-muted hidden sm:block">Metrics + findings</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left 2 Columns: File Uploads & Column Mapping */}
        <div className="lg:col-span-2 space-y-8">
          {/* SECTION 01: Upload Files */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-primary-light text-primary font-bold text-xs flex items-center justify-center">
                01
              </span>
              <div>
                <h2 className="text-lg font-bold text-heading">Upload your files</h2>
                <p className="text-xs text-muted">
                  Files are sent to your configured local API for processing.
                </p>
              </div>
            </div>

            {/* 2 Big Dropzones */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* ONNX Model Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleModelDrop}
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[190px] ${
                  modelFile
                    ? 'border-emerald-300 bg-emerald-50/30'
                    : 'border-cardBorder hover:border-primary/50 hover:bg-slate-50/60'
                }`}
              >
                <input
                  type="file"
                  accept=".onnx"
                  onChange={handleModelDrop}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm text-heading">Upload trained model</div>
                <div className="text-xs text-muted mt-1">Drag a file here or click to browse</div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">.onnx only · Max 100 MB</div>

                {modelFile && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/60 w-full flex items-center justify-between text-xs">
                    <span className="text-emerald-700 font-semibold truncate max-w-[150px]">
                      ✓ {modelFile.name} ({formatFileSize(modelFile.size)})
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setModelFile(null);
                      }}
                      className="text-danger-text hover:underline font-medium text-[11px]"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

              {/* CSV Dataset Dropzone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDatasetDrop}
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-[190px] ${
                  datasetFile
                    ? 'border-emerald-300 bg-emerald-50/30'
                    : 'border-cardBorder hover:border-success/50 hover:bg-slate-50/60'
                }`}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleDatasetDrop}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-success flex items-center justify-center mb-3">
                  <FileBarChart className="w-6 h-6" />
                </div>
                <div className="font-bold text-sm text-heading">Upload labeled dataset</div>
                <div className="text-xs text-muted mt-1">CSV with features, demographics, and known outcome</div>
                <div className="text-[10px] text-slate-400 font-mono mt-2">.csv only · Max 25 MB</div>

                {datasetFile && (
                  <div className="mt-3 pt-3 border-t border-emerald-200/60 w-full flex items-center justify-between text-xs">
                    <span className="text-emerald-700 font-semibold truncate max-w-[150px]">
                      ✓ {datasetFile.name} ({formatFileSize(datasetFile.size)})
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDatasetFile(null);
                      }}
                      className="text-danger-text hover:underline font-medium text-[11px]"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Amber Note Card */}
            <div className="p-4 rounded-xl bg-[#FFF7E0] border border-[#F3E0A6] text-[#8A5D00] text-xs leading-relaxed flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <strong className="font-bold">Important:</strong> the target column must contain known actual outcomes.
                A model's predictions alone cannot tell you whether it was correct. Selected feature columns must match
                the model's training-time input order and preprocessing.
              </div>
            </div>
          </div>

          {/* SECTION 02: Map Columns (Rendered as soon as inspect completes) */}
          {inspectLoading && (
            <div className="p-12 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div className="text-sm font-semibold text-heading">Inspecting ONNX model and dataset columns…</div>
            </div>
          )}

          {inspectData && (
            <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-lg bg-primary-light text-primary font-bold text-xs flex items-center justify-center">
                    02
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-heading">Map columns</h2>
                    <p className="text-xs text-muted">Identify outcome, sensitive groups, and reorder features.</p>
                  </div>
                </div>

                {/* Detected Model Chip */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-primary">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>
                    Model expects {inspectData.onnx.n_features || '?'} input features ({inspectData.onnx.input_name})
                  </span>
                </div>
              </div>

              {/* Outcome & Positive Label Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">
                    Outcome (target) column
                  </label>
                  <select
                    value={targetColumn}
                    onChange={(e) => setTargetColumn(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-medium text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {inspectData.columns.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.dtype})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-heading mb-1.5">
                    Positive label
                  </label>
                  <select
                    value={positiveLabel}
                    onChange={(e) => setPositiveLabel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-medium text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {inspectData.columns.find(c => c.name === targetColumn)?.sample?.map(v => (
                      <option key={String(v)} value={String(v)}>
                        {String(v)}
                      </option>
                    )) || (
                      <>
                        <option value="1">1</option>
                        <option value="0">0</option>
                        <option value="yes">yes</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Feature Columns Selection & Reordering */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-xs font-bold text-heading">
                      Model Feature Columns (ordered)
                    </label>
                    <p className="text-[11px] text-muted">
                      Select numeric features and use the arrows to match training order.
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      isFeatureCountMatched
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {selectedFeatures.length} selected / model expects {expectedFeatureCount || 'N'}
                  </span>
                </div>

                {/* Available Numeric / Text Checkboxes */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-4 rounded-xl bg-slate-50 border border-cardBorder max-h-48 overflow-y-auto">
                  {inspectData.columns
                    .filter(c => c.name !== targetColumn)
                    .map(col => {
                      const isSelected = selectedFeatures.includes(col.name);
                      const isNumeric = col.is_numeric;

                      return (
                        <div
                          key={col.name}
                          onClick={() => {
                            if (isNumeric) toggleFeature(col.name);
                          }}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                            !isNumeric
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                              : isSelected
                              ? 'bg-blue-50 border-primary/40 text-primary font-semibold'
                              : 'bg-white border-cardBorder text-heading hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate pr-1">
                            <div>{col.name}</div>
                            {!isNumeric && (
                              <div className="text-[9px] text-slate-400">text column – cannot be a model feature</div>
                            )}
                          </div>
                          {isNumeric && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="accent-primary rounded w-3.5 h-3.5"
                            />
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Reorderable Ordered List */}
                {selectedFeatures.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      Selected Feature Input Order
                    </div>
                    <div className="space-y-1.5">
                      {selectedFeatures.map((feat, idx) => (
                        <div
                          key={feat}
                          className="flex items-center justify-between px-3.5 py-2 bg-white border border-cardBorder rounded-xl text-xs font-medium text-heading"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-slate-100 text-muted flex items-center justify-center font-mono text-[10px]">
                              {idx + 1}
                            </span>
                            <span className="font-semibold">{feat}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveFeature(idx, -1)}
                              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                              aria-label="Move feature up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === selectedFeatures.length - 1}
                              onClick={() => moveFeature(idx, 1)}
                              className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent"
                              aria-label="Move feature down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sensitive / Demographic Group Columns */}
              <div className="space-y-2 pt-2">
                <label className="block text-xs font-bold text-heading">
                  Sensitive / Demographic Group Columns
                </label>
                <p className="text-[11px] text-muted">
                  Select demographic columns (e.g. age group, gender, region) for fairness evaluation.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-4 rounded-xl bg-slate-50 border border-cardBorder">
                  {inspectData.columns
                    .filter(c => c.name !== targetColumn && !selectedFeatures.includes(c.name))
                    .map(col => {
                      const isSelected = selectedGroups.includes(col.name);
                      return (
                        <div
                          key={col.name}
                          onClick={() => toggleGroup(col.name)}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-50 border-success/40 text-success font-semibold'
                              : 'bg-white border-cardBorder text-heading hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate pr-1">
                            <div>{col.name}</div>
                            <div className="text-[9px] text-muted">
                              {col.unique} unique {col.is_numeric && col.unique > 8 ? '(auto-binned)' : ''}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="accent-success rounded w-3.5 h-3.5"
                          />
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Data Preview Table & Quality Line */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-heading">
                    <Table className="w-4 h-4 text-primary" />
                    <span>Dataset Preview (first 5 records)</span>
                  </div>
                  <div className="font-mono text-muted text-[11px]">
                    {inspectData.rows.toLocaleString()} rows · {inspectData.columns.length} columns · 0 missing values
                  </div>
                </div>

                <div className="border border-cardBorder rounded-xl overflow-x-auto bg-white max-h-56">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-cardBorder text-muted text-[11px] font-bold">
                      <tr>
                        {inspectData.columns.map(c => (
                          <th key={c.name} className="px-3 py-2.5 whitespace-nowrap">
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {inspectData.preview.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/50">
                          {inspectData.columns.map(c => (
                            <td key={c.name} className="px-3 py-2 whitespace-nowrap text-slate-600">
                              {String(row[c.name] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 03: Audit Sensitivity */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-primary-light text-primary font-bold text-xs flex items-center justify-center">
                03
              </span>
              <div>
                <h2 className="text-lg font-bold text-heading">Audit sensitivity</h2>
                <p className="text-xs text-muted">Set thresholds for flagging potential disparities.</p>
              </div>
            </div>

            <div className="space-y-5 divide-y divide-slate-100">
              {/* Row 1: Gap Slider */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-heading">Flag when metric gap reaches</div>
                  <p className="text-[11px] text-muted">Difference between the highest and lowest eligible group.</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={flagThreshold}
                    onChange={(e) => setFlagThreshold(Number(e.target.value))}
                    className="w-32 accent-primary cursor-pointer"
                  />
                  <span className="w-12 text-right font-bold text-xs text-primary font-mono">
                    {flagThreshold}%
                  </span>
                </div>
              </div>

              {/* Row 2: Minimum Group Size */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-heading">Minimum group sample size</div>
                  <p className="text-[11px] text-muted">Smaller groups are shown but excluded from automatic flags.</p>
                </div>
                <select
                  value={minGroupSize}
                  onChange={(e) => setMinGroupSize(Number(e.target.value))}
                  className="px-3.5 py-2 bg-white border border-cardBorder rounded-xl text-xs font-semibold text-heading focus:outline-none focus:ring-2 focus:ring-primary/20 shrink-0"
                >
                  <option value={5}>5 rows</option>
                  <option value={10}>10 rows</option>
                  <option value={20}>20 rows</option>
                  <option value={30}>30 rows</option>
                  <option value={50}>50 rows</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sticky Card: Ready to evaluate? */}
        <div className="lg:sticky lg:top-8 space-y-4">
          <div className="p-6 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center">
              <FlaskConical className="w-5 h-5 stroke-[2.5]" />
            </div>

            <div>
              <h3 className="text-base font-bold text-heading">Ready to evaluate?</h3>
              <p className="text-xs text-muted leading-relaxed mt-1">
                HealthFair AI will run predictions, compare them with known outcomes, and evaluate group-level metrics.
              </p>
            </div>

            {/* Checklist */}
            <div className="space-y-2.5 border-t border-b border-cardBorder py-4 text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>Overall model metrics</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>Group-level error rates</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>Potential disparity flags</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>Exportable JSON report</span>
              </div>
            </div>

            {/* Run Button */}
            <button
              type="button"
              disabled={!isFormValid || auditLoading}
              onClick={handleRunAudit}
              className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                isFormValid && !auditLoading
                  ? 'bg-primary text-white hover:bg-primary-hover shadow-primary/25 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {auditLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Running audit…</span>
                </>
              ) : (
                <span>Run fairness audit</span>
              )}
            </button>

            {/* Security note */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <Shield className="w-3.5 h-3.5 text-success" />
              <span>Files are not retained by this demo API</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
