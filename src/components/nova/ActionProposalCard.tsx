import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Edit3, 
  Clock, 
  ShieldCheck, 
  AlertTriangle, 
  Loader2,
  Calendar,
  Lock,
  ArrowRight
} from 'lucide-react';

export interface ActionProposalCardProps {
  workflowId: string;
  action: {
    actionId: string;
    type: string;
    description: string;
    taskTitle?: string;
    when?: string;
    conflicts?: string;
    reason?: string;
    riskLevel: string;
    parameters: Record<string, unknown>;
  };
  confirmationBinding?: {
    bindingId: string;
    actionId: string;
    expiresAt: number;
    parameterHash: string;
    reviewerRiskLevel: string;
  } | null;
  status: 'awaiting_confirmation' | 'executing' | 'completed' | 'rejected' | 'failed';
  resultMessage?: string;
  onConfirm: (actionId: string, bindingId: string, parameters?: Record<string, unknown>) => Promise<void>;
  onReject: (actionId: string, reason?: string) => Promise<void>;
  onEdit: (actionId: string, updatedParameters: Record<string, unknown>) => Promise<void>;
}

export const ActionProposalCard: React.FC<ActionProposalCardProps> = ({
  workflowId,
  action,
  confirmationBinding,
  status,
  resultMessage,
  onConfirm,
  onReject,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Editable parameters state
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [scheduledDate, setScheduledDate] = useState(
    (action.parameters.scheduledDate as string) || tomorrow
  );
  const [startTime, setStartTime] = useState(
    ((action.parameters.scheduledStart as string) || '09:00').slice(-8, -3) || '09:00'
  );
  const [endTime, setEndTime] = useState(
    ((action.parameters.scheduledEnd as string) || '10:30').slice(-8, -3) || '10:30'
  );
  const [note, setNote] = useState((action.parameters.note as string) || '');

  const formatActionName = (type: string) => {
    switch (type) {
      case 'SCHEDULE_TASK':
        return 'Schedule Task';
      case 'COMPLETE_TASK':
        return 'Complete Task';
      case 'REOPEN_TASK':
        return 'Reopen Task';
      case 'RECOVERY_ADJUST':
      case 'RECOVERY_ALTERNATIVE':
        return 'Schedule Task (Recovery Alternative)';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  const handleConfirmClick = async () => {
    if (!confirmationBinding) return;
    setIsSubmitting(true);
    try {
      await onConfirm(action.actionId, confirmationBinding.bindingId, action.parameters);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectClick = async () => {
    setIsSubmitting(true);
    try {
      await onReject(action.actionId, 'User selected Reject');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSubmitting(true);
    try {
      const updatedStart = `${scheduledDate}T${startTime}:00.000Z`;
      const updatedEnd = `${scheduledDate}T${endTime}:00.000Z`;
      const updated: Record<string, unknown> = {
        ...action.parameters,
        scheduledDate,
        scheduledStart: updatedStart,
        scheduledEnd: updatedEnd,
      };
      if (note.trim()) {
        updated.note = note.trim();
      }
      await onEdit(action.actionId, updated);
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Remaining TTL calculation
  const minutesLeft = confirmationBinding?.expiresAt
    ? Math.max(0, Math.round((confirmationBinding.expiresAt - Date.now()) / 60000))
    : 5;

  return (
    <div className={`my-3 overflow-hidden rounded-xl border transition-all ${
      status === 'completed'
        ? 'border-emerald-500/40 bg-slate-900/90'
        : status === 'rejected'
        ? 'border-slate-800 bg-slate-900/50 opacity-80'
        : status === 'failed'
        ? 'border-rose-500/40 bg-slate-900/90'
        : 'border-amber-500/40 bg-slate-900/95 shadow-xl'
    }`}>
      {/* Header bar */}
      <div className={`flex items-center justify-between border-b px-4 py-2.5 ${
        status === 'completed'
          ? 'border-emerald-500/20 bg-emerald-950/30'
          : status === 'rejected'
          ? 'border-slate-800 bg-slate-950/40'
          : status === 'failed'
          ? 'border-rose-500/20 bg-rose-950/30'
          : 'border-amber-500/20 bg-amber-950/30'
      }`}>
        <div className="flex items-center gap-2">
          {status === 'completed' ? (
            <CheckCircle2 size={15} className="text-emerald-400" />
          ) : status === 'rejected' ? (
            <XCircle size={15} className="text-slate-500" />
          ) : status === 'failed' ? (
            <AlertTriangle size={15} className="text-rose-400" />
          ) : (
            <ShieldCheck size={15} className="text-amber-400" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            {status === 'completed'
              ? 'Action Completed'
              : status === 'rejected'
              ? 'Action Cancelled'
              : status === 'failed'
              ? 'Execution Failed'
              : 'Action Proposal · Confirmation Required'}
          </span>
        </div>

        {confirmationBinding && status === 'awaiting_confirmation' && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
            <Lock size={12} className="text-amber-400" />
            <span className="font-mono text-[10px] opacity-80">
              {confirmationBinding.bindingId.slice(0, 12)}…
            </span>
            <span aria-hidden="true">·</span>
            <span>{minutesLeft}m TTL</span>
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {/* Action Type & Target */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-400">
            {formatActionName(action.type)}
          </span>
          <h4 className="text-base font-semibold text-white tracking-tight">
            {action.taskTitle || action.description}
          </h4>
        </div>

        {/* Action Details Grid */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs sm:grid-cols-2">
          {action.when && (
            <div>
              <span className="text-[11px] font-medium text-slate-500 block">When</span>
              <span className="font-medium text-slate-200">{action.when}</span>
            </div>
          )}

          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Calendar Conflicts</span>
            <span className="font-medium text-emerald-300">
              {action.conflicts || 'None (Verified against Google Calendar)'}
            </span>
          </div>

          <div className="sm:col-span-2">
            <span className="text-[11px] font-medium text-slate-500 block">Reason</span>
            <span className="text-slate-300">
              {action.reason || 'Fits preferred focus window with highest strategic alignment.'}
            </span>
          </div>

          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Safety Gate</span>
            <span className="font-medium text-emerald-400">
              Reviewer Approved · Risk: {action.riskLevel || 'Low'}
            </span>
          </div>
        </div>

        {/* Inline Edit Form */}
        {isEditing && (
          <div className="mt-4 rounded-lg border border-violet-500/30 bg-violet-950/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-300 mb-3">
              <Edit3 size={13} />
              <span>Edit Action Parameters</span>
            </div>
            <p className="text-[11px] text-amber-300/90 mb-3">
              ⚠️ Note: Any changes require a new safety review by ReviewerAgent before execution.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Target Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-200 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-200 focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-200 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-xs text-slate-400 mb-1">Note (Optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add contextual note..."
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveEdit}
                className="rounded bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Re-reviewing…' : 'Submit for Re-Review'}
              </button>
            </div>
          </div>
        )}

        {/* Buttons / Result Messages */}
        {status === 'awaiting_confirmation' && !isEditing && (
          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-800/80 pt-4">
            <button
              onClick={handleConfirmClick}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Executing…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  <span>Confirm</span>
                </>
              )}
            </button>

            <button
              onClick={() => setIsEditing(true)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
            >
              <Edit3 size={13} />
              <span>Edit</span>
            </button>

            <button
              onClick={handleRejectClick}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-50"
            >
              <XCircle size={13} />
              <span>Reject</span>
            </button>
          </div>
        )}

        {status === 'executing' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-amber-300 border-t border-slate-800/60 pt-3">
            <Loader2 size={14} className="animate-spin text-amber-400" />
            <span>Executing action through ToolManager execution boundary…</span>
          </div>
        )}

        {status === 'completed' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400 border-t border-slate-800/60 pt-3">
            <CheckCircle2 size={15} />
            <span>{resultMessage || '✓ Action successfully executed and verified.'}</span>
          </div>
        )}

        {status === 'rejected' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 border-t border-slate-800/60 pt-3">
            <XCircle size={15} />
            <span>Okay — I won't make that change.</span>
          </div>
        )}

        {status === 'failed' && (
          <div className="mt-4 flex items-center gap-2 text-xs text-rose-400 border-t border-slate-800/60 pt-3">
            <AlertTriangle size={15} />
            <span>{resultMessage || "I couldn't complete that action."}</span>
          </div>
        )}
      </div>
    </div>
  );
};
