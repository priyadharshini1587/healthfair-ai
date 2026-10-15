import { NavLink } from '../lib/router';
import {
  Activity,
  LayoutDashboard,
  FileUp,
  Scale,
  BarChart3,
  ClipboardList,
  ShieldCheck
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/audit/new', label: 'New Audit', icon: FileUp },
  { to: '/analysis', label: 'Fairness Analysis', icon: Scale },
  { to: '/compare', label: 'Model Comparison', icon: BarChart3 },
  { to: '/reports', label: 'Reports & History', icon: ClipboardList },
];

export default function Sidebar() {
  return (
    <aside className="w-[300px] bg-white border-r border-cardBorder flex flex-col justify-between shrink-0 min-h-screen select-none">
      <div className="p-6">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20 text-white">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="text-xl font-bold tracking-tight text-heading">
              HealthFair <span className="text-primary">AI</span>
            </div>
            <div className="text-[10px] tracking-[0.14em] font-semibold text-muted uppercase">
              MODEL FAIRNESS AUDITOR
            </div>
          </div>
        </div>

        {/* Workspace Nav Section */}
        <div className="text-[11px] font-bold tracking-[0.12em] text-muted uppercase mb-3 px-3">
          WORKSPACE
        </div>
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary-light text-primary font-semibold shadow-xs'
                      : 'text-muted hover:text-heading hover:bg-slate-50'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0 stroke-[2]" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="p-6 space-y-4">
        {/* Privacy Card */}
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-100 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-heading mb-1">
              Privacy-first auditing
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Files are processed by your local API. This demo does not persist uploaded files on the server.
            </p>
          </div>
        </div>

        {/* Engine Status / Version Footer */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span className="font-medium text-[11px]">Audit engine connected</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">v1.0</span>
        </div>
      </div>
    </aside>
  );
}
