/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  Cpu, 
  Brain, 
  Activity, 
  TrendingUp, 
  Award, 
  Clock, 
  HelpCircle, 
  ArrowUpRight, 
  Settings, 
  CheckSquare, 
  Gauge,
  UserCheck,
  RefreshCw,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import { BurnoutMetrics, PredictionEngineMetrics } from '../types';

interface DigitalTwinProps {
  burnout: BurnoutMetrics;
  engineStats: PredictionEngineMetrics;
  onUpdateWeights: (weights: Record<string, number>) => void;
  isDark: boolean;
}

export default function DigitalTwin({
  burnout,
  engineStats,
  onUpdateWeights,
  isDark
}: DigitalTwinProps) {
  // Behavior pattern weights states
  const [workloadLimit, setWorkloadLimit] = React.useState(8);
  const [learningVelocity, setLearningVelocity] = React.useState(75);
  const [relaxationFactor, setRelaxationFactor] = React.useState(60);
  const [attentionFocus, setAttentionFocus] = React.useState(85);

  const [isUpdating, setIsUpdating] = React.useState(false);

  const handleWeightChange = (key: string, val: number) => {
    let currentWeights = { workloadLimit, learningVelocity, relaxationFactor, attentionFocus };
    if (key === 'workloadLimit') {
      setWorkloadLimit(val);
      currentWeights.workloadLimit = val;
    } else if (key === 'learningVelocity') {
      setLearningVelocity(val);
      currentWeights.learningVelocity = val;
    } else if (key === 'relaxationFactor') {
      setRelaxationFactor(val);
      currentWeights.relaxationFactor = val;
    } else if (key === 'attentionFocus') {
      setAttentionFocus(val);
      currentWeights.attentionFocus = val;
    }

    onUpdateWeights(currentWeights);
  };

  const triggerReset = async () => {
    setIsUpdating(true);
    await new Promise(resolve => setTimeout(resolve, 600));
    setWorkloadLimit(8);
    setLearningVelocity(75);
    setRelaxationFactor(60);
    setAttentionFocus(85);
    onUpdateWeights({ workloadLimit: 8, learningVelocity: 75, relaxationFactor: 60, attentionFocus: 85 });
    setIsUpdating(false);
  };

  const predictionAuditHistory = [
    { id: "audit_1", date: "June 28", model: "Task Completion Model", prediction: "Predicts task 'fine-tune' completion by Thursday", actualOutcome: "Completed Thursday 16:30", deviation: "0.0 days (100% accurate)", status: "verified" },
    { id: "audit_2", date: "June 25", model: "Deadline Risk Classifier", prediction: "Goal 'CV Audit' predicted at high risk of delay", actualOutcome: "Progress stagnated, delay verified", deviation: "Verified delay", status: "verified" },
    { id: "audit_3", date: "June 20", model: "Burnout Risk Classifier", prediction: "Burnout risk predicted at Critical (Score 88)", actualOutcome: "Productivity dropped by 22%", deviation: "Confirmed overload", status: "verified" }
  ];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold font-space tracking-tight">Digital Twin Behavior Optimizer</h2>
          <p className="text-xs text-gray-400">
            Calibrating behavioral parameters and monitoring predictive alignment statistics against historical task logs.
          </p>
        </div>

        <button
          onClick={triggerReset}
          disabled={isUpdating}
          className="px-3.5 py-1.5 rounded-xl border border-gray-800 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer hover:bg-gray-800/10"
        >
          <RefreshCw size={12} className={isUpdating ? 'animate-spin' : ''} />
          {isUpdating ? 'Recalibrating...' : 'Reset Core Model'}
        </button>
      </div>

      {/* Main Grid content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Sliders & Behavior parameters (Col Span 5) */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between lg:col-span-5 ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
              <Sliders size={12} className="text-violet-400" />
              Tune Twin Behavioral Weights
            </h4>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              These weights calibrate how Sentinel interprets your schedule. Tuning these parameters will recalculate task success scores and burnout estimates.
            </p>

            <div className="space-y-4 pt-2">
              
              {/* Slider 1: Workload Limit */}
              <div className="space-y-2 bg-slate-950/15 p-3 rounded-xl border border-gray-800/10">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-200">Workload Threshold</span>
                  <span className="font-mono text-violet-400 font-bold">{workloadLimit} hrs/day</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="14"
                  value={workloadLimit}
                  onChange={(e) => handleWeightChange('workloadLimit', parseInt(e.target.value))}
                  className="w-full accent-violet-600 h-1 bg-slate-950 rounded-lg cursor-pointer"
                />
                <span className="text-[9px] text-gray-500 font-mono block">Limits the daily capacity calculations.</span>
              </div>

              {/* Slider 2: Learning Velocity */}
              <div className="space-y-2 bg-slate-950/15 p-3 rounded-xl border border-gray-800/10">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-200">Learning Velocity Index</span>
                  <span className="font-mono text-violet-400 font-bold">{learningVelocity}%</span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="100"
                  value={learningVelocity}
                  onChange={(e) => handleWeightChange('learningVelocity', parseInt(e.target.value))}
                  className="w-full accent-violet-600 h-1 bg-slate-950 rounded-lg cursor-pointer"
                />
                <span className="text-[9px] text-gray-500 font-mono block">Adjusts target milestone completion speed assumptions.</span>
              </div>

              {/* Slider 3: Relaxation Factor */}
              <div className="space-y-2 bg-slate-950/15 p-3 rounded-xl border border-gray-800/10">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-gray-200">Relaxation & Cooldown Coef</span>
                  <span className="font-mono text-violet-400 font-bold">{relaxationFactor}%</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={relaxationFactor}
                  onChange={(e) => handleWeightChange('relaxationFactor', parseInt(e.target.value))}
                  className="w-full accent-violet-600 h-1 bg-slate-950 rounded-lg cursor-pointer"
                />
                <span className="text-[9px] text-gray-500 font-mono block">Mitigates burnout escalation multipliers.</span>
              </div>

            </div>
          </div>

          <div className="border-t border-gray-800/15 pt-3 mt-4 text-[10px] font-mono text-gray-500 flex justify-between">
            <span>Model Calibration Suite</span>
            <span className="text-emerald-400 font-bold uppercase">Dynamic Synchronization Active</span>
          </div>
        </div>

        {/* Right column: Prediction Logs (Col Span 7) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Twin Status & Engine Stats */}
          <div className={`p-5 rounded-2xl border ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Cpu size={12} className="text-violet-400" /> Active Simulation Stats</span>
              <span className="text-[8px] font-mono text-emerald-400 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Active</span>
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs font-mono">
              <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                <span className="text-gray-500 block text-[9px] uppercase font-bold mb-1">Mean Accuracy</span>
                <span className="text-sm font-bold text-white">{engineStats.historicalAccuracy}%</span>
              </div>
              <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                <span className="text-gray-500 block text-[9px] uppercase font-bold mb-1">Model F1</span>
                <span className="text-sm font-bold text-violet-400">{engineStats.f1Score}%</span>
              </div>
              <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                <span className="text-gray-500 block text-[9px] uppercase font-bold mb-1">Drift Index</span>
                <span className="text-sm font-bold text-amber-400">{engineStats.predictionDrift}</span>
              </div>
              <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                <span className="text-gray-500 block text-[9px] uppercase font-bold mb-1">Precision</span>
                <span className="text-sm font-bold text-white">{engineStats.precision}%</span>
              </div>
            </div>
          </div>

          {/* Verification Audit Logs */}
          <div className={`p-5 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
          }`}>
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 flex items-center gap-1.5">
                <UserCheck size={12} className="text-violet-400" />
                Independent Prediction Audit Log
              </h4>

              <div className="space-y-3">
                {predictionAuditHistory.map(log => (
                  <div key={log.id} className="p-3 bg-slate-950/25 rounded-xl border border-gray-800/15 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-200">{log.model}</span>
                      <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        {log.status}
                      </span>
                    </div>

                    <div className="text-gray-400">
                      <div>Prediction: <span className="font-medium text-white">{log.prediction}</span></div>
                      <div className="mt-0.5">Outcome: <span className="font-medium text-white">{log.actualOutcome}</span></div>
                    </div>

                    <div className="flex justify-between text-[9px] font-mono text-gray-500 border-t border-gray-800/5 pt-1.5">
                      <span>Log date: {log.date}</span>
                      <span>Deviation: <span className="text-emerald-400 font-semibold">{log.deviation}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
