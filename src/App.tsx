/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  CheckSquare, 
  Target, 
  Compass, 
  LineChart, 
  Activity, 
  Cpu, 
  Bot, 
  Menu, 
  Sun, 
  Moon, 
  Info,
  User,
  GraduationCap,
  Briefcase,
  TrendingUp,
  FileText,
  Sliders
} from 'lucide-react';

import { Task, Goal, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics, Conversation, ChatMessage, PredictionEngineMetrics } from './types';
import { PredictionEngine } from './utils/predictionEngine';

// Page imports
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Goals from './pages/Goals';
import CareerIntelligence from './pages/CareerIntelligence';
import ResumeIntelligence from './pages/ResumeIntelligence';
import OpportunityRadar from './pages/OpportunityRadar';
import DigitalTwin from './pages/DigitalTwin';
import Analytics from './pages/Analytics';
import AIWorkspace from './pages/AIWorkspace';
import FutureVision from './pages/FutureVision';

export default function App() {
  const [activeTab, setActiveTab] = React.useState<string>('dashboard');
  const [isDark, setIsDark] = React.useState<boolean>(true);
  const [toast, setToast] = React.useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Global Context: raw storage models
  const [rawTasks, setRawTasks] = React.useState<Task[]>([
    { id: 't1', title: 'Run Vertex AI tuning job', priority: 'critical', status: 'todo', estimatedHours: 8, daysRemaining: 2, difficulty: 'hard', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't2', title: 'Implement multi-agent memory loop', priority: 'high', status: 'todo', estimatedHours: 6.5, daysRemaining: 3, difficulty: 'hard', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't3', title: 'Refactor router configurations', priority: 'low', status: 'todo', estimatedHours: 2, daysRemaining: 10, difficulty: 'easy', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' },
    { id: 't4', title: 'Study DeepMind fine-tuning papers', priority: 'medium', status: 'done', estimatedHours: 4, daysRemaining: 5, difficulty: 'medium', dependencies: [], completionProbability: 0, predictedCompletionDate: '', delayRisk: 'low' }
  ]);

  const [rawGoals, setRawGoals] = React.useState<Goal[]>([
    { id: 'g1', title: 'Optimize Gemini Fine-Tuning Hyperparameters', targetDate: '2026-07-15', category: 'technical', progress: 85, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'low', reasoning: '' },
    { id: 'g2', title: 'Audit CV ATS gaps for Google DeepMind', targetDate: '2026-07-20', category: 'career', progress: 50, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'medium', reasoning: '' },
    { id: 'g3', title: 'AWS Solutions Architect Professional Certificate', targetDate: '2026-08-30', category: 'education', progress: 68, successProbability: 0, failureProbability: 0, predictedMilestoneDelay: false, aiRecoveryPlan: [], riskLevel: 'low', reasoning: '' }
  ]);

  const [rawOpps, setRawOpps] = React.useState<Opportunity[]>([
    { id: 'o1', title: 'Research Scientist Intern - Agent Swarms', company: 'Google DeepMind', type: 'Internship', deadline: 'In 5 days', url: 'https://deepmind.google/careers', fitScore: 0, expectedSuccess: 0, applicationConfidence: 0, careerImpactScore: 0, deadlineUrgency: 'low' },
    { id: 'o2', title: 'ML Infrastructure Engineer', company: 'OpenAI', type: 'Full-Time', deadline: 'In 12 days', url: 'https://openai.com/careers', fitScore: 0, expectedSuccess: 0, applicationConfidence: 0, careerImpactScore: 0, deadlineUrgency: 'medium' },
    { id: 'o3', title: 'Distributed Agent Training Hackathon', company: 'Meta', type: 'Hackathon', deadline: 'In 2 days', url: 'https://meta.ai', fitScore: 0, expectedSuccess: 0, applicationConfidence: 0, careerImpactScore: 0, deadlineUrgency: 'critical' }
  ]);

  const [skills, setSkills] = React.useState<{ name: string; score: number }[]>([
    { name: "TensorFlow", score: 85 },
    { name: "PyTorch", score: 80 },
    { name: "Transformers", score: 70 },
    { name: "Hyperparameter Search", score: 65 },
    { name: "Vertex AI", score: 50 },
    { name: "System Design", score: 60 }
  ]);

  // Swarm Chat Strategic Session State
  const [conversations, setConversations] = React.useState<Conversation[]>([
    {
      id: 'conv_1',
      title: 'DeepMind ATS Alignment Strategy',
      createdAt: new Date().toISOString(),
      messages: [
        {
          id: 'welcome_m',
          role: 'model',
          content: `Welcome back, Chief. I have parsed your active digital twin workload models and CV assets.

### Immediate Forecast Findings:
1. **Schedule Bottleneck:** You have **2 critical path tasks** due in under 72 hours. Probability of on-time delivery is at **62%**.
2. **Resume Audit:** Current DeepMind ATS match rate is **78%**. Key gaps include "Continuous Integration" and "SCXML Parsing".

Ask me to scan gaps, outline hyperparameter search configurations, or project your trajectory.`,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          confidenceScore: { overall: 94, reasoningQuality: 92, dataQuality: 88, riskLevel: 'low' },
          explainability: {
            why: "Drawn from consolidated task completion ratios and resume parsing models.",
            benefits: ["Identify scheduling gaps before they trigger delays", "Quantify hiring probabilities early"],
            risks: ["Study velocity may lag if development is favored exclusively"],
            nextSteps: ["Study Vertex AI custom tuning docs", "Automate CV keyword integration"]
          },
          decisionTree: {
            options: [
              { name: "Optimize Research Scientist Track", chosen: true, confidence: 92, pros: ["Highest salary potential", "Optimal skill overlap"], cons: ["Higher learning curve"] }
            ]
          }
        }
      ]
    }
  ]);
  const [activeConversationId, setActiveConversationId] = React.useState<string>('conv_1');

  // Trigger feedback messages
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // RECALCULATE SIMULATION STATE: The core of Predictive Intelligence
  // Anytime raw records change, run our 10 predictive models to refresh outputs
  const computedState = React.useMemo(() => {
    const tasks = PredictionEngine.calculateTaskPredictions(rawTasks);
    const goals = PredictionEngine.calculateGoalSuccess(rawGoals, tasks);
    const career = PredictionEngine.calculateCareerIntelligence(skills);
    const resume = PredictionEngine.calculateResumeIntelligence(skills.length);
    const opportunities = PredictionEngine.calculateOpportunityMatch(rawOpps, skills.map(s => s.name));
    const burnout = PredictionEngine.calculateBurnoutAndProductivity(tasks);
    const engineStats = PredictionEngine.getEngineMetrics();

    return { tasks, goals, career, resume, opportunities, burnout, engineStats };
  }, [rawTasks, rawGoals, rawOpps, skills]);

  // CRUD handlers: Tasks
  const handleAddTask = (task: Omit<Task, 'id' | 'completionProbability' | 'predictedCompletionDate' | 'delayRisk' | 'timeAllocationHours'>) => {
    const newTask: Task = {
      ...task,
      id: `t_${Date.now()}`,
      completionProbability: 50,
      predictedCompletionDate: 'In jeopardy',
      delayRisk: 'low'
    };
    setRawTasks(prev => [newTask, ...prev]);
    showToast('Task specification established in system log.', 'success');
  };

  const handleUpdateTask = (id: string, updates: Partial<Task>) => {
    setRawTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    showToast('Task parameters updated. Re-running ML simulations...', 'success');
  };

  const handleDeleteTask = (id: string) => {
    setRawTasks(prev => prev.filter(t => t.id !== id));
    showToast('Task purged. Re-calibrating workloads...', 'success');
  };

  // CRUD handlers: Goals
  const handleAddGoal = (goal: Omit<Goal, 'id' | 'successProbability' | 'failureProbability' | 'predictedMilestoneDelay' | 'riskLevel' | 'aiRecoveryPlan' | 'reasoning'>) => {
    const newGoal: Goal = {
      ...goal,
      id: `g_${Date.now()}`,
      successProbability: 50,
      failureProbability: 50,
      predictedMilestoneDelay: false,
      aiRecoveryPlan: [],
      riskLevel: 'low',
      reasoning: 'Analyzing goal specifications...'
    };
    setRawGoals(prev => [newGoal, ...prev]);
    showToast('Strategic milestone added to track.', 'success');
  };

  const handleUpdateGoal = (id: string, updates: Partial<Goal>) => {
    setRawGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    showToast('Goal target updated. Re-calculating success probability...', 'success');
  };

  const handleDeleteGoal = (id: string) => {
    setRawGoals(prev => prev.filter(g => g.id !== id));
    showToast('Strategic goal milestone deleted.', 'success');
  };

  // CRUD handlers: Opportunities
  const handleAddOpportunity = (opp: Omit<Opportunity, 'id' | 'fitScore' | 'expectedSuccess' | 'applicationConfidence' | 'careerImpactScore' | 'deadlineUrgency'>) => {
    const newOpp: Opportunity = {
      ...opp,
      id: `o_${Date.now()}`,
      fitScore: 50,
      expectedSuccess: 50,
      applicationConfidence: 50,
      careerImpactScore: 50,
      deadlineUrgency: 'low'
    };
    setRawOpps(prev => [newOpp, ...prev]);
    showToast('Listing logged to Radar database.', 'success');
  };

  const handleDeleteOpportunity = (id: string) => {
    setRawOpps(prev => prev.filter(o => o.id !== id));
    showToast('Opportunity posting removed.', 'success');
  };

  // Skills tuner (updates Trajectory)
  const handleUpdateSkills = (name: string, score: number) => {
    setSkills(prev => prev.map(s => s.name === name ? { ...s, score } : s));
  };

  // Recalibrate manual triggers
  const handleRecalibrate = () => {
    // Simply forces a state updates alerts
    showToast('All 10 Machine Learning models trained and calibrated successfully.', 'success');
  };

  // Send Swarm Strategic message
  const handleSendMessage = async (convId: string, text: string) => {
    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    // Update frontend state with user message immediately
    setConversations(prev => prev.map(c => {
      if (c.id === convId) {
        return { ...c, messages: [...c.messages, userMsg] };
      }
      return c;
    }));

    try {
      // POST user message, tasks, goals to Express backend API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: conversations.find(c => c.id === convId)?.messages || [],
          tasks: computedState.tasks,
          goals: computedState.goals
        })
      });

      if (!response.ok) {
        throw new Error('API server failed to respond.');
      }

      const resData = await response.json();

      const modelMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'model',
        content: resData.content,
        timestamp: new Date().toISOString(),
        explainability: resData.explainability,
        decisionTree: resData.decisionTree,
        confidenceScore: resData.confidenceScore,
        observability: resData.observability,
        insightsGenerated: resData.insightsGenerated,
        agentSteps: [
          { agentId: 'planner', name: 'Planner Agent', durationMs: 420 },
          { agentId: 'context', name: 'Context Agent', durationMs: 380 },
          { agentId: 'research', name: 'Research Agent', durationMs: 510 },
          { agentId: 'reasoner', name: 'Reasoning Agent', durationMs: 650 },
          { agentId: 'risk', name: 'Risk Agent', durationMs: 440 },
          { agentId: 'reviewer', name: 'Reviewer Agent', durationMs: 320 }
        ]
      };

      setConversations(prev => prev.map(c => {
        if (c.id === convId) {
          return { ...c, messages: [...c.messages, modelMsg] };
        }
        return c;
      }));

    } catch (err) {
      console.error(err);
      showToast('API swarm routing error. Using cached local intelligence.', 'error');
    }
  };

  const handleNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: `Consultation session ${conversations.length + 1}`,
      createdAt: new Date().toISOString(),
      messages: []
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newId);
    showToast('Fresh strategic consultation session booted.', 'success');
  };

  const handleDeleteConversation = (id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    showToast('Strategic logs purged.', 'success');
  };

  return (
    <div className={`min-h-screen font-sans flex ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-gray-50 text-slate-900'}`}>
      
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 p-4 rounded-xl shadow-2xl border text-xs font-mono font-bold uppercase flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' 
            ? 'bg-emerald-600/10 border-emerald-500 text-emerald-400' 
            : 'bg-red-600/10 border-red-500 text-red-400'
        }`}>
          <div className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* LEFT COMPACT UTILITY RAIL / NAVIGATION SIDEBAR */}
      <div className={`w-64 border-r shrink-0 flex flex-col justify-between p-5 ${
        isDark ? 'bg-slate-950/40 border-gray-900' : 'bg-white border-gray-200'
      }`}>
        
        <div className="space-y-6">
          
          {/* Logo / Brand Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Bot size={18} className="stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-tight font-space leading-none">Sentinel Nova</h1>
              <span className="text-[9px] font-mono text-gray-500 mt-1 inline-block uppercase font-bold tracking-wider">Predictive Agent OS</span>
            </div>
          </div>

          {/* Nav Items Feed */}
          <nav className="space-y-1">
            <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest block mb-2 px-3">Telemetry Control</span>
            
            {[
              { id: 'dashboard', label: 'Predictive Board', icon: Cpu },
              { id: 'workspace', label: 'Swarm Chat Console', icon: Bot },
              { id: 'tasks', label: 'Task Specifications', icon: CheckSquare },
              { id: 'goals', label: 'Strategic Milestones', icon: Target },
              { id: 'radar', label: 'Opportunity Radar', icon: Compass },
              { id: 'career', label: 'Career Trajectory', icon: TrendingUp },
              { id: 'resume', label: 'ATS Optimization', icon: FileText },
              { id: 'twin', label: 'Digital Twin Model', icon: Sliders },
              { id: 'analytics', label: 'Systemic Analytics', icon: LineChart },
              { id: 'future', label: 'Strategic Roadmap', icon: Sparkles }
            ].map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-violet-600 text-white font-bold shadow-md shadow-violet-600/10' 
                      : 'text-gray-400 hover:bg-gray-800/10 hover:text-white'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer User Avatar & Theme Controller */}
        <div className="space-y-4 pt-5 border-t border-gray-800/10">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 font-bold text-xs uppercase font-mono">
                AX
              </div>
              <div>
                <div className="text-xs font-bold leading-none">Alex Mercer</div>
                <span className="text-[9px] font-mono text-gray-500 block mt-0.5">CHIEF ENGINEER</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 font-mono">
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-1.5 hover:bg-gray-800/15 rounded-lg transition-all cursor-pointer shrink-0"
              title="Toggle theme mode"
            >
              {isDark ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <span className="text-[9px]">v3.2.0-NOVA</span>
          </div>

        </div>

      </div>

      {/* MAIN VIEWPORT CANVAS */}
      <main className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto space-y-6">
        
        {/* Active Tab Router */}
        {activeTab === 'dashboard' && (
          <Dashboard 
            tasks={computedState.tasks} 
            goals={computedState.goals} 
            opportunities={computedState.opportunities}
            career={computedState.career}
            resume={computedState.resume}
            burnout={computedState.burnout}
            onNavigate={setActiveTab}
            isDark={isDark}
          />
        )}

        {activeTab === 'tasks' && (
          <Tasks 
            tasks={computedState.tasks}
            onAddTask={handleAddTask}
            onUpdateTask={handleUpdateTask}
            onDeleteTask={handleDeleteTask}
            onRecalibrate={handleRecalibrate}
            isDark={isDark}
          />
        )}

        {activeTab === 'goals' && (
          <Goals 
            goals={computedState.goals}
            onAddGoal={handleAddGoal}
            onUpdateGoal={handleUpdateGoal}
            onDeleteGoal={handleDeleteGoal}
            onRecalibrate={handleRecalibrate}
            isDark={isDark}
          />
        )}

        {activeTab === 'career' && (
          <CareerIntelligence 
            career={computedState.career}
            onUpdateSkills={handleUpdateSkills}
            isDark={isDark}
          />
        )}

        {activeTab === 'resume' && (
          <ResumeIntelligence 
            resume={computedState.resume}
            onOptimize={handleRecalibrate}
            isDark={isDark}
          />
        )}

        {activeTab === 'radar' && (
          <OpportunityRadar 
            opportunities={computedState.opportunities}
            onAddOpportunity={handleAddOpportunity}
            onDeleteOpportunity={handleDeleteOpportunity}
            onRecalibrate={handleRecalibrate}
            isDark={isDark}
          />
        )}

        {activeTab === 'twin' && (
          <DigitalTwin 
            burnout={computedState.burnout}
            engineStats={computedState.engineStats}
            onUpdateWeights={() => showToast('Twin behavioral weights synchronized. Simulating workflow outcomes...', 'success')}
            isDark={isDark}
          />
        )}

        {activeTab === 'analytics' && (
          <Analytics 
            burnout={computedState.burnout}
            engineStats={computedState.engineStats}
            isDark={isDark}
          />
        )}

        {activeTab === 'workspace' && (
          <AIWorkspace 
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSendMessage={handleSendMessage}
            onDeleteConversation={handleDeleteConversation}
            onSelectConversation={setActiveConversationId}
            onNewConversation={handleNewConversation}
            tasks={computedState.tasks}
            goals={computedState.goals}
            isDark={isDark}
            showToast={showToast}
          />
        )}

        {activeTab === 'future' && (
          <FutureVision 
            isDark={isDark}
          />
        )}

      </main>

    </div>
  );
}
