import React, { useState } from 'react';
import { Plus, Sparkles, Calendar, Clock, Flame, Tag, Clock3, ArrowRight } from 'lucide-react';
import { parseQuickAddText, formatDurationMinutes } from '../../utils/taskDateUtils';
import { usePlanningProfile } from '../../context/PlanningProfileContext';
import { CreateTaskInput } from '../../context/TaskContext';

interface QuickAddBarProps {
  onAddTask: (task: CreateTaskInput) => Promise<any>;
}

export default function QuickAddBar({ onAddTask }: QuickAddBarProps) {
  const { profile } = usePlanningProfile();
  const timezone = profile?.timezone || 'UTC';

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const parsed = input.trim() ? parseQuickAddText(input, timezone) : null;
  const hasMetadata =
    parsed &&
    (parsed.dueDate ||
      parsed.dueTime ||
      parsed.priority ||
      parsed.estimatedMinutes ||
      (parsed.tags && parsed.tags.length > 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      const parsedData = parseQuickAddText(input, timezone);
      await onAddTask({
        title: parsedData.title,
        status: 'todo',
        priority: parsedData.priority || 'medium',
        dueDate: parsedData.dueDate || null,
        dueTime: parsedData.dueTime || null,
        estimatedMinutes: parsedData.estimatedMinutes || 30,
        tags: parsedData.tags || [],
      });
      setInput('');
    } catch (err) {
      console.error('Failed quick add task:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative rounded-2xl border border-slate-800 bg-slate-900/90 p-3 shadow-lg shadow-black/40 transition focus-within:border-violet-500/70 focus-within:ring-1 focus-within:ring-violet-500/30"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
          <Plus size={16} />
        </div>

        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Quick add: e.g. Finish NLP report tomorrow at 6 PM !urgent ~1h #college"
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition disabled:opacity-30 disabled:hover:bg-violet-600"
        >
          <span>Add</span>
          <ArrowRight size={13} />
        </button>
      </div>

      {/* Live parsing feedback preview */}
      {hasMetadata && (
        <div className="mt-2.5 flex items-center gap-2 flex-wrap border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
          <span className="text-slate-500 font-medium">Parsed:</span>

          <span className="font-medium text-slate-200 truncate max-w-xs">
            "{parsed?.title}"
          </span>

          {parsed?.dueDate && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-violet-300">
              <Calendar size={11} />
              <span>{parsed.dueDate}</span>
            </span>
          )}

          {parsed?.dueTime && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-violet-300">
              <Clock size={11} />
              <span>{parsed.dueTime}</span>
            </span>
          )}

          {parsed?.priority && (
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold capitalize ${
                parsed.priority === 'urgent'
                  ? 'bg-rose-500/20 text-rose-300'
                  : parsed.priority === 'high'
                  ? 'bg-amber-500/20 text-amber-300'
                  : parsed.priority === 'medium'
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              <Flame size={11} />
              <span>{parsed.priority}</span>
            </span>
          )}

          {parsed?.estimatedMinutes && (
            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
              <Clock3 size={11} />
              <span>{formatDurationMinutes(parsed.estimatedMinutes)}</span>
            </span>
          )}

          {parsed?.tags?.map(t => (
            <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-400">
              #{t}
            </span>
          ))}
        </div>
      )}
    </form>
  );
}
