/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Sparkles, 
  Send, 
  Trash2, 
  Bot, 
  User, 
  Clock, 
  Cpu, 
  ArrowRight, 
  Workflow, 
  CheckSquare, 
  Target,
  Brain,
  Lightbulb,
  Search,
  BookOpen,
  GitFork,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Gauge,
  Info,
  Activity,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { ChatMessage, Conversation, Task, Goal } from '../types';

interface AIWorkspaceProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSendMessage: (id: string, text: string) => Promise<any>;
  onDeleteConversation: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  tasks: Task[];
  goals: Goal[];
  isDark: boolean;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export default function AIWorkspace({
  conversations,
  activeConversationId,
  onSendMessage,
  onDeleteConversation,
  onSelectConversation,
  onNewConversation,
  tasks,
  goals,
  isDark,
  showToast
}: AIWorkspaceProps) {
  const [inputText, setInputText] = React.useState('');
  const [isThinking, setIsThinking] = React.useState(false);
  const [currentThinkingStep, setCurrentThinkingStep] = React.useState(0);
  const [thinkingSteps, setThinkingSteps] = React.useState<string[]>([]);
  const [expandedDecisions, setExpandedDecisions] = React.useState<Record<string, boolean>>({});

  const chatEndRef = React.useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0];
  const lastModelMessage = React.useMemo(() => {
    if (!activeConversation?.messages) return null;
    const models = activeConversation.messages.filter(m => m.role === 'model');
    return models.length > 0 ? models[models.length - 1] : null;
  }, [activeConversation]);

  const suggestedPrompts = [
    { label: "Draft my Gemini fine-tuning strategy", prompt: "How should I structure my hyperparameter search for fine-tuning Gemini 3.5 Flash on custom agent memory statecharts?" },
    { label: "Analyze my CV ATS gaps for DeepMind", prompt: "Perform a full compliance audit on my resume. What specific keywords or structure revisions do I need for senior Google DeepMind roles?" },
    { label: "Prioritize my operational agenda today", prompt: "Perform an executive sweep of my tasks and active goals. Tell me how to optimize my day schedule based on critical deadlines." },
    { label: "Recommend courses for AWS cert", prompt: "Recommend immediate courses and learning pathways to secure my AWS Certified Solutions Architect Professional goal." }
  ];

  // Auto scroll
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, isThinking]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;
    setInputText('');
    setIsThinking(true);
    setCurrentThinkingStep(0);

    const steps = [
      "Planner Agent: Formulating structured execution strategy...",
      "Context Agent: Mapping digital twin situation weights...",
      "Research Agent: Scanning parameter gaps and target opportunities...",
      "Reasoning Agent: Simulating trade-off decision options...",
      "Risk Agent: Auditing structural and timeline risks...",
      "Reviewer Agent: Validating draft accuracy and checklists...",
      "Consensus Agent: Synthesizing final response metrics...",
      "Memory Agent: Committing preferences and directions to conversation memory..."
    ];
    setThinkingSteps(steps);

    // Animate the thinking steps
    for (let i = 0; i < steps.length; i++) {
      setCurrentThinkingStep(i);
      await new Promise(resolve => setTimeout(resolve, 600));
    }

    try {
      await onSendMessage(activeConversationId, textToSend);
    } catch (error) {
      console.error(error);
      showToast('Error communicating with the deliberative reasoning engine.', 'error');
    } finally {
      setIsThinking(false);
      setCurrentThinkingStep(0);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(inputText);
  };

  const toggleDecision = (msgId: string) => {
    setExpandedDecisions(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  // Agent Swarm Live States calculated dynamically
  const agentSwarmStatus = React.useMemo(() => {
    const agents = [
      { id: 'planner', name: 'Planner Agent' },
      { id: 'context', name: 'Context Agent' },
      { id: 'research', name: 'Research Agent' },
      { id: 'reasoner', name: 'Reasoning Agent' },
      { id: 'risk', name: 'Risk Agent' },
      { id: 'reviewer', name: 'Reviewer Agent' },
      { id: 'consensus', name: 'Consensus Agent' },
      { id: 'memory', name: 'Memory Agent' }
    ];

    if (isThinking) {
      return agents.map((agent, idx) => {
        let status: 'waiting' | 'running' | 'completed' = 'waiting';
        if (idx === currentThinkingStep) status = 'running';
        else if (idx < currentThinkingStep) status = 'completed';
        return { ...agent, status, duration: idx < currentThinkingStep ? `${300 + idx * 40}ms` : null };
      });
    }

    if (lastModelMessage?.agentSteps) {
      return agents.map(agent => {
        const matchingStep = lastModelMessage.agentSteps?.find(s => s.agentId === agent.id);
        return {
          ...agent,
          status: 'completed' as const,
          duration: matchingStep ? `${matchingStep.durationMs}ms` : '350ms'
        };
      });
    }

    return agents.map(agent => ({ ...agent, status: 'waiting' as const, duration: null }));
  }, [isThinking, currentThinkingStep, lastModelMessage]);

  // Proactive Insights derived from model messages or fallback values
  const currentInsights = React.useMemo(() => {
    if (lastModelMessage?.insightsGenerated && lastModelMessage.insightsGenerated.length > 0) {
      return lastModelMessage.insightsGenerated;
    }
    return [
      { id: 'ins_1', text: "Your Resume ATS compatibility score is at 78% of Google DeepMind requirements.", type: 'info' as const },
      { id: 'ins_2', text: "You haven't updated or worked on your custom ML project in 6 days.", type: 'warning' as const },
      { id: 'ins_3', text: "Three target internship deadlines are approaching in under 12 days.", type: 'warning' as const }
    ];
  }, [lastModelMessage]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      
      {/* LEFT COLUMN: Strategic Sessions Feed (Col Span 3) */}
      <div className="lg:col-span-3 flex flex-col h-full space-y-4 overflow-y-auto">
        
        {/* New Session Action */}
        <button
          onClick={onNewConversation}
          className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
        >
          <Sparkles size={14} className="stroke-[2.5]" />
          New Strategic Session
        </button>

        {/* Sessions Feed */}
        <div className={`p-4 rounded-2xl border flex-1 flex flex-col min-h-[220px] ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2 mb-3">
            Consultation Logbook
          </h4>
          
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {conversations.length === 0 ? (
              <div className="text-[11px] text-gray-500 text-center py-6">No sessions yet.</div>
            ) : conversations.map(conv => {
              const isSelected = conv.id === activeConversationId;
              return (
                <div key={conv.id} className="flex items-center justify-between group gap-2">
                  <button
                    onClick={() => onSelectConversation(conv.id)}
                    className={`flex-1 text-left px-3 py-2 rounded-xl text-xs font-medium truncate cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-violet-600/10 text-violet-400 border border-violet-500/20 font-semibold' 
                        : 'hover:bg-gray-800/15 text-gray-400'
                    }`}
                  >
                    {conv.title}
                  </button>
                  {conversations.length > 1 && (
                    <button
                      onClick={() => onDeleteConversation(conv.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-all cursor-pointer shrink-0"
                      title="Purge session logs"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Core Context Weights */}
        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2 mb-3 flex items-center gap-2">
            <Cpu size={12} className="text-violet-400" />
            Core Context Weights
          </h4>
          <div className="space-y-2 text-[11px] text-gray-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><CheckSquare size={12} /> Pending Tasks</span>
              <span className="font-mono text-white font-bold">{tasks.filter(t => t.status !== 'done').length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Target size={12} /> Target Goals</span>
              <span className="font-mono text-white font-bold">{goals.length}</span>
            </div>
          </div>
        </div>

      </div>

      {/* CENTER COLUMN: Swarm Chat Workspace (Col Span 6) */}
      <div className={`lg:col-span-6 rounded-2xl border flex flex-col h-full relative overflow-hidden ${
        isDark ? 'bg-slate-900/15 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
      }`}>
        
        {/* Chat Banner Header */}
        <div className={`px-5 py-3 border-b flex items-center justify-between shrink-0 ${
          isDark ? 'bg-slate-950/40 border-gray-900/60' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isThinking ? 'bg-amber-400 animate-ping' : 'bg-violet-500 animate-pulse'}`}></div>
            <div>
              <h3 className="text-xs font-bold leading-none">{activeConversation?.title || 'Active Consultation'}</h3>
              <span className="text-[9px] text-gray-500 font-mono mt-0.5 inline-block">SWARM REASONING LAYER ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Chat Stream Viewport */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeConversation?.messages && activeConversation.messages.length > 0 ? (
            activeConversation.messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                
                {/* Bot Icon */}
                {msg.role !== 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-violet-600/15 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
                    <Bot size={16} />
                  </div>
                )}

                {/* Message Canvas Container */}
                <div className={`max-w-[92%] rounded-2xl p-4 text-xs leading-relaxed space-y-4 ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-tr-none'
                    : (isDark ? 'bg-gray-900/40 border border-gray-800/80 rounded-tl-none text-gray-200' : 'bg-gray-50 border border-gray-200/80 rounded-tl-none text-gray-800')
                }`}>
                  
                  {/* User View */}
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap font-medium">{msg.content}</div>
                  ) : (
                    // Model Swarm Detailed Layout
                    <div className="space-y-4">
                      
                      {/* 1. AGENT PLANNER TIMELINE */}
                      <div className={`rounded-xl p-3 border text-[10px] space-y-2 ${isDark ? 'bg-slate-950/50 border-gray-800' : 'bg-gray-100/60 border-gray-150'}`}>
                        <div className="flex items-center justify-between text-gray-400 border-b border-gray-800/20 pb-1.5 mb-1.5 font-mono text-[9px] uppercase tracking-wider font-bold">
                          <span className="flex items-center gap-1"><Workflow size={11} className="text-violet-400 animate-pulse" /> Deliberative Timeline</span>
                          <span className="text-violet-400 font-bold">Consensus Reached</span>
                        </div>
                        <div className="grid grid-cols-6 gap-1 text-center font-mono text-[8px] text-gray-500">
                          <div className="border-r border-gray-800/25 pr-1 text-violet-400 font-bold">1. Plan</div>
                          <div className="border-r border-gray-800/25 pr-1 text-violet-400 font-bold">2. Context</div>
                          <div className="border-r border-gray-800/25 pr-1 text-violet-400 font-bold">3. Research</div>
                          <div className="border-r border-gray-800/25 pr-1 text-indigo-400 font-bold">4. Reason</div>
                          <div className="border-r border-gray-800/25 pr-1 text-indigo-400 font-bold">5. Risk</div>
                          <div className="text-emerald-400 font-bold">6. Solved</div>
                        </div>
                      </div>

                      {/* 2. EXECUTIVE DETAILED MARKDOWN RESPONSE */}
                      <div className="whitespace-pre-wrap text-xs font-sans leading-relaxed text-gray-100 border-b border-gray-800/10 pb-4">
                        {msg.content}
                      </div>

                      {/* 3. DECISION TREE (Collapsible) */}
                      {msg.decisionTree && msg.decisionTree.options && msg.decisionTree.options.length > 0 && (
                        <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                          <button 
                            type="button"
                            onClick={() => toggleDecision(msg.id)}
                            className={`w-full px-3.5 py-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider font-bold text-gray-400 hover:text-white transition-all ${
                              isDark ? 'bg-slate-950/40 hover:bg-slate-950/80' : 'bg-gray-100 hover:bg-gray-150'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <GitFork size={12} className="text-indigo-400" />
                              Visual Decision Tree ({msg.decisionTree.options.length} options considered)
                            </span>
                            {expandedDecisions[msg.id] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          
                          {expandedDecisions[msg.id] && (
                            <div className={`p-3 space-y-3 border-t text-[10px] ${isDark ? 'bg-slate-950/15 border-gray-800' : 'bg-white border-gray-100'}`}>
                              {msg.decisionTree.options.map((opt, oIdx) => (
                                <div key={oIdx} className={`p-2.5 rounded-lg border ${
                                  opt.chosen 
                                    ? (isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200')
                                    : (isDark ? 'bg-red-500/5 border-red-500/10 opacity-60' : 'bg-red-50/20 border-red-100 opacity-70')
                                }`}>
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-bold font-space flex items-center gap-1.5 text-gray-200">
                                      {opt.chosen ? <CheckCircle2 size={12} className="text-emerald-400" /> : <XCircle size={12} className="text-red-400" />}
                                      {opt.name}
                                    </span>
                                    <span className={`font-mono text-[8px] px-1.5 py-0.5 rounded font-bold ${
                                      opt.chosen ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                    }`}>
                                      {opt.confidence}% Confidence
                                    </span>
                                  </div>
                                  <div className="space-y-1 text-gray-400">
                                    {opt.pros && opt.pros.length > 0 && (
                                      <div className="flex gap-1">
                                        <span className="text-emerald-400 font-bold">Pros:</span>
                                        <span>{opt.pros.join(", ")}</span>
                                      </div>
                                    )}
                                    {opt.cons && opt.cons.length > 0 && (
                                      <div className="flex gap-1">
                                        <span className="text-red-400 font-bold">Cons:</span>
                                        <span>{opt.cons.join(", ")}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. CONFIDENCE GAUGES */}
                      {msg.confidenceScore && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] font-mono">
                          <div className={`p-2 rounded-xl text-center border ${isDark ? 'bg-slate-950/50 border-gray-800' : 'bg-gray-100'}`}>
                            <div className="text-gray-500">Confidence</div>
                            <div className="text-xs font-bold text-violet-400 mt-0.5">{msg.confidenceScore.overall}%</div>
                          </div>
                          <div className={`p-2 rounded-xl text-center border ${isDark ? 'bg-slate-950/50 border-gray-800' : 'bg-gray-100'}`}>
                            <div className="text-gray-500">Reasoning</div>
                            <div className="text-xs font-bold text-indigo-400 mt-0.5">{msg.confidenceScore.reasoningQuality}%</div>
                          </div>
                          <div className={`p-2 rounded-xl text-center border ${isDark ? 'bg-slate-950/50 border-gray-800' : 'bg-gray-100'}`}>
                            <div className="text-gray-500">Data Quality</div>
                            <div className="text-xs font-bold text-blue-400 mt-0.5">{msg.confidenceScore.dataQuality}%</div>
                          </div>
                          <div className={`p-2 rounded-xl text-center border ${isDark ? 'bg-slate-950/50 border-gray-800' : 'bg-gray-100'}`}>
                            <div className="text-gray-500">Risk Profile</div>
                            <div className={`text-xs font-bold mt-0.5 uppercase ${
                              msg.confidenceScore.riskLevel === 'low' ? 'text-emerald-400' : msg.confidenceScore.riskLevel === 'medium' ? 'text-amber-400' : 'text-red-400'
                            }`}>{msg.confidenceScore.riskLevel}</div>
                          </div>
                        </div>
                      )}

                      {/* 5. EXPLAINABILITY BENTO CARD */}
                      {msg.explainability && (
                        <div className={`p-3 rounded-xl border space-y-2.5 ${isDark ? 'bg-slate-950/30 border-gray-800/80' : 'bg-gray-50/50 border-gray-200'}`}>
                          <div className="text-[9px] font-mono uppercase tracking-widest text-gray-500 font-bold border-b border-gray-800/10 pb-1 flex items-center gap-1">
                            <Info size={11} className="text-violet-400" /> Executive Explainability Board
                          </div>
                          <div className="text-[10px] text-gray-300">
                            <span className="font-bold text-violet-400">Tactical Why:</span> {msg.explainability.why}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                            <div>
                              <div className="font-semibold text-emerald-400 mb-0.5">Identified Benefits:</div>
                              <ul className="list-disc pl-3.5 space-y-0.5 text-gray-400">
                                {msg.explainability.benefits?.map((b, bI) => <li key={bI}>{b}</li>)}
                              </ul>
                            </div>
                            <div>
                              <div className="font-semibold text-red-400 mb-0.5">Potential Trade-offs:</div>
                              <ul className="list-disc pl-3.5 space-y-0.5 text-gray-400">
                                {msg.explainability.risks?.map((r, rI) => <li key={rI}>{r}</li>)}
                              </ul>
                            </div>
                          </div>
                          {msg.explainability.nextSteps && msg.explainability.nextSteps.length > 0 && (
                            <div className="text-[10px] pt-1.5 border-t border-gray-800/10">
                              <div className="font-bold text-indigo-400 mb-1 flex items-center gap-1">
                                <Activity size={10} /> Recommended Next Steps
                              </div>
                              <ol className="list-decimal pl-3.5 space-y-0.5 text-gray-400">
                                {msg.explainability.nextSteps.map((step, sI) => (
                                  <li key={sI} className="hover:text-white transition-colors">{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}

                  {/* Message Timestamp */}
                  <div className={`text-[8px] font-mono text-right mt-1.5 opacity-60 ${msg.role === 'user' ? 'text-violet-200' : 'text-gray-500'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* User Icon */}
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-white shrink-0">
                    <User size={16} />
                  </div>
                )}

              </div>
            ))
          ) : (
            // Empty State Dashboard
            <div className="h-full flex flex-col justify-center items-center text-center max-w-lg mx-auto space-y-6 py-12">
              <div className="w-12 h-12 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 animate-bounce">
                <Brain size={24} />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold tracking-tight">Begin Cognitive Strategy Session</h3>
                <p className="text-xs text-gray-500 leading-normal">
                  Ask Sentinel Nova to audit resumes, plan hyperparameters, or review priority blockers. All responses undergo 8 stages of swarm deliberation.
                </p>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                {suggestedPrompts.map((p, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => handleSend(p.prompt)}
                    className={`p-3.5 rounded-xl border text-left transition-all hover:scale-[1.02] flex flex-col justify-between h-24 cursor-pointer text-xs ${
                      isDark ? 'bg-gray-950/40 border-gray-900 hover:border-violet-500/25' : 'bg-gray-50 border-gray-100 hover:border-violet-500/20 shadow-sm'
                    }`}
                  >
                    <span className="font-semibold text-violet-400 font-space leading-tight">{p.label}</span>
                    <span className="text-[10px] text-gray-500 truncate w-full mt-2 block">{p.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar Form */}
        <form onSubmit={handleFormSubmit} className={`p-4 border-t shrink-0 flex gap-3 ${
          isDark ? 'bg-slate-950 border-gray-900' : 'bg-gray-50 border-gray-150'
        }`}>
          <input
            type="text"
            required
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isThinking}
            placeholder={isThinking ? 'Swarm deliberation in progress...' : 'Ask Chief of Staff "Analyze my resume ATS gaps"...'}
            className={`flex-1 px-4 py-2.5 rounded-xl text-xs border focus:outline-none focus:ring-1 focus:ring-violet-500 focus:border-violet-500 transition-all ${
              isDark ? 'bg-gray-900 border-gray-800 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900'
            }`}
          />
          <button
            type="submit"
            disabled={isThinking || !inputText.trim()}
            className="px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl shadow-lg shadow-violet-500/10 flex items-center justify-center shrink-0 disabled:opacity-50 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <Send size={14} />
          </button>
        </form>

      </div>

      {/* RIGHT COLUMN: Cursor-style Agent Swarm Controller Panel (Col Span 3) */}
      <div className="lg:col-span-3 flex flex-col h-full space-y-4 overflow-y-auto">
        
        {/* Swarm Live Controller */}
        <div className={`p-4 rounded-2xl border flex-1 flex flex-col ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2.5 mb-3.5 flex items-center gap-2">
            <Activity size={12} className="text-violet-400" />
            Agent Orchestrator
          </h4>
          
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {agentSwarmStatus.map((agent, aIdx) => (
              <div key={agent.id} className="flex items-center justify-between text-[11px] border-b border-gray-800/5 pb-2">
                <span className="flex items-center gap-2 text-gray-300">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    agent.status === 'running' 
                      ? 'bg-amber-400 animate-ping' 
                      : agent.status === 'completed' 
                        ? 'bg-emerald-400' 
                        : 'bg-gray-700'
                  }`}></span>
                  <span className={agent.status === 'running' ? 'font-bold text-white' : 'font-medium'}>{agent.name}</span>
                </span>
                
                <span className={`font-mono text-[9px] font-bold ${
                  agent.status === 'running' 
                    ? 'text-amber-400 animate-pulse' 
                    : agent.status === 'completed' 
                      ? 'text-emerald-400' 
                      : 'text-gray-600'
                }`}>
                  {agent.status === 'running' ? 'Thinking' : agent.status === 'completed' ? `Completed (${agent.duration || '350ms'})` : 'Waiting'}
                </span>
              </div>
            ))}
          </div>

          {/* Observability Stats */}
          <div className="border-t border-gray-800/20 pt-3 mt-3 text-[10px] font-mono text-gray-500 space-y-1.5">
            <div className="flex justify-between">
              <span>Token Cost:</span>
              <span className="text-gray-300 font-bold">{lastModelMessage?.observability?.tokenUsage?.total || '2,220'} tkn</span>
            </div>
            <div className="flex justify-between">
              <span>Latency (Accum):</span>
              <span className="text-gray-300 font-bold">{lastModelMessage?.observability?.executionTimeMs || '3,380'} ms</span>
            </div>
            <div className="flex justify-between">
              <span>Reasoning Depth:</span>
              <span className="text-gray-300 font-bold">{lastModelMessage?.observability?.reasoningDepth || '8'}/10</span>
            </div>
          </div>
        </div>

        {/* Proactive Cognitive Insights (Devin Style) */}
        <div className={`p-4 rounded-2xl border ${
          isDark ? 'bg-slate-900/30 border-gray-900' : 'bg-white border-gray-150 shadow-sm'
        }`}>
          <h4 className="text-[10px] font-bold font-mono text-gray-500 uppercase tracking-widest border-b border-gray-800/20 pb-2 mb-3.5 flex items-center gap-2">
            <Lightbulb size={12} className="text-violet-400" />
            Swarm Proactive Cards
          </h4>
          
          <div className="space-y-3">
            {currentInsights.map((ins) => (
              <div 
                key={ins.id} 
                className={`p-2.5 rounded-xl border text-[10px] leading-snug flex items-start gap-2 animate-in fade-in duration-300 ${
                  ins.type === 'warning'
                    ? (isDark ? 'bg-amber-500/5 border-amber-500/10 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800')
                    : ins.type === 'success'
                      ? (isDark ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-200' : 'bg-emerald-50 border-emerald-200 text-emerald-800')
                      : (isDark ? 'bg-violet-500/5 border-violet-500/10 text-violet-200' : 'bg-violet-50 border-violet-200 text-violet-800')
                }`}
              >
                {ins.type === 'warning' ? (
                  <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                ) : ins.type === 'success' ? (
                  <CheckSquare size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Info size={12} className="text-violet-400 shrink-0 mt-0.5" />
                )}
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
