import React, { useState, useEffect } from 'react';
import { X, Target, Calendar, AlertCircle } from 'lucide-react';
import { Goal, GoalPriority, GoalStatus } from '../../types';

interface GoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Goal>) => Promise<void>;
  initialGoal?: Goal | null;
}

export default function GoalModal({
  isOpen,
  onClose,
  onSave,
  initialGoal,
}: GoalModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('medium');
  const [status, setStatus] = useState<GoalStatus>('active');
  const [targetDate, setTargetDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [category, setCategory] = useState<'career' | 'technical' | 'project' | 'education'>('project');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialGoal) {
      setTitle(initialGoal.title || '');
      setDescription(initialGoal.description || '');
      setPriority(initialGoal.priority || 'medium');
      setStatus(initialGoal.status || 'active');
      setTargetDate(initialGoal.targetDate || '');
      setProgress(initialGoal.progress || 0);
      setCategory(initialGoal.category || 'project');
    } else {
      setTitle('');
      setDescription('');
      setPriority('high');
      setStatus('active');
      // Default to 60 days from now
      const d = new Date();
      d.setDate(d.getDate() + 60);
      setTargetDate(d.toISOString().split('T')[0]);
      setProgress(0);
      setCategory('career');
    }
    setError(null);
  }, [initialGoal, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Goal title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        targetDate: targetDate || undefined,
        progress: Math.min(100, Math.max(0, progress)),
        category,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save goal.');
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
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/20">
              <Target size={18} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-white">
                {initialGoal ? 'Edit Strategic Goal' : 'Establish Strategic Goal'}
              </h2>
              <p className="text-xs text-slate-400">
                Define the overarching outcome guiding your projects and tasks.
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
              Goal Outcome Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Build production-ready AI engineering portfolio"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Description / Impact Narrative
            </label>
            <textarea
              rows={3}
              placeholder="Why this matters and what success criteria look like..."
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
                onChange={e => setPriority(e.target.value as GoalPriority)}
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
                onChange={e => setStatus(e.target.value as GoalStatus)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none capitalize"
              >
                <option value="active">Active</option>
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
              <div className="relative">
                <input
                  type="date"
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-violet-500 focus:outline-none capitalize"
              >
                <option value="career">Career Trajectory</option>
                <option value="technical">Technical Training</option>
                <option value="project">Project Deliverable</option>
                <option value="education">Academic Milestone</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              <span>Baseline Progress (0-100%)</span>
              <span className="text-violet-400 font-mono">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={progress}
              onChange={e => setProgress(parseInt(e.target.value, 10))}
              className="w-full accent-violet-600 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Note: When projects with tasks are linked, goal progress automatically calculates from project task velocity.
            </p>
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
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : initialGoal ? 'Update Goal' : 'Create Goal'}
          </button>
        </div>
      </div>
    </div>
  );
}
