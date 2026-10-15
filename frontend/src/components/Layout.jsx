import React from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ErrorBanner from './ErrorBanner';

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-page text-heading font-sans">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <ErrorBanner />

        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>

        {/* Global Page Footer */}
        <footer className="h-12 border-t border-cardBorder bg-white/70 px-8 flex items-center justify-between text-xs text-muted shrink-0">
          <div>HealthFair AI · Hackathon prototype</div>
          <div className="font-medium text-slate-400">Fairness screening, not clinical certification</div>
        </footer>
      </div>
    </div>
  );
}
