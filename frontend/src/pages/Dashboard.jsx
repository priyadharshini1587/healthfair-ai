import React from 'react';
import {
  FileUp,
  Sparkles,
  Scale,
  CheckCircle,
  Activity,
  AlertTriangle,
  Users,
  Award,
  ArrowRight,
  TrendingUp
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
import { formatPercent } from '../lib/utils';

export default function Dashboard() {
  const { history, activeAudit } = useAudit();
  const navigate = useNavigate();

  const latestAudit = activeAudit || history[0] || null;
  const auditCount = history.length;

  // Chart data for latest audit
  let chartData = [];
  let firstGroupCol = null;
  let topFinding = null;

  if (latestAudit && latestAudit.groups) {
    const groupCols = Object.keys(latestAudit.groups);
    if (groupCols.length > 0) {
      firstGroupCol = groupCols[0];
      const groupsMap = latestAudit.groups[firstGroupCol];
      chartData = Object.entries(groupsMap).map(([groupName, metrics]) => ({
        group: groupName,
        recall: Number((metrics.recall * 100).toFixed(1)),
        accuracy: Number((metrics.accuracy * 100).toFixed(1)),
        isExcluded: metrics.is_excluded
      }));
    }

    if (latestAudit.flags && latestAudit.flags.length > 0) {
      const topFlag = latestAudit.flags[0];
      topFinding = `${topFlag.metric.toUpperCase()} gap on ${topFlag.attribute.replace('_', ' ')} is ${(topFlag.gap * 100).toFixed(1)}% between ${topFlag.best_group} and ${topFlag.worst_group} (${topFlag.severity} severity).`;
    }
  }

  // Calculate total groups analyzed
  let totalGroupsCount = 0;
  if (latestAudit && latestAudit.groups) {
    Object.values(latestAudit.groups).forEach(gMap => {
      totalGroupsCount += Object.keys(gMap).length;
    });
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="eyebrow mb-1">OVERVIEW</div>
          <h1 className="text-3xl font-extrabold text-heading">Model fairness dashboard</h1>
          <p className="text-sm text-muted mt-1">
            Understand how your health AI model performs across demographic groups.
          </p>
        </div>
        <button
          onClick={() => navigate('/audit/new')}
          className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-md shadow-primary/25 hover:bg-primary-hover transition-all shrink-0 self-start sm:self-auto cursor-pointer"
        >
          <FileUp className="w-4 h-4 stroke-[2.5]" />
          <span>Start new audit</span>
        </button>
      </div>

      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-r from-[#1E3A8A] via-[#2A52BE] to-[#3B6FD8] text-white p-8 md:p-10 shadow-lg">
        {/* Decorative Circles and Tile on Right */}
        <div className="absolute -right-12 -top-12 w-80 h-80 rounded-full border border-white/10 pointer-events-none hidden md:block" />
        <div className="absolute -right-24 -top-24 w-104 h-104 rounded-full border border-white/5 pointer-events-none hidden md:block" />
        <div className="absolute right-12 top-1/2 -translate-y-1/2 hidden lg:flex items-center justify-center">
          <div className="relative">
            {/* Center Blue Tile */}
            <div className="w-24 h-24 rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-center transform rotate-3 hover:rotate-0 transition-transform">
              <Scale className="w-12 h-12 text-white" />
            </div>
            {/* Floating Chip 1 */}
            <div className="absolute -top-4 -left-20 bg-white/90 backdrop-blur text-heading text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
              <CheckCircle className="w-3.5 h-3.5 text-success" />
              <span>Group metrics</span>
            </div>
            {/* Floating Chip 2 */}
            <div className="absolute -bottom-4 -right-16 bg-white/90 backdrop-blur text-heading text-xs font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span>Model reliability</span>
            </div>
            {/* Decorative Dots */}
            <div className="absolute -top-8 right-2 w-3 h-3 rounded-full bg-emerald-400" />
            <div className="absolute -bottom-8 left-0 w-2.5 h-2.5 rounded-full bg-amber-300" />
          </div>
        </div>

        {/* Hero Content */}
        <div className="max-w-2xl relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-xs font-semibold text-blue-100 uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Fairness Intelligence</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-snug">
            Trust models with evidence, not assumptions.
          </h2>

          <p className="text-blue-100 text-sm md:text-base leading-relaxed">
            Evaluate errors across age, gender, region, and other groups to spot performance gaps that overall accuracy can hide.
          </p>

          <div className="pt-2">
            <button
              onClick={() => navigate('/audit/new')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-primary font-bold text-sm shadow-md hover:bg-slate-50 transition-all cursor-pointer"
            >
              <span>Run a fairness audit →</span>
            </button>
          </div>
        </div>
      </div>

      {/* Audit at a glance section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-heading">Audit at a glance</h2>
            <p className="text-xs text-muted">Latest evaluation summary</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              latestAudit
                ? 'bg-primary-light text-primary border border-blue-200'
                : 'bg-slate-100 text-muted border border-slate-200'
            }`}
          >
            {latestAudit ? `Latest: ${latestAudit.meta?.model_name || 'Model'}` : 'Awaiting first audit'}
          </span>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Stat 1: Overall Accuracy */}
          <div className="p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Overall Accuracy</span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-primary flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-heading">
                {latestAudit ? formatPercent(latestAudit.overall?.accuracy) : '—'}
              </div>
              <p className="text-xs text-muted mt-1">
                {latestAudit ? 'Across all test records' : 'Run an audit to calculate'}
              </p>
            </div>
          </div>

          {/* Stat 2: Fairness Flags */}
          <div className="p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Fairness Flags</span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-heading">
                {latestAudit ? latestAudit.flags?.length ?? 0 : '—'}
              </div>
              <p className="text-xs text-muted mt-1">Across selected groups</p>
            </div>
          </div>

          {/* Stat 3: Groups Analyzed */}
          <div className="p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Groups Analyzed</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-success flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-heading">
                {latestAudit ? totalGroupsCount : '—'}
              </div>
              <p className="text-xs text-muted mt-1">Age, gender, region…</p>
            </div>
          </div>

          {/* Stat 4: Audits Completed */}
          <div className="p-5 rounded-[18px] bg-card border border-cardBorder shadow-soft flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Audits Completed</span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-extrabold text-heading">
                {auditCount}
              </div>
              <p className="text-xs text-muted mt-1">In this browser session</p>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Audit Card (Shown after at least one audit) */}
      {latestAudit && chartData.length > 0 && (
        <div className="p-6 md:p-8 rounded-[18px] bg-card border border-cardBorder shadow-soft space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-cardBorder pb-4">
            <div>
              <div className="eyebrow mb-1">LATEST AUDIT HIGHLIGHT</div>
              <h3 className="text-lg font-bold text-heading">
                Recall (True Positive Rate) by {firstGroupCol?.replace('_', ' ')}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                Evaluated on {latestAudit.meta?.evaluated_rows?.toLocaleString()} rows
              </p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="inline-flex items-center gap-1.5 text-primary hover:text-primary-hover font-bold text-sm"
            >
              <span>View full analysis</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Grouped Bar Chart */}
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6EAF2" />
                <XAxis dataKey="group" stroke="#6B7280" fontSize={12} tickLine={false} />
                <YAxis
                  stroke="#6B7280"
                  fontSize={12}
                  tickLine={false}
                  domain={[0, 100]}
                  unit="%"
                />
                <Tooltip
                  formatter={(val) => [`${val}%`, 'Recall']}
                  contentStyle={{
                    backgroundColor: '#0F1B3D',
                    borderRadius: '12px',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px'
                  }}
                />
                <Bar dataKey="recall" fill="#3558D6" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.recall < 50 ? '#E11D48' : '#3558D6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Plain English Finding Box */}
          {topFinding && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs md:text-sm flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Key disparity observation: </span>
                <span>{topFinding}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
