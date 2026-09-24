/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Target,
  FolderKanban,
  CheckCircle2,
  Plus,
  Trash2,
  Archive,
  Edit3,
  Calendar,
  Layers,
  ListTodo,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Filter,
  Sparkles,
  Check,
  RotateCcw,
  Clock3,
} from 'lucide-react';
import { Goal, Project, GoalPriority, ProjectPriority, GoalStatus, ProjectStatus } from '../types';
import { useGoalProject } from '../context/GoalProjectContext';
import { useTasks } from '../context/TaskContext';
import GoalModal from '../components/goals/GoalModal';
import ProjectModal from '../components/goals/ProjectModal';

interface GoalsPageProps {
  onNavigateToTasks?: (filter?: { projectId?: string; goalId?: string }) => void;
  isDark?: boolean;
}

export default function Goals({ onNavigateToTasks, isDark = true }: GoalsPageProps) {
  const {
    goals,
    projects,
    loading,
    error,
    createGoal,
    updateGoal,
    deleteGoal,
    completeGoal,
    archiveGoal,
    createProject,
    updateProject,
    deleteProject,
    completeProject,
    archiveProject,
    getProjectDerivedProgress,
    getGoalDerivedProgress,
    getProjectTasks,
    getGoalProjects,
    getGoalTasks,
  } = useGoalProject();

  const { tasks } = useTasks();

  // Navigation tab inside Strategic Layer: Goals vs Projects
  const [activeTab, setActiveTab] = useState<'goals' | 'projects'>('goals');
  const [statusFilter, setStatusFilter] = useState<'active' | 'completed' | 'archived' | 'all'>('active');

  // Selected Goal for detailed project breakdown view
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // Modals state
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectModalDefaultGoalId, setProjectModalDefaultGoalId] = useState<string | null>(null);

  // Toast notifications
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Filtered goals
  const filteredGoals = useMemo(() => {
    return goals.filter(g => {
      if (statusFilter === 'all') return true;
      return g.status === statusFilter;
    });
  }, [goals, statusFilter]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (statusFilter === 'all') return true;
      return p.status === statusFilter;
    });
  }, [projects, statusFilter]);

  // Keep selected goal synced
  const activeSelectedGoal = useMemo(() => {
    if (!selectedGoalId && filteredGoals.length > 0) {
      return filteredGoals[0];
    }
    return goals.find(g => g.id === selectedGoalId) || (filteredGoals.length > 0 ? filteredGoals[0] : null);
  }, [goals, selectedGoalId, filteredGoals]);

  // Projects contributing to active selected goal
  const selectedGoalProjects = useMemo(() => {
    if (!activeSelectedGoal) return [];
    return projects.filter(
      p => p.goalId === activeSelectedGoal.id || (activeSelectedGoal.projectIds && activeSelectedGoal.projectIds.includes(p.id))
    );
  }, [projects, activeSelectedGoal]);

  // Tasks contributing to active selected goal
  const selectedGoalTasks = useMemo(() => {
    if (!activeSelectedGoal) return [];
    return getGoalTasks(activeSelectedGoal.id);
  }, [activeSelectedGoal, getGoalTasks]);

  // Handlers for Goal Actions
  const handleOpenNewGoal = () => {
    setEditingGoal(null);
    setGoalModalOpen(true);
  };

  const handleOpenEditGoal = (goal: Goal, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingGoal(goal);
    setGoalModalOpen(true);
  };

  const handleCompleteGoal = async (goalId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await completeGoal(goalId);
      showToast('Goal marked as completed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to complete goal.');
    }
  };

  const handleArchiveGoal = async (goalId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await archiveGoal(goalId);
      showToast('Goal archived.');
    } catch (err: any) {
      showToast(err.message || 'Failed to archive goal.');
    }
  };

  const handleDeleteGoal = async (goalId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm('Delete this goal? Contributing projects and tasks will remain safe and will simply become unassigned.')) {
      try {
        await deleteGoal(goalId);
        showToast('Goal deleted.');
        if (selectedGoalId === goalId) {
          setSelectedGoalId(null);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to delete goal.');
      }
    }
  };

  // Handlers for Project Actions
  const handleOpenNewProject = (targetGoalId?: string | null) => {
    setEditingProject(null);
    setProjectModalDefaultGoalId(targetGoalId || activeSelectedGoal?.id || null);
    setProjectModalOpen(true);
  };

  const handleOpenEditProject = (proj: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProject(proj);
    setProjectModalDefaultGoalId(proj.goalId || null);
    setProjectModalOpen(true);
  };

  const handleRemoveProjectFromGoal = async (proj: Project, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await updateProject(proj.id, { goalId: null });
      showToast(`Removed "${proj.name}" from goal.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update project.');
    }
  };

  const handleCompleteProject = async (projId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await completeProject(projId);
      showToast('Project completed.');
    } catch (err: any) {
      showToast(err.message || 'Failed to complete project.');
    }
  };

  const handleArchiveProject = async (projId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await archiveProject(projId);
      showToast('Project archived.');
    } catch (err: any) {
      showToast(err.message || 'Failed to archive project.');
    }
  };

  const handleDeleteProject = async (projId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm('Delete this project? Associated tasks will NOT be deleted; they will remain available in your task list.')) {
      try {
        await deleteProject(projId);
        showToast('Project deleted.');
      } catch (err: any) {
        showToast(err.message || 'Failed to delete project.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-medium text-slate-100 shadow-xl shadow-black/60 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Strategic Layer</h1>
            <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-300">
              GOALS → PROJECTS → TASKS
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Understand not just what you are executing today, but <span className="text-slate-200 font-medium">why it matters</span> and how it drives long-term outcomes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleOpenNewProject()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer"
          >
            <FolderKanban size={14} className="text-indigo-400" />
            <span>New Project</span>
          </button>
          <button
            onClick={handleOpenNewGoal}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition cursor-pointer"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>New Goal</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'goals'
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Target size={14} />
            <span>Strategic Goals</span>
            <span className="ml-1 rounded-full bg-black/30 px-1.5 py-0.2 text-[10px]">
              {goals.filter(g => g.status === 'active').length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('projects')}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'projects'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <FolderKanban size={14} />
            <span>All Projects</span>
            <span className="ml-1 rounded-full bg-black/30 px-1.5 py-0.2 text-[10px]">
              {projects.filter(p => p.status === 'active').length}
            </span>
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Filter size={12} /> Status:
          </span>
          <div className="flex items-center gap-1 text-xs">
            {(['active', 'completed', 'archived', 'all'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-2.5 py-1 capitalize text-xs font-medium transition ${
                  statusFilter === s
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VIEW: STRATEGIC GOALS */}
      {activeTab === 'goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Goals List (Col 5) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Target Outcomes ({filteredGoals.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Sorted by priority & deadline
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400 animate-pulse">
                Loading strategic goals…
              </div>
            ) : filteredGoals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 mb-3">
                  <Target size={22} />
                </div>
                <h3 className="text-sm font-semibold text-slate-200">No goals yet.</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
                  Establish high-level objectives to align your projects and daily execution toward clear outcomes.
                </p>
                <button
                  onClick={handleOpenNewGoal}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500 transition cursor-pointer"
                >
                  <Plus size={14} /> Establish First Goal
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[750px] overflow-y-auto pr-1">
                {filteredGoals.map(goal => {
                  const isSelected = activeSelectedGoal?.id === goal.id;
                  const derivedProgress = getGoalDerivedProgress(goal);
                  const goalProjs = projects.filter(
                    p => p.goalId === goal.id || (goal.projectIds && goal.projectIds.includes(p.id))
                  );
                  const goalTs = getGoalTasks(goal.id);
                  const completedTs = goalTs.filter(t => t.status === 'completed');

                  return (
                    <div
                      key={goal.id}
                      onClick={() => setSelectedGoalId(goal.id)}
                      className={`group relative rounded-2xl border p-4.5 transition cursor-pointer ${
                        isSelected
                          ? 'border-violet-500/40 bg-violet-600/10 shadow-lg shadow-violet-950/40'
                          : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
                      }`}
                    >
                      {/* Priority and Status Badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              goal.priority === 'critical'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                : goal.priority === 'high'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                : goal.priority === 'medium'
                                ? 'bg-violet-500/15 text-violet-300 border border-violet-500/20'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {goal.priority}
                          </span>
                          {goal.status !== 'active' && (
                            <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase font-bold text-slate-400">
                              {goal.status}
                            </span>
                          )}
                        </div>

                        {/* Quick Action Buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => handleOpenEditGoal(goal, e)}
                            title="Edit goal"
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                          >
                            <Edit3 size={13} />
                          </button>
                          {goal.status === 'active' && (
                            <button
                              onClick={e => handleCompleteGoal(goal.id, e)}
                              title="Mark completed"
                              className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-500/10"
                            >
                              <Check size={13} />
                            </button>
                          )}
                          <button
                            onClick={e => handleArchiveGoal(goal.id, e)}
                            title="Archive goal"
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800"
                          >
                            <Archive size={13} />
                          </button>
                          <button
                            onClick={e => handleDeleteGoal(goal.id, e)}
                            title="Delete goal"
                            className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Goal Title & Description */}
                      <h3 className="text-sm font-semibold text-white leading-snug">
                        {goal.title}
                      </h3>
                      {goal.description && (
                        <p className="mt-1 text-xs text-slate-400 line-clamp-2">
                          {goal.description}
                        </p>
                      )}

                      {/* Progress Bar */}
                      <div className="mt-3.5 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400">Progress</span>
                          <span className="font-semibold text-violet-300">{derivedProgress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              derivedProgress >= 100
                                ? 'bg-emerald-400'
                                : derivedProgress > 50
                                ? 'bg-violet-400'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${derivedProgress}%` }}
                          />
                        </div>
                      </div>

                      {/* Metadata row: Target date, Projects, Tasks */}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <FolderKanban size={12} className="text-indigo-400" />
                            {goalProjs.length} {goalProjs.length === 1 ? 'project' : 'projects'}
                          </span>
                          <span className="flex items-center gap-1">
                            <ListTodo size={12} className="text-violet-400" />
                            {completedTs.length}/{goalTs.length} tasks
                          </span>
                        </div>

                        {goal.targetDate && (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Calendar size={11} />
                            {new Date(goal.targetDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Goal Detail & Contributing Projects (Col 7) */}
          <div className="lg:col-span-7">
            {activeSelectedGoal ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
                {/* Detail Header */}
                <div className="space-y-3 border-b border-slate-800/80 pb-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600/20 text-violet-400 border border-violet-500/20">
                        <Target size={16} />
                      </span>
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
                        Strategic Goal Detail
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditGoal(activeSelectedGoal)}
                        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800 transition"
                      >
                        <Edit3 size={12} /> Edit
                      </button>
                      {activeSelectedGoal.status === 'active' ? (
                        <button
                          onClick={() => handleCompleteGoal(activeSelectedGoal.id)}
                          className="flex items-center gap-1 rounded-lg bg-emerald-600/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400 hover:bg-emerald-600/20 transition"
                        >
                          <Check size={12} /> Mark Complete
                        </button>
                      ) : (
                        <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-400 capitalize">
                          {activeSelectedGoal.status}
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">
                      {activeSelectedGoal.title}
                    </h2>
                    {activeSelectedGoal.description && (
                      <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                        {activeSelectedGoal.description}
                      </p>
                    )}
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500">Overall Progress</span>
                      <div className="text-lg font-bold font-mono text-violet-300 mt-1">
                        {getGoalDerivedProgress(activeSelectedGoal)}%
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500">Priority</span>
                      <div className="text-sm font-semibold capitalize text-slate-200 mt-1">
                        {activeSelectedGoal.priority}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500">Target Date</span>
                      <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                        {activeSelectedGoal.targetDate
                          ? new Date(activeSelectedGoal.targetDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'None set'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                      <span className="text-[10px] font-mono uppercase text-slate-500">Task Velocity</span>
                      <div className="text-xs font-semibold text-emerald-400 mt-1">
                        {selectedGoalTasks.filter(t => t.status === 'completed').length} / {selectedGoalTasks.length} Done
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Contributing Projects */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <FolderKanban size={16} className="text-indigo-400" />
                        <span>Projects Contributing to this Goal ({selectedGoalProjects.length})</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Initiatives translating this goal into executed task streams.
                      </p>
                    </div>

                    <button
                      onClick={() => handleOpenNewProject(activeSelectedGoal.id)}
                      className="flex items-center gap-1 rounded-xl bg-indigo-600/20 border border-indigo-500/30 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30 transition cursor-pointer"
                    >
                      <Plus size={13} /> Add Project
                    </button>
                  </div>

                  {selectedGoalProjects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/30 p-6 text-center">
                      <FolderKanban size={20} className="mx-auto text-slate-500 mb-2" />
                      <p className="text-xs text-slate-300 font-medium">This goal has no projects yet.</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                        Link existing projects or create a dedicated project to begin tracking milestone progress automatically.
                      </p>
                      <button
                        onClick={() => handleOpenNewProject(activeSelectedGoal.id)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition"
                      >
                        <Plus size={13} /> Create Project for this Goal
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedGoalProjects.map(proj => {
                        const projProgress = getProjectDerivedProgress(proj);
                        const projTasks = getProjectTasks(proj.id);
                        const completedTasks = projTasks.filter(t => t.status === 'completed');

                        return (
                          <div
                            key={proj.id}
                            className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3 hover:border-slate-700 transition"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-semibold text-white">
                                    {proj.name}
                                  </h4>
                                  <span
                                    className={`rounded px-1.5 py-0.2 text-[9px] font-bold uppercase ${
                                      proj.status === 'completed'
                                        ? 'bg-emerald-500/10 text-emerald-400'
                                        : proj.status === 'on_hold'
                                        ? 'bg-amber-500/10 text-amber-400'
                                        : 'bg-indigo-500/10 text-indigo-300'
                                    }`}
                                  >
                                    {proj.status}
                                  </span>
                                </div>
                                {proj.description && (
                                  <p className="mt-1 text-[11px] text-slate-400">
                                    {proj.description}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={e => handleOpenEditProject(proj, e)}
                                  title="Edit or move project"
                                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  onClick={e => handleRemoveProjectFromGoal(proj, e)}
                                  title="Remove from this goal (keeps project independent)"
                                  className="p-1 text-slate-400 hover:text-amber-300 rounded hover:bg-amber-500/10"
                                >
                                  <RotateCcw size={12} />
                                </button>
                                <button
                                  onClick={e => handleDeleteProject(proj.id, e)}
                                  title="Delete project (keeps tasks)"
                                  className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Project Progress */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-mono">
                                <span className="text-slate-400">
                                  {completedTasks.length} / {projTasks.length} tasks completed
                                </span>
                                <span className="font-semibold text-indigo-300">{projProgress}%</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                                <div
                                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                                  style={{ width: `${projProgress}%` }}
                                />
                              </div>
                            </div>

                            {/* Actions row: View tasks */}
                            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                              <span className="flex items-center gap-1">
                                {proj.targetDate && (
                                  <>
                                    <Clock3 size={11} /> Target: {new Date(proj.targetDate).toLocaleDateString()}
                                  </>
                                )}
                              </span>
                              {onNavigateToTasks && (
                                <button
                                  onClick={() => onNavigateToTasks({ projectId: proj.id })}
                                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                                >
                                  <span>View Project Tasks</span>
                                  <ChevronRight size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Section: Active Tasks Contributing */}
                {selectedGoalTasks.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <ListTodo size={14} className="text-violet-400" />
                        <span>Contributing Task Streams ({selectedGoalTasks.length})</span>
                      </h4>
                      {onNavigateToTasks && (
                        <button
                          onClick={() => onNavigateToTasks({ goalId: activeSelectedGoal.id })}
                          className="text-xs font-semibold text-violet-400 hover:text-violet-300 flex items-center gap-1 cursor-pointer"
                        >
                          <span>Open in Tasks</span>
                          <ExternalLink size={12} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {selectedGoalTasks.slice(0, 5).map(task => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between rounded-lg border border-slate-800/60 bg-slate-950/40 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                task.status === 'completed'
                                  ? 'bg-emerald-400'
                                  : task.priority === 'urgent'
                                  ? 'bg-rose-500'
                                  : 'bg-violet-400'
                              }`}
                            />
                            <span
                              className={`truncate font-medium ${
                                task.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'
                              }`}
                            >
                              {task.title}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 capitalize shrink-0">
                            {task.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/30 p-12 text-center text-slate-500 text-xs">
                Select a goal to view contributing projects, milestone breakdown, and execution metrics.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW: ALL PROJECTS (INDEPENDENT ACCESS - Requirement 10) */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <FolderKanban size={18} className="text-indigo-400" />
                <span>All Projects ({filteredProjects.length})</span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage initiatives independently or link them to high-level strategic goals.
              </p>
            </div>

            <button
              onClick={() => handleOpenNewProject()}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-900/30 hover:bg-indigo-500 transition cursor-pointer"
            >
              <Plus size={14} /> New Project
            </button>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 mb-3">
                <FolderKanban size={22} />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">No projects yet.</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Create a project to cluster tasks, track deterministic completion velocity, and organize work streams.
              </p>
              <button
                onClick={() => handleOpenNewProject()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 transition cursor-pointer"
              >
                <Plus size={14} /> Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map(proj => {
                const parentGoal = goals.find(g => g.id === proj.goalId);
                const projTasks = getProjectTasks(proj.id);
                const completedTasks = projTasks.filter(t => t.status === 'completed');
                const progress = getProjectDerivedProgress(proj);

                return (
                  <div
                    key={proj.id}
                    className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4 hover:border-slate-700 hover:bg-slate-900/90 transition flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              proj.priority === 'critical'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                : proj.priority === 'high'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {proj.priority || 'Normal'}
                          </span>
                          <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] uppercase font-bold text-slate-400">
                            {proj.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => handleOpenEditProject(proj, e)}
                            title="Edit Project"
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
                          >
                            <Edit3 size={13} />
                          </button>
                          {proj.status === 'active' && (
                            <button
                              onClick={e => handleCompleteProject(proj.id, e)}
                              title="Complete Project"
                              className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-500/10"
                            >
                              <Check size={13} />
                            </button>
                          )}
                          <button
                            onClick={e => handleArchiveProject(proj.id, e)}
                            title="Archive Project"
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800"
                          >
                            <Archive size={13} />
                          </button>
                          <button
                            onClick={e => handleDeleteProject(proj.id, e)}
                            title="Delete Project (tasks remain)"
                            className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-rose-500/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-white">
                        {proj.name}
                      </h3>
                      {proj.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {proj.description}
                        </p>
                      )}

                      {/* Parent Goal Alignment */}
                      <div className="pt-1">
                        {parentGoal ? (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600/10 border border-violet-500/20 px-2 py-1 text-[11px] text-violet-300 font-medium">
                            <Target size={11} className="text-violet-400" />
                            <span className="truncate max-w-[200px]">Goal: {parentGoal.title}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 italic">
                            Independent Project (No Goal)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-slate-800/80">
                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-slate-400">
                            {completedTasks.length}/{projTasks.length} tasks
                          </span>
                          <span className="font-semibold text-indigo-300">{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Footer Info */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          {proj.targetDate ? `Due ${new Date(proj.targetDate).toLocaleDateString()}` : 'No deadline'}
                        </span>
                        {onNavigateToTasks && (
                          <button
                            onClick={() => onNavigateToTasks({ projectId: proj.id })}
                            className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <span>Filter tasks</span>
                            <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Goal Creation/Editing Modal */}
      <GoalModal
        isOpen={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        onSave={async data => {
          if (editingGoal) {
            await updateGoal(editingGoal.id, data);
            showToast('Goal updated.');
          } else {
            await createGoal(data);
            showToast('Strategic goal created.');
          }
        }}
        initialGoal={editingGoal}
      />

      {/* Project Creation/Editing Modal */}
      <ProjectModal
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSave={async data => {
          if (editingProject) {
            await updateProject(editingProject.id, data);
            showToast('Project updated.');
          } else {
            await createProject(data);
            showToast('Project created.');
          }
        }}
        initialProject={editingProject}
        goals={goals}
        defaultGoalId={projectModalDefaultGoalId}
      />
    </div>
  );
}
