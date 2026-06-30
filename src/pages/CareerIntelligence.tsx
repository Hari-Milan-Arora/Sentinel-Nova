/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  Compass, 
  LineChart, 
  Activity, 
  TrendingUp, 
  Award, 
  HelpCircle, 
  ArrowUpRight, 
  Target, 
  Lightbulb, 
  BookOpen, 
  ChevronRight,
  TrendingDown,
  Briefcase
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { CareerMetrics } from '../types';

interface CareerIntelligenceProps {
  career: CareerMetrics;
  onUpdateSkills: (skillName: string, score: number) => void;
  isDark: boolean;
}

export default function CareerIntelligence({
  career,
  onUpdateSkills,
  isDark
}: CareerIntelligenceProps) {
  const [selectedRole, setSelectedRole] = React.useState('Google DeepMind - Research Scientist');
  const targetRoles = [
    { name: 'Google DeepMind - Research Scientist', skills: ["TensorFlow", "PyTorch", "Transformers", "Hyperparameter Search", "Vertex AI", "System Design"] },
    { name: 'OpenAI - AI Alignment Architect', skills: ["PyTorch", "Transformers", "Reinforcement Learning", "Interpretability", "System Design"] },
    { name: 'Meta - Resident ML Infrastructure Engineer', skills: ["PyTorch", "CUDA Kernels", "System Design", "Distributed Training", "Transformers"] }
  ];

  const activeRole = targetRoles.find(r => r.name === selectedRole) || targetRoles[0];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-space tracking-tight">Career Trajectory Forecaster</h2>
          <p className="text-xs text-gray-400">
            Simulating skill growth momentum and career target compliance matrices to project future positions and earning potential.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-gray-500 font-bold uppercase">Target Path:</span>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className={`px-3 py-1.5 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 font-semibold cursor-pointer ${
              isDark ? 'bg-slate-900 border-gray-800 text-white' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            {targetRoles.map(r => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Grid: Upper Layout (Confidence Ring & Salary Curve) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Upper Left: Interview Probability & Speed (Col Span 4) */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between lg:col-span-4 ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
              <Compass size={12} className="text-violet-400" />
              Interview Readiness Forecast
            </h4>

            {/* Circular Gauge */}
            <div className="flex flex-col items-center justify-center py-4 relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="rgba(139, 92, 246, 0.06)" strokeWidth="6" fill="transparent" />
                <circle cx="64" cy="64" r="56" stroke="rgb(139, 92, 246)" strokeWidth="6" fill="transparent" 
                  strokeDasharray={351} strokeDashoffset={351 - (351 * career.interviewProbability) / 100} />
              </svg>
              <div className="absolute flex flex-col items-center text-center">
                <span className="text-2xl font-mono font-bold text-white leading-none">{career.interviewProbability}%</span>
                <span className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-wider mt-1">Readiness Ratio</span>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed text-center">
              Your overall technical skill index is at <span className="font-bold text-violet-400">{career.currentReadiness}% matching</span> against the requirements for <span className="font-bold text-white truncate max-w-[200px] inline-block align-bottom">{activeRole.name}</span>.
            </p>
          </div>

          <div className="border-t border-gray-800/15 pt-3 mt-4 flex items-center justify-between text-[10px] font-mono text-gray-500">
            <span>Model 3 Prediction</span>
            <span className="text-emerald-400 font-bold flex items-center gap-0.5">
              <TrendingUp size={11} /> 30d Projection: {career.forecast30Days}%
            </span>
          </div>
        </div>

        {/* Upper Right: Interactive Salary Projections (Col Span 8) */}
        <div className={`p-5 rounded-2xl border lg:col-span-8 flex flex-col justify-between ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><LineChart size={12} className="text-violet-400" /> Earning Trajectory Projection (3 Years)</span>
              <span className="text-[8px] text-gray-500 font-bold uppercase">Exponential Skill Growth Curve</span>
            </h4>

            {/* Salary chart using Recharts */}
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={career.futureSalaryProjection}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSalary" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(139, 92, 246)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="rgb(139, 92, 246)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.05)" />
                  <XAxis dataKey="year" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={10} tickLine={false} domain={['dataMin - 10000', 'dataMax + 10000']} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isDark ? 'rgb(15, 23, 42)' : 'white', 
                      borderColor: 'rgba(100, 116, 139, 0.1)',
                      fontSize: '10px',
                      color: isDark ? '#fff' : '#000'
                    }} 
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Salary']}
                  />
                  <Area type="monotone" dataKey="salary" stroke="rgb(139, 92, 246)" strokeWidth={2} fillOpacity={1} fill="url(#colorSalary)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border-t border-gray-800/15 pt-3 mt-4 text-[11px] leading-snug text-gray-400">
            <span className="font-bold text-violet-400">Salary Elasticity Model:</span> Future salary curve correlates directly with skills compliance. Securing the remaining <span className="font-bold text-white">{career.skillGrowth.filter(s => s.currentScore < 50).length} missing skills</span> unlocks an expected salary premium of <span className="text-emerald-400 font-bold">22.4%</span> by 2028.
          </div>
        </div>

      </div>

      {/* Lower Layout: Skill Progression and Growth Tuning */}
      <div className={`p-5 rounded-2xl border ${
        isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
      }`}>
        <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Award size={12} className="text-violet-400" /> Career Skill progression Map</span>
          <span className="text-[8px] font-mono text-gray-500 font-bold uppercase">Click score to tune skill value</span>
        </h4>

        {/* Skill Bars with interactive Tuning (CRUD) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {career.skillGrowth.map((skill) => {
            const hasSkill = skill.currentScore > 50;
            return (
              <div key={skill.name} className="space-y-2 bg-slate-950/15 p-3 rounded-xl border border-gray-800/20">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-200">{skill.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono text-gray-500 uppercase">Target: {skill.targetScore}%</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-[9px] font-mono text-violet-400 uppercase font-bold">90d Projection: {skill.predicted90Days}%</span>
                  </div>
                </div>

                {/* Progress bar comparison */}
                <div className="relative pt-1">
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-gray-800/20 relative">
                    {/* Target marker line */}
                    <div className="absolute right-[10%] top-0 bottom-0 w-0.5 bg-red-400/40 z-10" />
                    
                    {/* Predicted line overlay */}
                    <div className="h-full bg-violet-600/30 absolute left-0" style={{ width: `${skill.predicted90Days}%` }} />
                    
                    {/* Current Score */}
                    <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 absolute left-0" style={{ width: `${skill.currentScore}%` }} />
                  </div>
                </div>

                {/* Interactive Tuner Slider (CRUD) */}
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 pt-1">
                  <span>Current: {skill.currentScore}%</span>
                  <div className="flex items-center gap-2">
                    <span>Tune:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={skill.currentScore}
                      onChange={(e) => onUpdateSkills(skill.name, parseInt(e.target.value))}
                      className="accent-violet-500 w-24 h-1 cursor-pointer bg-slate-950 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
