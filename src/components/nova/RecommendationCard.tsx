import React from 'react';
import { Sparkles, ArrowRight, Clock, Target, ShieldCheck, CheckCircle2 } from 'lucide-react';

export interface RecommendationCardProps {
  card: {
    taskId: string;
    taskTitle: string;
    priority: string;
    estimatedEffortMinutes: number;
    whyThisNow: string[];
    confidence: number;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    strategy: string;
    alternatives: Array<{ taskId: string; taskTitle: string; strategy: string; reason: string }>;
    rationale: string;
  };
  onWorkOnThis: (taskId: string, title: string) => void;
  onPlanIt: (taskId: string, title: string) => void;
  onNotNow: () => void;
  isActionTaken?: boolean;
}

export const RecommendationCard: React.FC<RecommendationCardProps> = ({
  card,
  onWorkOnThis,
  onPlanIt,
  onNotNow,
  isActionTaken = false,
}) => {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-violet-500/30 bg-slate-900/90 shadow-xl transition-all">
      {/* Top Banner / Header */}
      <div className="flex items-center justify-between border-b border-violet-500/20 bg-violet-950/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
            Nova Recommends
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>Deliberative Prioritization</span>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-emerald-300">{card.confidence}% confidence</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* Primary Task Title */}
        <h3 className="text-base font-semibold text-white tracking-tight sm:text-lg">
          {card.taskTitle}
        </h3>

        {/* Clean unboxed metadata with subtle typographic separators */}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="font-medium capitalize text-slate-300">
            {card.priority} Priority
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="flex items-center gap-1 text-slate-300">
            <Clock size={12} className="text-slate-500" />
            {card.estimatedEffortMinutes} min estimated
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-slate-400">
            Strategy: {card.strategy}
          </span>
        </div>

        {/* Why this now section */}
        <div className="mt-4 rounded-lg bg-slate-950/60 p-3.5 border border-slate-800/80">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Why this now
          </p>
          <ul className="space-y-1.5">
            {card.whyThisNow.map((reason, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Alternatives section if available */}
        {card.alternatives && card.alternatives.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-400 mb-2">
              Deliberative Alternatives Considered
            </p>
            <div className="space-y-1.5">
              {card.alternatives.map((alt, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-0.5 rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-medium text-slate-200">
                    {idx + 1}. {alt.taskTitle}
                  </span>
                  <span className="text-[11px] text-slate-400 italic">
                    {alt.reason}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {!isActionTaken && (
          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-800/80 pt-4">
            <button
              onClick={() => onWorkOnThis(card.taskId, card.taskTitle)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
            >
              <span>Work on this</span>
              <ArrowRight size={13} />
            </button>
            <button
              onClick={() => onPlanIt(card.taskId, card.taskTitle)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <span>Schedule focus window</span>
            </button>
            <button
              onClick={onNotNow}
              className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
            >
              Not now
            </button>
          </div>
        )}

        {isActionTaken && (
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400 border-t border-slate-800/60 pt-3">
            <CheckCircle2 size={14} />
            <span>Action initiated from this recommendation</span>
          </div>
        )}
      </div>
    </div>
  );
};
