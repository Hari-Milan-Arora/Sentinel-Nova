/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Brain, 
  RefreshCw, 
  ArrowUpRight, 
  Filter, 
  Check, 
  X,
  Gauge,
  Sparkles
} from 'lucide-react';
import { Task } from '../types';

interface TasksProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'completionProbability' | 'predictedCompletionDate' | 'delayRisk' | 'timeAllocationHours'>) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
  onDeleteTask: (id: string) => void;
  onRecalibrate: () => void;
  isDark: boolean;
}

export default function Tasks({
  tasks,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onRecalibrate,
  isDark
}: TasksProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [priority, setPriority] = React.useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [estimatedHours, setEstimatedHours] = React.useState(4);
  const [daysRemaining, setDaysRemaining] = React.useState(3);
  const [difficulty, setDifficulty] = React.useState<'easy' | 'medium' | 'hard'>('medium');

  const [filter, setFilter] = React.useState<'all' | 'todo' | 'in_progress' | 'done'>('all');
  const [isCalibrating, setIsCalibrating] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title,
      priority,
      status: 'todo',
      estimatedHours,
      daysRemaining,
      difficulty,
      dependencies: []
    });
    setTitle('');
    setPriority('medium');
    setEstimatedHours(4);
    setDaysRemaining(3);
    setDifficulty('medium');
    setShowAddForm(false);
  };

  const triggerCalibrate = async () => {
    setIsCalibrating(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    onRecalibrate();
    setIsCalibrating(false);
  };

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true;
    return t.status === filter;
  });

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold font-space tracking-tight">Cognitive Task Manager</h2>
            <span className="px-2 py-0.5 bg-violet-600/10 text-violet-400 border border-violet-500/20 font-mono text-[8px] font-bold rounded">PHASE 3 ACTIVE</span>
          </div>
          <p className="text-xs text-gray-400">
            Augmenting schedules with statistical completion dates, bottleneck alerts, and workload optimizations.
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
            {isCalibrating ? 'Calibrating...' : 'Recalibrate Engine'}
          </button>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus size={12} className="stroke-[2.5]" />
            New Task
          </button>
        </div>
      </div>

      {/* Suggested Reordering Strategy */}
      <div className={`p-4 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
        isDark ? 'bg-violet-950/5 border-violet-900/10' : 'bg-violet-50 border-violet-100 shadow-sm'
      }`}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
            <Brain size={16} />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-violet-400">AI Suggested Schedule Reordering</h4>
            <p className="text-[11px] text-gray-400">
              Sentinel predicts scheduling bottleneck on critical milestones. We recommend executing high-risk critical path items first.
            </p>
          </div>
        </div>
        <button 
          onClick={triggerCalibrate}
          className="text-violet-400 hover:text-violet-300 font-semibold font-mono text-[10px] uppercase flex items-center gap-0.5 self-start md:self-center cursor-pointer shrink-0"
        >
          Re-sequence List <ArrowUpRight size={12} />
        </button>
      </div>

      {/* Add Task Modal overlay or form inline */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className={`p-5 rounded-2xl border space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 ${
          isDark ? 'bg-slate-900/60 border-gray-900' : 'bg-white border-gray-200'
        }`}>
          <h3 className="text-xs font-bold uppercase font-mono tracking-widest text-gray-400 flex items-center gap-1.5 pb-2 border-b border-gray-800/10">
            <Sparkles size={12} className="text-violet-400" /> Create Predictive Task Instance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Task Title / Specification</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Implement Statechart transition script"
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Priority Tier</label>
              <select
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical Path</option>
              </select>
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Difficulty Complexity</label>
              <select
                value={difficulty}
                onChange={(e: any) => setDifficulty(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <option value="easy">Easy (Routine)</option>
                <option value="medium">Medium (Requires focus)</option>
                <option value="hard">Hard (Deep skill)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Estimated Work Load (Hours)</label>
              <input
                type="number"
                min="1"
                max="100"
                required
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(parseInt(e.target.value))}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Deadline Constraints (Days Remaining)</label>
              <input
                type="number"
                min="0"
                max="365"
                required
                value={daysRemaining}
                onChange={(e) => setDaysRemaining(parseInt(e.target.value))}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
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
              Save Instance
            </button>
          </div>
        </form>
      )}

      {/* Main Task Feed Section */}
      <div className="space-y-4">
        
        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-gray-800/10 pb-2">
          <Filter size={12} className="text-gray-500" />
          <span className="text-[10px] font-mono text-gray-500 uppercase font-bold">Filters:</span>
          {['all', 'todo', 'in_progress', 'done'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-3 py-1 rounded-lg text-[10px] font-mono uppercase cursor-pointer transition-all ${
                filter === f 
                  ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 font-bold' 
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Task Grid/List */}
        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-xs font-medium">No tasks found.</div>
          ) : filteredTasks.map((task, idx) => {
            const isCompleted = task.status === 'done';
            return (
              <div 
                key={task.id}
                className={`p-4 rounded-2xl border transition-all hover:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isCompleted 
                    ? (isDark ? 'bg-slate-900/10 border-gray-900/60 opacity-60' : 'bg-gray-50 border-gray-150 opacity-70')
                    : (isDark ? 'bg-slate-900/30 border-gray-900/40' : 'bg-white border-gray-150 shadow-sm')
                }`}
              >
                
                {/* Left Block: Task Status / Details */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <button
                    onClick={() => onUpdateTask(task.id, { status: isCompleted ? 'todo' : 'done' })}
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 cursor-pointer transition-all ${
                      isCompleted 
                        ? 'bg-emerald-600/15 border-emerald-500 text-emerald-400' 
                        : 'border-gray-700 hover:border-violet-500'
                    }`}
                  >
                    {isCompleted && <Check size={12} />}
                  </button>
                  
                  <div className="space-y-1.5 min-w-0">
                    <h4 className={`text-xs font-semibold truncate ${isCompleted ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {task.title}
                    </h4>
                    
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-gray-500">
                      <span className={`px-1.5 py-0.5 rounded font-bold uppercase ${
                        task.priority === 'critical' ? 'bg-red-500/10 text-red-400' :
                        task.priority === 'high' ? 'bg-orange-500/10 text-orange-400' :
                        task.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-gray-500/10 text-gray-400'
                      }`}>
                        {task.priority}
                      </span>
                      
                      <span>•</span>
                      <span>{task.estimatedHours} hrs</span>
                      <span>•</span>
                      <span>{task.daysRemaining} days remaining</span>
                      <span>•</span>
                      <span className="uppercase">{task.difficulty}</span>
                    </div>
                  </div>
                </div>

                {/* Right Block: Predictive Statistics Bento */}
                {!isCompleted && (
                  <div className="grid grid-cols-3 gap-2.5 max-w-sm w-full md:w-auto text-center border-t md:border-t-0 border-gray-800/15 pt-3 md:pt-0 shrink-0">
                    
                    {/* Gauge 1: Completion Probability */}
                    <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/10 min-w-[90px]">
                      <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Completion Prob</span>
                      <span className={`text-xs font-mono font-bold mt-1 block ${
                        task.completionProbability && task.completionProbability > 80 ? 'text-emerald-400' :
                        task.completionProbability && task.completionProbability > 50 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {task.completionProbability}%
                      </span>
                    </div>

                    {/* Gauge 2: Delay Risk */}
                    <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/10 min-w-[90px]">
                      <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Delay Risk</span>
                      <span className={`text-xs font-mono font-bold mt-1 uppercase block ${
                        task.delayRisk === 'low' ? 'text-emerald-400' :
                        task.delayRisk === 'medium' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {task.delayRisk}
                      </span>
                    </div>

                    {/* Gauge 3: Dynamic Delivery Date */}
                    <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/10 min-w-[90px]">
                      <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Est. Completion</span>
                      <span className="text-[10px] font-semibold text-violet-300 mt-1 block truncate">
                        {task.predictedCompletionDate}
                      </span>
                    </div>

                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 self-end md:self-center">
                  {task.timeAllocationHours && !isCompleted && (
                    <div className="hidden lg:block px-2.5 py-1 bg-slate-950/30 rounded-xl border border-gray-800/10 text-[9px] font-mono text-gray-400">
                      Alloc: <span className="text-white font-bold">{task.timeAllocationHours} hr/day</span>
                    </div>
                  )}
                  
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 text-red-400 hover:bg-red-500/15 rounded-lg transition-all cursor-pointer shrink-0"
                    title="Delete task specification"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
}
