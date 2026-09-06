import React from 'react';
import { Bot, CalendarDays, CheckSquare, ChevronDown, Compass, LayoutDashboard, LineChart, LogIn, Menu, Moon, Settings, Sparkles, Target, User, X, Sun } from 'lucide-react';
import { Task, Goal, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics, Conversation, ChatMessage } from './types';
import { PredictionEngine } from './utils/predictionEngine';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Goals from './pages/Goals';
import AIWorkspace from './pages/AIWorkspace';
import CareerIntelligence from './pages/CareerIntelligence';
import ResumeIntelligence from './pages/ResumeIntelligence';
import OpportunityRadar from './pages/OpportunityRadar';
import DigitalTwin from './pages/DigitalTwin';
import Analytics from './pages/Analytics';

const navItems = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

const secondaryItems = [
  { id: 'nova', label: 'Nova AI', icon: Sparkles },
  { id: 'insights', label: 'Insights', icon: LineChart },
];

export default function App() {
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [isDark, setIsDark] = React.useState(true);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const [rawTasks, setRawTasks] = React.useState<Task[]>([
    { id: 't1', title: 'Run Vertex AI tuning job', priority: 'critical', status: 'todo', estimatedHours: 8, daysRemaining: 2, difficulty: 'hard', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't2', title: 'Implement multi-agent memory loop', priority: 'high', status: 'todo', estimatedHours: 6.5, daysRemaining: 3, difficulty: 'hard', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't3', title: 'Refactor router configurations', priority: 'low', status: 'todo', estimatedHours: 2, daysRemaining: 10, difficulty: 'easy', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't4', title: 'Study DeepMind fine-tuning papers', priority: 'medium', status: 'done', estimatedHours: 4, daysRemaining: 5, difficulty: 'medium', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' }
  ]);

  const [rawGoals, setRawGoals] = React.useState<Goal[]>([
    { id: 'g1', title: 'Ship Sentinel Nova MVP', targetDate: '2026-09-12', category: 'project', progress: 72, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'low', reasoning: '' },
    { id: 'g2', title: 'Become an AI Engineer', targetDate: '2026-12-31', category: 'career', progress: 48, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'medium', reasoning: '' },
    { id: 'g3', title: 'Master NLP + LangChain', targetDate: '2026-10-30', category: 'education', progress: 61, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'low', reasoning: '' }
  ]);

  const [rawOpps, setRawOpps] = React.useState<Opportunity[]>([]);
  const [skills, setSkills] = React.useState<{ name: string; score: number }[]>([
    { name: 'TensorFlow', score: 85 }, { name: 'PyTorch', score: 80 }, { name: 'Transformers', score: 70 }, { name: 'LangChain', score: 75 }, { name: 'Vertex AI', score: 50 }, { name: 'System Design', score: 60 }
  ]);

  const [conversations, setConversations] = React.useState<Conversation[]>([{ id: 'conv_1', title: 'Planning session', createdAt: new Date().toISOString(), messages: [] }]);
  const [activeConversationId, setActiveConversationId] = React.useState('conv_1');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3000);
  };

  const computedState = React.useMemo(() => {
    const tasks = PredictionEngine.calculateTaskPredictions(rawTasks);
    const goals = PredictionEngine.calculateGoalSuccess(rawGoals, tasks);
    const career = PredictionEngine.calculateCareerIntelligence(skills);
    const resume = PredictionEngine.calculateResumeIntelligence(skills.length);
    const opportunities = PredictionEngine.calculateOpportunityMatch(rawOpps, skills.map(s => s.name));
    const burnout = PredictionEngine.calculateBurnoutAndProductivity(tasks);
    return { tasks, goals, career, resume, opportunities, burnout, engineStats: PredictionEngine.getEngineMetrics() };
  }, [rawTasks, rawGoals, rawOpps, skills]);

  const handleAddTask = (task: Omit<Task, 'id' | 'completionProbability' | 'predictedCompletionDate' | 'delayRisk' | 'timeAllocationHours'>) => {
    setRawTasks(prev => [{ ...task, id: `t_${Date.now()}`, completionProbability: 50, predictedCompletionDate: '', delayRisk: 'low' }, ...prev]);
    showToast('Task added');
  };
  const handleUpdateTask = (id: string, updates: Partial<Task>) => { setRawTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t)); };
  const handleDeleteTask = (id: string) => { setRawTasks(prev => prev.filter(t => t.id !== id)); showToast('Task deleted'); };
  const handleAddGoal = (goal: Omit<Goal, 'id' | 'successProbability' | 'failureProbability' | 'predictedMilestoneDelay' | 'riskLevel' | 'aiRecoveryPlan' | 'reasoning'>) => {
    setRawGoals(prev => [{ ...goal, id: `g_${Date.now()}`, successProbability: 50, failureProbability: 50, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'low', reasoning: '' }, ...prev]);
    showToast('Goal added');
  };
  const handleUpdateGoal = (id: string, updates: Partial<Goal>) => { setRawGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g)); };
  const handleDeleteGoal = (id: string) => { setRawGoals(prev => prev.filter(g => g.id !== id)); showToast('Goal deleted'); };
  const handleAddOpportunity = (opp: Omit<Opportunity, 'id' | 'fitScore' | 'expectedSuccess' | 'applicationConfidence' | 'careerImpactScore' | 'deadlineUrgency'>) => setRawOpps(prev => [{ ...opp, id: `o_${Date.now()}`, fitScore: 50, expectedSuccess: 50, applicationConfidence: 50, careerImpactScore: 50, deadlineUrgency: 'low' }, ...prev]);
  const handleDeleteOpportunity = (id: string) => setRawOpps(prev => prev.filter(o => o.id !== id));
  const handleUpdateSkills = (name: string, score: number) => setSkills(prev => prev.map(s => s.name === name ? { ...s, score } : s));

  const handleSendMessage = async (convId: string, text: string) => {
    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString() };
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c));
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, history: conversations.find(c => c.id === convId)?.messages || [], tasks: computedState.tasks, goals: computedState.goals }) });
      if (!response.ok) throw new Error('API failed');
      const data = await response.json();
      const modelMsg: ChatMessage = { id: `msg_${Date.now()+1}`, role: 'model', content: data.content || 'I could not complete that plan yet.', timestamp: new Date().toISOString(), confidenceScore: data.confidenceScore, explainability: data.explainability };
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, modelMsg] } : c));
    } catch { showToast('Nova is temporarily unavailable'); }
  };

  const go = (tab: string) => { setActiveTab(tab); setMobileNav(false); };

  const renderPage = () => {
    if (activeTab === 'dashboard') return <Dashboard {...computedState} onNavigate={go} isDark={isDark} />;
    if (activeTab === 'tasks') return <Tasks tasks={computedState.tasks} onAddTask={handleAddTask} onUpdateTask={handleUpdateTask} onDeleteTask={handleDeleteTask} onRecalibrate={() => showToast('Nova recalculated your workload')} isDark={isDark} />;
    if (activeTab === 'goals') return <Goals goals={computedState.goals} onAddGoal={handleAddGoal} onUpdateGoal={handleUpdateGoal} onDeleteGoal={handleDeleteGoal} onRecalibrate={() => showToast('Goal plan refreshed')} isDark={isDark} />;
    if (activeTab === 'nova') return <AIWorkspace conversations={conversations} activeConversationId={activeConversationId} onSendMessage={handleSendMessage} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onSelectConversation={setActiveConversationId} onNewConversation={() => { const id = `conv_${Date.now()}`; setConversations(prev => [{ id, title: 'New planning session', createdAt: new Date().toISOString(), messages: [] }, ...prev]); setActiveConversationId(id); }} tasks={computedState.tasks} goals={computedState.goals} isDark={isDark} showToast={showToast} />;
    if (activeTab === 'insights') return <Analytics burnout={computedState.burnout} engineStats={computedState.engineStats} isDark={isDark} />;
    if (activeTab === 'career') return <CareerIntelligence career={computedState.career} onUpdateSkills={handleUpdateSkills} isDark={isDark} />;
    if (activeTab === 'resume') return <ResumeIntelligence resume={computedState.resume} onOptimize={() => showToast('Resume analysis refreshed')} isDark={isDark} />;
    if (activeTab === 'radar') return <OpportunityRadar opportunities={computedState.opportunities} onAddOpportunity={handleAddOpportunity} onDeleteOpportunity={handleDeleteOpportunity} onRecalibrate={() => showToast('Opportunity ranking refreshed')} isDark={isDark} />;
    if (activeTab === 'twin') return <DigitalTwin burnout={computedState.burnout} engineStats={computedState.engineStats} onUpdateWeights={() => showToast('Behavior model refreshed')} isDark={isDark} />;
    if (activeTab === 'calendar') return <CalendarPlaceholder onConnect={() => showToast('Google Calendar connection is scheduled for Day 4')} />;
    return <SettingsPlaceholder onGoogle={() => showToast('Google sign-in foundation is ready for OAuth wiring')} />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {toast && <div className="fixed right-5 top-5 z-[80] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl">{toast}</div>}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-400 lg:hidden" onClick={() => setMobileNav(v => !v)}>{mobileNav ? <X size={20}/> : <Menu size={20}/>}</button><button onClick={() => go('dashboard')} className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-900/30"><Bot size={19}/></div><div className="text-left"><div className="text-sm font-semibold tracking-tight">Sentinel Nova</div><div className="hidden text-[10px] text-slate-500 sm:block">AI Chief of Staff</div></div></button></div>
          <div className="flex items-center gap-1.5"><button onClick={() => setIsDark(v => !v)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">{isDark ? <Sun size={17}/> : <Moon size={17}/>}</button><button onClick={() => setShowProfile(v => !v)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-800"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold">HM</div><ChevronDown size={14} className="hidden text-slate-500 sm:block"/></button></div>
        </div>
        {showProfile && <div className="absolute right-4 top-14 w-52 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl"><div className="px-3 py-2 text-xs text-slate-500">Signed in as</div><div className="px-3 pb-2 text-sm font-medium text-white">Hari Milan</div><button onClick={() => { setShowProfile(false); go('settings'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><Settings size={15}/> Settings</button></div>}
      </header>

      <aside className={`fixed bottom-0 left-0 top-16 z-40 w-64 border-r border-slate-800/80 bg-slate-950 px-3 py-5 transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}>
        <nav className="space-y-1">{navItems.map(item => <NavButton key={item.id} item={item} active={activeTab === item.id} onClick={() => go(item.id)} />)}</nav>
        <div className="my-5 border-t border-slate-800"/>
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Intelligence</div>
        <nav className="space-y-1">{secondaryItems.map(item => <NavButton key={item.id} item={item} active={activeTab === item.id} onClick={() => go(item.id)} />)}</nav>
        <div className="my-5 border-t border-slate-800"/>
        <NavButton item={{ id: 'settings', label: 'Settings', icon: Settings }} active={activeTab === 'settings'} onClick={() => go('settings')} />
        <div className="mt-auto pt-8"><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2"><div className="rounded-lg bg-violet-500/10 p-2 text-violet-400"><Sparkles size={15}/></div><div><p className="text-xs font-semibold text-slate-200">Nova is ready</p><p className="text-[10px] text-slate-500">Plan, prioritize, adapt.</p></div></div></div></div>
      </aside>

      <main className="min-h-screen pt-16 lg:pl-64"><div className="mx-auto max-w-[1400px] p-5 sm:p-7 lg:p-10">{renderPage()}</div></main>
    </div>
  );
}

function NavButton({ item, active, onClick }: { item: { id: string; label: string; icon: React.ComponentType<{ size?: number }> }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-violet-500/10 text-violet-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}><Icon size={17}/><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400"/>}</button>;
}

function CalendarPlaceholder({ onConnect }: { onConnect: () => void }) {
  return <div className="mx-auto max-w-3xl py-16 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300"><CalendarDays size={25}/></div><h1 className="mt-5 text-3xl font-semibold">Your calendar, inside Nova.</h1><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">Google Calendar will become Nova's availability layer: events, focus blocks and intelligent scheduling without turning your calendar into a second task list.</p><button onClick={onConnect} className="mt-7 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-950">Connect Google Calendar</button></div>;
}

function SettingsPlaceholder({ onGoogle }: { onGoogle: () => void }) {
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-semibold">Settings</h1><p className="mt-2 text-sm text-slate-400">Account, integrations and Nova preferences.</p><div className="mt-7 rounded-2xl border border-slate-800 bg-slate-900/70 p-6"><div className="flex items-center justify-between gap-4"><div><p className="font-semibold text-white">Google account</p><p className="mt-1 text-sm text-slate-500">Sign in with Google will be the identity layer for Sentinel Nova.</p></div><button onClick={onGoogle} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-white"><LogIn size={15}/> Continue with Google</button></div></div></div>;
}
