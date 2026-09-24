import React from 'react';
import {
  CheckCircle2,
  Circle,
  Clock3,
  Calendar,
  AlertTriangle,
  Flame,
  ArrowUp,
  Minus,
  ArrowDown,
  Layers,
  Link2,
  Repeat,
  Tag,
  Target,
  FolderKanban,
  Check,
} from 'lucide-react';
import { Task, TaskPriority } from '../../types';
import {
  formatDueDateDisplay,
  formatDurationMinutes,
} from '../../utils/taskDateUtils';
import { usePlanningProfile } from '../../context/PlanningProfileContext';
import { useGoalProject } from '../../context/GoalProjectContext';

interface TaskRowProps {
  task: Task;
  onToggleComplete: (id: string, currentlyCompleted: boolean) => void;
  onClick: (task: Task) => void;
}

export default function TaskRow({ task, onToggleComplete, onClick }: TaskRowProps) {
  const { profile } = usePlanningProfile();
  const { projects, goals } = useGoalProject();
  const timezone = profile?.timezone || 'UTC';

  const matchedProject = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  const matchedGoal = task.goalId
    ? goals.find(g => g.id === task.goalId)
    : matchedProject?.goalId
    ? goals.find(g => g.id === matchedProject.goalId)
    : null;

  const isCompleted = task.status === 'completed';
  const dueInfo = formatDueDateDisplay(task.dueDate, task.dueTime, timezone);

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;

  const renderPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
            <Flame size={12} className="text-rose-400" />
            <span>Urgent</span>
          </span>
        );
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
            <ArrowUp size={12} className="text-amber-400" />
            <span>High</span>
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300">
            <Minus size={12} className="text-violet-400" />
            <span>Med</span>
          </span>
        );
      case 'low':
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            <ArrowDown size={12} className="text-slate-500" />
            <span>Low</span>
          </span>
        );
    }
  };

  const renderDueDateBadge = () => {
    if (dueInfo.status === 'none') return null;

    if (dueInfo.status === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-300">
          <AlertTriangle size={11} className="text-rose-400" />
          <span>{dueInfo.label}</span>
        </span>
      );
    }

    if (dueInfo.status === 'today') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
          <Clock3 size={11} className="text-violet-400" />
          <span>{dueInfo.label}</span>
        </span>
      );
    }

    if (dueInfo.status === 'tomorrow') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-slate-300">
          <Calendar size={11} className="text-slate-400" />
          <span>{dueInfo.label}</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
        <Calendar size={11} className="text-slate-500" />
        <span>{dueInfo.label}</span>
      </span>
    );
  };

  return (
    <div
      onClick={() => onClick(task)}
      className={`group relative flex items-center justify-between gap-3 sm:gap-4 rounded-xl border px-3.5 py-3 transition-all duration-150 cursor-pointer ${
        isCompleted
          ? 'border-slate-800/50 bg-slate-950/40 opacity-70 hover:opacity-90'
          : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
      }`}
    >
      {/* Left side: Checkbox + Title + Meta badges */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Toggle Complete Checkbox */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onToggleComplete(task.id, isCompleted);
          }}
          className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
            isCompleted
              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
              : 'border-slate-700 bg-slate-950/80 text-transparent hover:border-violet-500 hover:text-violet-400'
          }`}
          title={isCompleted ? 'Mark incomplete' : 'Mark completed'}
        >
          <Check size={12} className={isCompleted ? 'opacity-100 stroke-[2.5]' : 'opacity-0 group-hover:opacity-100'} />
        </button>

        {/* Task Details */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium tracking-tight ${
                isCompleted ? 'line-through text-slate-500' : 'text-slate-100 group-hover:text-white'
              }`}
            >
              {task.title}
            </span>

            {/* Recurrence Indicator */}
            {task.recurring && (
              <span title={`Repeats ${task.recurring.type}`} className="text-slate-500">
                <Repeat size={12} />
              </span>
            )}

            {/* Dependency Indicator */}
            {task.dependencyIds && task.dependencyIds.length > 0 && (
              <span
                title={`Blocked by ${task.dependencyIds.length} dependencies`}
                className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/80"
              >
                <Link2 size={11} />
                <span>{task.dependencyIds.length}</span>
              </span>
            )}
          </div>

          {/* Secondary Info row */}
          <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-slate-400">
            {/* Priority */}
            {renderPriorityBadge(task.priority)}

            {/* Due Date */}
            {renderDueDateBadge()}

            {/* Estimated Duration */}
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[11px] text-slate-400">
              <Clock3 size={11} className="text-slate-500" />
              <span>{formatDurationMinutes(task.estimatedMinutes)}</span>
            </span>

            {/* Subtasks pill */}
            {totalSubtasks > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[11px] text-slate-400">
                <Layers size={11} className="text-slate-500" />
                <span>
                  {completedSubtasks}/{totalSubtasks}
                </span>
              </span>
            )}

            {/* Tags */}
            {task.tags?.map(t => (
              <span
                key={t}
                className="hidden sm:inline-flex items-center rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-400"
              >
                #{t}
              </span>
            ))}

            {/* Project / Goal */}
            {matchedProject && (
              <span className="hidden md:inline-flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
                <FolderKanban size={10} className="text-indigo-400" />
                <span className="truncate max-w-[120px]">{matchedProject.name}</span>
              </span>
            )}
            {matchedGoal && !matchedProject && (
              <span className="hidden md:inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                <Target size={10} className="text-violet-400" />
                <span className="truncate max-w-[120px]">{matchedGoal.title}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right side: Status indicator / Edit chevron */}
      <div className="shrink-0 flex items-center gap-2">
        <span
          className={`text-[11px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${
            task.status === 'in_progress'
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : task.status === 'completed'
              ? 'bg-emerald-500/10 text-emerald-400'
              : task.status === 'inbox'
              ? 'bg-slate-800 text-slate-400'
              : 'text-slate-500'
          }`}
        >
          {task.status === 'in_progress' ? 'Active' : task.status}
        </span>
      </div>
    </div>
  );
}
