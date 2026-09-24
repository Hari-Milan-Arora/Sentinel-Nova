import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Goal, Project, Task } from '../types';
import { useAuth } from '../auth/AuthContext';
import { useTasks } from './TaskContext';

interface GoalProjectContextType {
  goals: Goal[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  createGoal: (input: Partial<Goal>) => Promise<Goal>;
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<Goal>;
  deleteGoal: (id: string) => Promise<void>;
  completeGoal: (id: string) => Promise<Goal>;
  archiveGoal: (id: string) => Promise<Goal>;
  createProject: (input: Partial<Project>) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  completeProject: (id: string) => Promise<Project>;
  archiveProject: (id: string) => Promise<Project>;
  refreshGoalsAndProjects: () => Promise<void>;
  getProjectDerivedProgress: (project: Project) => number;
  getGoalDerivedProgress: (goal: Goal) => number;
  getProjectTasks: (projectId: string) => Task[];
  getGoalProjects: (goalId: string) => Project[];
  getGoalTasks: (goalId: string) => Task[];
}

const GoalProjectContext = createContext<GoalProjectContextType | undefined>(undefined);

export const GoalProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { tasks, refreshTasks } = useTasks();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshGoalsAndProjects = useCallback(async () => {
    if (!user) {
      setGoals([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [goalsRes, projectsRes] = await Promise.all([
        fetch('/api/goals', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
      ]);

      if (!goalsRes.ok) {
        throw new Error(`Failed to load goals: ${goalsRes.statusText}`);
      }
      if (!projectsRes.ok) {
        throw new Error(`Failed to load projects: ${projectsRes.statusText}`);
      }

      const goalsData = await goalsRes.json();
      const projectsData = await projectsRes.json();

      setGoals(goalsData.goals || []);
      setProjects(projectsData.projects || []);
    } catch (err: any) {
      console.error('GoalProjectContext refresh error:', err);
      setError(err.message || 'Failed to sync goals and projects.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      refreshGoalsAndProjects();
    }
  }, [authLoading, refreshGoalsAndProjects]);

  // Project derived progress: completed tasks / total non-cancelled tasks
  const getProjectTasks = useCallback(
    (projectId: string): Task[] => {
      return tasks.filter(t => t.projectId === projectId);
    },
    [tasks]
  );

  const getProjectDerivedProgress = useCallback(
    (project: Project): number => {
      const pTasks = tasks.filter(t => t.projectId === project.id && t.status !== 'cancelled');
      if (pTasks.length === 0) {
        return project.progress || 0;
      }
      const completed = pTasks.filter(t => t.status === 'completed').length;
      return Math.round((completed / pTasks.length) * 100);
    },
    [tasks]
  );

  // Goal derived progress: aggregate progress of associated projects
  const getGoalProjects = useCallback(
    (goalId: string): Project[] => {
      return projects.filter(p => p.goalId === goalId || p.status === 'active' && false);
    },
    [projects]
  );

  const getGoalTasks = useCallback(
    (goalId: string): Task[] => {
      const gProjects = projects.filter(p => p.goalId === goalId);
      const projectIds = new Set(gProjects.map(p => p.id));
      return tasks.filter(t => (t.projectId && projectIds.has(t.projectId)) || t.goalId === goalId);
    },
    [projects, tasks]
  );

  const getGoalDerivedProgress = useCallback(
    (goal: Goal): number => {
      const linkedProjects = projects.filter(
        p => p.goalId === goal.id || (goal.projectIds && goal.projectIds.includes(p.id))
      );
      if (linkedProjects.length === 0) {
        return goal.progress || 0;
      }
      const totalProgress = linkedProjects.reduce(
        (acc, p) => acc + getProjectDerivedProgress(p),
        0
      );
      return Math.round(totalProgress / linkedProjects.length);
    },
    [projects, getProjectDerivedProgress]
  );

  // Goal CRUD
  const createGoal = async (input: Partial<Goal>): Promise<Goal> => {
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create goal.');
      }
      setGoals(prev => [data.goal, ...prev]);
      return data.goal;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateGoal = async (id: string, updates: Partial<Goal>): Promise<Goal> => {
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update goal.');
      }
      setGoals(prev => prev.map(g => (g.id === id ? data.goal : g)));
      return data.goal;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteGoal = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete goal.');
      }
      // Safe relationship handling: remove goal, and unassign goal from local projects
      setGoals(prev => prev.filter(g => g.id !== id));
      setProjects(prev =>
        prev.map(p => (p.goalId === id ? { ...p, goalId: null } : p))
      );
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const completeGoal = async (id: string): Promise<Goal> => {
    try {
      const res = await fetch(`/api/goals/${id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete goal.');
      }
      setGoals(prev => prev.map(g => (g.id === id ? data.goal : g)));
      return data.goal;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const archiveGoal = async (id: string): Promise<Goal> => {
    try {
      const res = await fetch(`/api/goals/${id}/archive`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive goal.');
      }
      setGoals(prev => prev.map(g => (g.id === id ? data.goal : g)));
      return data.goal;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  // Project CRUD
  const createProject = async (input: Partial<Project>): Promise<Project> => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create project.');
      }
      const newProj: Project = data.project;
      setProjects(prev => [newProj, ...prev]);

      // If attached to a goal, link in local goal
      if (newProj.goalId) {
        setGoals(prev =>
          prev.map(g =>
            g.id === newProj.goalId && !g.projectIds.includes(newProj.id)
              ? { ...g, projectIds: [...g.projectIds, newProj.id] }
              : g
          )
        );
      }

      return newProj;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>): Promise<Project> => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update project.');
      }
      const updated: Project = data.project;
      setProjects(prev => prev.map(p => (p.id === id ? updated : p)));

      // Refresh goals in background to update links
      fetch('/api/goals', { credentials: 'include' })
        .then(r => r.json())
        .then(d => d.goals && setGoals(d.goals))
        .catch(() => {});

      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteProject = async (id: string): Promise<void> => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete project.');
      }
      // Remove project locally
      setProjects(prev => prev.filter(p => p.id !== id));
      // Unlink from goals
      setGoals(prev =>
        prev.map(g => ({
          ...g,
          projectIds: g.projectIds.filter(pid => pid !== id),
        }))
      );
      // Synchronize tasks so any task that had this project is refreshed to null
      await refreshTasks();
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const completeProject = async (id: string): Promise<Project> => {
    try {
      const res = await fetch(`/api/projects/${id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete project.');
      }
      setProjects(prev => prev.map(p => (p.id === id ? data.project : p)));
      return data.project;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const archiveProject = async (id: string): Promise<Project> => {
    try {
      const res = await fetch(`/api/projects/${id}/archive`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive project.');
      }
      setProjects(prev => prev.map(p => (p.id === id ? data.project : p)));
      return data.project;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const value = useMemo(
    () => ({
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
      refreshGoalsAndProjects,
      getProjectDerivedProgress,
      getGoalDerivedProgress,
      getProjectTasks,
      getGoalProjects,
      getGoalTasks,
    }),
    [
      goals,
      projects,
      loading,
      error,
      refreshGoalsAndProjects,
      getProjectDerivedProgress,
      getGoalDerivedProgress,
      getProjectTasks,
      getGoalProjects,
      getGoalTasks,
    ]
  );

  return <GoalProjectContext.Provider value={value}>{children}</GoalProjectContext.Provider>;
};

export const useGoalProject = () => {
  const context = useContext(GoalProjectContext);
  if (!context) {
    throw new Error('useGoalProject must be used within a GoalProjectProvider');
  }
  return context;
};
