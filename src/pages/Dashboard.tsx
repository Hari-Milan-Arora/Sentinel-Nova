import React from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Flag, Sparkles, Target, Zap } from 'lucide-react';
import { Task, Goal, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics } from '../types';

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

export default function Dashboard({ tasks, goals, onNavigate }: DashboardProps) {
  const activeTasks = tasks.filter(t => t.status !== 'done');
  const completed = tasks.filter(t => t.status === 'done').length;
  const topTask = activeTasks.find(t => t.priority === 'critical') || activeTasks[0];
  const todayTasks = activeTasks.slice(0, 4);
  const avgProgress = goals.length ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length) : 0;

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-violet-400">Sunday, September 6</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Good afternoon, Hari.</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Here is what matters today. Nova has already ranked your workload around deadlines, goals and available focus time.</p>
        </div>
        <button onClick={() => onNavigate('tasks')} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 transition hover:bg-violet-500">
          <Zap size={16} /> Quick add task
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Today', `${completed}/${tasks.length || 0}`, 'tasks completed'],
          ['Focus', `${Math.min(8, activeTasks.reduce((s, t) => s + t.estimatedHours, 0))}h`, 'recommended workload'],
          ['Goals', `${avgProgress}%`, 'average progress'],
          ['Risk', topTask?.delayRisk === 'critical' || topTask?.delayRisk === 'high' ? 'Needs attention' : 'On track', 'schedule health']
        ].map(([label, value, caption]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{caption}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg font-semibold text-white">Today's plan</h2><p className="mt-1 text-xs text-slate-500">Your highest-value work, in order.</p></div>
            <button onClick={() => onNavigate('tasks')} className="text-xs font-semibold text-violet-400 hover:text-violet-300">View all</button>
          </div>
          <div className="mt-5 space-y-2">
            {todayTasks.map(task => (
              <button key={task.id} onClick={() => onNavigate('tasks')} className="group flex w-full items-center gap-4 rounded-xl border border-transparent p-3 text-left transition hover:border-slate-800 hover:bg-slate-950/60">
                <span className="h-5 w-5 rounded-full border border-slate-600 group-hover:border-violet-500" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-200">{task.title}</span><span className="mt-1 flex items-center gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><Clock3 size={12}/>{task.estimatedHours}h</span><span className="capitalize">{task.priority} priority</span></span></span>
                <ChevronRight size={16} className="text-slate-600 transition group-hover:text-violet-400" />
              </button>
            ))}
            {!todayTasks.length && <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">Your task list is clear. Nice work.</div>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-6">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-violet-500/15 p-2 text-violet-300"><Sparkles size={18}/></div><div><p className="text-sm font-semibold text-white">Nova's recommendation</p><p className="mt-2 text-sm leading-6 text-slate-300">Start with <span className="font-semibold text-white">{topTask?.title || 'your most important task'}</span>. Protect a focused block before opening lower-priority work.</p></div></div>
            <button onClick={() => onNavigate('nova')} className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-violet-300">Ask Nova why <ChevronRight size={13}/></button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2"><CalendarDays size={16} className="text-slate-400"/><h3 className="text-sm font-semibold text-white">Next up</h3></div><button onClick={() => onNavigate('calendar')} className="text-xs text-violet-400">Calendar</button></div>
            <div className="mt-4 space-y-3 text-sm"><div className="flex items-center justify-between"><span className="text-slate-300">Deep work block</span><span className="text-xs text-slate-500">2:00 PM</span></div><div className="flex items-center justify-between"><span className="text-slate-300">Team sync</span><span className="text-xs text-slate-500">4:00 PM</span></div></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Goals in motion</h2><p className="mt-1 text-xs text-slate-500">Keep the daily work connected to the bigger picture.</p></div><button onClick={() => onNavigate('goals')} className="text-xs font-semibold text-violet-400">Manage goals</button></div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">{goals.slice(0,3).map(goal => <div key={goal.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Target size={13}/>{goal.category}</div><p className="mt-2 line-clamp-2 text-sm font-medium text-slate-200">{goal.title}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-500" style={{width:`${goal.progress}%`}}/></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{goal.progress}%</span><span>{goal.riskLevel} risk</span></div></div>)}</div>
      </section>
    </div>
  );
}
