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
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  UserCheck, 
  GraduationCap, 
  Briefcase,
  ChevronRight,
  HelpCircle,
  TrendingDown,
  Percent,
  ThumbsUp
} from 'lucide-react';
import { Task, Goal, Opportunity, CareerMetrics, ResumeMetrics, BurnoutMetrics } from '../types';
import { PredictionEngine } from '../utils/predictionEngine';

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

export default function Dashboard({
  tasks,
  goals,
  opportunities,
  career,
  resume,
  burnout,
  onNavigate,
  isDark
}: DashboardProps) {
  // Compute metrics in real-time
  const completedTasksCount = tasks.filter(t => t.status === 'done').length;
  const pendingTasks = tasks.filter(t => t.status !== 'done');
  
  // Calculate average task completion probability
  const avgTaskProb = pendingTasks.length > 0
    ? Math.round(pendingTasks.reduce((acc, t) => acc + (t.completionProbability || 50), 0) / pendingTasks.length)
    : 100;

  // Filter highest-rated opportunities
  const bestOpps = opportunities.slice(0, 2);

  // Critical risks feed
  const criticalPredictions = React.useMemo(() => {
    const alerts = [];
    
    // Task delay warnings
    pendingTasks.forEach(t => {
      if (t.delayRisk === 'critical' || t.delayRisk === 'high') {
        alerts.push({
          id: `t_risk_${t.id}`,
          type: 'danger',
          title: `Schedule Breach Risk: '${t.title}'`,
          desc: `Calculated Completion likelihood is extremely low (${t.completionProbability}%). You are highly unlikely to finish this task before Friday.`,
          action: 'Decompose scope or reallocate hours',
          target: 'tasks'
        });
      }
    });

    // Goal delay warnings
    goals.forEach(g => {
      if (g.predictedMilestoneDelay) {
        alerts.push({
          id: `g_risk_${g.id}`,
          type: 'warning',
          title: `Milestone Delay Predicted: '${g.title}'`,
          desc: `Current weekly task velocity puts goal completion timeline at high risk. Confidence is only ${g.successProbability}%.`,
          action: 'Inject recovery plan',
          target: 'goals'
        });
      }
    });

    // Burnout alarm
    if (burnout.burnoutScore > 70) {
      alerts.push({
        id: 'burnout_risk',
        type: 'danger',
        title: 'High Burnout Index Detected',
        desc: `Working hours and high workloads place burnout at ${burnout.burnoutScore}/100. Overload will degrade output quality by 30%.`,
        action: 'Implement hard-stop hours',
        target: 'twin'
      });
    }

    // Default proactive recommendation
    if (alerts.length === 0) {
      alerts.push({
        id: 'stable_prod',
        type: 'success',
        title: 'Cognitive Velocity is Optimal',
        desc: 'All active schedules are in healthy baseline bounds. No critical timeline delays are forecast for the next 7 days.',
        action: 'View digital twin models',
        target: 'twin'
      });
    }

    return alerts;
  }, [pendingTasks, goals, burnout]);

  return (
    <div className="space-y-6">
      
      {/* Dynamic System Banner */}
      <div className={`p-6 rounded-2xl border relative overflow-hidden flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${
        isDark 
          ? 'bg-gradient-to-r from-slate-900 via-violet-950/20 to-slate-900 border-gray-800' 
          : 'bg-gradient-to-r from-indigo-50 via-white to-violet-50 border-gray-200 shadow-sm'
      }`}>
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-violet-500/10 text-violet-400 font-mono text-[9px] font-bold rounded-full border border-violet-500/20 uppercase tracking-widest animate-pulse">
              Predictive Engine Active
            </span>
          </div>
          <h2 className="text-xl font-bold font-space tracking-tight">
            Greetings, Chief. I have run 10 predictive simulations.
          </h2>
          <p className="text-xs text-gray-400 max-w-2xl">
            Sentinel Nova has compiled your activity metrics, task histories, and career skill alignment vectors. 
            Here is your proactive workflow telemetry board.
          </p>
        </div>
        
        {/* Main Stats Header Block */}
        <div className="flex gap-4 relative z-10 shrink-0">
          <div className={`p-3.5 rounded-xl text-center border min-w-[90px] ${isDark ? 'bg-slate-950/40 border-gray-800/80' : 'bg-white border-gray-200'}`}>
            <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Engine Accuracy</span>
            <span className="text-sm font-bold font-mono text-emerald-400 mt-1 block">94.2%</span>
          </div>
          <div className={`p-3.5 rounded-xl text-center border min-w-[90px] ${isDark ? 'bg-slate-950/40 border-gray-800/80' : 'bg-white border-gray-200'}`}>
            <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider block">Pending Risks</span>
            <span className={`text-sm font-bold font-mono mt-1 block ${criticalPredictions.filter(a => a.type === 'danger').length > 0 ? 'text-red-400' : 'text-amber-400'}`}>
              {criticalPredictions.filter(a => a.type !== 'success').length}
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Predictive Forecast Dashboard & Gauges (Col Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Bento Row 1: Tasks Success & Burnout Risk */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Widget 1: Task Success Forecast */}
            <div className={`p-5 rounded-2xl border relative flex flex-col justify-between ${
              isDark ? 'bg-slate-900/40 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                    <CheckSquare size={14} className="text-violet-400" />
                    Task Success Forecast
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-violet-400">Model 1 & 2</span>
                </div>

                <div className="flex items-center gap-4 py-1">
                  <div className="relative flex items-center justify-center">
                    {/* Simple SVG Circular Gauge */}
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="rgba(139, 92, 246, 0.1)" strokeWidth="4" fill="transparent" />
                      <circle cx="32" cy="32" r="28" stroke="rgb(139, 92, 246)" strokeWidth="4" fill="transparent" 
                        strokeDasharray={175} strokeDashoffset={175 - (175 * avgTaskProb) / 100} />
                    </svg>
                    <span className="absolute font-mono text-xs font-bold text-white">{avgTaskProb}%</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold font-space text-gray-200">Average Schedule Security</div>
                    <div className="text-[11px] text-gray-400">
                      Based on workload ratios across {pendingTasks.length} active tasks and {completedTasksCount} completions.
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  {pendingTasks.slice(0, 2).map(task => (
                    <div key={task.id} className="flex items-center justify-between text-[11px] bg-slate-950/20 p-2 rounded-lg border border-gray-800/20">
                      <span className="truncate max-w-[170px] text-gray-300 font-medium">{task.title}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                          task.delayRisk === 'low' ? 'bg-emerald-500/10 text-emerald-400' :
                          task.delayRisk === 'medium' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                        }`}>
                          {task.delayRisk} Risk
                        </span>
                        <span className="font-mono font-bold text-white">{task.completionProbability}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => onNavigate('tasks')}
                className="w-full mt-4 py-1.5 hover:bg-gray-800/10 border border-gray-800/35 text-center text-gray-400 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                Task Calibration Center <ChevronRight size={12} />
              </button>
            </div>

            {/* Widget 2: Burnout Risk Classifier */}
            <div className={`p-5 rounded-2xl border relative flex flex-col justify-between ${
              isDark ? 'bg-slate-900/40 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                    <Activity size={14} className="text-violet-400" />
                    Burnout Risk Alarm
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-violet-400">Model 9</span>
                </div>

                <div className="flex items-center gap-4 py-1">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-16 h-16 transform -rotate-90">
                      <circle cx="32" cy="32" r="28" stroke="rgba(239, 68, 68, 0.1)" strokeWidth="4" fill="transparent" />
                      <circle cx="32" cy="32" r="28" stroke={burnout.burnoutScore > 70 ? "rgb(239, 68, 68)" : "rgb(245, 158, 11)"} strokeWidth="4" fill="transparent" 
                        strokeDasharray={175} strokeDashoffset={175 - (175 * burnout.burnoutScore) / 100} />
                    </svg>
                    <span className="absolute font-mono text-xs font-bold text-white">{burnout.burnoutScore}%</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold font-space flex items-center gap-1.5 text-gray-200">
                      Risk Level: <span className={`uppercase font-bold ${
                        burnout.burnoutRisk === 'low' ? 'text-emerald-400' :
                        burnout.burnoutRisk === 'medium' ? 'text-amber-400' : 'text-red-400'
                      }`}>{burnout.burnoutRisk}</span>
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Volatility Index is stable, but working hours averages 9.2 hrs/day.
                    </div>
                  </div>
                </div>

                <div className="text-[10px] bg-slate-950/20 p-2.5 rounded-lg border border-gray-800/20 text-gray-400 leading-snug">
                  <span className="font-bold text-amber-400 block mb-1">Recommended Preventative Rest:</span>
                  {burnout.recoverySuggestions[0]}
                </div>
              </div>
              <button 
                onClick={() => onNavigate('twin')}
                className="w-full mt-4 py-1.5 hover:bg-gray-800/10 border border-gray-800/35 text-center text-gray-400 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                Inspect Behavior Graph <ChevronRight size={12} />
              </button>
            </div>

          </div>

          {/* Bento Row 2: Career Readiness & Resume Trend */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Widget 3: Career Trajectory Forecast */}
            <div className={`p-5 rounded-2xl border relative flex flex-col justify-between ${
              isDark ? 'bg-slate-900/40 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                    <TrendingUp size={14} className="text-violet-400" />
                    Career Trajectory Forecast
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-violet-400">Model 3</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center py-2">
                  <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/20">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold">Now</div>
                    <div className="text-sm font-bold text-white mt-1">{career.currentReadiness}%</div>
                  </div>
                  <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/20">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold">In 30 Days</div>
                    <div className="text-sm font-bold text-violet-400 mt-1">+{career.forecast30Days - career.currentReadiness}%</div>
                  </div>
                  <div className="p-2 bg-slate-950/15 rounded-xl border border-gray-800/20">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono font-bold">In 90 Days</div>
                    <div className="text-sm font-bold text-emerald-400 mt-1">+{career.forecast90Days - career.currentReadiness}%</div>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400">
                  Securing a Senior DeepMind Research role is forecast at <span className="text-emerald-400 font-bold">{career.interviewProbability}% interview probability</span> based on current technical training consistency.
                </p>
              </div>
              <button 
                onClick={() => onNavigate('career')}
                className="w-full mt-4 py-1.5 hover:bg-gray-800/10 border border-gray-800/35 text-center text-gray-400 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                Trajectory Simulation <ChevronRight size={12} />
              </button>
            </div>

            {/* Widget 4: Resume Evolution / ATS Forecast */}
            <div className={`p-5 rounded-2xl border relative flex flex-col justify-between ${
              isDark ? 'bg-slate-900/40 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5">
                  <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                    <UserCheck size={14} className="text-violet-400" />
                    Resume Trend / ATS Tracker
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-violet-400">Model 4</span>
                </div>

                <div className="flex items-center justify-between bg-slate-950/25 p-3 rounded-xl border border-gray-800/20">
                  <div>
                    <div className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider">Current ATS Compatibility</div>
                    <div className="text-xl font-mono font-bold text-white mt-1">{resume.atsScore}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-wider">90d ATS Projection</div>
                    <div className="text-sm font-mono font-bold text-emerald-400 mt-1 flex items-center justify-end gap-1">
                      <TrendingUp size={12} /> {resume.atsForecast30Days}%
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest block">Critical Keywords Missing</span>
                  <div className="flex flex-wrap gap-1">
                    {resume.missingSkills.slice(0, 3).map((s, idx) => (
                      <span key={idx} className="text-[9px] font-medium bg-slate-950/40 border border-gray-800/50 px-2 py-0.5 rounded-full text-violet-300">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => onNavigate('resume')}
                className="w-full mt-4 py-1.5 hover:bg-gray-800/10 border border-gray-800/35 text-center text-gray-400 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
              >
                Scan ATS Gaps <ChevronRight size={12} />
              </button>
            </div>

          </div>

          {/* Bento Row 3: Learning Curve Forecast */}
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-slate-900/40 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5 mb-4">
              <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                <GraduationCap size={14} className="text-violet-400" />
                Learning Progress and Speed Estimation
              </span>
              <span className="text-[10px] font-mono font-semibold text-violet-400">Model 5</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-8 space-y-2">
                <h4 className="text-xs font-bold text-gray-200">Goal: Secure AWS Solutions Architect Pro</h4>
                <p className="text-[11px] text-gray-400">
                  Current study velocity averages <span className="font-bold text-white">4.8 hours/week</span> against a goal of 6.0 hours. 
                  Model forecasts completion timeline is slightly delayed by 1.8 weeks.
                </p>
                
                {/* Horizontal Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[10px] font-mono text-gray-500">
                    <span>Study Goal Progress</span>
                    <span>68% Complete</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-gray-800/30">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full" style={{ width: '68%' }} />
                  </div>
                </div>
              </div>

              <div className="md:col-span-4 grid grid-cols-2 gap-2 text-center md:border-l md:border-gray-800/20 md:pl-4">
                <div className="p-2.5 bg-slate-950/20 rounded-xl border border-gray-800/10">
                  <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Est. Completion</span>
                  <span className="text-xs font-bold text-violet-400 mt-1 block">In 2.2 Weeks</span>
                </div>
                <div className="p-2.5 bg-slate-950/20 rounded-xl border border-gray-800/10">
                  <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">On-Time Prob</span>
                  <span className="text-xs font-bold text-emerald-400 mt-1 block">85.4%</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Opportunity Match Optimizer & Proactive Predictions Feed (Col Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Widget 5: Proactive Weekly Warnings Feed */}
          <div className={`p-5 rounded-2xl border flex flex-col ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Cpu size={12} className="text-violet-400" /> Weekly Predictions Feed</span>
              <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded">LIVE</span>
            </h4>

            <div className="space-y-4 max-h-[310px] overflow-y-auto pr-1">
              {criticalPredictions.map((alert) => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded-xl border text-[11px] leading-relaxed space-y-2 relative overflow-hidden ${
                    alert.type === 'danger'
                      ? (isDark ? 'bg-red-500/5 border-red-500/10 text-red-100' : 'bg-red-50 border-red-200 text-red-900')
                      : alert.type === 'warning'
                        ? (isDark ? 'bg-amber-500/5 border-amber-500/10 text-amber-100' : 'bg-amber-50 border-amber-200 text-amber-900')
                        : (isDark ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-100' : 'bg-emerald-50 border-emerald-200 text-emerald-900')
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    {alert.type === 'danger' ? (
                      <AlertTriangle size={12} className="text-red-400" />
                    ) : alert.type === 'warning' ? (
                      <AlertTriangle size={12} className="text-amber-400" />
                    ) : (
                      <CheckCircle2 size={12} className="text-emerald-400" />
                    )}
                    <span className="font-space tracking-tight text-xs">{alert.title}</span>
                  </div>
                  
                  <p className="text-gray-400 text-[10px] leading-snug">{alert.desc}</p>
                  
                  <div className="pt-2 border-t border-gray-800/5 flex items-center justify-between text-[9px]">
                    <span className="font-mono text-gray-500 uppercase font-bold">Actionable Recovery:</span>
                    <button 
                      onClick={() => onNavigate(alert.target)}
                      className="text-violet-400 hover:text-violet-300 font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      {alert.action} <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 6: Opportunity Score Optimizer */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-800/20 pb-2.5">
                <span className="flex items-center gap-2 font-bold text-xs uppercase font-mono text-gray-400">
                  <Compass size={14} className="text-violet-400" />
                  Opportunity Score Optimizer
                </span>
                <span className="text-[10px] font-mono font-semibold text-violet-400">Model 6</span>
              </div>

              <p className="text-[11px] text-gray-400">
                Ranked using Smart Match algorithm. Showing opportunities with highest computed application confidence.
              </p>

              <div className="space-y-3">
                {bestOpps.map(opp => (
                  <div key={opp.id} className="p-3 bg-slate-950/15 rounded-xl border border-gray-800/20 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="text-[11px] font-bold text-gray-200 truncate max-w-[170px]">{opp.title}</h5>
                        <span className="text-[9px] text-gray-500 font-mono mt-0.5 inline-block">{opp.company} • {opp.type}</span>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                        {opp.fitScore}% Fit
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[9px] font-mono border-t border-gray-800/10 pt-2 text-gray-400">
                      <div>
                        <span>Expected Success: </span>
                        <span className="font-bold text-white">{opp.expectedSuccess}%</span>
                      </div>
                      <div className="text-right">
                        <span>Impact Score: </span>
                        <span className="font-bold text-white">{opp.careerImpactScore}/100</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button 
              onClick={() => onNavigate('radar')}
              className="w-full mt-5 py-1.5 hover:bg-gray-800/10 border border-gray-800/35 text-center text-gray-400 hover:text-white rounded-xl text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-all"
            >
              Analyze Radar Pipeline <ChevronRight size={12} />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
