import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useAudit } from '../context/AuditContext';

export default function ErrorBanner() {
  const { errorBanner, clearError } = useAudit();

  if (!errorBanner) return null;

  return (
    <div
      role="alert"
      className="bg-[#FDECEA] border-b border-[#F5C2BD] text-[#B3261E] px-8 py-3.5 flex items-center justify-between text-sm transition-all animate-fadeIn"
    >
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0 text-[#B3261E]" />
        <span className="font-medium">{errorBanner.message}</span>
      </div>
      <button
        onClick={clearError}
        className="p-1 hover:bg-[#F5C2BD]/50 rounded-lg transition-colors text-[#B3261E]"
        aria-label="Dismiss error banner"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
