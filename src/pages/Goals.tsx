/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Plus, 
  Trash2, 
  Target, 
  Brain, 
  ArrowRight, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Activity, 
  CheckCircle2, 
  X,
  RefreshCw,
  Clock
} from 'lucide-react';
import { Goal } from '../types';

interface GoalsProps {
  goals: Goal[];
  onAddGoal: (goal: Omit<Goal, 'id' | 'successProbability' | 'failureProbability' | 'predictedMilestoneDelay' | 'riskLevel' | 'aiRecoveryPlan' | 'reasoning'>) => void;
  onUpdateGoal: (id: string, updates: Partial<Goal>) => void;
  onDeleteGoal: (id: string) => void;
  onRecalibrate: () => void;
  isDark: boolean;
}

export default function Goals({
  goals,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onRecalibrate,
  isDark
}: GoalsProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<'career' | 'technical' | 'project' | 'education'>('technical');
  const [progress, setProgress] = React.useState(10);
  const [targetDate, setTargetDate] = React.useState('2026-07-30');
  
  const [activeGoalId, setActiveGoalId] = React.useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddGoal({
      title,
      category,
      progress,
      targetDate
    });
    setTitle('');
    setCategory('technical');
    setProgress(10);
    setTargetDate('2026-07-30');
    setShowAddForm(false);
  };

  const triggerCalibrate = async () => {
    setIsCalibrating(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    onRecalibrate();
    setIsCalibrating(false);
  };

  // Set first goal as selected if none is active
  React.useEffect(() => {
    if (goals.length > 0 && !activeGoalId) {
      setActiveGoalId(goals[0].id);
    }
  }, [goals, activeGoalId]);

  const activeGoal = goals.find(g => g.id === activeGoalId) || goals[0];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold font-space tracking-tight">Milestone Success Estimator</h2>
            <span className="px-2 py-0.5 bg-violet-600/10 text-violet-400 border border-violet-500/20 font-mono text-[8px] font-bold rounded">PHASE 3 ACTIVE</span>
          </div>
          <p className="text-xs text-gray-400">
            Mapping progress metrics against systemic task flows to predict deadline completions and construct fail-safe correction paths.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={triggerCalibrate}
            disabled={isCalibrating}
            className={`px-3.5 py-1.5 rounded-xl border border-gray-800 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-gray-800/10 ${
              isCalibrating ? 'opacity-50' : ''
            }`}
          >
            <RefreshCw size={12} className={isCalibrating ? 'animate-spin' : ''} />
            {isCalibrating ? 'Calibrating...' : 'Evaluate Targets'}
          </button>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus size={12} className="stroke-[2.5]" />
            New Goal
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className={`p-5 rounded-2xl border space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 ${
          isDark ? 'bg-slate-900/60 border-gray-900' : 'bg-white border-gray-200'
        }`}>
          <h3 className="text-xs font-bold uppercase font-mono tracking-widest text-gray-400 flex items-center gap-1.5 pb-2 border-b border-gray-800/10">
            <Sparkles size={12} className="text-violet-400" /> Establish Goal Milestone
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Goal Specification</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Master Vertex AI Tuning Models"
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Category</label>
              <select
                value={category}
                onChange={(e: any) => setCategory(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <option value="technical">Technical Training</option>
                <option value="career">Career Trajectory</option>
                <option value="project">Project Deliverable</option>
                <option value="education">Academic Milestone</option>
              </select>
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Target Deadline</label>
              <input
                type="date"
                required
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-gray-500 uppercase font-bold">
              <span>Initial Progress</span>
              <span>{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="99"
              value={progress}
              onChange={(e) => setProgress(parseInt(e.target.value))}
              className="w-full accent-violet-600 h-1 bg-slate-950 rounded-lg cursor-pointer"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 border border-gray-800 hover:bg-gray-800/10 text-gray-400 text-[10px] font-mono font-bold uppercase rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-[10px] font-mono font-bold uppercase rounded-xl cursor-pointer shadow-md"
            >
              Create Goal
            </button>
          </div>
        </form>
      )}

      {/* Main Goal Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Goals List Feed (Col Span 5) */}
        <div className="lg:col-span-5 space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {goals.map((g) => {
            const isActive = g.id === activeGoalId;
            return (
              <div
                key={g.id}
                onClick={() => setActiveGoalId(g.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-28 relative overflow-hidden ${
                  isActive 
                    ? 'bg-violet-600/10 border-violet-500/30 shadow-md shadow-violet-500/5' 
                    : (isDark ? 'bg-slate-900/30 border-gray-900/50 hover:border-gray-800' : 'bg-white border-gray-150 shadow-sm')
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-widest">
                      {g.category}
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                      g.riskLevel === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                      g.riskLevel === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {g.riskLevel} Risk
                    </span>
                  </div>
                  <h4 className="text-xs font-bold truncate max-w-[210px] text-gray-200">
                    {g.title}
                  </h4>
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[9px] font-mono text-gray-400">
                    <span>Progress: {g.progress}%</span>
                    <span className="font-bold text-emerald-400">P(Success): {g.successProbability}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden border border-gray-800/10">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${g.progress}%` }} />
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGoal(g.id);
                  }}
                  className="absolute bottom-2.5 right-2.5 p-1 hover:bg-red-500/15 rounded text-red-400 shrink-0 transition-all cursor-pointer"
                  title="Purge goal milestone"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right Column: Interactive Prediction Dashboard & AI Recovery (Col Span 7) */}
        <div className="lg:col-span-7">
          {activeGoal ? (
            <div className={`p-5 rounded-2xl border flex flex-col justify-between h-full space-y-5 ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              
              {/* Header Details */}
              <div className="border-b border-gray-800/15 pb-3">
                <div className="flex items-center justify-between text-[9px] font-mono text-gray-500">
                  <span className="uppercase tracking-widest">Active Forecast Dashboard</span>
                  <span>Target: {new Date(activeGoal.targetDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h3 className="text-sm font-bold text-gray-100 font-space tracking-tight mt-1">
                  {activeGoal.title}
                </h3>
              </div>

              {/* Quantified Outcomes */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-950/20 rounded-xl border border-gray-800/25 text-center">
                  <span className="text-[9px] font-mono text-gray-500 uppercase font-bold flex items-center justify-center gap-1">
                    <TrendingUp size={11} className="text-emerald-400" /> Predicted Success Probability
                  </span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-2 block">{activeGoal.successProbability}%</span>
                </div>
                <div className="p-3.5 bg-slate-950/20 rounded-xl border border-gray-800/25 text-center">
                  <span className="text-[9px] font-mono text-gray-500 uppercase font-bold flex items-center justify-center gap-1">
                    <TrendingDown size={11} className="text-red-400" /> Predicted Failure Probability
                  </span>
                  <span className="text-2xl font-bold font-mono text-red-400 mt-2 block">{activeGoal.failureProbability}%</span>
                </div>
              </div>

              {/* AI Reasoning Text */}
              <div className="p-3 bg-slate-950/30 rounded-xl border border-gray-800/10 text-[11px] leading-relaxed text-gray-400 flex gap-2.5">
                <Brain size={16} className="text-violet-400 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <span className="font-bold text-violet-300">Predictive Diagnostic:</span> {activeGoal.reasoning}
                </div>
              </div>

              {/* Sentinel AI Recovery Plan */}
              <div className={`p-4 rounded-xl border space-y-3 ${
                activeGoal.riskLevel === 'high' || activeGoal.riskLevel === 'critical'
                  ? (isDark ? 'bg-red-500/5 border-red-500/10' : 'bg-red-50 border-red-200')
                  : (isDark ? 'bg-slate-950/40 border-gray-800' : 'bg-gray-50 border-gray-200')
              }`}>
                <div className="flex items-center justify-between text-[10px] font-mono border-b border-gray-800/10 pb-1.5">
                  <span className="uppercase tracking-wider font-bold text-violet-400 flex items-center gap-1">
                    <Activity size={12} /> Sentinel AI Fallback Recovery Plan
                  </span>
                  <span className={`font-bold uppercase text-[9px] ${
                    activeGoal.riskLevel === 'low' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {activeGoal.riskLevel === 'low' ? 'Status Secure' : 'Intervention Suggested'}
                  </span>
                </div>

                <ul className="space-y-2 text-[11px] text-gray-300">
                  {activeGoal.aiRecoveryPlan?.map((plan, pIdx) => (
                    <li key={pIdx} className="flex gap-2">
                      <span className="text-violet-400 font-mono font-bold">{pIdx + 1}.</span>
                      <span>{plan}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CRUD Update Progress Slider */}
              <div className="space-y-2 pt-2 border-t border-gray-800/15">
                <div className="flex justify-between text-[10px] font-mono text-gray-500">
                  <span>Modify Core Progress</span>
                  <span>{activeGoal.progress}% Complete</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={activeGoal.progress}
                    onChange={(e) => onUpdateGoal(activeGoal.id, { progress: parseInt(e.target.value) })}
                    className="flex-1 accent-violet-600 h-1 bg-slate-950 rounded-lg cursor-pointer"
                  />
                  {activeGoal.progress < 100 && (
                    <button
                      onClick={() => onUpdateGoal(activeGoal.id, { progress: 100 })}
                      className="px-2.5 py-1 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold uppercase rounded cursor-pointer transition-all"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-12">
              Select or establish a goal milestone to initiate active predictive forecasts.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
