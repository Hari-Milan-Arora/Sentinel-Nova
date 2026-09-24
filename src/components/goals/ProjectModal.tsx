import React, { useState, useEffect } from 'react';
import { X, FolderKanban, AlertCircle, Target } from 'lucide-react';
import { Project, ProjectPriority, ProjectStatus, Goal } from '../../types';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Project>) => Promise<void>;
  initialProject?: Project | null;
  goals: Goal[];
  defaultGoalId?: string | null;
}

export default function ProjectModal({
  isOpen,
  onClose,
  onSave,
  initialProject,
  goals,
  defaultGoalId,
}: ProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState<string>('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [priority, setPriority] = useState<ProjectPriority>('medium');
  const [targetDate, setTargetDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProject) {
      setName(initialProject.name || '');
      setDescription(initialProject.description || '');
      setGoalId(initialProject.goalId || '');
      setStatus(initialProject.status || 'active');
      setPriority(initialProject.priority || 'medium');
      setTargetDate(initialProject.targetDate || '');
      setProgress(initialProject.progress || 0);
    } else {
      setName('');
      setDescription('');
      setGoalId(defaultGoalId || '');
      setStatus('active');
      setPriority('high');
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setTargetDate(d.toISOString().split('T')[0]);
      setProgress(0);
    }
    setError(null);
  }, [initialProject, defaultGoalId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        goalId: goalId || null,
        status,
        priority,
        targetDate: targetDate || null,
        progress: Math.min(100, Math.max(0, progress)),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl shadow-black/80"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/20">
              <FolderKanban size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                {initialProject ? 'Edit Project' : 'New Project'}
              </h2>
              <p className="text-xs text-slate-400">
                A structured initiative grouping related tasks toward an outcome.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle size={15} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sentinel Nova Core"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Parent Goal (Strategic Alignment)
            </label>
            <div className="relative">
              <select
                value={goalId}
                onChange={e => setGoalId(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              >
                <option value="">(None — Independent Project)</option>
                {goals.map(g => (
                  <option key={g.id} value={g.id}>
                    Goal: {g.title} [{g.priority.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Projects linked to a goal automatically contribute to that goal's progress and intelligence.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Description / Scope
            </label>
            <textarea
              rows={3}
              placeholder="Key deliverables, scope boundaries, and core milestones..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as ProjectPriority)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none capitalize"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical Priority</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Status
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as ProjectStatus)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none capitalize"
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Target Deadline
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                <span>Fallback Progress</span>
                <span className="text-indigo-400 font-mono">{progress}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={progress}
                onChange={e => setProgress(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 h-1.5 bg-slate-950 rounded-lg cursor-pointer mt-2"
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 px-6 py-4 bg-slate-950/40 rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-900/30 hover:bg-indigo-500 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : initialProject ? 'Update Project' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
