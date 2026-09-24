import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Inbox,
  Calendar,
  Clock,
  Flame,
  AlertCircle,
  RefreshCw,
  X,
  ListFilter,
  CheckSquare,
  FolderKanban,
  Target,
} from 'lucide-react';
import { Task, TaskPriority, TaskStatus } from '../types';
import { useTasks, CreateTaskInput } from '../context/TaskContext';
import { usePlanningProfile } from '../context/PlanningProfileContext';
import { useGoalProject } from '../context/GoalProjectContext';
import { getTodayString, getTomorrowString, getDueDateCategory } from '../utils/taskDateUtils';
import TaskRow from '../components/tasks/TaskRow';
import TaskModal from '../components/tasks/TaskModal';
import QuickAddBar from '../components/tasks/QuickAddBar';

type ViewMode = 'all' | 'inbox' | 'today' | 'upcoming' | 'completed' | 'priority';
type SortOption = 'dueDate' | 'priority' | 'createdAt' | 'estimatedMinutes';

interface TasksProps {
  initialProjectId?: string;
  initialGoalId?: string;
  onClearFilter?: () => void;
}

export default function Tasks({ initialProjectId, initialGoalId, onClearFilter }: TasksProps = {}) {
  const {
    tasks,
    loading,
    error,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    reopenTask,
    refreshTasks,
  } = useTasks();

  const { profile } = usePlanningProfile();
  const { projects, goals } = useGoalProject();
  const timezone = profile?.timezone || 'UTC';

  // Navigation / View State
  const [activeView, setActiveView] = useState<ViewMode>(
    initialProjectId || initialGoalId ? 'all' : 'today'
  );

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>(initialProjectId || 'all');
  const [goalFilter, setGoalFilter] = useState<string>(initialGoalId || 'all');
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Synchronize when initial props change
  React.useEffect(() => {
    if (initialProjectId) {
      setProjectFilter(initialProjectId);
      setActiveView('all');
    }
  }, [initialProjectId]);

  React.useEffect(() => {
    if (initialGoalId) {
      setGoalFilter(initialGoalId);
      setActiveView('all');
    }
  }, [initialGoalId]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const todayStr = useMemo(() => getTodayString(timezone), [timezone]);
  const tomorrowStr = useMemo(() => getTomorrowString(timezone), [timezone]);

  // Extract all unique tags across tasks
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    tasks.forEach(t => t.tags?.forEach(tag => tagSet.add(tag)));
    return Array.from(tagSet);
  }, [tasks]);

  // Compute count badges for views
  const viewCounts = useMemo(() => {
    const counts = {
      all: tasks.filter(t => t.status !== 'cancelled').length,
      inbox: tasks.filter(t => t.status === 'inbox' || (!t.dueDate && t.status !== 'completed')).length,
      today: tasks.filter(t => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        const cat = getDueDateCategory(t.dueDate, t.dueTime, timezone);
        return cat === 'today' || cat === 'overdue' || (!t.dueDate && t.status === 'in_progress');
      }).length,
      upcoming: tasks.filter(t => {
        if (t.status === 'completed' || t.status === 'cancelled') return false;
        const cat = getDueDateCategory(t.dueDate, t.dueTime, timezone);
        return cat === 'tomorrow' || cat === 'upcoming';
      }).length,
      completed: tasks.filter(t => t.status === 'completed').length,
      priority: tasks.filter(t => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high')).length,
    };
    return counts;
  }, [tasks, timezone]);

  // Filter and sort tasks
  const displayedTasks = useMemo(() => {
    return tasks
      .filter(task => {
        // 1. View Mode filter
        if (activeView === 'inbox') {
          if (task.status === 'completed') return false;
          if (task.status !== 'inbox' && task.dueDate) return false;
        } else if (activeView === 'today') {
          if (task.status === 'completed') return false;
          const cat = getDueDateCategory(task.dueDate, task.dueTime, timezone);
          if (cat !== 'today' && cat !== 'overdue' && !(task.status === 'in_progress' && !task.dueDate)) {
            return false;
          }
        } else if (activeView === 'upcoming') {
          if (task.status === 'completed') return false;
          const cat = getDueDateCategory(task.dueDate, task.dueTime, timezone);
          if (cat !== 'tomorrow' && cat !== 'upcoming') return false;
        } else if (activeView === 'completed') {
          if (task.status !== 'completed') return false;
        } else if (activeView === 'priority') {
          if (task.status === 'completed') return false;
          if (task.priority !== 'urgent' && task.priority !== 'high') return false;
        } else if (activeView === 'all') {
          // Keep all active or completed
        }

        // 2. Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = task.title.toLowerCase().includes(q);
          const matchDesc = task.description?.toLowerCase().includes(q);
          const matchTags = task.tags?.some(tag => tag.toLowerCase().includes(q));
          if (!matchTitle && !matchDesc && !matchTags) return false;
        }

        // 3. Priority filter
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
          return false;
        }

        // 4. Status filter
        if (statusFilter !== 'all' && task.status !== statusFilter) {
          return false;
        }

        // 5. Tag filter
        if (tagFilter !== 'all' && (!task.tags || !task.tags.includes(tagFilter))) {
          return false;
        }

        // 6. Project filter
        if (projectFilter === 'unassigned') {
          if (task.projectId) return false;
        } else if (projectFilter !== 'all') {
          if (task.projectId !== projectFilter) return false;
        }

        // 7. Goal filter
        if (goalFilter === 'unassigned') {
          if (task.goalId) return false;
        } else if (goalFilter !== 'all') {
          const taskProj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
          const effectiveGoalId = task.goalId || taskProj?.goalId;
          if (effectiveGoalId !== goalFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Priority weight mapping
        const pWeight: Record<TaskPriority, number> = {
          urgent: 4,
          high: 3,
          medium: 2,
          low: 1,
        };

        if (sortBy === 'priority') {
          const diff = pWeight[b.priority] - pWeight[a.priority];
          return sortAsc ? -diff : diff;
        }

        if (sortBy === 'dueDate') {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          const diff = a.dueDate.localeCompare(b.dueDate);
          return sortAsc ? diff : -diff;
        }

        if (sortBy === 'createdAt') {
          const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          return sortAsc ? -diff : diff;
        }

        if (sortBy === 'estimatedMinutes') {
          const diff = (a.estimatedMinutes || 30) - (b.estimatedMinutes || 30);
          return sortAsc ? diff : -diff;
        }

        return 0;
      });
  }, [
    tasks,
    activeView,
    searchQuery,
    priorityFilter,
    statusFilter,
    tagFilter,
    projectFilter,
    goalFilter,
    projects,
    sortBy,
    sortAsc,
    timezone,
  ]);

  const handleToggleComplete = async (taskId: string, currentlyCompleted: boolean) => {
    try {
      if (currentlyCompleted) {
        await reopenTask(taskId);
        showToast('Task marked incomplete');
      } else {
        await completeTask(taskId);
        showToast('Task completed');
      }
    } catch (err: any) {
      showToast(err.message || 'Error updating task status');
    }
  };

  const handleSaveModal = async (taskData: any) => {
    if (selectedTask) {
      await updateTask(selectedTask.id, taskData);
      showToast('Task updated successfully');
    } else {
      await createTask(taskData);
      showToast('Task created successfully');
    }
  };

  const handleDeleteModal = async (taskId: string) => {
    await deleteTask(taskId);
    showToast('Task deleted');
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-medium text-slate-100 shadow-xl shadow-black/60 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Tasks</h1>
            <span className="rounded-md border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-300">
              Execution Layer
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Everything you need to execute, organized around what matters.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => refreshTasks()}
            title="Refresh tasks"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => {
              setSelectedTask(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 transition"
          >
            <Plus size={15} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => refreshTasks()}
            className="rounded-lg bg-rose-500/20 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Quick Add Bar */}
      <QuickAddBar onAddTask={createTask} />

      {/* Views / Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800/60 no-scrollbar">
        {[
          { id: 'today', label: 'Today', count: viewCounts.today, icon: Clock },
          { id: 'upcoming', label: 'Upcoming', count: viewCounts.upcoming, icon: Calendar },
          { id: 'priority', label: 'Priority', count: viewCounts.priority, icon: Flame },
          { id: 'inbox', label: 'Inbox', count: viewCounts.inbox, icon: Inbox },
          { id: 'all', label: 'All Tasks', count: viewCounts.all, icon: CheckSquare },
          { id: 'completed', label: 'Completed', count: viewCounts.completed, icon: CheckCircle2 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as ViewMode)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                isActive
                  ? 'bg-slate-800 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-violet-400' : 'text-slate-500'} />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive ? 'bg-slate-700 text-violet-300' : 'bg-slate-800/80 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search size={15} className="absolute left-3.5 top-3 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title, description, or tag..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-10 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter & Sort Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Priority filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
            <span className="text-slate-500 text-[11px]">Priority:</span>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none font-medium capitalize"
            >
              <option value="all">All</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Project filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
            <FolderKanban size={12} className="text-indigo-400" />
            <span className="text-slate-500 text-[11px]">Project:</span>
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none font-medium max-w-[130px] truncate"
            >
              <option value="all">All projects</option>
              <option value="unassigned">(No project)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Goal filter */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
            <Target size={12} className="text-violet-400" />
            <span className="text-slate-500 text-[11px]">Goal:</span>
            <select
              value={goalFilter}
              onChange={e => setGoalFilter(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none font-medium max-w-[130px] truncate"
            >
              <option value="all">All goals</option>
              <option value="unassigned">(No goal)</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5">
              <span className="text-slate-500 text-[11px]">Tag:</span>
              <select
                value={tagFilter}
                onChange={e => setTagFilter(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none font-medium"
              >
                <option value="all">All tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort By */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1.5">
            <span className="text-slate-500 text-[11px]">Sort:</span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-slate-200 focus:outline-none font-medium"
            >
              <option value="priority">Priority</option>
              <option value="dueDate">Due date</option>
              <option value="createdAt">Created date</option>
              <option value="estimatedMinutes">Duration</option>
            </select>

            <button
              onClick={() => setSortAsc(!sortAsc)}
              title={sortAsc ? 'Ascending' : 'Descending'}
              className="text-slate-400 hover:text-white p-0.5 rounded"
            >
              <ArrowUpDown size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Indicators */}
      {(projectFilter !== 'all' || goalFilter !== 'all' || priorityFilter !== 'all' || tagFilter !== 'all' || searchQuery.trim()) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Filters:</span>
          {projectFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-1 text-indigo-300 font-medium">
              <FolderKanban size={12} className="text-indigo-400" />
              <span>Project: {projectFilter === 'unassigned' ? 'Unassigned' : projects.find(p => p.id === projectFilter)?.name || projectFilter}</span>
              <button onClick={() => setProjectFilter('all')} className="hover:text-white ml-0.5">
                <X size={11} />
              </button>
            </span>
          )}
          {goalFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/15 px-2.5 py-1 text-violet-300 font-medium">
              <Target size={12} className="text-violet-400" />
              <span>Goal: {goalFilter === 'unassigned' ? 'Unassigned' : goals.find(g => g.id === goalFilter)?.title || goalFilter}</span>
              <button onClick={() => setGoalFilter('all')} className="hover:text-white ml-0.5">
                <X size={11} />
              </button>
            </span>
          )}
          {priorityFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 font-medium capitalize">
              <span>Priority: {priorityFilter}</span>
              <button onClick={() => setPriorityFilter('all')} className="hover:text-white ml-0.5">
                <X size={11} />
              </button>
            </span>
          )}
          {tagFilter !== 'all' && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 font-medium">
              <span>#{tagFilter}</span>
              <button onClick={() => setTagFilter('all')} className="hover:text-white ml-0.5">
                <X size={11} />
              </button>
            </span>
          )}
          {searchQuery.trim() && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 font-medium">
              <span>Query: "{searchQuery}"</span>
              <button onClick={() => setSearchQuery('')} className="hover:text-white ml-0.5">
                <X size={11} />
              </button>
            </span>
          )}
          <button
            onClick={() => {
              setProjectFilter('all');
              setGoalFilter('all');
              setPriorityFilter('all');
              setTagFilter('all');
              setSearchQuery('');
              onClearFilter?.();
            }}
            className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-2 ml-1 cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="space-y-2">
        {loading && tasks.length === 0 ? (
          // Loading skeleton
          <div className="space-y-3 py-8 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-violet-400" />
            <p className="text-xs font-medium text-slate-500">Loading your workload…</p>
          </div>
        ) : displayedTasks.length > 0 ? (
          displayedTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onToggleComplete={handleToggleComplete}
              onClick={t => {
                setSelectedTask(t);
                setIsModalOpen(true);
              }}
            />
          ))
        ) : (
          // Empty State
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 py-12 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-slate-500 mb-3">
              {searchQuery || priorityFilter !== 'all' || tagFilter !== 'all' ? (
                <ListFilter size={22} />
              ) : activeView === 'today' ? (
                <Clock size={22} className="text-violet-400/80" />
              ) : activeView === 'completed' ? (
                <CheckCircle2 size={22} className="text-emerald-400/80" />
              ) : (
                <CheckSquare size={22} />
              )}
            </div>

            <h3 className="text-sm font-semibold text-slate-300">
              {searchQuery || priorityFilter !== 'all' || tagFilter !== 'all'
                ? 'No matching tasks found'
                : activeView === 'today'
                ? 'No tasks due today'
                : activeView === 'completed'
                ? 'No completed tasks yet'
                : 'No tasks in this view'}
            </h3>

            <p className="mt-1 max-w-sm text-xs text-slate-500">
              {searchQuery || priorityFilter !== 'all' || tagFilter !== 'all'
                ? 'Try clearing your search or filters to see more tasks.'
                : activeView === 'today'
                ? 'Your day is clear or all scheduled tasks have been completed. Nice work.'
                : 'Capture your next action above using quick add or click Add Task.'}
            </p>

            {(searchQuery || priorityFilter !== 'all' || tagFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPriorityFilter('all');
                  setTagFilter('all');
                }}
                className="mt-4 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition"
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Task Creation & Detail Modal */}
      <TaskModal
        isOpen={isModalOpen}
        initialTask={selectedTask}
        allTasks={tasks}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={handleSaveModal}
        onDelete={handleDeleteModal}
      />
    </div>
  );
}
