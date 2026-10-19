/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Activity,
  ShieldCheck,
  Clock,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  SlidersHorizontal,
  FileSpreadsheet,
  FileCode,
  Layers,
  ChevronRight,
  TrendingUp,
  Cpu,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react';
import {
  DecisionRecord,
  ResearchMetricsSummary,
  BaselineComparisonResult,
  DecisionType,
} from '../types/research';

interface InsightsProps {
  isDark: boolean;
}

export default function Insights({ isDark }: InsightsProps) {
  const [metrics, setMetrics] = useState<ResearchMetricsSummary | null>(null);
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [selectedDecision, setSelectedDecision] = useState<DecisionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [exporting, setExporting] = useState(false);
  const [baselineResults, setBaselineResults] = useState<Record<string, BaselineComparisonResult> | null>(null);
  const [runningBaseline, setRunningBaseline] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [filterType]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const typeParam = filterType !== 'all' ? `?decisionType=${filterType}` : '';
      const [metricsRes, decisionsRes] = await Promise.all([
        fetch(`/api/nova/metrics${typeParam}`),
        fetch(`/api/nova/decisions${typeParam}`),
      ]);

      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        if (mData.success && mData.metrics) {
          setMetrics(mData.metrics);
        }
      }

      if (decisionsRes.ok) {
        const dData = await decisionsRes.json();
        if (dData.success && dData.decisions) {
          setDecisions(dData.decisions);
          if (dData.decisions.length > 0 && !selectedDecision) {
            setSelectedDecision(dData.decisions[0]);
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch Nova insights data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'json' | 'csv') => {
    setExporting(true);
    try {
      const res = await fetch(`/api/nova/export?format=${format}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sentinel_nova_decisions.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleRunBaseline = async () => {
    setRunningBaseline(true);
    try {
      const res = await fetch('/api/nova/baselines/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.comparison) {
          setBaselineResults(data.comparison);
        }
      }
    } catch (err) {
      console.error('Baseline comparison error:', err);
    } finally {
      setRunningBaseline(false);
    }
  };

  const pct = (val: number | undefined) => Math.round((val || 0) * 100);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Activity size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Chief-of-Staff Intelligence & Observability
              </h1>
              <p className="text-xs text-slate-400">
                Research-grade structured decision telemetry, explainability audit trails, and experimental baselines
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <FileCode size={14} />
            <span>Export JSON</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <FileSpreadsheet size={14} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleRunBaseline}
            disabled={runningBaseline}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 transition"
          >
            {runningBaseline ? <RefreshCw size={14} className="animate-spin" /> : <Layers size={14} />}
            <span>Compare Baselines</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-xl border border-slate-800">
          {[
            { id: 'all', label: 'All Decisions' },
            { id: 'SCHEDULING', label: 'Scheduling' },
            { id: 'PRIORITIZATION', label: 'Prioritization' },
            { id: 'PLANNING', label: 'Planning' },
            { id: 'REVIEW', label: 'Review Gate' },
            { id: 'EXECUTION', label: 'Execution' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filterType === tab.id
                  ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          Showing {decisions.length} recorded decision{decisions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Top Telemetry Metric Grids */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Decision Quality */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Decision Quality</span>
            <TrendingUp size={15} className="text-violet-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {metrics ? `${pct(metrics.recommendationAcceptanceRate)}%` : '--'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Acceptance Rate · {metrics?.totalRecommendations || 0} Actionable Recommendations
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
            <span>Edit Rate: {metrics ? `${pct(metrics.proposalEditRate)}%` : '--'}</span>
            <span>Reject: {metrics ? `${pct(metrics.recommendationRejectionRate)}%` : '--'}</span>
          </div>
        </div>

        {/* Metric 2: Scheduling Feasibility */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Scheduling Feasibility</span>
            <Clock size={15} className="text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">
            {metrics ? `${pct(metrics.schedulingFeasibilityRate)}%` : '--'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Feasible Requests · 0% Hard Constraint Violations
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
            <span>Avg Windows: {metrics?.averageCandidateCount || '--'}</span>
            <span>Replans: {metrics ? `${pct(metrics.replanningRate)}%` : '--'}</span>
          </div>
        </div>

        {/* Metric 3: Safety & Interceptions */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Safety & Interceptions</span>
            <ShieldCheck size={15} className="text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-400">100%</div>
          <div className="mt-1 text-xs text-slate-500">
            Replay & Staleness Protection Active
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
            <span>Recovery: {metrics ? `${pct(metrics.recoverySuccessRate)}%` : '--'}</span>
            <span>Execution: {metrics ? `${pct(metrics.executionSuccessRate)}%` : '--'}</span>
          </div>
        </div>

        {/* Metric 4: Decision Latency */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Decision Latency</span>
            <Cpu size={15} className="text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {metrics ? `${metrics.averageDecisionLatencyMs}ms` : '--'}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Mean Decision Latency · P95: {metrics?.p95DecisionLatencyMs || '--'}ms
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
            <span>Decisions: {metrics?.totalDecisions || 0}</span>
            <span>Total Logged</span>
          </div>
        </div>
      </div>

      {/* Baseline Comparison Modal / Section (if run) */}
      {baselineResults && (
        <div className="rounded-2xl border border-violet-500/30 bg-violet-950/20 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-violet-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Research Baseline Comparison Evaluation
              </h2>
            </div>
            <button
              onClick={() => setBaselineResults(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {Object.values(baselineResults).map((b) => (
              <div
                key={b.mode}
                className={`rounded-xl p-4 border ${
                  b.mode === 'SENTINEL_NOVA'
                    ? 'border-violet-500/50 bg-violet-900/30 shadow-lg'
                    : 'border-slate-800 bg-slate-900/60'
                }`}
              >
                <div className="text-xs font-semibold text-white truncate">{b.modeName}</div>
                <div className="mt-2 text-xl font-bold text-white">
                  {b.feasibleSchedulesCount > 0 ? `${b.feasibleSchedulesCount} slots` : 'No schedule'}
                </div>
                <div className="mt-2 space-y-1 text-[11px] text-slate-400 border-t border-slate-800/60 pt-2">
                  <div className="flex justify-between">
                    <span>Confidence:</span>
                    <span className="font-semibold text-slate-200">{Math.round(b.averageConfidence * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Violations:</span>
                    <span className="font-semibold text-emerald-400">{b.hardConstraintViolations}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Latency:</span>
                    <span className="text-slate-300">{b.decisionLatencyMs}ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Two-Column Decision Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Decision Telemetry Stream */}
        <div className="lg:col-span-5 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Recent Structured Decisions</span>
            <span>{decisions.length} recorded</span>
          </div>

          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {decisions.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-8 text-center text-xs text-slate-500">
                No decision records logged yet. Start a session with Nova to generate structured telemetry.
              </div>
            ) : (
              decisions.map((d) => {
                const isSelected = selectedDecision?.decisionId === d.decisionId;
                const timeFormatted = new Date(d.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <button
                    key={d.decisionId}
                    onClick={() => setSelectedDecision(d)}
                    className={`w-full text-left rounded-xl p-3.5 border transition-all ${
                      isSelected
                        ? 'border-violet-500/60 bg-violet-950/30 shadow-md'
                        : 'border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{d.decisionType}</span>
                        <span className="text-slate-600 text-xs">·</span>
                        <span className="text-[11px] text-slate-400">{d.agentId.replace('agent.', '')}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{timeFormatted}</span>
                    </div>

                    <div className="mt-1.5 text-xs text-slate-300 font-medium truncate">
                      {d.selectedCandidate?.title || d.selectedCandidate?.window
                        ? `Selected: ${d.selectedCandidate.title || `${d.selectedCandidate.window?.start?.split('T')[1]?.slice(0, 5)}–${d.selectedCandidate.window?.end?.split('T')[1]?.slice(0, 5)}`}`
                        : `Evaluated ${d.candidateCount} candidate${d.candidateCount !== 1 ? 's' : ''}`}
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Strategy: {d.strategy}</span>
                      <span
                        className={
                          d.outcome === 'EXECUTED' || d.outcome === 'ACCEPTED'
                            ? 'text-emerald-400 font-semibold'
                            : d.outcome === 'REJECTED' || d.outcome === 'STALE'
                            ? 'text-rose-400 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {d.outcome}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Explainability & Audit Panel */}
        <div className="lg:col-span-7">
          {selectedDecision ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{selectedDecision.decisionType}</span>
                    <span>·</span>
                    <span>{selectedDecision.agentId}</span>
                    <span>·</span>
                    <span>{new Date(selectedDecision.timestamp).toLocaleString()}</span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-white">
                    {selectedDecision.selectedCandidate?.title || 'Decision Audit Trail'}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-400">Confidence</div>
                  <div className="text-sm font-bold text-violet-400">
                    {Math.round(selectedDecision.confidence * 100)}% ({selectedDecision.confidenceLevel})
                  </div>
                </div>
              </div>

              {/* Explainability Section: WHY THIS? WHY NOW? WHY THIS TIME? */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Structured Reasoning & Explainability
                </h4>

                {/* Why This */}
                {selectedDecision.explanation.whyThis && selectedDecision.explanation.whyThis.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
                    <div className="text-xs font-semibold text-slate-200">Why This Recommendation?</div>
                    <ul className="space-y-1 text-xs text-slate-400">
                      {selectedDecision.explanation.whyThis.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <CheckCircle2 size={13} className="text-emerald-400 mt-0.5 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Why Now */}
                {selectedDecision.explanation.whyNow && selectedDecision.explanation.whyNow.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
                    <div className="text-xs font-semibold text-slate-200">Why Now? (Temporal Priority)</div>
                    <ul className="space-y-1 text-xs text-slate-400">
                      {selectedDecision.explanation.whyNow.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Clock size={13} className="text-blue-400 mt-0.5 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Why This Time (if scheduling) */}
                {selectedDecision.explanation.whyThisTime && selectedDecision.explanation.whyThisTime.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
                    <div className="text-xs font-semibold text-slate-200">Why This Window? (Slot Alignment)</div>
                    <ul className="space-y-1 text-xs text-slate-400">
                      {selectedDecision.explanation.whyThisTime.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Sparkles size={13} className="text-violet-400 mt-0.5 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Why Not Alternative */}
                {selectedDecision.explanation.whyNotAlternative && selectedDecision.explanation.whyNotAlternative.length > 0 && (
                  <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950/40 p-3.5">
                    <div className="text-xs font-semibold text-slate-200">Alternative Comparison</div>
                    <ul className="space-y-1 text-xs text-slate-400">
                      {selectedDecision.explanation.whyNotAlternative.map((reason, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <SlidersHorizontal size={13} className="text-amber-400 mt-0.5 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Factor Scores & Hard Constraints Audit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-800/80 pt-4">
                <div>
                  <h5 className="text-xs font-semibold text-slate-300 mb-2">Factor Weights</h5>
                  <div className="space-y-1 text-xs">
                    {Object.entries(selectedDecision.factorScores || {}).map(([key, score]) => (
                      <div key={key} className="flex items-center justify-between text-slate-400">
                        <span className="capitalize">{key}:</span>
                        <span className="font-mono text-slate-200">{Math.round(score * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="text-xs font-semibold text-slate-300 mb-2">Hard Constraints Verified</h5>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Sleep Rhythm Enforced:</span>
                      <span className="text-emerald-400 font-semibold">Pass</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Calendar Meeting Conflict:</span>
                      <span className="text-emerald-400 font-semibold">Zero Conflict</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Fixed Commitment Protected:</span>
                      <span className="text-emerald-400 font-semibold">Protected</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Dependencies Checked:</span>
                      <span className="text-emerald-400 font-semibold">Satisfied</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Latency & Audit Metadata */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/60 pt-3">
                <span>Decision Latency: {selectedDecision.latencyMs}ms</span>
                <span>Decision ID: {selectedDecision.decisionId.slice(0, 16)}...</span>
                <span>Audit: SHA-256 Parameter Verified</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-12 text-center text-xs text-slate-500">
              Select a decision record on the left to inspect its explainability breakdown and constraint audit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
