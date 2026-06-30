/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  Cpu, 
  Brain, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Workflow, 
  Activity, 
  Compass, 
  Lock, 
  ArrowRight,
  Gauge
} from 'lucide-react';

interface FutureVisionProps {
  isDark: boolean;
}

export default function FutureVision({ isDark }: FutureVisionProps) {
  const phases = [
    {
      id: "phase1",
      number: "PHASE 1",
      title: "Core System & AI Chief of Staff",
      status: "completed",
      date: "Q1 2026",
      desc: "Establishing foundational CRUD interfaces for goals, tasks, and resume assets alongside standard responsive telemetry dashboards.",
      highlights: [
        "Interactive Task & Goal CRUD boards",
        "Resume and CV asset ingestion",
        "Modern responsive layouts"
      ]
    },
    {
      id: "phase2",
      number: "PHASE 2",
      title: "Deliberative Swarm Reasoning Engine",
      status: "completed",
      date: "Q2 2026",
      desc: "Implementing multi-agent deliberative reasoning logs representing multi-agent consensus checks before responding.",
      highlights: [
        "8-Stage agent swarm timeline simulator",
        "Granular token usage, reasoning depth, and latency logs",
        "Interactive decision tree tree visualizations"
      ]
    },
    {
      id: "phase3",
      number: "PHASE 3",
      title: "Predictive Intelligence Platform",
      status: "completed",
      date: "Q3 2026",
      desc: "Transforming Sentinel from a reactive logbook into a forward-looking predictive system using 10 specialized ML models.",
      highlights: [
        "Task completion speed & delay risk gauges",
        "Burnout risk classifications and preventative cooldown recommendations",
        "ATS resume trend tracking & interview probability line curves",
        "Smart Match opportunity ranking arrays"
      ]
    },
    {
      id: "phase4",
      number: "PHASE 4",
      title: "Proactive Autonomous Swarms",
      status: "in_progress",
      date: "Q4 2026",
      desc: "Augmenting the system with background execution workers capable of auto-submitting resumes, auto-registering for hackathons, and locking in calendar schedules.",
      highlights: [
        "Background task worker loops",
        "Auto-scheduling and sync with calendar integrations",
        "Autonomous application routing with feedback logs"
      ]
    }
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Page Header */}
      <div className="text-center space-y-2 border-b border-gray-800/20 pb-6">
        <span className="px-2.5 py-0.5 bg-violet-600/15 text-violet-400 font-mono text-[9px] font-bold rounded-full border border-violet-500/20 uppercase tracking-widest">
          Sentinel Nova Roadmap
        </span>
        <h2 className="text-2xl font-bold font-space tracking-tight">System Trajectory & Strategic Vision</h2>
        <p className="text-xs text-gray-400 max-w-lg mx-auto">
          The structural timeline detailing the evolution of Sentinel Nova from a reactive digital twin assistant into a fully proactive, autonomous ML workspace.
        </p>
      </div>

      {/* Timeline List */}
      <div className="relative border-l border-gray-800/35 pl-6 ml-4 space-y-10 py-4">
        {phases.map((phase, idx) => {
          const isCompleted = phase.status === 'completed';
          const isInProgress = phase.status === 'in_progress';
          
          return (
            <div key={phase.id} className="relative">
              
              {/* Timeline marker icon */}
              <div className={`absolute -left-[35px] top-1.5 w-5 h-5 rounded-full border flex items-center justify-center ${
                isCompleted 
                  ? 'bg-emerald-600/25 border-emerald-500 text-emerald-400' 
                  : isInProgress 
                    ? 'bg-violet-600/25 border-violet-500 text-violet-400 animate-pulse' 
                    : 'bg-slate-950 border-gray-800 text-gray-600'
              }`}>
                {isCompleted ? (
                  <CheckCircle2 size={12} className="stroke-[2.5]" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                )}
              </div>

              {/* Phase Bento Card */}
              <div className={`p-5 rounded-2xl border space-y-4 transition-all hover:border-gray-800/80 ${
                isCompleted 
                  ? (isDark ? 'bg-slate-900/25 border-gray-900/60' : 'bg-white border-gray-200 shadow-sm')
                  : isInProgress
                    ? (isDark ? 'bg-violet-950/5 border-violet-900/20' : 'bg-violet-50/50 border-violet-100 shadow-sm')
                    : 'bg-slate-900/5 border-gray-950/20 opacity-50'
              }`}>
                
                {/* Meta details */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-800/15 pb-2.5">
                  <div>
                    <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest">{phase.number}</span>
                    <h3 className="text-sm font-bold text-gray-100 font-space tracking-tight mt-0.5">{phase.title}</h3>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[9px] font-bold">
                    <span className="text-gray-500">{phase.date}</span>
                    <span className="text-gray-600">|</span>
                    <span className={`uppercase ${isCompleted ? 'text-emerald-400' : 'text-violet-400 animate-pulse'}`}>
                      {phase.status}
                    </span>
                  </div>
                </div>

                {/* Desc */}
                <p className="text-xs text-gray-400 leading-relaxed">{phase.desc}</p>

                {/* Highlights list */}
                <div className="space-y-2">
                  <span className="text-[9px] font-mono font-bold text-gray-500 uppercase tracking-widest block">Deliverable Checklist</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    {phase.highlights.map((item, iIdx) => (
                      <div key={iIdx} className="flex items-center gap-2 text-gray-300">
                        {isCompleted ? (
                          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                        )}
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
