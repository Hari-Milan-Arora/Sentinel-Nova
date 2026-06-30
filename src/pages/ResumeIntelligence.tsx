/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  UserCheck, 
  Award, 
  HelpCircle, 
  ArrowUpRight, 
  Activity, 
  Lightbulb, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  ListTodo, 
  ChevronRight,
  RefreshCw,
  FileText,
  AlertCircle
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ResumeMetrics } from '../types';

interface ResumeIntelligenceProps {
  resume: ResumeMetrics;
  onOptimize: () => void;
  isDark: boolean;
}

export default function ResumeIntelligence({
  resume,
  onOptimize,
  isDark
}: ResumeIntelligenceProps) {
  const [isScanned, setIsScanned] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'ats' | 'gaps' | 'courses'>('ats');

  const handleScan = async () => {
    setIsScanned(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    onOptimize();
    setIsScanned(false);
  };

  const courseRecommendations = [
    { title: "Vertex AI: Custom Training & Tuning Pipelines", provider: "Coursera", duration: "12 hours", relevance: "high", skill: "Vertex AI Study Jobs" },
    { title: "Continuous Integration & Delivery for ML Models", provider: "DeepLearning.AI", duration: "8 hours", relevance: "medium", skill: "Continuous Integration" },
    { title: "Designing Finite State Machines for Agent Swarms", provider: "Stanford Online", duration: "20 hours", relevance: "high", skill: "SCXML Parsing" }
  ];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-space tracking-tight">Resume ATS Evolution Platform</h2>
          <p className="text-xs text-gray-400">
            Scanning portfolio structures and parsing skill representations to forecast hiring probabilities and automate ATS score optimization.
          </p>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanned}
          className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={12} className={isScanned ? 'animate-spin' : ''} />
          {isScanned ? 'Evaluating Resume...' : 'Analyze & Optimize CV'}
        </button>
      </div>

      {/* Main Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: ATS Stats & History (Col Span 5) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* ATS Gauge & Hiring Probability */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
                <FileText size={12} className="text-violet-400" />
                ATS Compatibility Index
              </h4>

              <div className="flex items-center justify-between bg-slate-950/25 p-4 rounded-xl border border-gray-800/20">
                <div>
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider">Current Score</span>
                  <span className="text-2xl font-bold font-mono text-white mt-1 block">{resume.atsScore}%</span>
                </div>
                <div className="w-px h-10 bg-gray-800/20" />
                <div className="text-right">
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-wider">Hiring Prob</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">{resume.hiringProbability}%</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10 text-[11px] leading-relaxed text-gray-400 flex gap-2">
                <AlertCircle size={14} className="text-violet-400 shrink-0 mt-0.5" />
                <p>
                  Adding <span className="text-violet-300 font-semibold">{resume.missingSkills.length} missing keywords</span> will increase hiring probability by <span className="text-emerald-400 font-bold">+11.5%</span>.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-800/15 pt-3 mt-4 text-[10px] font-mono text-gray-500 flex justify-between">
              <span>Model 4 Prediction</span>
              <span className="text-emerald-400 font-bold uppercase flex items-center gap-0.5">
                <TrendingUp size={11} /> Trajectory: upward
              </span>
            </div>
          </div>

          {/* ATS History Curve (Area Chart) */}
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center gap-1.5">
              <TrendingUp size={12} className="text-violet-400" />
              Historical ATS Score Evolution
            </h4>

            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={resume.improvementTrend}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorATS" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="rgb(139, 92, 246)" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="rgb(139, 92, 246)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.05)" />
                  <XAxis dataKey="date" stroke="#475569" fontSize={9} tickLine={false} />
                  <YAxis stroke="#475569" fontSize={9} tickLine={false} domain={[50, 100]} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isDark ? 'rgb(15, 23, 42)' : 'white', 
                      borderColor: 'rgba(100, 116, 139, 0.1)',
                      fontSize: '9px',
                      color: isDark ? '#fff' : '#000'
                    }} 
                    formatter={(value: any) => [`${value}%`, 'ATS Match']}
                  />
                  <Area type="monotone" dataKey="score" stroke="rgb(139, 92, 246)" strokeWidth={2} fillOpacity={1} fill="url(#colorATS)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Right Column: Missing Skills & Adaptive Courses (Col Span 7) */}
        <div className={`lg:col-span-7 rounded-2xl border flex flex-col justify-between ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          
          <div className="p-5 space-y-4">
            
            {/* Nav Tabs */}
            <div className="flex items-center gap-2 border-b border-gray-800/10 pb-2">
              <button
                onClick={() => setActiveTab('ats')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase cursor-pointer transition-all ${
                  activeTab === 'ats' 
                    ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 font-bold' 
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                Gaps Diagnostic
              </button>
              <button
                onClick={() => setActiveTab('courses')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase cursor-pointer transition-all ${
                  activeTab === 'courses' 
                    ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 font-bold' 
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                Adaptive Course Pathways
              </button>
            </div>

            {/* Tab: Gaps */}
            {activeTab === 'ats' && (
              <div className="space-y-4">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Sentinel has completed a linguistic alignment sweep. We detected that the following core keywords or phrases are missing or under-represented in your profile descriptions:
                </p>

                <div className="space-y-3">
                  {resume.missingSkills.map((skill, idx) => (
                    <div key={idx} className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/15 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <span className="text-xs font-bold text-gray-200">{skill}</span>
                      </div>
                      <span className="text-[9px] font-mono text-red-400 font-bold uppercase bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10">
                        High Priority Gaps
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab: Courses */}
            {activeTab === 'courses' && (
              <div className="space-y-4">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Recommended course structures and training frameworks. Completing these modules will automatically integrate missing keywords and verify ATS compliance:
                </p>

                <div className="space-y-3">
                  {courseRecommendations.map((rec, idx) => (
                    <div key={idx} className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/15 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-100">{rec.title}</span>
                        <span className="text-[8px] font-mono text-emerald-400 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          {rec.relevance} relevance
                        </span>
                      </div>

                      <div className="flex justify-between text-[10px] font-mono text-gray-500">
                        <span>Provider: {rec.provider} • Duration: {rec.duration}</span>
                        <span>Fills Gap: <span className="text-violet-400 font-semibold">{rec.skill}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div className="p-5 border-t border-gray-800/15 flex items-center justify-between text-[11px]">
            <span className="text-gray-400">Ready to inject these optimized keywords?</span>
            <button
              onClick={handleScan}
              className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-0.5 cursor-pointer"
            >
              Automate Keyword Integration <ChevronRight size={14} />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}
