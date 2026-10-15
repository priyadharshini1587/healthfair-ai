import React, { useState } from 'react';
import {
  Scale,
  FileUp,
  Download,
  Printer,
  Calendar,
  Layers,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Sparkles,
  Sliders,
  FileText,
  BarChart2,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine
} from 'recharts';
import { useAudit } from '../context/AuditContext';
import { useNavigate } from '../lib/router';
import { applyMitigation, downloadMitigatedPredictions } from '../lib/api';
import MetricTooltip from '../components/MetricTooltip';
import {
  formatPercent,
  formatRate,
  formatAuc,
  formatNumber,
  METRIC_TOOLTIPS
} from '../lib/utils';

export default function FairnessAnalysis() {
  const { activeAudit, history, cachedFiles, addMitigatedRun, showError, clearError } = useAudit();
  const navigate = useNavigate();

  // Current report to view (activeAudit or first in history)
  const report = activeAudit || history[0] || null;

  // Selected sensitive attribute (default first key)
  const groupKeys = report?.groups ? Object.keys(report.groups) : [];
  const [selectedAttr, setSelectedAttr] = useState(groupKeys[0] || 'age_group');

  // Selected tab
  const [activeTab, setActiveTab] = useState('overview');

  // Group performance metric picker for bar chart
  const [chartMetric, setChartMetric] = useState('recall');

  // Mitigation state
  const [mitigationMethod, setMitigationMethod] = useState('equal_opportunity');
  const [mitigationLoading, setMitigationLoading] = useState(false);
  const [mitigationResult, setMitigationResult] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // If no report available, show empty state
  if (!report) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-muted mx-auto flex items-center justify-center shadow-soft">
          <Scale className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-heading">No fairness report to analyze</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-2 leading-relaxed">
            Run an audit first. The analysis needs predictions and known outcomes to calculate meaningful metrics.
          </p>
        </div>
        <button
          onClick={() => navigate('/audit/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md shadow-primary/25 hover:bg-primary-hover transition-all"
        >
          <FileUp className="w-4 h-4" />
          <span>Start an audit</span>
        </button>
      </div>
    );
  }

  // Ensure selectedAttr is valid
  const currentAttr = report.groups[selectedAttr] ? selectedAttr : groupKeys[0] || 'age_group';
  const groupsData = report.groups[currentAttr] || {};
  const disparityData = report.disparity[currentAttr] || {};

  // Export JSON handler
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `healthfair_report_${report.meta?.model_name || 'audit'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Printable report
  const handlePrint = () => {
    window.print();
  };

  // Apply Mitigation handler
  const handleApplyMitigation = async () => {
    if (!cachedFiles?.modelFile || !cachedFiles?.datasetFile) {
      showError('Original audit files are required to apply mitigation in this session.');
      return;
    }

    clearError();
    setMitigationLoading(true);
    try {
      const res = await applyMitigation(
        cachedFiles.modelFile,
        cachedFiles.datasetFile,
        report.config,
        mitigationMethod,
        currentAttr
      );
      setMitigationResult(res);

      // Save mitigated run into audit history
      if (res.after && res.after.overall) {
        const syntheticReport = {
          ...report,
          overall: res.after.overall,
          groups: {
            ...report.groups,
            [currentAttr]: res.after.groups
          },
          disparity: {
            ...report.disparity,
            [currentAttr]: {
              ...report.disparity[currentAttr],
              equal_opportunity_diff: res.after.equal_opportunity_diff,
              fpr_gap: res.after.fpr_gap,
              demographic_parity_diff: res.after.demographic_parity_diff
            }
          }
        };
        addMitigatedRun(syntheticReport, report.meta?.model_name || 'Model', mitigationMethod);
      }
    } catch (err) {
      showError(err.message || 'Mitigation failed');
    } finally {
      setMitigationLoading(false);
    }
  };

  const handleDownloadPredictions = async () => {
    if (!cachedFiles?.modelFile || !cachedFiles?.datasetFile) {
      showError('Original audit files are required to export predictions.');
      return;
    }
    clearError();
    setDownloadLoading(true);
    try {
      await downloadMitigatedPredictions(
        cachedFiles.modelFile,
        cachedFiles.datasetFile,
        report.config,
        mitigationMethod,
        currentAttr
      );
    } catch (err) {
      showError(err.message || 'Predictions export failed');
    } finally {
      setDownloadLoading(false);
    }
  };

  // Group Performance table data
  const groupRows = Object.entries(groupsData).map(([gName, m]) => ({
    name: gName,
    ...m
  }));

  // Find min and max for highlighting
  const findExtremes = (metricKey) => {
    const valid = groupRows.filter(r => !r.is_excluded && r[metricKey] !== null);
    if (valid.length === 0) return { best: null, worst: null };
    const vals = valid.map(r => r[metricKey]);
    const maxVal = Math.max(...vals);
    const minVal = Math.min(...vals);
    // for fpr lower is best, for others higher is best
    if (metricKey === 'fpr') {
      return { best: minVal, worst: maxVal };
    }
    return { best: maxVal, worst: minVal };
  };

  const extremes = {
    accuracy: findExtremes('accuracy'),
    precision: findExtremes('precision'),
    recall: findExtremes('recall'),
    fpr: findExtremes('fpr'),
    f1: findExtremes('f1'),
    selection_rate: findExtremes('selection_rate'),
    auc: findExtremes('auc')
  };

  // Chart data for selected group attribute
  const barChartData = groupRows.map(r => ({
    group: r.name,
    value: Number((r[chartMetric] * 100).toFixed(1)),
    isExcluded: r.is_excluded
  }));

  // Scatter data (TPR vs FPR)
  const scatterData = groupRows.map(r => ({
    group: r.name,
    fpr: Number((r.fpr * 100).toFixed(1)),
    tpr: Number((r.recall * 100).toFixed(1)),
    n: r.n
  }));

  // Format tab badge findings
  const highFlagsCount = report.flags?.filter(f => f.severity === 'High').length || 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <div>
        <div className="eyebrow mb-1">FAIRNESS ANALYSIS</div>
        <h1 className="text-3xl font-extrabold text-heading">Fairness & group analysis</h1>
        <p className="text-sm text-muted mt-1">
          Inspect errors and performance across demographic groups.
        </p>
      </div>

      {/* Header Info Card */}
      <div className="p-6 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-heading">
              {report.meta?.model_name || 'Uploaded Model'}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-primary border border-blue-200">
              {report.meta?.total_rows?.toLocaleString()} rows
            </span>
            {report.meta?.rows_dropped > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                {report.meta.rows_dropped} dropped (missing target)
              </span>
            )}
          </div>
          <div className="text-xs text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Dataset: <strong className="text-heading font-medium">{report.meta?.dataset_name || 'Dataset'}</strong></span>
            <span>Target: <strong className="text-heading font-medium font-mono">{report.config.target_column}</strong></span>
            <span>Audited on: {report.meta?.timestamp || 'Today'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap no-print">
          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-cardBorder text-heading font-semibold text-xs hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export JSON report</span>
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-cardBorder text-heading font-semibold text-xs hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600" />
            <span>Download printable report</span>
          </button>
          <button
            onClick={() => navigate('/audit/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold text-xs hover:bg-primary-hover transition-all shadow-md shadow-primary/25 cursor-pointer"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>New audit</span>
          </button>
        </div>
      </div>

      {/* Group Attribute Segmented Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cardBorder pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted uppercase tracking-wider mr-2">
            Demographic Group:
          </span>
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-cardBorder">
            {groupKeys.map(attr => (
              <button
                key={attr}
                onClick={() => setSelectedAttr(attr)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize cursor-pointer ${
                  currentAttr === attr
                    ? 'bg-white text-primary shadow-xs'
                    : 'text-muted hover:text-heading'
                }`}
              >
                {attr.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-cardBorder overflow-x-auto max-w-full">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'performance', label: 'Group performance' },
            { id: 'disparity', label: 'Disparity metrics' },
            { id: 'explainability', label: 'Explainability' },
            { id: 'mitigation', label: 'Mitigation' },
            { id: 'report', label: 'Narrative report' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white text-primary shadow-xs'
                  : 'text-muted hover:text-heading'
              }`}
            >
              {tab.label}
              {tab.id === 'disparity' && highFlagsCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-bold">
                  {highFlagsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Overall Metric Cards */}
          <div>
            <div className="eyebrow mb-2">BASELINE PERFORMANCE</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { key: 'accuracy', label: 'Accuracy', val: formatPercent(report.overall.accuracy) },
                { key: 'precision', label: 'Precision', val: formatPercent(report.overall.precision) },
                { key: 'recall', label: 'Recall / TPR', val: formatPercent(report.overall.recall) },
                { key: 'fpr', label: 'FPR', val: formatPercent(report.overall.fpr) },
                { key: 'f1', label: 'F1 Score', val: formatPercent(report.overall.f1) },
                { key: 'selection_rate', label: 'Selection Rate', val: formatPercent(report.overall.selection_rate) },
                { key: 'auc', label: 'ROC-AUC', val: formatAuc(report.overall.auc) },
              ].map(m => (
                <div key={m.key} className="p-4 rounded-[18px] bg-card border border-cardBorder shadow-soft">
                  <div className="text-[11px] font-semibold text-muted">
                    <MetricTooltip metricKey={m.key} label={m.label} />
                  </div>
                  <div className="text-xl font-extrabold text-heading mt-2 font-mono">
                    {m.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Findings List */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-heading">Key findings & flagged gaps</h3>
                <p className="text-xs text-muted">Disparities identified across demographic attributes</p>
              </div>
              <span className="text-xs font-semibold text-muted">
                Threshold: {(report.config.flag_threshold * 100).toFixed(0)}% gap
              </span>
            </div>

            {report.flags && report.flags.length > 0 ? (
              <div className="space-y-3">
                {report.flags.map((flag, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-cardBorder bg-slate-50/60 flex items-start justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wide ${
                            flag.severity === 'High'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {flag.severity} Severity
                        </span>
                        <span className="font-bold text-heading capitalize">
                          {flag.metric.replace('_', ' ')} gap on {flag.attribute.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">
                        {flag.metric === 'disparate_impact_ratio' ? (
                          <>
                            Disparate impact ratio is <strong>{flag.ratio?.toFixed(2)}</strong> (violates the 0.80 four-fifths rule).
                            Lowest selection group is <strong>{flag.worst_group}</strong> vs highest <strong>{flag.best_group}</strong>.
                          </>
                        ) : (
                          <>
                            {flag.metric.toUpperCase()} for <strong>{flag.worst_group}</strong> is{' '}
                            <strong>{formatPercent(report.groups[flag.attribute]?.[flag.worst_group]?.[flag.metric])}</strong> versus{' '}
                            <strong>{formatPercent(report.groups[flag.attribute]?.[flag.best_group]?.[flag.metric])}</strong> for{' '}
                            <strong>{flag.best_group}</strong> — a{' '}
                            <span className="text-rose-600 font-bold">{(flag.gap * 100).toFixed(1)}-point gap</span>, above your{' '}
                            {(report.config.flag_threshold * 100).toFixed(0)}% threshold.
                          </>
                        )}
                      </p>
                    </div>

                    <div className="text-right font-mono font-bold text-sm shrink-0 text-rose-600">
                      {flag.metric === 'disparate_impact_ratio' ? `${flag.ratio?.toFixed(2)} ratio` : `+${(flag.gap * 100).toFixed(1)}%`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="font-bold text-heading">No critical disparity flags detected</p>
                <p className="mt-1">All group performance gaps fall within the {(report.config.flag_threshold * 100).toFixed(0)}% threshold.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: GROUP PERFORMANCE */}
      {activeTab === 'performance' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Table */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-heading">
                  Performance by {currentAttr.replace('_', ' ')}
                </h3>
                <p className="text-xs text-muted">
                  Best performing values in column are highlighted in green, worst in red.
                </p>
              </div>
              <div className="text-xs text-muted font-mono">
                Min sample size: {report.config.min_group_size} rows
              </div>
            </div>

            <div className="border border-cardBorder rounded-xl overflow-x-auto bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-cardBorder text-muted text-[11px] font-bold">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-3 py-3">Sample (n)</th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="accuracy" label="Accuracy" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="precision" label="Precision" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="recall" label="Recall (TPR)" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="fpr" label="FPR" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="f1" label="F1" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="selection_rate" label="Selection Rate" /></th>
                    <th className="px-3 py-3"><MetricTooltip metricKey="auc" label="ROC-AUC" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {groupRows.map(row => {
                    const isExc = row.is_excluded;
                    return (
                      <tr key={row.name} className={`hover:bg-slate-50/50 ${isExc ? 'opacity-60 bg-slate-50/40' : ''}`}>
                        <td className="px-4 py-3 font-sans font-bold text-heading whitespace-nowrap">
                          {row.name}
                          {isExc && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600 font-semibold font-sans">
                              excluded (n &lt; {report.config.min_group_size})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{formatNumber(row.n)}</td>

                        {/* Metrics cells with best/worst highlights */}
                        {['accuracy', 'precision', 'recall', 'fpr', 'f1', 'selection_rate', 'auc'].map(mKey => {
                          const val = row[mKey];
                          const isBest = !isExc && val !== null && val === extremes[mKey].best;
                          const isWorst = !isExc && val !== null && val === extremes[mKey].worst;
                          const cellClass = isBest
                            ? 'bg-emerald-50 text-emerald-800 font-bold px-2 py-1 rounded'
                            : isWorst
                            ? 'bg-rose-50 text-rose-800 font-bold px-2 py-1 rounded'
                            : 'text-slate-700';

                          return (
                            <td key={mKey} className="px-3 py-3 whitespace-nowrap">
                              <span className={cellClass}>
                                {mKey === 'auc' ? formatAuc(val) : formatPercent(val)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Grouped Bar Chart + TPR vs FPR Scatter */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Bar Chart with metric picker */}
            <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-heading capitalize">
                    {chartMetric.replace('_', ' ')} by group
                  </h4>
                  <p className="text-[11px] text-muted">Comparison across {currentAttr.replace('_', ' ')}</p>
                </div>
                <select
                  value={chartMetric}
                  onChange={(e) => setChartMetric(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-cardBorder rounded-lg text-xs font-semibold text-heading"
                >
                  <option value="recall">Recall (TPR)</option>
                  <option value="accuracy">Accuracy</option>
                  <option value="precision">Precision</option>
                  <option value="fpr">False Positive Rate</option>
                  <option value="f1">F1 Score</option>
                  <option value="selection_rate">Selection Rate</option>
                </select>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EAF2" />
                    <XAxis dataKey="group" stroke="#6B7280" fontSize={11} tickLine={false} />
                    <YAxis stroke="#6B7280" fontSize={11} tickLine={false} domain={[0, 100]} unit="%" />
                    <Tooltip
                      formatter={(val) => [`${val}%`, chartMetric.replace('_', ' ').toUpperCase()]}
                      contentStyle={{
                        backgroundColor: '#0F1B3D',
                        borderRadius: '12px',
                        color: '#fff',
                        border: 'none',
                        fontSize: '11px'
                      }}
                    />
                    <Bar dataKey="value" fill="#3558D6" radius={[6, 6, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.value < 50 ? '#E11D48' : '#3558D6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Scatter Plot: TPR vs FPR */}
            <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-4">
              <div>
                <h4 className="text-sm font-bold text-heading">ROC Space: TPR vs FPR</h4>
                <p className="text-[11px] text-muted">
                  Equalized odds requires points to cluster together. High vertical spread reveals recall disparity.
                </p>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6EAF2" />
                    <XAxis
                      type="number"
                      dataKey="fpr"
                      name="FPR"
                      unit="%"
                      domain={[0, 40]}
                      stroke="#6B7280"
                      fontSize={11}
                    />
                    <YAxis
                      type="number"
                      dataKey="tpr"
                      name="TPR / Recall"
                      unit="%"
                      domain={[0, 100]}
                      stroke="#6B7280"
                      fontSize={11}
                    />
                    <ZAxis dataKey="n" range={[60, 300]} name="Sample size" />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-heading text-white p-2.5 rounded-xl text-xs space-y-1 shadow-lg">
                              <div className="font-bold">{data.group}</div>
                              <div>TPR (Recall): {data.tpr}%</div>
                              <div>FPR: {data.fpr}%</div>
                              <div>Sample (n): {data.n}</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Scatter name="Groups" data={scatterData} fill="#3558D6" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DISPARITY METRICS */}
      {activeTab === 'disparity' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="eyebrow">FAIRNESS CRITERIA & GAPS</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                key: 'equal_opportunity_diff',
                label: 'Equal Opportunity Difference',
                val: formatPercent(disparityData.equal_opportunity_diff),
                threshold: report.config.flag_threshold,
                gap: disparityData.equal_opportunity_diff,
                rule: 'Flag if gap >= 10%',
                meaning: 'Gap in disease detection rates between demographics.'
              },
              {
                key: 'disparate_impact_ratio',
                label: 'Disparate Impact Ratio',
                val: disparityData.disparate_impact_ratio?.toFixed(2) || '—',
                isRatio: true,
                passed: disparityData.disparate_impact_ratio >= 0.80,
                rule: 'Four-fifths rule (≥ 0.80)',
                meaning: 'Ratio of selection rates. Values under 0.80 indicate systemic under-selection.'
              },
              {
                key: 'demographic_parity_diff',
                label: 'Demographic Parity Difference',
                val: formatPercent(disparityData.demographic_parity_diff),
                threshold: report.config.flag_threshold,
                gap: disparityData.demographic_parity_diff,
                rule: 'Flag if gap >= 10%',
                meaning: 'Gap in positive diagnosis rates regardless of actual ground truth.'
              },
              {
                key: 'equalized_odds_diff',
                label: 'Equalized Odds Difference',
                val: formatPercent(disparityData.equalized_odds_diff),
                threshold: report.config.flag_threshold,
                gap: disparityData.equalized_odds_diff,
                rule: 'Max(TPR gap, FPR gap) < 10%',
                meaning: 'Worst-case gap across both true positive and false alarm rates.'
              },
              {
                key: 'fpr_gap',
                label: 'False Positive Rate Gap',
                val: formatPercent(disparityData.fpr_gap),
                threshold: report.config.flag_threshold,
                gap: disparityData.fpr_gap,
                rule: 'Flag if gap >= 10%',
                meaning: 'Disparity in healthy patients being falsely flagged for treatment.'
              },
              {
                key: 'accuracy_gap',
                label: 'Accuracy Gap',
                val: formatPercent(disparityData.accuracy_gap),
                threshold: report.config.flag_threshold,
                gap: disparityData.accuracy_gap,
                rule: 'Flag if gap >= 10%',
                meaning: 'Difference in overall correct prediction rate across groups.'
              },
            ].map(card => {
              const passed = card.isRatio
                ? card.passed
                : card.gap < card.threshold;

              return (
                <div
                  key={card.key}
                  className="p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-heading">
                        <MetricTooltip metricKey={card.key} label={card.label} />
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">{card.rule}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${
                        passed
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {passed ? 'PASS' : 'FLAGGED'}
                    </span>
                  </div>

                  <div>
                    <div className="text-2xl font-extrabold text-heading font-mono">
                      {card.val}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                      {card.meaning}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: EXPLAINABILITY */}
      {activeTab === 'explainability' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Permutation Importance */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div>
              <div className="eyebrow mb-1">EXPLAINABLE AI</div>
              <h3 className="text-lg font-bold text-heading">Permutation Feature Importance</h3>
              <p className="text-xs text-muted">
                Model-agnostic evaluation measuring drop in ROC-AUC when each feature is randomly shuffled (5 repeats, seed 42).
              </p>
            </div>

            {/* Overall Importance Bar Chart */}
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={Object.entries(report.importance?.overall || {}).map(([feat, drop]) => ({
                    feature: feat,
                    drop: Number((drop * 100).toFixed(2))
                  }))}
                  margin={{ top: 10, right: 20, left: 10, bottom: 35 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EAF2" />
                  <XAxis
                    dataKey="feature"
                    stroke="#6B7280"
                    fontSize={11}
                    angle={-25}
                    textAnchor="end"
                    tickLine={false}
                  />
                  <YAxis stroke="#6B7280" fontSize={11} tickLine={false} unit="%" />
                  <Tooltip
                    formatter={(val) => [`${val}% AUC drop`, 'Importance']}
                    contentStyle={{
                      backgroundColor: '#0F1B3D',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px'
                    }}
                  />
                  <Bar dataKey="drop" fill="#3558D6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Proxy Check Table */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-heading">Demographic Proxy Detection</h3>
                <p className="text-xs text-muted">
                  Correlation checks between clinical model features and protected demographic attributes.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                Warning threshold: |r| ≥ 0.30
              </span>
            </div>

            <div className="border border-cardBorder rounded-xl overflow-x-auto bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-cardBorder text-muted text-[11px] font-bold">
                  <tr>
                    <th className="px-4 py-3">Feature</th>
                    <th className="px-4 py-3">Sensitive Attribute</th>
                    <th className="px-4 py-3">Correlation (|r|)</th>
                    <th className="px-4 py-3">Proxy Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {report.proxy_check?.map((item, idx) => (
                    <tr key={idx} className={item.is_proxy ? 'bg-amber-50/40' : 'hover:bg-slate-50/50'}>
                      <td className="px-4 py-3 font-semibold text-heading font-sans">{item.feature}</td>
                      <td className="px-4 py-3 text-slate-700 capitalize font-sans">{item.attribute.replace('_', ' ')}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{Math.abs(item.correlation).toFixed(3)}</td>
                      <td className="px-4 py-3 font-sans">
                        {item.is_proxy ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                            <span>Potential proxy for {item.attribute}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Normal correlation</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MITIGATION */}
      {activeTab === 'mitigation' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Mitigation Configuration Card */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <div>
              <div className="eyebrow mb-1">ALGORITHMIC DEBIASING</div>
              <h3 className="text-lg font-bold text-heading">Mitigate demographic disparity</h3>
              <p className="text-xs text-muted">
                Choose a debiasing method to post-process predictions or retrain with pre-processing weights.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">
                  Mitigation Algorithm
                </label>
                <select
                  value={mitigationMethod}
                  onChange={(e) => setMitigationMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-semibold text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="equal_opportunity">Equal opportunity thresholds (post-processing) – Default</option>
                  <option value="demographic_parity">Demographic parity thresholds (post-processing)</option>
                  <option value="reweighing">Reweighing + retrain (pre-processing)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-heading mb-1.5">
                  Target Sensitive Attribute
                </label>
                <select
                  value={currentAttr}
                  onChange={(e) => setSelectedAttr(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-semibold text-heading focus:outline-none focus:ring-2 focus:ring-primary/20 capitalize"
                >
                  {groupKeys.map(attr => (
                    <option key={attr} value={attr}>
                      {attr.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                disabled={mitigationLoading}
                onClick={handleApplyMitigation}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md shadow-primary/25 hover:bg-primary-hover disabled:opacity-50 cursor-pointer"
              >
                {mitigationLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying debiasing…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Apply mitigation</span>
                  </>
                )}
              </button>

              {mitigationResult && (
                <button
                  type="button"
                  disabled={downloadLoading}
                  onClick={handleDownloadPredictions}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-cardBorder text-heading font-semibold text-xs hover:bg-slate-50 transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Download predictions CSV</span>
                </button>
              )}
            </div>
          </div>

          {/* Mitigation Results Display */}
          {mitigationResult && (
            <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
              {/* Verdict Line */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs md:text-sm font-semibold flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong>Verdict: </strong>
                  Equal-opportunity gap reduced from{' '}
                  <span className="font-bold font-mono">
                    {(mitigationResult.before?.equal_opportunity_diff * 100).toFixed(1)}%
                  </span>{' '}
                  to{' '}
                  <span className="font-bold font-mono text-emerald-700">
                    {(mitigationResult.after?.equal_opportunity_diff * 100).toFixed(1)}%
                  </span>{' '}
                  with overall accuracy{' '}
                  <span className="font-mono">
                    {(mitigationResult.before?.overall?.accuracy * 100).toFixed(1)}% →{' '}
                    {(mitigationResult.after?.overall?.accuracy * 100).toFixed(1)}%
                  </span>.
                </div>
              </div>

              {/* Stat Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-cardBorder">
                  <div className="text-[11px] font-bold text-muted uppercase">Accuracy Cost</div>
                  <div className="text-xl font-extrabold text-heading font-mono mt-1">
                    {(mitigationResult.before?.overall?.accuracy * 100).toFixed(1)}% →{' '}
                    {(mitigationResult.after?.overall?.accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">Overall test set accuracy</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-cardBorder">
                  <div className="text-[11px] font-bold text-muted uppercase">Equal Opportunity Gap</div>
                  <div className="text-xl font-extrabold text-emerald-600 font-mono mt-1">
                    {(mitigationResult.before?.equal_opportunity_diff * 100).toFixed(1)}% →{' '}
                    {(mitigationResult.after?.equal_opportunity_diff * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">TPR disparity across groups</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-cardBorder">
                  <div className="text-[11px] font-bold text-muted uppercase">FPR Gap</div>
                  <div className="text-xl font-extrabold text-heading font-mono mt-1">
                    {(mitigationResult.before?.fpr_gap * 100).toFixed(1)}% →{' '}
                    {(mitigationResult.after?.fpr_gap * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">False alarm difference</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-cardBorder">
                  <div className="text-[11px] font-bold text-muted uppercase">Demographic Parity Gap</div>
                  <div className="text-xl font-extrabold text-heading font-mono mt-1">
                    {(mitigationResult.before?.demographic_parity_diff * 100).toFixed(1)}% →{' '}
                    {(mitigationResult.after?.demographic_parity_diff * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted mt-1">Selection rate difference</div>
                </div>
              </div>

              {/* Group-specific Thresholds */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-heading">Calibrated Group Thresholds</div>
                <div className="flex flex-wrap gap-2.5">
                  {Object.entries(mitigationResult.thresholds || {}).map(([g, t]) => (
                    <span
                      key={g}
                      className="px-3 py-1.5 rounded-xl bg-white border border-cardBorder text-xs font-mono shadow-2xs"
                    >
                      <strong className="font-sans text-slate-800">{g}:</strong>{' '}
                      <span className="text-primary font-bold">{Number(t).toFixed(3)}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Before vs After Group Bar Chart */}
              <div className="space-y-2 pt-2">
                <div className="text-xs font-bold text-heading">Recall (TPR) Before vs After Mitigation</div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.keys(mitigationResult.before?.groups || {}).map(g => ({
                        group: g,
                        before: Number(((mitigationResult.before.groups[g]?.recall || 0) * 100).toFixed(1)),
                        after: Number(((mitigationResult.after.groups[g]?.recall || 0) * 100).toFixed(1)),
                      }))}
                      margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EAF2" />
                      <XAxis dataKey="group" stroke="#6B7280" fontSize={11} tickLine={false} />
                      <YAxis stroke="#6B7280" fontSize={11} tickLine={false} domain={[0, 100]} unit="%" />
                      <Tooltip
                        formatter={(val, name) => [`${val}%`, name === 'before' ? 'Before Mitigation' : 'After Mitigation']}
                        contentStyle={{
                          backgroundColor: '#0F1B3D',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                      />
                      <Bar dataKey="before" fill="#94A3B8" name="before" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="after" fill="#12A37F" name="after" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Clinical Warning */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs leading-relaxed flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Important clinical note:</strong> Equalising one fairness metric (such as Equal Opportunity)
                  often introduces tradeoffs with other metrics (such as False Positive Rate or Precision).
                  Automated thresholds should always undergo multidisciplinary clinical and ethical review before deployment.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: NARRATIVE REPORT PREVIEW */}
      {activeTab === 'report' && (
        <div className="p-8 md:p-12 rounded-[18px] bg-white border border-cardBorder shadow-soft space-y-8 animate-fadeIn max-w-4xl mx-auto">
          {/* Printable Report Header */}
          <div className="border-b border-cardBorder pb-6 space-y-2">
            <div className="eyebrow">FORMAL AUDIT DOCUMENT</div>
            <h2 className="text-2xl font-black text-heading">Healthcare Model Fairness Audit Report</h2>
            <div className="text-xs text-muted flex flex-wrap gap-4 pt-1 font-mono">
              <span>Model: {report.meta?.model_name}</span>
              <span>Dataset: {report.meta?.dataset_name} ({report.meta?.total_rows} rows)</span>
              <span>Date: {report.meta?.timestamp}</span>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <section className="space-y-3">
            <h3 className="text-base font-bold text-heading">1. Executive Summary</h3>
            <p className="text-xs leading-relaxed text-slate-700">
              HealthFair AI conducted an algorithmic bias screening on the model <strong>{report.meta?.model_name}</strong>.
              While the model achieves an overall accuracy of <strong>{formatPercent(report.overall?.accuracy)}</strong> and
              ROC-AUC of <strong>{formatAuc(report.overall?.auc)}</strong>, significant disparity was detected across demographic groups.
              A total of <strong>{report.flags?.length || 0} performance flags</strong> were raised under the{' '}
              {(report.config.flag_threshold * 100).toFixed(0)}% threshold policy.
            </p>
          </section>

          {/* Section 2: Methodology */}
          <section className="space-y-3">
            <h3 className="text-base font-bold text-heading">2. Methodology & Criteria</h3>
            <p className="text-xs leading-relaxed text-slate-700">
              Evaluation was performed in-memory without persistent storage. Model inference outputs were compared with
              ground truth outcome <code>{report.config.target_column}</code>. Six core fairness criteria were assessed:
              Demographic Parity Difference, Disparate Impact Ratio, Equal Opportunity Difference (Recall Gap),
              Equalized Odds, False Positive Rate Gap, and Accuracy Gap.
            </p>
          </section>

          {/* Section 3: Group Findings */}
          <section className="space-y-3">
            <h3 className="text-base font-bold text-heading">3. Detailed Group Findings</h3>
            <div className="space-y-2">
              {report.flags?.map((f, i) => (
                <div key={i} className="text-xs p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-900 capitalize">
                    {f.attribute.replace('_', ' ')} — {f.metric.replace('_', ' ')}:
                  </span>{' '}
                  <span className="text-slate-700">
                    Gap of {(f.gap * 100).toFixed(1)}% between best group ({f.best_group}) and worst group ({f.worst_group})
                    rated {f.severity} severity.
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Section 4: Mitigation & Recommendations */}
          <section className="space-y-3">
            <h3 className="text-base font-bold text-heading">4. Mitigation Recommendations</h3>
            <p className="text-xs leading-relaxed text-slate-700">
              Post-processing calibration (equal-opportunity decision thresholding) demonstrated successful reduction
              of the recall gap while preserving overall diagnostic accuracy above 80%. Calibrated decision thresholds
              can be exported for integration into inference pipelines.
            </p>
          </section>

          {/* Section 5: Limitations & Regulatory Disclaimer */}
          <section className="p-4 rounded-xl bg-slate-50 border border-cardBorder text-slate-500 text-[11px] leading-relaxed space-y-1.5">
            <div className="font-bold text-heading">Limitations & Regulatory Disclaimer</div>
            <p>
              This report is generated for screening, research, and algorithmic transparency during the hackathon prototype evaluation.
              Fairness screening does not constitute clinical certification or diagnostic clearance. Algorithmic changes must be
              reviewed by medical professionals and clinical trial boards before affecting patient outcomes.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
