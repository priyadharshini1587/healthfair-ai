import React, { useState } from 'react';
import {
  ClipboardList,
  Search,
  FileUp,
  Download,
  Trash2,
  ExternalLink,
  History,
  AlertTriangle,
  Info,
  Layers
} from 'lucide-react';
import { useAudit } from '../context/AuditContext';
import { useNavigate } from '../lib/router';
import { formatPercent } from '../lib/utils';

export default function ReportsHistory() {
  const { history, setActiveAudit, deleteAudit } = useAudit();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filteredHistory = history.filter(h => {
    const term = search.toLowerCase();
    const modelName = (h.meta?.model_name || '').toLowerCase();
    const datasetName = (h.meta?.dataset_name || '').toLowerCase();
    return modelName.includes(term) || datasetName.includes(term);
  });

  const handleOpen = (report) => {
    setActiveAudit(report);
    navigate('/analysis');
  };

  const handleExportJson = (report) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `healthfair_report_${report.meta?.model_name || 'audit'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">AUDIT ARCHIVE</div>
          <h1 className="text-3xl font-extrabold text-heading">Reports & history</h1>
          <p className="text-sm text-muted mt-1">
            Review completed audits, reopen their analysis, or export the full JSON report.
          </p>
        </div>
        <button
          onClick={() => navigate('/audit/new')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/25 hover:bg-primary-hover transition-all shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <FileUp className="w-4 h-4" />
          <span>New audit</span>
        </button>
      </div>

      {/* Main Archive Card */}
      <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
        {/* Search & Badge Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cardBorder pb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search model or dataset…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-cardBorder rounded-xl text-xs font-medium text-heading focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-primary border border-blue-200 shrink-0 self-start sm:self-auto">
            {history.length} session {history.length === 1 ? 'report' : 'reports'}
          </span>
        </div>

        {/* Empty state or List of audits */}
        {history.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-muted mx-auto flex items-center justify-center">
              <History className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-heading">No saved reports in this session</h3>
              <p className="text-xs text-muted max-w-sm mx-auto mt-1 leading-relaxed">
                Your completed audits will appear here. Refreshing the page clears this browser-only history, so export reports you need to keep.
              </p>
            </div>
            <button
              onClick={() => navigate('/audit/new')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-bold text-xs shadow-md shadow-primary/25 hover:bg-primary-hover transition-all cursor-pointer"
            >
              <span>Create an audit</span>
            </button>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted">
            No audits matched your search "{search}".
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredHistory.map(report => (
              <div
                key={report.id}
                className="py-4.5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 p-3 rounded-xl transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h4 className="text-sm font-bold text-heading">
                      {report.meta?.model_name || 'Audited Model'}
                    </h4>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                      {report.meta?.dataset_name || 'dataset.csv'}
                    </span>
                  </div>
                  <div className="text-xs text-muted flex items-center gap-3">
                    <span>{report.meta?.timestamp || 'Today'}</span>
                    <span>·</span>
                    <span>
                      Accuracy: <strong className="text-heading font-mono">{formatPercent(report.overall?.accuracy)}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Flags: <strong className="text-rose-600 font-mono">{report.flags?.length || 0}</strong>
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpen(report)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-hover transition-all cursor-pointer shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open</span>
                  </button>
                  <button
                    onClick={() => handleExportJson(report)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-cardBorder text-heading text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>Export JSON</span>
                  </button>
                  <button
                    onClick={() => deleteAudit(report.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    aria-label="Delete report"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Session-only History Disclaimer */}
      <div className="p-4 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-600 text-xs flex items-center gap-3">
        <Info className="w-5 h-5 text-primary shrink-0" />
        <div>
          <strong className="text-heading">Session-only history: </strong>
          This prototype keeps audit history in frontend memory, not a database. Download reports before refreshing or closing the browser.
        </div>
      </div>
    </div>
  );
}
