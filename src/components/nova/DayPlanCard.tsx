import React from 'react';
import { Calendar, Clock, Coffee, ShieldCheck, ArrowRight } from 'lucide-react';

export interface DayPlanBlock {
  timeWindow: string;
  taskId?: string;
  taskTitle: string;
  durationMinutes: number;
  priority?: string;
  goalTitle?: string;
  projectTitle?: string;
  reason: string;
  confidence?: number;
  isBuffer?: boolean;
}

export interface DayPlanCardProps {
  dayPlan: DayPlanBlock[];
  onSchedulePlan?: () => void;
  isScheduled?: boolean;
}

export const DayPlanCard: React.FC<DayPlanCardProps> = ({
  dayPlan,
  onSchedulePlan,
  isScheduled = false,
}) => {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-violet-500/30 bg-slate-900/90 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-violet-500/20 bg-violet-950/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
            Today's Proposed Plan
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>Calibrated for Energy & Capacity</span>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-xs text-slate-400 mb-4">
          Deliberately organized across your working hours with zero calendar conflicts and built-in cognitive buffers:
        </p>

        {/* Timeline blocks */}
        <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {dayPlan.map((block, idx) => (
            <div key={idx} className="relative group">
              {/* Dot marker */}
              <div className={`absolute -left-6 mt-1 h-3 w-3 rounded-full border-2 ${
                block.isBuffer
                  ? 'border-slate-600 bg-slate-800'
                  : 'border-violet-500 bg-violet-950'
              }`} />

              <div className={`rounded-lg border px-3.5 py-2.5 text-xs transition-all ${
                block.isBuffer
                  ? 'border-slate-800/80 bg-slate-950/40 text-slate-400'
                  : 'border-slate-800 bg-slate-950/80 text-slate-200 hover:border-slate-700'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono font-semibold text-slate-300 text-[11px]">
                    <Clock size={12} className={block.isBuffer ? 'text-slate-500' : 'text-violet-400'} />
                    <span>{block.timeWindow}</span>
                  </div>
                  {block.confidence && !block.isBuffer && (
                    <span className="text-[10px] text-emerald-400">
                      {block.confidence}% confidence
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className={`font-semibold ${block.isBuffer ? 'text-slate-400 italic' : 'text-white'}`}>
                    {block.taskTitle}
                  </span>
                  {!block.isBuffer && block.priority && (
                    <span className="text-[10px] font-medium capitalize text-slate-400">
                      {block.priority}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                  {block.reason}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Schedule Mutation Notice */}
        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-400">
          <strong>Note on Day Plans:</strong> A generated plan is a proposal. Any task scheduling mutations require safety review and your explicit confirmation before applying.
        </div>
      </div>
    </div>
  );
};
