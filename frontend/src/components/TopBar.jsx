import React from 'react';
import { useLocation } from '../lib/router';
import { Bell } from 'lucide-react';
import { useAudit } from '../context/AuditContext';

const ROUTE_NAMES = {
  '/': 'Dashboard',
  '/audit/new': 'New Audit',
  '/analysis': 'Fairness Analysis',
  '/compare': 'Model Comparison',
  '/reports': 'Reports & History',
};

export default function TopBar() {
  const location = useLocation();
  const { apiStatus } = useAudit();
  const currentTitle = ROUTE_NAMES[location.pathname] || 'Auditor';

  return (
    <header className="h-16 bg-white border-b border-cardBorder px-8 flex items-center justify-between shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">HealthFair AI</span>
        <span className="text-slate-300">/</span>
        <span className="font-bold text-heading">{currentTitle}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Live API Status Pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-cardBorder text-xs font-medium">
          <span
            className={`w-2 h-2 rounded-full ${
              apiStatus === 'connected' ? 'bg-success animate-pulse' : 'bg-danger-text'
            }`}
          />
          <span className={apiStatus === 'connected' ? 'text-heading' : 'text-danger-text'}>
            {apiStatus === 'connected' ? 'API connected' : 'API offline'}
          </span>
        </div>

        {/* Notifications Icon */}
        <button
          type="button"
          aria-label="Notifications"
          className="p-2 text-muted hover:text-heading hover:bg-slate-50 rounded-xl transition-colors"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User / Org Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary-light text-primary flex items-center justify-center font-bold text-xs shadow-xs border border-blue-100">
          HF
        </div>
      </div>
    </header>
  );
}
