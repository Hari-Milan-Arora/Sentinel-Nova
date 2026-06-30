/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  LineChart, 
  Activity, 
  TrendingUp, 
  Award, 
  Clock, 
  HelpCircle, 
  ArrowUpRight, 
  CheckSquare, 
  Gauge, 
  Cpu, 
  RefreshCw,
  Sliders,
  Calendar,
  BarChart2
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, LineChart as ReLineChart, Line, Legend } from 'recharts';
import { BurnoutMetrics, PredictionEngineMetrics } from '../types';

interface AnalyticsProps {
  burnout: BurnoutMetrics;
  engineStats: PredictionEngineMetrics;
  isDark: boolean;
}

export default function Analytics({
  burnout,
  engineStats,
  isDark
}: AnalyticsProps) {
  const [activeTab, setActiveTab] = React.useState<'productivity' | 'calibration'>('productivity');

  const epochTrend = [
    { epoch: 'E1', loss: 0.28, accuracy: 84 },
    { epoch: 'E2', loss: 0.24, accuracy: 87 },
    { epoch: 'E3', loss: 0.19, accuracy: 91 },
    { epoch: 'E4', loss: 0.14, accuracy: 94 }
  ];

  const focusDistribution = [
    { name: 'Monday', dev: 6, learning: 3, strategy: 1 },
    { name: 'Tuesday', dev: 5, learning: 4, strategy: 1 },
    { name: 'Wednesday', dev: 7, learning: 2, strategy: 2 },
    { name: 'Thursday', dev: 4, learning: 5, strategy: 2 },
    { name: 'Friday', dev: 5, learning: 3, strategy: 3 },
    { name: 'Saturday', dev: 1, learning: 2, strategy: 1 },
    { name: 'Sunday', dev: 0, learning: 1, strategy: 2 }
  ];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-space tracking-tight">Predictive Analytics Platform</h2>
          <p className="text-xs text-gray-400">
            Evaluating historical trends, projecting workload models, and monitoring training losses across active ML layers.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-slate-950/40 border border-gray-800 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setActiveTab('productivity')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold cursor-pointer transition-all ${
              activeTab === 'productivity' ? 'bg-violet-600/25 text-violet-400' : 'text-gray-500 hover:text-white'
            }`}
          >
            Workload Forecasts
          </button>
          <button
            onClick={() => setActiveTab('calibration')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase font-bold cursor-pointer transition-all ${
              activeTab === 'calibration' ? 'bg-violet-600/25 text-violet-400' : 'text-gray-500 hover:text-white'
            }`}
          >
            Model Loss Metrics
          </button>
        </div>
      </div>

      {/* Main content conditional */}
      {activeTab === 'productivity' ? (
        <div className="space-y-6">
          
          {/* Main Chart Card */}
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><LineChart size={12} className="text-violet-400" /> Multi-Day Productivity Curve Forecast</span>
              <span className="text-[8px] text-gray-500 font-bold uppercase">Comparing Normal vs AI Cooldown guided</span>
            </h4>

            {/* Recharts Double Line Chart */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ReLineChart
                  data={burnout.productivityTrend}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.05)" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} domain={[0, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isDark ? 'rgb(15, 23, 42)' : 'white', 
                      borderColor: 'rgba(100, 116, 139, 0.1)',
                      fontSize: '9px',
                      color: isDark ? '#fff' : '#000'
                    }} 
                  />
                  <Legend verticalAlign="top" height={36} iconSize={8} fontSize={10} wrapperStyle={{ fontSize: '10px' }} />
                  <Line type="monotone" name="Standard (Overloaded) Productivity" dataKey="value" stroke="rgb(239, 68, 68)" strokeWidth={1.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" name="AI Cooldown Guided Recovery" dataKey="predictedValue" stroke="rgb(16, 185, 129)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ReLineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lower layout bento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Bento block 1: Workload Hour Allocations */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
                  <Calendar size={12} className="text-violet-400" />
                  Expected Attention Hour Distribution
                </h4>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Predictive distribution of cognitive bandwidth over next 7 days based on current priority milestones:
                </p>

                <div className="space-y-2.5">
                  {focusDistribution.slice(0, 5).map(day => (
                    <div key={day.name} className="space-y-1 bg-slate-950/15 p-2 rounded-lg border border-gray-800/5">
                      <div className="flex justify-between text-[10px] font-mono text-gray-300">
                        <span className="font-bold">{day.name}</span>
                        <span>Total: {day.dev + day.learning + day.strategy} hrs</span>
                      </div>
                      
                      {/* Stacked bar visualization */}
                      <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden flex">
                        <div className="h-full bg-violet-600" style={{ width: `${(day.dev / 12) * 100}%` }} title={`Dev: ${day.dev} hrs`} />
                        <div className="h-full bg-indigo-500" style={{ width: `${(day.learning / 12) * 100}%` }} title={`Study: ${day.learning} hrs`} />
                        <div className="h-full bg-emerald-500" style={{ width: `${(day.strategy / 12) * 100}%` }} title={`Strategy: ${day.strategy} hrs`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between text-[9px] font-mono text-gray-500 pt-3 border-t border-gray-800/10 mt-4">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-600 block" /> Dev</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-500 block" /> Study</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500 block" /> Strategy</span>
              </div>
            </div>

            {/* Bento block 2: Risk Profile details */}
            <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
                  <BarChart2 size={12} className="text-violet-400" />
                  Systemic Risk Profile Classification
                </h4>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Multi-variable stress and workload factors parsed across core timelines. Risk classification:
                </p>

                <div className="space-y-3.5 pt-1 text-[11px] text-gray-300">
                  <div className="flex items-center justify-between border-b border-gray-800/5 pb-2">
                    <span>Deadline Convergence Volatility</span>
                    <span className="font-mono text-red-400 font-bold uppercase">High Risk (0.84)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-800/5 pb-2">
                    <span>Task Context Switching Multiplier</span>
                    <span className="font-mono text-amber-400 font-bold uppercase">Medium Risk (0.55)</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-gray-800/5 pb-2">
                    <span>Active Skill Acquisition Rate</span>
                    <span className="font-mono text-emerald-400 font-bold uppercase">Optimal Bounds</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Workload Standard Deviation</span>
                    <span className="font-mono text-gray-400">1.84 hrs/day</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-950/25 rounded-xl border border-gray-800/10 text-[10px] text-gray-400 leading-relaxed mt-4">
                <span className="font-bold text-violet-400 block mb-0.5">Statistical Summary:</span>
                While skill growth velocity is pristine, convergence of 3 active deadlines on June 30 increases timeline risk. Consider adjusting workload thresholds in Digital Twin.
              </div>
            </div>

          </div>

        </div>
      ) : (
        // Calibration metrics Tab
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Calibration block 1: Loss curves */}
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
                <span>Model Loss & Convergence Over Epochs</span>
                <span className="text-[8px] text-gray-500 font-bold uppercase">Model 1 Retraining Metrics</span>
              </h4>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={epochTrend}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.05)" />
                    <XAxis dataKey="epoch" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? 'rgb(15, 23, 42)' : 'white', 
                        borderColor: 'rgba(100, 116, 139, 0.1)',
                        fontSize: '9px',
                        color: isDark ? '#fff' : '#000'
                      }} 
                    />
                    <Area type="monotone" name="Cross-Entropy Training Loss" dataKey="loss" stroke="rgb(239, 68, 68)" strokeWidth={1.5} fillOpacity={0.06} fill="rgb(239, 68, 68)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Calibration block 2: Accuracy curves */}
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
                <span>Validation Accuracy vs Epochs</span>
                <span className="text-[8px] text-gray-500 font-bold uppercase">Balanced F1 convergence</span>
              </h4>

              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={epochTrend}
                    margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.05)" />
                    <XAxis dataKey="epoch" stroke="#475569" fontSize={9} tickLine={false} />
                    <YAxis stroke="#475569" fontSize={9} tickLine={false} domain={[50, 100]} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: isDark ? 'rgb(15, 23, 42)' : 'white', 
                        borderColor: 'rgba(100, 116, 139, 0.1)',
                        fontSize: '9px',
                        color: isDark ? '#fff' : '#000'
                      }} 
                    />
                    <Area type="monotone" name="Mean Squared Accuracy (%)" dataKey="accuracy" stroke="rgb(16, 185, 129)" strokeWidth={1.5} fillOpacity={0.06} fill="rgb(16, 185, 129)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
