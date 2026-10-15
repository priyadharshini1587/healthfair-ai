import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { METRIC_TOOLTIPS } from '../lib/utils';

export default function MetricTooltip({ metricKey, label, className = '' }) {
  const [open, setOpen] = useState(false);
  const info = METRIC_TOOLTIPS[metricKey];

  return (
    <span className={`inline-flex items-center gap-1 relative ${className}`}>
      <span>{label || info?.title || metricKey}</span>
      {info && (
        <span
          className="cursor-pointer text-muted hover:text-primary transition-colors inline-flex items-center"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(prev => !prev);
          }}
          aria-label={`Info about ${info.title}`}
        >
          <Info className="w-3.5 h-3.5 shrink-0" />
          {open && (
            <div className="absolute z-50 left-0 bottom-full mb-2 w-64 p-3 bg-heading text-white text-xs rounded-xl shadow-xl pointer-events-none transform -translate-x-1/4 animate-fadeIn">
              <div className="font-bold text-white mb-1">{info.title}</div>
              <div className="font-mono text-[10px] text-blue-300 bg-slate-800/80 p-1.5 rounded mb-1.5 border border-slate-700/50">
                {info.formula}
              </div>
              <div className="text-slate-300 text-[11px] leading-relaxed">
                {info.desc}
              </div>
            </div>
          )}
        </span>
      )}
    </span>
  );
}
