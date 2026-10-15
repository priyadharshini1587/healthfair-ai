import React, { useState } from 'react';
import {
  BarChart3,
  FileUp,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  ArrowLeftRight,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import { useAudit } from '../context/AuditContext';
import { useNavigate } from '../lib/router';
import { formatPercent, formatAuc } from '../lib/utils';

export default function ModelComparison() {
  const { history, activeRunA, setActiveRunA, activeRunB, setActiveRunB } = useAudit();
  const navigate = useNavigate();

  // If less than 2 audits in session, show empty state
  if (history.length < 2) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 text-muted mx-auto flex items-center justify-center shadow-soft">
          <BarChart3 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-heading">Two audit runs needed</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-2 leading-relaxed">
            Run audits for two models using the same dataset, target column, positive label, and group definitions.
            Results are kept in browser memory for this session.
          </p>
        </div>
        <button
          onClick={() => navigate('/audit/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-md shadow-primary/25 hover:bg-primary-hover transition-all cursor-pointer"
        >
          <FileUp className="w-4 h-4" />
          <span>Run another audit</span>
        </button>
      </div>
    );
  }

  // Selected audits for A and B
  const runAId = activeRunA?.id || history[1]?.id || history[0]?.id;
  const runBId = activeRunB?.id || history[0]?.id;

  const runA = history.find(h => h.id === runAId) || history[1] || history[0];
  const runB = history.find(h => h.id === runBId) || history[0];

  // Incompatibility checks
  let incompatibilityError = null;
  if (runA.config.target_column !== runB.config.target_column) {
    incompatibilityError = `Incompatible target columns: Run A uses '${runA.config.target_column}', while Run B uses '${runB.config.target_column}'.`;
  } else if (String(runA.config.positive_label) !== String(runB.config.positive_label)) {
    incompatibilityError = `Incompatible positive labels: Run A uses '${runA.config.positive_label}', while Run B uses '${runB.config.positive_label}'.`;
  } else if (runA.meta?.evaluated_rows !== runB.meta?.evaluated_rows) {
    incompatibilityError = `Incompatible dataset size: Run A has ${runA.meta?.evaluated_rows} rows, while Run B has ${runB.meta?.evaluated_rows} rows.`;
  }

  // Find shared group attributes
  const commonAttrs = Object.keys(runA.groups || {}).filter(attr => runB.groups && runB.groups[attr]);
  const [selectedAttr, setSelectedAttr] = useState(commonAttrs[0] || 'age_group');
  const activeAttr = commonAttrs.includes(selectedAttr) ? selectedAttr : commonAttrs[0];

  // Bar chart data for Equal Opportunity gap across models
  const eoGapChartData = commonAttrs.map(attr => ({
    attribute: attr.replace('_', ' '),
    runA: Number(((runA.disparity?.[attr]?.equal_opportunity_diff || 0) * 100).toFixed(1)),
    runB: Number(((runB.disparity?.[attr]?.equal_opportunity_diff || 0) * 100).toFixed(1)),
  }));

  // Delta calculation helper: positive improvement
  // For accuracy/precision/recall/f1/auc: higher is better
  // For fpr: lower is better
  const renderDelta = (valA, valB, isLowerBetter = false) => {
    if (valA === null || valB === null || valA === undefined || valB === undefined) return null;
    const diff = valB - valA;
    const isImproved = isLowerBetter ? diff < -0.0001 : diff > 0.0001;
    const isWorse = isLowerBetter ? diff > 0.0001 : diff < -0.0001;
    const diffText = (diff > 0 ? '+' : '') + (diff * 100).toFixed(1) + '%';

    if (Math.abs(diff) < 0.0001) {
      return <span className="text-slate-400 font-mono text-[11px]">— No change</span>;
    }

    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-bold font-mono ${
          isImproved ? 'text-emerald-600' : isWorse ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        {isImproved ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
        <span>{diffText}</span>
      </span>
    );
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div>
        <div className="eyebrow mb-1">MODEL BENCHMARKING</div>
        <h1 className="text-3xl font-extrabold text-heading">Compare model audits</h1>
        <p className="text-sm text-muted mt-1">
          Compare evaluation runs performed on the same dataset and compatible outcome definitions.
        </p>
      </div>

      {/* Model Selection Dropdowns */}
      <div className="p-6 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Run A */}
          <div>
            <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
              Run A (Baseline)
            </label>
            <select
              value={runA.id}
              onChange={(e) => setActiveRunA(history.find(h => h.id === e.target.value))}
              className="w-full px-4 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-bold text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {history.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {h.meta?.model_name || `Run #${i + 1}`} ({h.meta?.timestamp})
                </option>
              ))}
            </select>
          </div>

          {/* Run B */}
          <div>
            <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-2">
              Run B (Comparison / Mitigated)
            </label>
            <select
              value={runB.id}
              onChange={(e) => setActiveRunB(history.find(h => h.id === e.target.value))}
              className="w-full px-4 py-2.5 bg-white border border-cardBorder rounded-xl text-xs font-bold text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {history.map((h, i) => (
                <option key={h.id} value={h.id}>
                  {h.meta?.model_name || `Run #${i + 1}`} ({h.meta?.timestamp})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Incompatibility Error Banner */}
      {incompatibilityError && (
        <div className="p-5 rounded-xl bg-[#FDECEA] border border-[#F5C2BD] text-[#B3261E] text-xs font-semibold flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{incompatibilityError}</span>
        </div>
      )}

      {!incompatibilityError && (
        <>
          {/* Side by side overall metrics with deltas */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
            <h3 className="text-base font-bold text-heading">Overall Diagnostic Performance & Deltas</h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
              {[
                { label: 'Accuracy', valA: runA.overall.accuracy, valB: runB.overall.accuracy, isLowerBetter: false },
                { label: 'Precision', valA: runA.overall.precision, valB: runB.overall.precision, isLowerBetter: false },
                { label: 'Recall (TPR)', valA: runA.overall.recall, valB: runB.overall.recall, isLowerBetter: false },
                { label: 'FPR', valA: runA.overall.fpr, valB: runB.overall.fpr, isLowerBetter: true },
                { label: 'F1 Score', valA: runA.overall.f1, valB: runB.overall.f1, isLowerBetter: false },
                { label: 'Selection Rate', valA: runA.overall.selection_rate, valB: runB.overall.selection_rate, isLowerBetter: false },
                { label: 'ROC-AUC', valA: runA.overall.auc, valB: runB.overall.auc, isLowerBetter: false, isAuc: true },
              ].map(item => (
                <div key={item.label} className="p-4 rounded-xl bg-slate-50 border border-cardBorder space-y-1">
                  <div className="text-[11px] font-bold text-muted">{item.label}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    A: {item.isAuc ? formatAuc(item.valA) : formatPercent(item.valA)}
                  </div>
                  <div className="text-base font-extrabold text-heading font-mono">
                    B: {item.isAuc ? formatAuc(item.valB) : formatPercent(item.valB)}
                  </div>
                  <div className="pt-1">
                    {renderDelta(item.valA, item.valB, item.isLowerBetter)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Equal Opportunity Gap Comparison Bar Chart */}
          <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-5">
            <div>
              <h3 className="text-base font-bold text-heading">Equal Opportunity Gap (TPR Disparity) Comparison</h3>
              <p className="text-xs text-muted">Lower gap represents greater fairness across demographic attributes.</p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eoGapChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EAF2" />
                  <XAxis dataKey="attribute" stroke="#6B7280" fontSize={12} tickLine={false} />
                  <YAxis stroke="#6B7280" fontSize={12} tickLine={false} domain={[0, 40]} unit="%" />
                  <Tooltip
                    formatter={(val, name) => [`${val}%`, name === 'runA' ? `Run A: ${runA.meta?.model_name}` : `Run B: ${runB.meta?.model_name}`]}
                    contentStyle={{
                      backgroundColor: '#0F1B3D',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px'
                    }}
                  />
                  <Bar dataKey="runA" fill="#94A3B8" name="runA" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="runB" fill="#3558D6" name="runB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-Group Metric Deltas Table */}
          {activeAttr && runA.groups?.[activeAttr] && runB.groups?.[activeAttr] && (
            <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-heading">
                    Per-Group Performance Deltas on {activeAttr.replace('_', ' ')}
                  </h3>
                  <p className="text-xs text-muted">Examine group shifts between Run A and Run B</p>
                </div>

                <div className="inline-flex p-1 bg-slate-100 rounded-lg">
                  {commonAttrs.map(attr => (
                    <button
                      key={attr}
                      onClick={() => setSelectedAttr(attr)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold capitalize cursor-pointer ${
                        activeAttr === attr ? 'bg-white text-primary shadow-xs' : 'text-muted'
                      }`}
                    >
                      {attr.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-cardBorder rounded-xl overflow-x-auto bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-cardBorder text-muted text-[11px] font-bold">
                    <tr>
                      <th className="px-4 py-3">Group</th>
                      <th className="px-3 py-3">Recall (Run A)</th>
                      <th className="px-3 py-3">Recall (Run B)</th>
                      <th className="px-3 py-3">Recall Shift</th>
                      <th className="px-3 py-3">FPR (Run A)</th>
                      <th className="px-3 py-3">FPR (Run B)</th>
                      <th className="px-3 py-3">FPR Shift</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-xs">
                    {Object.keys(runA.groups[activeAttr]).map(groupName => {
                      const mA = runA.groups[activeAttr][groupName];
                      const mB = runB.groups[activeAttr]?.[groupName];
                      if (!mA || !mB) return null;

                      return (
                        <tr key={groupName} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-sans font-bold text-heading">{groupName}</td>
                          <td className="px-3 py-3 text-slate-600">{formatPercent(mA.recall)}</td>
                          <td className="px-3 py-3 font-bold text-heading">{formatPercent(mB.recall)}</td>
                          <td className="px-3 py-3">{renderDelta(mA.recall, mB.recall, false)}</td>
                          <td className="px-3 py-3 text-slate-600">{formatPercent(mA.fpr)}</td>
                          <td className="px-3 py-3 font-bold text-heading">{formatPercent(mB.fpr)}</td>
                          <td className="px-3 py-3">{renderDelta(mA.fpr, mB.fpr, true)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
