import React from 'react';
import { ArrowRight, BrainCircuit, CalendarDays, CheckCircle2, ChevronRight, Clock3, ShieldCheck, Sparkles, Target, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

const features = [
  { icon: Target, title: 'Turn goals into action', text: 'Nova breaks long-term outcomes into milestones, projects and realistic next steps.' },
  { icon: CalendarDays, title: 'Plan around real time', text: 'Connect your calendar so planning respects meetings, focus time and the day you actually have.' },
  { icon: BrainCircuit, title: 'Think before you act', text: 'Nova spots overloaded schedules, deadline risk and dependencies before they become problems.' },
  { icon: Workflow, title: 'Adapt as life changes', text: 'When priorities move, the plan can be recalculated instead of forcing you to start over.' },
];

export default function Landing() {
  return <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
    <header className="relative z-20 border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-950/40"><Sparkles size={18}/></span><span className="font-semibold tracking-tight">Sentinel Nova</span></Link>
        <nav className="hidden items-center gap-7 text-sm text-slate-400 md:flex"><a href="#how-it-works" className="hover:text-white">How it works</a><a href="#features" className="hover:text-white">Capabilities</a><a href="#workflow" className="hover:text-white">Workflow</a></nav>
        <Link to="/login" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900">Sign in</Link>
      </div>
    </header>

    <main>
      <section className="relative mx-auto max-w-7xl px-5 pb-24 pt-20 sm:px-8 sm:pt-28 lg:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-3xl"/>
        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-3 py-1.5 text-xs font-medium text-violet-300"><Sparkles size={13}/> The AI Chief of Staff that thinks before it acts.</div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl lg:text-7xl">Your goals deserve more than a to-do list.</h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">Sentinel Nova connects goals, tasks, time and intelligence into one adaptive operating system for getting meaningful work done.</p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row"><Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">Start with Google <ArrowRight size={16}/></Link><a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-900">See how Nova works <ChevronRight size={16}/></a></div>
        </div>

        <div className="relative z-10 mx-auto mt-20 max-w-5xl rounded-3xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl shadow-black/30 backdrop-blur sm:p-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-800 pb-5"><div><p className="text-xs font-medium text-violet-400">TODAY</p><h2 className="mt-1 text-xl font-semibold">Good afternoon. Here is what matters.</h2></div><span className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-300">Nova plan ready</span></div>
            <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-4 md:col-span-2"><div className="flex items-start gap-3"><div className="rounded-lg bg-violet-500/15 p-2 text-violet-300"><BrainCircuit size={17}/></div><div><p className="text-sm font-semibold">Nova recommends your next move</p><p className="mt-1 text-xs leading-5 text-slate-400">Protect a 90-minute focus block for the highest-impact task before your 4 PM meeting.</p></div></div></div><div className="rounded-xl border border-slate-800 p-4"><p className="text-xs text-slate-500">Focus time</p><p className="mt-2 text-2xl font-semibold">3h 20m</p><p className="mt-1 text-xs text-slate-500">available today</p></div></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl border border-slate-800 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><CheckCircle2 size={14}/> Today's tasks</div><p className="mt-3 text-sm font-medium">Finish memory loop implementation</p><div className="mt-3 h-1.5 rounded-full bg-slate-800"><div className="h-full w-[72%] rounded-full bg-violet-500"/></div></div><div className="rounded-xl border border-slate-800 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14}/> Next event</div><p className="mt-3 text-sm font-medium">Team sync · 4:00 PM</p><p className="mt-1 text-xs text-slate-500">Calendar-aware planning keeps the block realistic.</p></div></div>
          </div>
        </div>
      </section>

      <section id="features" className="border-y border-slate-900 bg-slate-950/70 py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">More than productivity</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">A chief of staff for the work you actually care about.</h2><p className="mt-4 text-sm leading-6 text-slate-400">Nova sits above your planner. It understands the relationship between what you want, what needs to happen, and how much time you really have.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-slate-800 bg-slate-800 md:grid-cols-2">{features.map(({icon:Icon,title,text}) => <div key={title} className="bg-slate-950 p-7"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-violet-300"><Icon size={19}/></div><h3 className="mt-5 text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div></div></section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 sm:px-8"><div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">How it works</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From intention to an adaptive plan.</h2><p className="mt-4 text-sm leading-6 text-slate-400">The system combines structured planning with an intelligence layer that reviews the plan before you commit to it.</p><div className="mt-8 flex items-center gap-3 text-sm text-slate-300"><ShieldCheck size={17} className="text-emerald-400"/> You stay in control of consequential actions.</div></div><div id="workflow" className="space-y-3">{[['01','Define the outcome','Tell Nova what you want to accomplish and when it matters.'],['02','Decompose the work','Nova turns the outcome into milestones, projects and actionable tasks.'],['03','Check reality','Tasks are evaluated against workload, dependencies and calendar availability.'],['04','Recommend, then adapt','Nova explains its recommendation and recalculates when your priorities or time change.']].map(([n,t,d]) => <div key={n} className="flex gap-5 rounded-2xl border border-slate-800 bg-slate-900/50 p-5"><span className="font-mono text-xs text-violet-400">{n}</span><div><h3 className="text-sm font-semibold">{t}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{d}</p></div></div>)}</div></div></section>

      <section className="border-t border-slate-900 py-24"><div className="mx-auto max-w-4xl px-5 text-center sm:px-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300"><Sparkles size={20}/></div><h2 className="mt-5 text-3xl font-semibold tracking-tight">Build your day around the goal, not the noise.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">Connect your identity, tasks and calendar. Let Nova help you decide what deserves attention next.</p><Link to="/login" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950">Enter Sentinel Nova <ArrowRight size={16}/></Link></div></section>
    </main>
    <footer className="border-t border-slate-900 py-7"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 text-xs text-slate-600 sm:px-8"><span>© 2026 Sentinel Nova</span><span>AI Chief of Staff · Planner · Intelligence</span></div></footer>
  </div>;
}
