/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Plus, 
  Trash2, 
  Compass, 
  Brain, 
  Sparkles, 
  ArrowUpRight, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Globe, 
  RefreshCw,
  Search,
  Filter,
  Check
} from 'lucide-react';
import { Opportunity } from '../types';

interface OpportunityRadarProps {
  opportunities: Opportunity[];
  onAddOpportunity: (opp: Omit<Opportunity, 'id' | 'fitScore' | 'expectedSuccess' | 'applicationConfidence' | 'careerImpactScore' | 'deadlineUrgency'>) => void;
  onDeleteOpportunity: (id: string) => void;
  onRecalibrate: () => void;
  isDark: boolean;
}

export default function OpportunityRadar({
  opportunities,
  onAddOpportunity,
  onDeleteOpportunity,
  onRecalibrate,
  isDark
}: OpportunityRadarProps) {
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [type, setType] = React.useState<'Internship' | 'Full-Time' | 'Hackathon' | 'Scholarship' | 'Course'>('Full-Time');
  const [deadline, setDeadline] = React.useState('In 12 days');
  const [url, setUrl] = React.useState('');

  const [activeOppId, setActiveOppId] = React.useState<string | null>(null);
  const [isCalibrating, setIsCalibrating] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !company.trim()) return;
    onAddOpportunity({
      title,
      company,
      type,
      deadline,
      url: url || undefined
    });
    setTitle('');
    setCompany('');
    setType('Full-Time');
    setDeadline('In 12 days');
    setUrl('');
    setShowAddForm(false);
  };

  const triggerCalibrate = async () => {
    setIsCalibrating(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    onRecalibrate();
    setIsCalibrating(false);
  };

  React.useEffect(() => {
    if (opportunities.length > 0 && !activeOppId) {
      setActiveOppId(opportunities[0].id);
    }
  }, [opportunities, activeOppId]);

  const activeOpp = opportunities.find(o => o.id === activeOppId) || opportunities[0];

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800/20 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold font-space tracking-tight">Smart Match Opportunity Radar</h2>
            <span className="px-2 py-0.5 bg-violet-600/10 text-violet-400 border border-violet-500/20 font-mono text-[8px] font-bold rounded">PHASE 3 ACTIVE</span>
          </div>
          <p className="text-xs text-gray-400">
            Scanning career listings and calculating candidate-opportunity fit scoring, expected success, and alignment metrics.
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
            {isCalibrating ? 'Scanning...' : 'Scan Postings'}
          </button>
          
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-bold font-mono uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus size={12} className="stroke-[2.5]" />
            Add Posting
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className={`p-5 rounded-2xl border space-y-4 animate-in fade-in slide-in-from-top-4 duration-300 ${
          isDark ? 'bg-slate-900/60 border-gray-900' : 'bg-white border-gray-200'
        }`}>
          <h3 className="text-xs font-bold uppercase font-mono tracking-widest text-gray-400 flex items-center gap-1.5 pb-2 border-b border-gray-800/10">
            <Sparkles size={12} className="text-violet-400" /> Catalog Target Career Opportunity
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Job / Posting Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Research Scientist - Multi-Agent Swarms"
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Company / Entity</label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google DeepMind"
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Category</label>
              <select
                value={type}
                onChange={(e: any) => setType(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <option value="Full-Time">Full-Time Career</option>
                <option value="Internship">Internship / Co-op</option>
                <option value="Hackathon">Hackathon / Pitch</option>
                <option value="Scholarship">Fellowship / Scholarship</option>
                <option value="Course">Certification Track</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Deadline Timeframe</label>
              <input
                type="text"
                required
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="e.g. In 5 days, Tomorrow, July 15"
                className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-950 border-gray-800 text-white' : 'bg-gray-50 border-gray-200'
                }`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-gray-500 uppercase font-bold">Listing URL (Optional)</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. https://careers.google.com/..."
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
              Create Posting
            </button>
          </div>
        </form>
      )}

      {/* Main Grid Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Ranked List (Col Span 5) */}
        <div className="lg:col-span-5 space-y-3 max-h-[500px] overflow-y-auto pr-1">
          {opportunities.map((opp) => {
            const isActive = opp.id === activeOppId;
            return (
              <div
                key={opp.id}
                onClick={() => setActiveOppId(opp.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 h-28 relative overflow-hidden ${
                  isActive 
                    ? 'bg-violet-600/10 border-violet-500/30 shadow-md shadow-violet-500/5' 
                    : (isDark ? 'bg-slate-900/30 border-gray-900/50 hover:border-gray-800' : 'bg-white border-gray-150 shadow-sm')
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-mono font-bold text-gray-500 uppercase tracking-widest">
                      {opp.company}
                    </span>
                    <span className="text-gray-700 font-mono text-[8px]">•</span>
                    <span className="text-[8px] font-mono font-semibold text-gray-400">{opp.type}</span>
                  </div>
                  <h4 className="text-xs font-bold truncate max-w-[180px] text-gray-200">
                    {opp.title}
                  </h4>
                  <div className="flex items-center gap-1 text-[9px] text-gray-400">
                    <Clock size={10} /> <span>Deadline: {opp.deadline}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded block">
                    {opp.fitScore}% Fit
                  </span>
                  <span className="text-[8px] font-mono text-gray-500 font-bold block mt-1 uppercase">Smart Score</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteOpportunity(opp.id);
                  }}
                  className="absolute bottom-2 right-2 p-1 text-red-400 hover:bg-red-500/15 rounded shrink-0 transition-all cursor-pointer"
                  title="Purge opportunity specification"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Right column: Metric sliders (Col Span 7) */}
        <div className="lg:col-span-7">
          {activeOpp ? (
            <div className={`p-5 rounded-2xl border flex flex-col justify-between h-full space-y-5 ${
              isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
            }`}>
              
              {/* Header */}
              <div className="border-b border-gray-800/15 pb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[9px] font-mono text-gray-500">
                    <span className="uppercase tracking-widest">{activeOpp.company}</span>
                    <span>•</span>
                    <span className="uppercase">{activeOpp.type}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-100 font-space tracking-tight mt-1">
                    {activeOpp.title}
                  </h3>
                </div>

                {activeOpp.url && (
                  <a
                    href={activeOpp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 bg-slate-950/30 hover:bg-slate-950 border border-gray-800/35 text-violet-400 rounded-lg text-xs font-mono font-bold uppercase shrink-0 cursor-pointer flex items-center gap-1 transition-all"
                  >
                    <Globe size={12} /> External
                  </a>
                )}
              </div>

              {/* Score bento metrics block */}
              <div className="space-y-4">
                
                {/* 1. Fit Score Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-gray-400">Adaptive Fit Score</span>
                    <span className="font-bold text-white">{activeOpp.fitScore}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-gray-800/20">
                    <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full" style={{ width: `${activeOpp.fitScore}%` }} />
                  </div>
                </div>

                {/* 2. Expected Success Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-gray-400">Expected Application Success Score</span>
                    <span className="font-bold text-emerald-400">{activeOpp.expectedSuccess}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-gray-800/20">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${activeOpp.expectedSuccess}%` }} />
                  </div>
                </div>

                {/* 3. Application Confidence Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-gray-400">Cognitive Confidence Bounds</span>
                    <span className="font-bold text-indigo-400">{activeOpp.applicationConfidence}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-gray-800/20">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${activeOpp.applicationConfidence}%` }} />
                  </div>
                </div>

                {/* Grid details (Impact and Urgency) */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-800/10 pt-4">
                  <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                    <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Career Impact Factor</span>
                    <span className="text-sm font-bold text-white mt-1 block">{activeOpp.careerImpactScore}/100</span>
                  </div>
                  <div className="p-3 bg-slate-950/20 rounded-xl border border-gray-800/10">
                    <span className="text-[8px] font-mono uppercase text-gray-500 font-bold block">Deadline Urgency Index</span>
                    <span className={`text-xs font-bold uppercase mt-1.5 block ${
                      activeOpp.deadlineUrgency === 'critical' ? 'text-red-400 animate-pulse' :
                      activeOpp.deadlineUrgency === 'high' ? 'text-orange-400' : 'text-emerald-400'
                    }`}>
                      {activeOpp.deadlineUrgency}
                    </span>
                  </div>
                </div>

              </div>

              {/* Model Diagnostics */}
              <div className="p-3 bg-slate-950/30 rounded-xl border border-gray-800/10 text-[11px] leading-relaxed text-gray-400 flex gap-2.5">
                <Brain size={16} className="text-violet-400 shrink-0 mt-0.5" />
                <p>
                  <span className="font-bold text-violet-300">Model 6 Diagnostic:</span> Fit score is determined dynamically based on the semantic match of your current active skill representation map. You can optimize this fit score by completing related courses.
                </p>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-xs py-12">
              Select or add a target career opportunity to initiate smart fit scoring analyses.
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
