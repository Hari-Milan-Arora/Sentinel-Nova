import React, { useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flag,
  Sparkles,
  Target,
  Zap,
  Check,
  Flame,
  ArrowUp,
  AlertTriangle,
  FolderKanban,
} from 'lucide-react';
import { Task, Goal, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics, DayOfWeek } from '../types';
import { usePlanningProfile } from '../context/PlanningProfileContext';
import { useTasks } from '../context/TaskContext';
import { useGoalProject } from '../context/GoalProjectContext';
import { useCalendar } from '../context/CalendarContext';
import { useAuth } from '../auth/AuthContext';
import { formatTime12 } from '../utils/scheduleUtils';
import { getTodayString, getDueDateCategory, formatDurationMinutes } from '../utils/taskDateUtils';
import { findCandidateWindowsForTask } from '../utils/availabilityEngine';
import TaskModal from '../components/tasks/TaskModal';

interface DashboardProps {
  tasks: Task[];
  goals: Goal[];
  opportunities: Opportunity[];
  career: CareerMetrics;
  resume: ResumeMetrics;
  burnout: BurnoutMetrics;
  onNavigate: (tab: string) => void;
  isDark: boolean;
}

export default function Dashboard({ goals: propGoals, onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const { profile } = usePlanningProfile();
  const { tasks, completeTask, reopenTask, createTask } = useTasks();
  const { goals: contextGoals, projects } = useGoalProject();
  const { status: calendarStatus, availability: todayAvailability } = useCalendar();
  const goals = contextGoals.length > 0 ? contextGoals : propGoals;
  const timezone = profile?.timezone || 'UTC';

  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Day & Recurring commitments
  const dayNames: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDate = new Date();
  const todayDay = dayNames[todayDate.getDay()];
  const todayCommitments = profile?.recurringBlocks.filter(b => b.days.includes(todayDay)) || [];

  const todayStr = getTodayString(timezone);

  // Calendar current state & next commitment
  const currentMinutes = todayDate.getHours() * 60 + todayDate.getMinutes();
  const currentSlot = todayAvailability?.blocks.find(b => {
    const sMin = parseInt(b.start.split('T')[1]?.slice(0, 2) || '0', 10) * 60 + parseInt(b.start.split('T')[1]?.slice(3, 5) || '0', 10);
    const eMin = parseInt(b.end.split('T')[1]?.slice(0, 2) || '0', 10) * 60 + parseInt(b.end.split('T')[1]?.slice(3, 5) || '0', 10);
    return currentMinutes >= sMin && currentMinutes < eMin;
  });

  const nextCommitment = todayAvailability?.blocks.find(b => {
    const sMin = parseInt(b.start.split('T')[1]?.slice(0, 2) || '0', 10) * 60 + parseInt(b.start.split('T')[1]?.slice(3, 5) || '0', 10);
    return sMin > currentMinutes && (b.source === 'calendar_busy' || b.source === 'fixed_commitment');
  });

  const remainingFreeMins = todayAvailability?.freeWindows.reduce((acc, w) => {
    const eMin = parseInt(w.end.split('T')[1]?.slice(0, 2) || '0', 10) * 60 + parseInt(w.end.split('T')[1]?.slice(3, 5) || '0', 10);
    if (eMin > currentMinutes) {
      const sMin = parseInt(w.start.split('T')[1]?.slice(0, 2) || '0', 10) * 60 + parseInt(w.start.split('T')[1]?.slice(3, 5) || '0', 10);
      const startEffective = Math.max(currentMinutes, sMin);
      return acc + (eMin - startEffective);
    }
    return acc;
  }, 0) ?? (todayAvailability ? todayAvailability.totalFreeMinutes : 0);

  // Filter tasks relevant for Today's plan
  const todayTasks = tasks.filter(t => {
    if (t.status === 'cancelled') return false;
    const cat = getDueDateCategory(t.dueDate, t.dueTime, timezone);
    return cat === 'today' || cat === 'overdue' || (!t.dueDate && t.status === 'in_progress');
  });

  const activeTodayTasks = todayTasks.filter(t => t.status !== 'completed');
  const completedTodayTasks = todayTasks.filter(t => t.status === 'completed');

  // Overall active tasks for metrics
  const allActiveTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const allCompletedTasks = tasks.filter(t => t.status === 'completed');

  // Find top priority task
  const topTask =
    allActiveTasks.find(t => t.priority === 'urgent') ||
    allActiveTasks.find(t => t.priority === 'high') ||
    allActiveTasks[0];

  // Next Best Window computation (Day 5B.4)
  const candidateWindows = React.useMemo(() => {
    if (!topTask || !todayAvailability?.freeWindows) return [];
    return findCandidateWindowsForTask(topTask, todayAvailability.freeWindows, profile);
  }, [topTask, todayAvailability?.freeWindows, profile]);

  const bestWindow = candidateWindows.length > 0 ? candidateWindows[0] : null;

  // Calculate estimated focus hours for active today tasks
  const focusMinutes = activeTodayTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
  const focusHours = Math.round((focusMinutes / 60) * 10) / 10;

  const avgProgress = goals.length
    ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
    : 0;

  const handleToggleTask = async (taskId: string, currentlyCompleted: boolean) => {
    if (currentlyCompleted) {
      await reopenTask(taskId);
    } else {
      await completeTask(taskId);
    }
  };

  const formattedDate = todayDate.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const userName = user?.name ? user.name.split(' ')[0] : 'Hari';

  return (
    <div className="space-y-7">
      {/* Header */}
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-400">{formattedDate}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
            Good day, {userName}.
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Here is what matters today. Nova has aligned your workload around deadlines, scheduled rhythm, and focus capacity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsQuickAddOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 transition hover:bg-violet-500"
          >
            <Zap size={16} /> Quick add task
          </button>
        </div>
      </section>

      {/* Metric Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Today', `${completedTodayTasks.length}/${todayTasks.length || 0}`, 'tasks completed today'],
          ['Focus', `${focusHours}h`, 'active today workload'],
          ['Goals', `${avgProgress}%`, 'average goal velocity'],
          [
            'Risk',
            topTask?.priority === 'urgent'
              ? 'Needs attention'
              : allActiveTasks.some(t => t.dueDate && t.dueDate < todayStr)
              ? 'Overdue items'
              : 'On track',
            'schedule health',
          ],
        ].map(([label, value, caption]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{caption}</p>
          </div>
        ))}
      </section>

      {/* Main Today View & Sidebar Grid */}
      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        {/* Left: Today's Plan */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Today's plan</h2>
              <p className="mt-1 text-xs text-slate-500">
                Your highest-value work for today, synchronized across Nova.
              </p>
            </div>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-violet-400 hover:text-violet-300"
            >
              View all ({tasks.length})
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {todayTasks.slice(0, 6).map(task => {
              const isCompleted = task.status === 'completed';
              const isOverdue = task.dueDate && task.dueDate < todayStr && !isCompleted;
              const matchedProj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
              const matchedGoal = task.goalId
                ? goals.find(g => g.id === task.goalId)
                : matchedProj?.goalId
                ? goals.find(g => g.id === matchedProj.goalId)
                : null;

              return (
                <div
                  key={task.id}
                  className={`group flex w-full items-center gap-3.5 rounded-xl border p-3 transition ${
                    isCompleted
                      ? 'border-slate-800/40 bg-slate-950/40 opacity-75'
                      : isOverdue
                      ? 'border-rose-900/40 bg-rose-950/10 hover:border-rose-800/60'
                      : 'border-slate-800/80 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  {/* Interactive Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleTask(task.id, isCompleted)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                      isCompleted
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                        : 'border-slate-600 bg-slate-900 text-transparent hover:border-violet-400'
                    }`}
                    title={isCompleted ? 'Mark incomplete' : 'Mark completed'}
                  >
                    <Check size={12} className={isCompleted ? 'opacity-100 stroke-[2.5]' : 'opacity-0'} />
                  </button>

                  {/* Task Content */}
                  <div
                    onClick={() => onNavigate('tasks')}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          isCompleted ? 'line-through text-slate-500' : 'text-slate-200 group-hover:text-white'
                        }`}
                      >
                        {task.title}
                      </span>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 text-[10px] font-semibold bg-rose-500/20 text-rose-300">
                          <AlertTriangle size={10} /> Overdue
                        </span>
                      )}
                      {matchedProj && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                          <FolderKanban size={10} className="text-indigo-400" />
                          <span className="truncate max-w-[100px]">{matchedProj.name}</span>
                        </span>
                      )}
                      {matchedGoal && !matchedProj && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium text-violet-300 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">
                          <Target size={10} className="text-violet-400" />
                          <span className="truncate max-w-[100px]">{matchedGoal.title}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 size={12} />
                        {formatDurationMinutes(task.estimatedMinutes)}
                      </span>
                      <span className="capitalize text-slate-400 font-medium">
                        {task.priority} priority
                      </span>
                      {task.dueTime && (
                        <span className="text-violet-400/90">at {task.dueTime}</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('tasks')}
                    className="text-slate-600 group-hover:text-violet-400 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })}

            {!todayTasks.length && (
              <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400/80" />
                Your task list for today is clear.
                <div className="mt-2">
                  <button
                    onClick={() => setIsQuickAddOpen(true)}
                    className="text-xs font-semibold text-violet-400 hover:text-violet-300 underline underline-offset-4"
                  >
                    Add a task for today
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Recommendation & Schedule */}
        <div className="space-y-5">
          {/* Nova's Recommendation */}
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Nova's recommendation</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {topTask ? (
                    <>
                      Focus first on <span className="font-semibold text-white">{topTask.title}</span>. It is marked{' '}
                      <strong className="text-violet-300 font-semibold">{topTask.priority}</strong> priority.
                      Protect a dedicated block before opening secondary tasks.
                    </>
                  ) : (
                    'Workload is balanced today. Use free intervals to advance medium-term goals or recharge.'
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('nova')}
              className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-violet-300 hover:text-violet-200"
            >
              Ask Nova why <ChevronRight size={13} />
            </button>
          </div>

          {/* Next Best Window (Day 5B.4) */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                Next Best Window
              </span>
              <span className="text-[11px] text-slate-500">Deterministic fit</span>
            </div>

            {bestWindow && topTask ? (
              <div className="space-y-1.5">
                <div className="text-sm font-semibold text-white truncate">{topTask.title}</div>
                <div className="text-base font-bold text-violet-300">
                  {bestWindow.window.startFormatted} – {bestWindow.window.endFormatted}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
                  <span className="capitalize font-medium text-slate-300">
                    {topTask.priority} priority
                  </span>
                  <span>•</span>
                  <span>{bestWindow.window.inPreferredFocusPeriod ? 'Morning focus' : 'Optimal focus'}</span>
                  <span>•</span>
                  <span className="text-emerald-400">No conflicts</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-300">No suitable window found</p>
                <p className="text-xs text-slate-400">
                  {!topTask
                    ? 'No active tasks waiting to be scheduled today.'
                    : 'Remaining free slots today are too short for this task duration.'}
                </p>
              </div>
            )}
          </div>

          {/* Today's Schedule & Calendar Awareness */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={16} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Today's rhythm</h3>
              </div>
              <button
                onClick={() => onNavigate('calendar')}
                className="text-xs text-violet-400 hover:text-violet-300"
              >
                Calendar & Availability →
              </button>
            </div>

            {/* Calendar Awareness Banner */}
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-3 text-xs text-violet-200">
              <div className="font-semibold text-white">
                Nova is planning around your calendar commitments
              </div>
              <p className="mt-1 text-[11px] text-violet-300/80">
                {calendarStatus === 'connected'
                  ? `Google Calendar linked • ${Math.floor(remainingFreeMins / 60)}h ${remainingFreeMins % 60}m free remaining today`
                  : 'Connect Google Calendar to synchronize live meetings and protect focus windows.'}
              </p>
            </div>

            {/* Current Slot & Next Commitment Status */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                <span className="text-[10px] uppercase font-semibold text-slate-500">Current Slot</span>
                <div className="mt-1 font-medium text-white truncate">
                  {currentSlot
                    ? currentSlot.classification === 'free'
                      ? currentSlot.metadata?.inFocusPeriod
                        ? 'Prime Focus'
                        : 'Free Window'
                      : currentSlot.source === 'calendar_busy'
                      ? 'Calendar Busy'
                      : currentSlot.source === 'sleep'
                      ? 'Sleep Rhythm'
                      : 'Fixed Commitment'
                    : 'Free Window'}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                <span className="text-[10px] uppercase font-semibold text-slate-500">Next Up</span>
                <div className="mt-1 font-medium text-amber-300 truncate">
                  {nextCommitment
                    ? `${nextCommitment.title} (${formatTime12(nextCommitment.start.split('T')[1]?.slice(0, 5) || '')})`
                    : 'No more events'}
                </div>
              </div>
            </div>

            <div className="space-y-2.5 text-sm pt-1 border-t border-slate-800/80">
              {todayCommitments.length > 0 ? (
                todayCommitments.slice(0, 2).map(b => (
                  <div key={b.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 truncate max-w-[180px]">{b.title}</span>
                    <span className="text-[11px] font-medium text-amber-300/90 shrink-0">
                      {formatTime12(b.startTime)} – {formatTime12(b.endTime)}
                    </span>
                  </div>
                ))
              ) : profile ? (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Preferred focus block</span>
                  <span className="text-[11px] text-violet-300 shrink-0">
                    {formatTime12(profile.preferredWorkingHours.startTime)} –{' '}
                    {formatTime12(profile.preferredWorkingHours.endTime)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Focus block</span>
                  <span className="text-[11px] text-slate-500">Flexible today</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Goals in Motion */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Goals in motion</h2>
            <p className="mt-1 text-xs text-slate-500">
              Keep the daily work connected to the bigger picture.
            </p>
          </div>
          <button
            onClick={() => onNavigate('goals')}
            className="text-xs font-semibold text-violet-400 hover:text-violet-300"
          >
            Manage goals
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {goals.slice(0, 3).map(goal => (
            <div key={goal.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Target size={13} />
                {goal.category}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-200">{goal.title}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>{goal.progress}%</span>
                <span>{goal.riskLevel} risk</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Add Modal */}
      <TaskModal
        isOpen={isQuickAddOpen}
        allTasks={tasks}
        onClose={() => setIsQuickAddOpen(false)}
        onSave={async data => {
          await createTask(data);
          setIsQuickAddOpen(false);
        }}
      />
    </div>
  );
}
