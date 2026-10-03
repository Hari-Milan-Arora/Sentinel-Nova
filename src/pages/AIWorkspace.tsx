/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Compass,
  Zap,
  Info,
  ChevronRight,
  ListTodo
} from 'lucide-react';
import { ChatMessage, Conversation, Task, Goal, NovaMessageType } from '../types';
import { RecommendationCard } from '../components/nova/RecommendationCard';
import { ActionProposalCard } from '../components/nova/ActionProposalCard';
import { DayPlanCard, DayPlanBlock } from '../components/nova/DayPlanCard';
import { usePlanningProfile } from '../context/PlanningProfileContext';

interface AIWorkspaceProps {
  conversations: Conversation[];
  activeConversationId: string;
  onSendMessage?: (id: string, text: string) => Promise<any>;
  onDeleteConversation: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  tasks: Task[];
  goals: Goal[];
  isDark: boolean;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  refreshTasks?: () => Promise<void>;
}

export default function AIWorkspace({
  conversations,
  activeConversationId,
  onDeleteConversation,
  onSelectConversation,
  onNewConversation,
  tasks,
  goals,
  isDark,
  showToast,
  refreshTasks,
}: AIWorkspaceProps) {
  const { profile } = usePlanningProfile();
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activitySummary, setActivitySummary] = useState<string | null>(null);
  const [lastTaskId, setLastTaskId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Local message state per conversation
  const [conversationMessages, setConversationMessages] = useState<Record<string, ChatMessage[]>>({});

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || conversations[0];
  }, [conversations, activeConversationId]);

  const activeMessages = useMemo(() => {
    if (!activeConversation) return [];
    return conversationMessages[activeConversation.id] || activeConversation.messages || [];
  }, [conversationMessages, activeConversation]);

  // Sync initial conversation messages
  useEffect(() => {
    if (activeConversation && !conversationMessages[activeConversation.id]) {
      setConversationMessages((prev) => ({
        ...prev,
        [activeConversation.id]: activeConversation.messages || [],
      }));
    }
  }, [activeConversation, conversationMessages]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isProcessing, activitySummary]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [inputText]);

  const suggestedPrompts = [
    { label: 'What should I work on first?', prompt: 'What should I work on first?' },
    { label: 'Plan my day', prompt: 'Plan my day.' },
    { label: 'Review my workload', prompt: 'Review my workload and upcoming priorities.' },
    { label: 'When should I do architecture?', prompt: 'When should I do the architecture task?' },
    { label: 'Complete highest-priority task', prompt: 'Complete my highest-priority task.' },
  ];

  // Derive today summary stats
  const activeTasksList = useMemo(() => tasks.filter((t) => t.status !== 'completed'), [tasks]);
  const highestPriorityTask = useMemo(() => {
    return (
      activeTasksList.find((t) => t.priority === 'urgent') ||
      activeTasksList.find((t) => t.priority === 'high') ||
      activeTasksList[0] ||
      null
    );
  }, [activeTasksList]);

  const updateActiveConversationMessages = (
    updater: (prev: ChatMessage[]) => ChatMessage[]
  ) => {
    if (!activeConversation) return;
    setConversationMessages((prev) => ({
      ...prev,
      [activeConversation.id]: updater(prev[activeConversation.id] || []),
    }));
  };

  /**
   * Send a message through Chief of Staff workflow
   */
  const handleSendWorkflow = async (userPrompt: string, overrideParams?: Record<string, unknown>) => {
    const trimmed = userPrompt.trim();
    if (!trimmed || isProcessing) return;

    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // 1. Append User Message
    const userMsg: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      messageType: 'USER_MESSAGE',
    };

    updateActiveConversationMessages((prev) => [...prev, userMsg]);

    // 2. Determine realistic activity summary based on prompt content
    const lower = trimmed.toLowerCase();
    let currentActivity = 'Consulting Chief of Staff Orchestrator…';
    if (lower.includes('plan') || lower.includes('day')) {
      currentActivity = 'Checking calendar availability & building balanced day plan…';
    } else if (lower.includes('what should') || lower.includes('priorit') || lower.includes('first')) {
      currentActivity = 'Reviewing your priorities, deadlines, and active goals…';
    } else if (lower.includes('when') || lower.includes('schedule') || lower.includes('slot')) {
      currentActivity = 'Evaluating availability windows and focus constraints…';
    } else if (lower.includes('complete') || lower.includes('move') || lower.includes('reopen')) {
      currentActivity = 'Resolving task reference and safety review…';
    } else if (lower.includes('remember') || lower.includes('memory')) {
      currentActivity = 'Scanning project memory and saved preferences…';
    }

    setIsProcessing(true);
    setActivitySummary(currentActivity);

    try {
      const response = await fetch('/api/nova/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userRequest: trimmed,
          parameters: {
            lastTaskId: overrideParams?.lastTaskId || lastTaskId || undefined,
            ...(overrideParams || {}),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const workflow = data.workflow || {};

      // Update last referenced task id for conversational continuity
      if (data.recommendationCard?.taskId) {
        setLastTaskId(data.recommendationCard.taskId);
      } else if (data.activeAction?.parameters?.taskId) {
        setLastTaskId(String(data.activeAction.parameters.taskId));
      }

      // Map workflow result to structured ChatMessage
      let msgType: NovaMessageType = 'NOVA_MESSAGE';
      if (data.state === 'AWAITING_CONFIRMATION') {
        msgType = 'CONFIRMATION_REQUIRED';
      } else if (data.recommendationCard) {
        msgType = 'RECOMMENDATION';
      } else if (data.dayPlan && data.dayPlan.length > 0) {
        msgType = 'NOVA_MESSAGE';
      } else if (data.state === 'FAILED') {
        msgType = 'FAILURE';
      } else if (data.state === 'COMPLETED') {
        msgType = 'SUCCESS';
      }

      const modelMsg: ChatMessage = {
        id: `msg_m_${Date.now()}`,
        role: 'model',
        content: data.message || workflow.summary || 'I evaluated your request.',
        timestamp: new Date().toISOString(),
        messageType: msgType,
        workflowId: data.workflowId,
        recommendationCard: data.recommendationCard || undefined,
        actionProposal: data.activeAction || undefined,
        confirmationBinding: data.confirmationBinding || undefined,
        dayPlan: data.dayPlan || undefined,
        ambiguousChoices: data.ambiguousChoices || undefined,
        executionStatus: data.state === 'AWAITING_CONFIRMATION' ? 'idle' : undefined,
      };

      updateActiveConversationMessages((prev) => [...prev, modelMsg]);

      // If an action was completed directly or tasks changed, refresh tasks
      if (refreshTasks && (data.state === 'COMPLETED' || data.executionResult)) {
        void refreshTasks();
      }
    } catch (err: any) {
      console.error('Nova workflow error:', err);
      const errorMsg: ChatMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'model',
        content: 'Nova is momentarily unavailable. Please verify your connection or try again.',
        timestamp: new Date().toISOString(),
        messageType: 'FAILURE',
      };
      updateActiveConversationMessages((prev) => [...prev, errorMsg]);
      showToast('Error communicating with Chief of Staff engine', 'error');
    } finally {
      setIsProcessing(false);
      setActivitySummary(null);
    }
  };

  /**
   * Action Confirmation Handler
   */
  const handleConfirmAction = async (
    msgId: string,
    workflowId: string,
    actionId: string,
    bindingId: string,
    parameters?: Record<string, unknown>
  ) => {
    // Set executing state in UI
    updateActiveConversationMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, executionStatus: 'executing' } : m
      )
    );

    try {
      const res = await fetch(`/api/nova/workflow/${workflowId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actionId,
          bindingId,
          parameters,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        const errorText = data.error || data.message || 'Execution rejected or failed safety gates.';
        updateActiveConversationMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  executionStatus: 'failed',
                  executionMessage: errorText,
                }
              : m
          )
        );
        showToast(errorText, 'error');
        return;
      }

      // Success!
      const successText =
        data.message || 'Action executed safely via Chief of Staff ToolManager.';
      updateActiveConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                executionStatus: 'success',
                executionMessage: successText,
                actionProposal: data.activeAction || m.actionProposal,
              }
            : m
        )
      );

      // Mutated tasks in background -> sync store
      if (refreshTasks) {
        await refreshTasks();
      }

      showToast('Action confirmed and executed successfully', 'success');
    } catch (err: any) {
      console.error('Confirmation error:', err);
      updateActiveConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                executionStatus: 'failed',
                executionMessage: 'Network error confirming action.',
              }
            : m
        )
      );
      showToast('Failed to confirm action', 'error');
    }
  };

  /**
   * Action Rejection Handler
   */
  const handleRejectAction = async (
    msgId: string,
    workflowId: string,
    actionId: string,
    reason?: string
  ) => {
    try {
      const res = await fetch(`/api/nova/workflow/${workflowId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actionId,
          reason: reason || 'User rejected proposed action',
        }),
      });

      const data = await res.json();

      updateActiveConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                executionStatus: 'rejected',
                executionMessage: data.message || 'Action safely aborted with no mutations.',
              }
            : m
        )
      );

      showToast('Action was canceled without changes', 'success');
    } catch (err) {
      console.error('Rejection error:', err);
      showToast('Error rejecting action', 'error');
    }
  };

  /**
   * Action Edit Handler
   */
  const handleEditAction = async (
    msgId: string,
    workflowId: string,
    actionId: string,
    updatedParameters: Record<string, unknown>
  ) => {
    try {
      const res = await fetch(`/api/nova/workflow/${workflowId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          actionId,
          updatedParameters,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Failed to edit action', 'error');
        return;
      }

      // Re-review occurred: update proposal card and new confirmation binding
      updateActiveConversationMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                content: data.message || m.content,
                actionProposal: data.activeAction,
                confirmationBinding: data.confirmationBinding,
                executionStatus: 'idle',
              }
            : m
        )
      );

      showToast('Parameters updated & safety re-verified', 'success');
    } catch (err) {
      console.error('Edit error:', err);
      showToast('Failed to modify action parameters', 'error');
    }
  };

  /**
   * Quick Disambiguation Choice Handler
   */
  const handleSelectAmbiguousChoice = (choice: { id: string; title: string }) => {
    setLastTaskId(choice.id);
    handleSendWorkflow(`Complete task "${choice.title}"`, {
      taskId: choice.id,
      lastTaskId: choice.id,
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30 shadow-md shadow-violet-950/40">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white tracking-tight sm:text-lg">
                Nova
              </h1>
              <span className="text-xs text-slate-500 font-mono">·</span>
              <span className="text-xs font-medium text-slate-400">
                AI Chief of Staff
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              The AI Chief of Staff that Thinks Before It Acts.
            </p>
          </div>
        </div>

        {/* Status & Context Indicators */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Dot */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isProcessing
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="font-medium">
              {isProcessing ? 'Thinking…' : 'Ready'}
            </span>
          </div>

          {/* Context Badge: Active Tasks */}
          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-400">
            <CheckSquare size={13} className="text-slate-500" />
            <span>{activeTasksList.length} active tasks</span>
          </div>

          {/* Context Badge: Calendar Read-Only */}
          <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-400">
            <Calendar size={13} className="text-violet-400" />
            <span>Read-Only Calendar Engine</span>
          </div>

          {/* New Session Action */}
          <button
            onClick={onNewConversation}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
          >
            <Sparkles size={13} className="text-violet-400" />
            <span>New Session</span>
          </button>

          {/* Toggle Right Context Drawer */}
          <button
            onClick={() => setIsSidebarOpen((v) => !v)}
            title="Toggle Today context panel"
            className={`hidden xl:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              isSidebarOpen
                ? 'border-violet-500/40 bg-violet-950/30 text-violet-300'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span>Today</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 min-h-0 pt-4 gap-6">
        {/* Left/Center Conversation Stream */}
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-slate-800/80 bg-slate-950/60 shadow-xl overflow-hidden">
          
          {/* Scrollable Conversation Stream */}
          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 sm:px-6">
            {activeMessages.length === 0 ? (
              <div className="my-auto py-12 text-center max-w-xl mx-auto">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-600/10 text-violet-400 shadow-xl shadow-violet-950/40">
                  <Bot size={28} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white tracking-tight sm:text-xl">
                  How can Nova assist you today?
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400 sm:text-sm">
                  Nova reasons across your priorities, calendar availability, and stored preferences.
                  Recommendations are explained with deliberative trade-offs, and actions are never executed without your explicit review and cryptographic confirmation.
                </p>

                {/* Instant prompt chips */}
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {suggestedPrompts.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendWorkflow(s.prompt)}
                      className="rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-300 hover:border-violet-500/50 hover:bg-slate-850 hover:text-white transition cursor-pointer"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeMessages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/20 text-violet-400 mt-0.5">
                        <Bot size={16} />
                      </div>
                    )}

                    <div className={`flex flex-col max-w-3xl ${isUser ? 'items-end' : 'items-start'}`}>
                      {/* Message Bubble or Card Container */}
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                          isUser
                            ? 'bg-violet-600 text-white rounded-br-sm shadow-md shadow-violet-950/20'
                            : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-bl-sm shadow-md'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        {/* Ambiguity Disambiguation Options */}
                        {msg.ambiguousChoices && msg.ambiguousChoices.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80">
                            <p className="text-xs font-semibold text-slate-300 mb-2">
                              Select target task:
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {msg.ambiguousChoices.map((choice) => (
                                <button
                                  key={choice.id}
                                  onClick={() => handleSelectAmbiguousChoice(choice)}
                                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-left text-slate-200 hover:border-violet-500/40 hover:bg-slate-900 transition"
                                >
                                  <span className="font-medium truncate">{choice.title}</span>
                                  <ChevronRight size={13} className="text-slate-500 shrink-0 ml-2" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Structured Recommendation Card */}
                      {msg.recommendationCard && (
                        <div className="w-full mt-2">
                          <RecommendationCard
                            card={msg.recommendationCard}
                            onWorkOnThis={(taskId, title) => {
                              setLastTaskId(taskId);
                              handleSendWorkflow(`Focus on task "${title}" today.`, { lastTaskId: taskId });
                            }}
                            onPlanIt={(taskId, title) => {
                              setLastTaskId(taskId);
                              handleSendWorkflow(`Schedule task "${title}" into an available focus window.`, {
                                taskId,
                                lastTaskId: taskId,
                              });
                            }}
                            onNotNow={() => {
                              handleSendWorkflow('Show me the next recommended priority instead.');
                            }}
                          />
                        </div>
                      )}

                      {/* Structured Day Plan Card */}
                      {msg.dayPlan && msg.dayPlan.length > 0 && (
                        <div className="w-full mt-2">
                          <DayPlanCard
                            dayPlan={msg.dayPlan as DayPlanBlock[]}
                            onSchedulePlan={() => {
                              handleSendWorkflow('Propose schedule actions for these planned tasks.');
                            }}
                          />
                        </div>
                      )}

                      {/* Action Proposal & Confirmation Card */}
                      {msg.actionProposal && msg.workflowId && (
                        <div className="w-full mt-2">
                          <ActionProposalCard
                            workflowId={msg.workflowId}
                            action={msg.actionProposal}
                            confirmationBinding={msg.confirmationBinding}
                            status={
                              msg.executionStatus === 'executing'
                                ? 'executing'
                                : msg.executionStatus === 'success'
                                ? 'completed'
                                : msg.executionStatus === 'rejected'
                                ? 'rejected'
                                : msg.executionStatus === 'failed'
                                ? 'failed'
                                : 'awaiting_confirmation'
                            }
                            resultMessage={msg.executionMessage}
                            onConfirm={(actionId, bindingId, parameters) =>
                              handleConfirmAction(
                                msg.id,
                                msg.workflowId!,
                                actionId,
                                bindingId,
                                parameters
                              )
                            }
                            onReject={(actionId, reason) =>
                              handleRejectAction(
                                msg.id,
                                msg.workflowId!,
                                actionId,
                                reason
                              )
                            }
                            onEdit={(actionId, updatedParams) =>
                              handleEditAction(
                                msg.id,
                                msg.workflowId!,
                                actionId,
                                updatedParams
                              )
                            }
                          />
                        </div>
                      )}

                      {/* Timestamp */}
                      <span className="mt-1 px-1 text-[10px] text-slate-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {isUser && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300 mt-0.5">
                        <User size={16} />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Deliberative Thinking Activity (No fake delays: only in-flight) */}
            {isProcessing && (
              <div className="flex gap-3 sm:gap-4 items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-600/20 text-violet-400">
                  <Bot size={16} />
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-violet-500/20 bg-slate-900/90 px-4 py-3 text-xs text-slate-300 shadow-md">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:0.4s]" />
                  </div>
                  <span className="text-slate-300 font-medium">
                    {activitySummary || 'Consulting Chief of Staff Orchestrator…'}
                  </span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Composer & Quick Action Prompts */}
          <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-950/90">
            {/* Quick Prompt Chips */}
            <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
                Prompts:
              </span>
              {suggestedPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendWorkflow(p.prompt)}
                  disabled={isProcessing}
                  className="shrink-0 rounded-lg border border-slate-800/80 bg-slate-900/80 px-2.5 py-1 text-slate-400 hover:border-slate-700 hover:bg-slate-850 hover:text-slate-200 transition disabled:opacity-50 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendWorkflow(inputText);
              }}
              className="relative flex items-end rounded-xl border border-slate-800 bg-slate-900/90 focus-within:border-violet-500/60 focus-within:ring-1 focus-within:ring-violet-500/30 transition shadow-inner"
            >
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendWorkflow(inputText);
                  }
                }}
                disabled={isProcessing}
                placeholder="Ask Nova anything… (e.g. Plan my day, What should I work on first?, Move this task to tomorrow)"
                rows={1}
                className="flex-1 max-h-36 resize-none bg-transparent px-4 py-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
              />

              <div className="flex items-center gap-1 p-2">
                <button
                  type="submit"
                  disabled={!inputText.trim() || isProcessing}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition cursor-pointer"
                  title="Send (Enter)"
                >
                  <Send size={15} />
                </button>
              </div>
            </form>

            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>Nova adheres to safety gates: actions require confirmation before execution.</span>
              <span className="font-mono">Enter to send · Shift+Enter for newline</span>
            </div>
          </div>
        </div>

        {/* Right Desktop Context Panel / Today Command Center */}
        {isSidebarOpen && (
          <aside className="hidden xl:flex flex-col w-80 shrink-0 space-y-4 overflow-y-auto">
            
            {/* Today's Chief of Staff Briefing Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
                <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Compass size={13} className="text-violet-400" />
                  Today's Briefing
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>

              {/* Highest Priority Task */}
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Critical Path Task
                </p>
                {highestPriorityTask ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
                    <div className="flex items-center justify-between gap-1 text-xs">
                      <span className="font-semibold text-white truncate">
                        {highestPriorityTask.title}
                      </span>
                      <span className="text-[10px] font-medium capitalize text-rose-400 shrink-0">
                        {highestPriorityTask.priority}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                      <Clock size={11} className="text-slate-500" />
                      <span>{highestPriorityTask.estimatedMinutes || 60}m</span>
                      {highestPriorityTask.dueDate && (
                        <span>· Due {highestPriorityTask.dueDate}</span>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        handleSendWorkflow(`Focus on task "${highestPriorityTask.title}" and plan it.`, {
                          taskId: highestPriorityTask.id,
                          lastTaskId: highestPriorityTask.id,
                        })
                      }
                      className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 py-1 text-[11px] font-semibold text-slate-300 hover:border-violet-500/40 hover:text-white transition"
                    >
                      <Sparkles size={11} className="text-violet-400" />
                      <span>Ask Nova to plan this</span>
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-2.5 text-xs text-slate-500">
                    No urgent tasks remaining.
                  </div>
                )}
              </div>

              {/* Planning Rhythm & Working Hours */}
              <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5 text-xs text-slate-300 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Working Hours:</span>
                  <span className="font-mono text-slate-200">
                    {profile?.preferredWorkingHours?.startTime || '09:00'} –{' '}
                    {profile?.preferredWorkingHours?.endTime || '17:00'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Sleep Schedule:</span>
                  <span className="font-mono text-slate-200">
                    {profile?.sleepSchedule?.weekdaySleep || '23:00'} –{' '}
                    {profile?.sleepSchedule?.weekdayWake || '07:00'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Timezone:</span>
                  <span className="font-mono text-slate-200">
                    {profile?.timezone || 'UTC'}
                  </span>
                </div>
              </div>
            </div>

            {/* Active Goals Alignment */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
                <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Target size={13} className="text-violet-400" />
                  Active Strategic Goals
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {goals.filter((g) => g.status === 'active').length}
                </span>
              </div>

              <div className="space-y-2">
                {goals.slice(0, 3).map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-200">
                      <span className="font-semibold truncate">{goal.title}</span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {goal.progress || 0}%
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-800">
                      <div
                        className="h-1 rounded-full bg-violet-500"
                        style={{ width: `${Math.min(goal.progress || 0, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 shadow-sm">
              <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest mb-3 block">
                Quick Orchestrations
              </span>
              <div className="space-y-1.5">
                <button
                  onClick={() => handleSendWorkflow('Plan my day.')}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-left text-slate-300 hover:border-violet-500/40 hover:text-white transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Calendar size={13} className="text-violet-400" />
                    <span>Plan My Day</span>
                  </span>
                  <ArrowRight size={12} className="text-slate-500" />
                </button>

                <button
                  onClick={() => handleSendWorkflow('What should I work on first?')}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-left text-slate-300 hover:border-violet-500/40 hover:text-white transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Zap size={13} className="text-amber-400" />
                    <span>What should I work on first?</span>
                  </span>
                  <ArrowRight size={12} className="text-slate-500" />
                </button>

                <button
                  onClick={() => handleSendWorkflow('What do you remember about my project?')}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-left text-slate-300 hover:border-violet-500/40 hover:text-white transition cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Brain size={13} className="text-emerald-400" />
                    <span>Memory Recall</span>
                  </span>
                  <ArrowRight size={12} className="text-slate-500" />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
