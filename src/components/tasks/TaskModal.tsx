import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  Tag,
  AlertCircle,
  Flame,
  CheckCircle2,
  Trash2,
  Plus,
  Repeat,
  Link2,
  Layers,
  Target,
  FolderKanban,
  Flag,
  Sparkles,
  Loader2,
  Check,
} from 'lucide-react';
import { Task, TaskPriority, TaskStatus, Subtask, TaskRecurrence, RecurrenceType } from '../../types';
import {
  getTodayString,
  getTomorrowString,
  formatDueDateDisplay,
  formatDurationMinutes,
} from '../../utils/taskDateUtils';
import { usePlanningProfile } from '../../context/PlanningProfileContext';
import { useGoalProject } from '../../context/GoalProjectContext';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTask?: Task | null;
  allTasks?: Task[];
  onSave: (data: any) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const DURATION_PRESETS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '3h', minutes: 180 },
];

export default function TaskModal({
  isOpen,
  onClose,
  initialTask,
  allTasks = [],
  onSave,
  onDelete,
}: TaskModalProps) {
  const { profile } = usePlanningProfile();
  const { projects, goals } = useGoalProject();
  const timezone = profile?.timezone || 'UTC';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(30);
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Subtasks
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // Dependencies
  const [dependencyIds, setDependencyIds] = useState<string[]>([]);

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');

  // Prepared metadata fields
  const [projectId, setProjectId] = useState<string>('');
  const [goalId, setGoalId] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scheduling Recommendation State (Day 5B.4)
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [schedulingData, setSchedulingData] = useState<{
    recommendation: {
      taskId: string;
      taskTitle: string;
      scheduledStart: string;
      scheduledEnd: string;
      timeFormatted: string;
      durationMinutes: number;
      strategy: string;
      confidence: number;
      rationale: string;
      tradeoffs: string[];
      alternatives: Array<{
        start: string;
        end: string;
        timeFormatted: string;
        fit: string;
        score: number;
        reason: string;
      }>;
    } | null;
    hasFeasibleWindow: boolean;
    unassignedReason?: string;
    action?: any;
    summary?: string;
  } | null>(null);
  const [proposalConfirmed, setProposalConfirmed] = useState(false);

  useEffect(() => {
    setLoadingSchedule(false);
    setScheduleError(null);
    setSchedulingData(null);
    setProposalConfirmed(false);

    if (initialTask) {
      setTitle(initialTask.title || '');
      setDescription(initialTask.description || '');
      setStatus(initialTask.status || 'todo');
      setPriority(initialTask.priority || 'medium');
      setDueDate(initialTask.dueDate || '');
      setDueTime(initialTask.dueTime || '');
      setEstimatedMinutes(initialTask.estimatedMinutes || 30);
      setCustomMinutes('');
      setTags(initialTask.tags || []);
      setSubtasks(initialTask.subtasks ? [...initialTask.subtasks] : []);
      setDependencyIds(initialTask.dependencyIds || []);
      setIsRecurring(Boolean(initialTask.recurring));
      setRecurrenceType(initialTask.recurring?.type || 'weekly');
      setProjectId(initialTask.projectId || '');
      setGoalId(initialTask.goalId || '');
    } else {
      setTitle('');
      setDescription('');
      setStatus('todo');
      setPriority('medium');
      setDueDate(getTodayString(timezone));
      setDueTime('');
      setEstimatedMinutes(30);
      setCustomMinutes('');
      setTags([]);
      setSubtasks([]);
      setDependencyIds([]);
      setIsRecurring(false);
      setRecurrenceType('weekly');
      setProjectId('');
      setGoalId('');
    }
    setError(null);
  }, [initialTask, isOpen, timezone]);

  if (!isOpen) return null;

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSt: Subtask = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: newSubtaskTitle.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setSubtasks([...subtasks, newSt]);
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = (stId: string) => {
    setSubtasks(
      subtasks.map(st => (st.id === stId ? { ...st, completed: !st.completed } : st))
    );
  };

  const handleDeleteSubtask = (stId: string) => {
    setSubtasks(subtasks.filter(st => st.id !== stId));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const finalMinutes = customMinutes ? parseInt(customMinutes, 10) || estimatedMinutes : estimatedMinutes;

    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      status,
      priority,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      estimatedMinutes: Math.max(5, finalMinutes),
      tags,
      subtasks,
      dependencyIds,
      recurring: isRecurring
        ? {
            type: recurrenceType,
          }
        : null,
      projectId: projectId || null,
      goalId: goalId || null,
    };

    try {
      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleFindBestTime = async () => {
    if (!initialTask?.id) {
      setScheduleError('Save this task first to find the best scheduling window.');
      return;
    }

    setLoadingSchedule(true);
    setScheduleError(null);
    setSchedulingData(null);
    setProposalConfirmed(false);

    try {
      const res = await fetch('/api/nova/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskId: initialTask.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to retrieve scheduling recommendation.');
      }

      const data = await res.json();
      setSchedulingData(data);
    } catch (err: any) {
      setScheduleError(err.message || 'Unable to connect to Nova scheduler.');
    } finally {
      setLoadingSchedule(false);
    }
  };

  const completedSubtasksCount = subtasks.filter(s => s.completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasksCount / subtasks.length) * 100) : 0;

  // Filter tasks that can be dependencies (exclude self)
  const availableDependencies = allTasks.filter(t => !initialTask || t.id !== initialTask.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl shadow-black/80"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
                priority === 'urgent'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : priority === 'high'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : priority === 'medium'
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {priority === 'urgent' ? <Flame size={16} /> : <Flag size={15} />}
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                {initialTask ? 'Edit Task' : 'New Task'}
              </h2>
              <p className="text-xs text-slate-400">
                {initialTask ? `Created ${new Date(initialTask.createdAt).toLocaleDateString()}` : 'Define what needs execution'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Task Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              placeholder="e.g. Finish NLP report and benchmark tests"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Status & Priority Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="inbox">Inbox</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Priority
              </label>
              <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-800 bg-slate-950 p-1">
                {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map(p => {
                  const isSelected = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-lg py-1.5 text-xs font-medium capitalize transition ${
                        isSelected
                          ? p === 'urgent'
                            ? 'bg-rose-600 text-white font-semibold shadow-sm'
                            : p === 'high'
                            ? 'bg-amber-600 text-white font-semibold shadow-sm'
                            : p === 'medium'
                            ? 'bg-violet-600 text-white font-semibold shadow-sm'
                            : 'bg-slate-700 text-white font-semibold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Due Date & Time */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Due Date & Time
              </label>
              <span className="text-[11px] text-slate-500">Timezone: {timezone}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button
                type="button"
                onClick={() => setDueDate('')}
                className={`rounded-lg px-2.5 py-1 text-xs border ${
                  !dueDate
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                No date
              </button>
              <button
                type="button"
                onClick={() => setDueDate(getTodayString(timezone))}
                className={`rounded-lg px-2.5 py-1 text-xs border ${
                  dueDate === getTodayString(timezone)
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDueDate(getTomorrowString(timezone))}
                className={`rounded-lg px-2.5 py-1 text-xs border ${
                  dueDate === getTomorrowString(timezone)
                    ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                }`}
              >
                Tomorrow
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <Calendar size={15} className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3.5 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div className="relative">
                <Clock size={15} className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" />
                <input
                  type="time"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  placeholder="Optional time"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3.5 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Scheduling Intelligence (Day 5B.4) */}
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-violet-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
                  Nova Scheduling Intelligence
                </span>
              </div>
              {initialTask?.id ? (
                <button
                  type="button"
                  onClick={handleFindBestTime}
                  disabled={loadingSchedule}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                >
                  {loadingSchedule ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Analyzing calendar...
                    </>
                  ) : (
                    <>
                      <Clock size={13} /> Find Best Time
                    </>
                  )}
                </button>
              ) : (
                <span className="text-[11px] text-slate-500">Save task to find optimal window</span>
              )}
            </div>

            {scheduleError && (
              <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                <AlertCircle size={14} className="shrink-0" />
                <span>{scheduleError}</span>
              </div>
            )}

            {schedulingData && (
              <div className="space-y-3 pt-1">
                {schedulingData.hasFeasibleWindow && schedulingData.recommendation ? (
                  <div className="rounded-xl border border-violet-500/30 bg-slate-950/80 p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                          Recommended
                        </span>
                        <div className="text-sm font-semibold text-white mt-0.5">
                          {schedulingData.recommendation.timeFormatted}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Confidence</span>
                        <div className="text-xs font-bold text-emerald-400">
                          {schedulingData.recommendation.confidence}%
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                      <span>
                        Duration: <strong className="text-slate-200">{schedulingData.recommendation.durationMinutes}m</strong>
                      </span>
                      <span>
                        Strategy: <strong className="text-slate-200 capitalize">{schedulingData.recommendation.strategy.replace('_', ' ')}</strong>
                      </span>
                    </div>

                    <div className="text-slate-300 bg-violet-500/10 rounded-lg p-2 border border-violet-500/15">
                      <strong className="text-violet-300">Why: </strong>
                      {schedulingData.recommendation.rationale}
                    </div>

                    {schedulingData.recommendation.alternatives.length > 0 && (
                      <div className="pt-1 space-y-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Alternative Windows:
                        </span>
                        {schedulingData.recommendation.alternatives.map((alt, idx) => (
                          <div key={idx} className="flex items-center justify-between text-slate-400 text-[11px]">
                            <span>
                              Alternative: <strong className="text-slate-200">{alt.timeFormatted}</strong>
                            </span>
                            <span className="text-[10px] text-slate-500">{alt.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Confirmation UI (Day 5B.4) */}
                    {schedulingData.action?.requiresConfirmation && !proposalConfirmed && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between">
                        <span className="font-medium text-slate-200">Schedule this task?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSchedulingData(null);
                            }}
                            className="rounded-lg border border-slate-800 px-2.5 py-1 text-xs font-medium text-slate-400 hover:text-white transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const rec = schedulingData.recommendation!;
                              if (rec.scheduledStart) {
                                const [datePart, timePart] = rec.scheduledStart.split('T');
                                if (datePart) setDueDate(datePart);
                                if (timePart) setDueTime(timePart.slice(0, 5));
                              }
                              setProposalConfirmed(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-violet-500 transition"
                          >
                            <Check size={12} /> Confirm
                          </button>
                        </div>
                      </div>
                    )}

                    {proposalConfirmed && (
                      <div className="mt-2 flex items-center gap-2 text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                        <CheckCircle2 size={14} className="shrink-0" />
                        <span>
                          Schedule proposal accepted! Click <strong>Save Changes</strong> below to commit to this task.
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                    <p className="font-semibold text-amber-300">No suitable window found</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {schedulingData.unassignedReason || 'No feasible time window found within your working hours and availability constraints.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Estimated Duration */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Estimated Duration
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {DURATION_PRESETS.map(preset => {
                const isSelected = estimatedMinutes === preset.minutes && !customMinutes;
                return (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => {
                      setEstimatedMinutes(preset.minutes);
                      setCustomMinutes('');
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                      isSelected
                        ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-semibold'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="1440"
                placeholder="Custom minutes (e.g. 75)"
                value={customMinutes}
                onChange={e => setCustomMinutes(e.target.value)}
                className="w-48 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <span className="text-xs text-slate-400">
                Current estimate: <strong className="text-violet-300">{formatDurationMinutes(customMinutes ? parseInt(customMinutes, 10) || estimatedMinutes : estimatedMinutes)}</strong>
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Description / Notes
            </label>
            <textarea
              rows={2}
              placeholder="Add key context, links, or acceptance criteria..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* Subtasks Section */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-slate-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Subtasks
                </h3>
              </div>
              {subtasks.length > 0 && (
                <span className="text-xs font-medium text-violet-400">
                  {completedSubtasksCount} of {subtasks.length} ({subtaskProgress}%)
                </span>
              )}
            </div>

            {subtasks.length > 0 && (
              <div className="w-full bg-slate-800 rounded-full h-1.5 mb-3 overflow-hidden">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${subtaskProgress}%` }}
                />
              </div>
            )}

            {/* Subtask items */}
            <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
              {subtasks.map(st => (
                <div
                  key={st.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-200 border border-slate-800/60"
                >
                  <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => handleToggleSubtask(st.id)}
                      className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-violet-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className={st.completed ? 'line-through text-slate-500' : 'text-slate-200'}>
                      {st.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(st.id)}
                    className="text-slate-500 hover:text-rose-400 transition"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add subtask input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add subtask and press enter..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Add
              </button>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {tags.map(t => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300 border border-slate-700"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(t)}
                    className="hover:text-rose-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Add tag (e.g. project, research)..."
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="w-64 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* Dependencies Section */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Link2 size={14} className="text-slate-400" />
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Dependencies (Blocked By)
              </label>
            </div>
            {availableDependencies.length > 0 ? (
              <select
                multiple
                value={dependencyIds}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setDependencyIds(selected);
                }}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none h-24"
              >
                {availableDependencies.map(t => (
                  <option key={t.id} value={t.id} className="py-1">
                    [{t.priority.toUpperCase()}] {t.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-slate-500 italic">No other tasks available to depend on.</p>
            )}
            <p className="mt-1 text-[11px] text-slate-500">Hold Cmd/Ctrl to select multiple dependent tasks.</p>
          </div>

          {/* Recurrence Section */}
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Repeat size={14} className="text-slate-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Recurring Task
                </span>
              </div>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-violet-600 focus:ring-0"
              />
            </div>
            {isRecurring && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-xs text-slate-400">Repeats:</span>
                {(['daily', 'weekly', 'monthly', 'custom'] as RecurrenceType[]).map(r => (
                  <label key={r} className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="recurrence"
                      value={r}
                      checked={recurrenceType === r}
                      onChange={() => setRecurrenceType(r)}
                      className="text-violet-600 bg-slate-900 border-slate-700"
                    />
                    <span className="capitalize">{r}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Strategic Connections (Project & Goal) */}
          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Strategic Alignment
              </label>
              <span className="text-[11px] text-slate-500">
                Connect this task to active initiatives
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <FolderKanban size={13} className="text-indigo-400" />
                  <label className="text-[11px] font-medium text-slate-300">Project</label>
                </div>
                <select
                  value={projectId}
                  onChange={e => {
                    const newProjId = e.target.value;
                    setProjectId(newProjId);
                    if (newProjId) {
                      const proj = projects.find(p => p.id === newProjId);
                      if (proj?.goalId) {
                        setGoalId(proj.goalId);
                      }
                    }
                  }}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="">(No Project / Independent)</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} [{p.status.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Target size={13} className="text-violet-400" />
                  <label className="text-[11px] font-medium text-slate-300">Strategic Goal</label>
                </div>
                <select
                  value={goalId}
                  onChange={e => setGoalId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                >
                  <option value="">(No Goal / Unaligned)</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.title} [{g.priority.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {projectId && (
              <p className="text-[11px] text-slate-500">
                {projects.find(p => p.id === projectId)?.goalId
                  ? 'Goal automatically linked from parent project.'
                  : 'This project is currently independent of any goal.'}
              </p>
            )}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-950/40 rounded-b-2xl">
          {initialTask && onDelete ? (
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Delete task "${initialTask.title}"?`)) {
                  await onDelete(initialTask.id);
                  onClose();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
            >
              <Trash2 size={14} /> Delete
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
