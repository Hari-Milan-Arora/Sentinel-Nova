import React, { lazy, Suspense } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Bot, CalendarDays, CheckSquare, ChevronDown, LayoutDashboard, LineChart, LogIn, Menu, Moon, Settings, Sparkles, Target, X, Sun, LogOut, AlertTriangle } from 'lucide-react';
import { Task, Opportunity, Conversation, ChatMessage } from './types';
import { PredictionEngine } from './utils/predictionEngine';
import { useAuth } from './auth/AuthContext';
import { usePlanningProfile } from './context/PlanningProfileContext';
import { useTasks } from './context/TaskContext';
import { useGoalProject } from './context/GoalProjectContext';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tasks = lazy(() => import('./pages/Tasks'));
const Goals = lazy(() => import('./pages/Goals'));
const AIWorkspace = lazy(() => import('./pages/AIWorkspace'));
const CareerIntelligence = lazy(() => import('./pages/CareerIntelligence'));
const ResumeIntelligence = lazy(() => import('./pages/ResumeIntelligence'));
const OpportunityRadar = lazy(() => import('./pages/OpportunityRadar'));
const DigitalTwin = lazy(() => import('./pages/DigitalTwin'));
const Insights = lazy(() => import('./pages/Insights'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const CalendarPage = lazy(() => import('./pages/Calendar'));

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
  const { user, logout } = useAuth();
  const { profile, loading: profileLoading } = usePlanningProfile();
  const location = useLocation();
  const navigate = useNavigate();

  // If on the onboarding route, render the onboarding flow directly
  const isOnboardingRoute = location.pathname.startsWith('/app/onboarding');

  const getTabFromPath = (pathname: string) => {
    const sub = pathname.replace(/^\/app\/?/, '').split('/')[0];
    if (sub === 'tasks') return 'tasks';
    if (sub === 'goals') return 'goals';
    if (sub === 'calendar') return 'calendar';
    if (sub === 'nova') return 'nova';
    if (sub === 'insights') return 'insights';
    if (sub === 'settings') return 'settings';
    if (sub === 'career') return 'career';
    if (sub === 'resume') return 'resume';
    if (sub === 'radar') return 'radar';
    if (sub === 'twin') return 'twin';
    return 'dashboard';
  };

  const activeTab = getTabFromPath(location.pathname);
  const [isDark, setIsDark] = React.useState(true);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [showProfile, setShowProfile] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [tasksFilter, setTasksFilter] = React.useState<{ projectId?: string; goalId?: string } | null>(null);

  const { tasks: realTasks, createTask, updateTask, deleteTask, refreshTasks } = useTasks();
  const { goals: persistedGoals } = useGoalProject();
  const [rawOpps, setRawOpps] = React.useState<Opportunity[]>([]);
  const [skills, setSkills] = React.useState<{ name: string; score: number }[]>([
    { name: 'TensorFlow', score: 85 }, { name: 'PyTorch', score: 80 }, { name: 'Transformers', score: 70 }, { name: 'LangChain', score: 75 }, { name: 'Vertex AI', score: 50 }, { name: 'System Design', score: 60 }
  ]);
  const [conversations, setConversations] = React.useState<Conversation[]>([{ id: 'conv_1', title: 'Planning session', createdAt: new Date().toISOString(), messages: [] }]);
  const [activeConversationId, setActiveConversationId] = React.useState('conv_1');
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3000); };
  const computedState = React.useMemo(() => ({
    tasks: PredictionEngine.calculateTaskPredictions(realTasks),
    goals: PredictionEngine.calculateGoalSuccess(persistedGoals, PredictionEngine.calculateTaskPredictions(realTasks)),
    career: PredictionEngine.calculateCareerIntelligence(skills),
    resume: PredictionEngine.calculateResumeIntelligence(skills.length),
    opportunities: PredictionEngine.calculateOpportunityMatch(rawOpps, skills.map(s => s.name)),
    burnout: PredictionEngine.calculateBurnoutAndProductivity(PredictionEngine.calculateTaskPredictions(realTasks)),
    engineStats: PredictionEngine.getEngineMetrics()
  }), [realTasks, persistedGoals, rawOpps, skills]);
  const handleAddTask = async (task: any) => { 
    try {
      await createTask(task); 
      showToast('Task added');
    } catch {
      showToast('Failed to add task');
    }
  };
  const handleUpdateTask = async (id: string, updates: Partial<Task>) => {
    try {
      await updateTask(id, updates);
    } catch {
      showToast('Failed to update task');
    }
  };
  const handleDeleteTask = async (id: string) => { 
    try {
      await deleteTask(id); 
      showToast('Task deleted');
    } catch {
      showToast('Failed to delete task');
    }
  };
  const handleAddOpportunity = (opp: Omit<Opportunity, 'id' | 'fitScore' | 'expectedSuccess' | 'applicationConfidence' | 'careerImpactScore' | 'deadlineUrgency'>) => setRawOpps(prev => [{ ...opp, id: `o_${Date.now()}`, fitScore: 50, expectedSuccess: 50, applicationConfidence: 50, careerImpactScore: 50, deadlineUrgency: 'low' }, ...prev]);
  const handleDeleteOpportunity = (id: string) => setRawOpps(prev => prev.filter(o => o.id !== id));
  const handleUpdateSkills = (name: string, score: number) => setSkills(prev => prev.map(s => s.name === name ? { ...s, score } : s));
  const handleSendMessage = async (convId: string, text: string) => {
    const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: 'user', content: text, timestamp: new Date().toISOString() };
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, userMsg] } : c));
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ message: text }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Nova could not complete this request.');
      const modelMsg: ChatMessage = { id: `msg_${Date.now()+1}`, role: 'model', content: data.content || 'I could not complete that plan yet.', timestamp: new Date().toISOString(), confidenceScore: data.confidenceScore, explainability: data.explainability };
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, modelMsg] } : c));
    } catch (error) {
      const failureMsg: ChatMessage = {
        id: `msg_${Date.now()+1}`,
        role: 'model',
        content: `I could not complete that request. ${error instanceof Error ? error.message : 'Please try again.'}`,
        timestamp: new Date().toISOString(),
      };
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, failureMsg] } : c));
    }
  };
  const go = (tab: string) => {
    setMobileNav(false);
    if (tab === 'dashboard') {
      navigate('/app');
    } else {
      navigate(`/app/${tab}`);
    }
  };
  // 1. Onboarding dedicated screen
  if (isOnboardingRoute) {
    return <Suspense fallback={<PageLoading />}><Onboarding /></Suspense>;
  }

  // 2. Profile loading screen
  if (profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-violet-400" />
          <p className="mt-4 text-xs font-medium tracking-wide text-slate-400">
            Loading planning rhythm…
          </p>
        </div>
      </div>
    );
  }

  // 3. First-time user onboarding redirect: if profile incomplete, redirect to /app/onboarding
  if (!profile || (!profile.onboardingCompleted && !profile.onboardingSkipped)) {
    return <Navigate to="/app/onboarding" replace />;
  }

  const renderPage = () => {
    if (activeTab === 'dashboard') {
      return (
        <div className="space-y-6">
          {profile?.onboardingSkipped && (
            <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-200 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={16} className="shrink-0 text-amber-400" />
                <span>
                  <strong>Baseline schedule needed:</strong> Nova is operating without your verified sleep and recurring commitments.
                </span>
              </div>
              <button
                onClick={() => navigate('/app/onboarding')}
                className="shrink-0 font-semibold text-amber-300 underline underline-offset-2 hover:text-white"
              >
                Complete schedule setup →
              </button>
            </div>
          )}
          <Dashboard {...computedState} onNavigate={go} isDark={isDark} />
        </div>
      );
    }
    if (activeTab === 'tasks') {
      return (
        <Tasks
          initialProjectId={tasksFilter?.projectId}
          initialGoalId={tasksFilter?.goalId}
          onClearFilter={() => setTasksFilter(null)}
        />
      );
    }
    if (activeTab === 'goals') {
      return (
        <Goals
          onNavigateToTasks={(filter) => {
            setTasksFilter(filter || null);
            go('tasks');
          }}
          isDark={isDark}
        />
      );
    }
    if (activeTab === 'nova') return <AIWorkspace conversations={conversations} activeConversationId={activeConversationId} onSendMessage={handleSendMessage} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onSelectConversation={setActiveConversationId} onNewConversation={() => { const id = `conv_${Date.now()}`; setConversations(prev => [{ id, title: 'New planning session', createdAt: new Date().toISOString(), messages: [] }, ...prev]); setActiveConversationId(id); }} tasks={computedState.tasks} goals={computedState.goals} isDark={isDark} showToast={showToast} refreshTasks={refreshTasks} />;
    if (activeTab === 'insights') return <Insights isDark={isDark} />;
    if (activeTab === 'career') return <CareerIntelligence career={computedState.career} onUpdateSkills={handleUpdateSkills} isDark={isDark} />;
    if (activeTab === 'resume') return <ResumeIntelligence resume={computedState.resume} isDark={isDark} />;
    if (activeTab === 'radar') return <OpportunityRadar opportunities={computedState.opportunities} onAddOpportunity={handleAddOpportunity} onDeleteOpportunity={handleDeleteOpportunity} isDark={isDark} />;
    if (activeTab === 'twin') return <DigitalTwin burnout={computedState.burnout} engineStats={computedState.engineStats} isDark={isDark} />;
    if (activeTab === 'calendar') return <CalendarPage />;
    return <SettingsPage user={user} onLogout={logout} />;
  };
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    {toast && <div className="fixed right-5 top-5 z-[80] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl">{toast}</div>}
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl"><div className="flex h-full items-center justify-between px-4 lg:px-6"><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-400 lg:hidden" onClick={() => setMobileNav(v => !v)}>{mobileNav ? <X size={20}/> : <Menu size={20}/>}</button><button onClick={() => go('dashboard')} className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-900/30"><Bot size={19}/></div><div className="text-left"><div className="text-sm font-semibold tracking-tight">Sentinel Nova</div><div className="hidden text-[10px] text-slate-500 sm:block">AI Chief of Staff</div></div></button></div><div className="flex items-center gap-1.5"><button onClick={() => setIsDark(v => !v)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">{isDark ? <Sun size={17}/> : <Moon size={17}/>}</button><button onClick={() => setShowProfile(v => !v)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-800">{user?.picture ? <img src={user.picture} alt="" className="h-8 w-8 rounded-lg object-cover"/> : <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold">{user?.name?.slice(0,2).toUpperCase() || 'SN'}</div>}<ChevronDown size={14} className="hidden text-slate-500 sm:block"/></button></div></div>{showProfile && <div className="absolute right-4 top-14 w-64 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl"><div className="px-3 pt-2 text-xs text-slate-500">Signed in as</div><div className="px-3 font-semibold text-white text-sm truncate">{user?.name || 'Authenticated User'}</div><div className="px-3 pb-3 text-xs text-slate-400 truncate">{user?.email}</div><button onClick={() => { setShowProfile(false); go('settings'); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"><Settings size={15}/> Settings</button><button onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"><LogOut size={15}/> Sign out</button></div>}</header>
    <aside className={`fixed bottom-0 left-0 top-16 z-40 w-64 border-r border-slate-800/80 bg-slate-950 px-3 py-5 transition-transform lg:translate-x-0 ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}><nav className="space-y-1">{navItems.map(item => <NavButton key={item.id} item={item} active={activeTab === item.id} onClick={() => go(item.id)} />)}</nav><div className="my-5 border-t border-slate-800"/><div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">Intelligence</div><nav className="space-y-1">{secondaryItems.map(item => <NavButton key={item.id} item={item} active={activeTab === item.id} onClick={() => go(item.id)} />)}</nav><div className="my-5 border-t border-slate-800"/><NavButton item={{ id: 'settings', label: 'Settings', icon: Settings }} active={activeTab === 'settings'} onClick={() => go('settings')} /><div className="mt-auto pt-8"><div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><div className="flex items-center gap-2"><div className="rounded-lg bg-violet-500/10 p-2 text-violet-400"><Sparkles size={15}/></div><div><p className="text-xs font-semibold text-slate-200">Nova is ready</p><p className="text-[10px] text-slate-500">Plan, prioritize, adapt.</p></div></div></div></div></aside>
    <main className="min-h-screen pt-16 lg:pl-64"><div className="mx-auto max-w-[1400px] p-5 sm:p-7 lg:p-10"><Suspense fallback={<PageLoading />}>{renderPage()}</Suspense></div></main>
  </div>;
}
function NavButton({ item, active, onClick }: { item: { id: string; label: string; icon: React.ComponentType<{ size?: number | string }> }; active: boolean; onClick: () => void }) { const Icon = item.icon; return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-violet-500/10 text-violet-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}><Icon size={17}/><span>{item.label}</span>{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-400"/>}</button>; }
function PageLoading() {
  return <div role="status" className="flex min-h-56 items-center justify-center text-sm text-slate-400">Loading page…</div>;
}
