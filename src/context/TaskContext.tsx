import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Task, TaskPriority, TaskStatus, Subtask, TaskRecurrence } from '../types';
import { useAuth } from '../auth/AuthContext';

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  dueTime?: string | null;
  estimatedMinutes?: number;
  tags?: string[];
  subtasks?: Array<{
    id?: string;
    title: string;
    completed: boolean;
    createdAt?: string;
  }>;
  projectId?: string | null;
  goalId?: string | null;
  milestoneId?: string | null;
  recurring?: TaskRecurrence | null;
  dependencyIds?: string[];
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  createTask: (input: CreateTaskInput) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<Task>;
  reopenTask: (id: string) => Promise<Task>;
  refreshTasks: () => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load tasks (${res.status})`);
      }
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err: any) {
      console.error('Error loading tasks:', err);
      setError(err.message || 'Unable to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      void refreshTasks();
    }
  }, [authLoading, user, refreshTasks]);

  const createTask = useCallback(
    async (input: CreateTaskInput): Promise<Task> => {
      setError(null);
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to create task (${res.status})`);
        }
        const data = await res.json();
        const newTask: Task = data.task;
        setTasks(prev => [newTask, ...prev.filter(t => t.id !== newTask.id)]);
        return newTask;
      } catch (err: any) {
        setError(err.message || 'Failed to create task.');
        throw err;
      }
    },
    []
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Task>): Promise<Task> => {
      setError(null);
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to update task (${res.status})`);
        }
        const data = await res.json();
        const updatedTask: Task = data.task;
        setTasks(prev => prev.map(t => (t.id === id ? updatedTask : t)));
        return updatedTask;
      } catch (err: any) {
        setError(err.message || 'Failed to update task.');
        throw err;
      }
    },
    []
  );

  const deleteTask = useCallback(async (id: string): Promise<void> => {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to delete task (${res.status})`);
      }
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete task.');
      throw err;
    }
  }, []);

  const completeTask = useCallback(async (id: string): Promise<Task> => {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}/complete`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to complete task (${res.status})`);
      }
      const data = await res.json();
      const completedTask: Task = data.task;
      setTasks(prev => prev.map(t => (t.id === id ? completedTask : t)));
      return completedTask;
    } catch (err: any) {
      setError(err.message || 'Failed to complete task.');
      throw err;
    }
  }, []);

  const reopenTask = useCallback(async (id: string): Promise<Task> => {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${id}/reopen`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to reopen task (${res.status})`);
      }
      const data = await res.json();
      const reopenedTask: Task = data.task;
      setTasks(prev => prev.map(t => (t.id === id ? reopenedTask : t)));
      return reopenedTask;
    } catch (err: any) {
      setError(err.message || 'Failed to reopen task.');
      throw err;
    }
  }, []);

  return (
    <TaskContext.Provider
      value={{
        tasks,
        loading,
        error,
        createTask,
        updateTask,
        deleteTask,
        completeTask,
        reopenTask,
        refreshTasks,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = (): TaskContextType => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
