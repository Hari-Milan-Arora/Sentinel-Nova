import React, { useState, useEffect, useMemo } from 'react';
import {
  Brain,
  Plus,
  Search,
  Archive,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  Sparkles,
  RefreshCw,
  X,
  Filter,
} from 'lucide-react';
import {
  MemoryItem,
  MemoryType,
  MemoryImportance,
  MemorySensitivity,
} from '../../types';

export default function MemoryManagement() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryItem | null>(null);

  // Form state
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<MemoryType>('preference');
  const [formImportance, setFormImportance] = useState<MemoryImportance>('medium');
  const [formSensitivity, setFormSensitivity] = useState<MemorySensitivity>('normal');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchMemories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory?status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        setMemories(data.memories || []);
      } else {
        setError(data.error || 'Failed to load memories.');
      }
    } catch {
      setError('Network error while loading memories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMemories();
  }, [statusFilter]);

  const handleOpenAddModal = () => {
    setEditingMemory(null);
    setFormContent('');
    setFormType('preference');
    setFormImportance('medium');
    setFormSensitivity('normal');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (memory: MemoryItem) => {
    setEditingMemory(memory);
    setFormContent(memory.content);
    setFormType(memory.type);
    setFormImportance(memory.importance);
    setFormSensitivity(memory.sensitivity);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContent.trim()) {
      setFormError('Content cannot be empty.');
      return;
    }

    setFormSubmitting(true);
    setFormError(null);

    try {
      if (editingMemory) {
        // Update
        const res = await fetch(`/api/memory/${editingMemory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: formContent.trim(),
            type: formType,
            importance: formImportance,
            sensitivity: formSensitivity,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update memory.');
        }
      } else {
        // Create
        const res = await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: formContent.trim(),
            type: formType,
            importance: formImportance,
            sensitivity: formSensitivity,
            source: 'user_explicit',
            sourceReference: 'settings_ui',
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to create memory.');
        }
      }

      setIsAddModalOpen(false);
      await fetchMemories();
    } catch (err: any) {
      setFormError(err.message || 'Error saving memory item.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}/archive`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
      }
    } catch (err) {
      console.error('Failed to archive memory:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this memory item?')) {
      return;
    }
    try {
      const res = await fetch(`/api/memory/${id}?hard=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await fetchMemories();
      }
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  // Filter and search
  const filteredMemories = useMemo(() => {
    return memories.filter(m => {
      if (typeFilter !== 'all' && m.type !== typeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.content.toLowerCase().includes(q) ||
          m.type.toLowerCase().includes(q) ||
          m.source.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [memories, typeFilter, searchQuery]);

  const activeCount = useMemo(() => memories.filter(m => m.status === 'active').length, [memories]);
  const explicitCount = useMemo(
    () => memories.filter(m => m.source === 'user_explicit' || m.source === 'user_confirmed').length,
    [memories]
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={20} className="text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Nova Memory Bank</h2>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Persistent, isolated context and preferences that inform Sentinel Nova's proactive planning.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchMemories()}
            title="Refresh memories"
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 transition"
          >
            <Plus size={14} />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Memories</span>
            <Sparkles size={14} className="text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{activeCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Persisted user context</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>High-Authority Context</span>
            <Shield size={14} className="text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-400">{explicitCount}</p>
          <p className="mt-1 text-[11px] text-slate-500">Explicit & confirmed preferences</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Data Boundary</span>
            <CheckCircle2 size={14} className="text-blue-400" />
          </div>
          <p className="mt-2 text-sm font-semibold text-white">Strict Isolation</p>
          <p className="mt-1 text-[11px] text-slate-500">Zero credentials or cross-tenant leaks</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search saved preferences, working style, constraints…"
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter toggle */}
          <div className="flex rounded-xl border border-slate-800 bg-slate-950/60 p-1">
            <button
              onClick={() => setStatusFilter('active')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                statusFilter === 'active'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                statusFilter === 'archived'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Archived
            </button>
          </div>

          {/* Type selector */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            aria-label="Filter memories by category"
            className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="preference">Preference</option>
            <option value="working_style">Working Style</option>
            <option value="scheduling_preference">Scheduling</option>
            <option value="constraint">Constraint</option>
            <option value="goal_context">Goal Context</option>
            <option value="project_context">Project Context</option>
            <option value="decision">Decision</option>
            <option value="instruction">Instruction</option>
            <option value="fact">Fact</option>
            <option value="temporary_context">Temporary</option>
          </select>
        </div>
      </div>

      {/* Memory Items List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500">Loading Nova memories…</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300">
          {error}
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
          <Brain size={28} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-white">No memories found</p>
          <p className="mt-1 text-xs text-slate-400">
            {searchQuery || typeFilter !== 'all'
              ? 'No records match your search criteria.'
              : 'Tell Nova what to remember in chat ("remember that I do deep work in mornings") or click Add Memory.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map(mem => (
            <div
              key={mem.id}
              className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition hover:border-slate-700"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 flex-1">
                  {/* Badge Row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-300 uppercase tracking-wide">
                      {mem.type.replace('_', ' ')}
                    </span>

                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                        mem.importance === 'critical'
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                          : mem.importance === 'high'
                          ? 'bg-amber-500/15 text-amber-300'
                          : mem.importance === 'medium'
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {mem.importance}
                    </span>

                    <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-400">
                      {mem.source === 'user_confirmed'
                        ? 'Confirmed by You'
                        : mem.source === 'user_explicit'
                        ? 'Explicit'
                        : mem.source === 'system_derived'
                        ? 'System Derived'
                        : 'Agent Inferred'}
                    </span>

                    {mem.confidence && (
                      <span className="text-[11px] text-slate-500">
                        {Math.round(mem.confidence * 100)}% conf
                      </span>
                    )}

                    {mem.sensitivity === 'sensitive' && (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={10} /> Sensitive
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <p className="text-sm font-medium text-white leading-relaxed">{mem.content}</p>

                  {/* Provenance & Time */}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      Updated {new Date(mem.updatedAt).toLocaleDateString()}
                    </span>
                    {mem.sourceReference && <span>• Source: {mem.sourceReference}</span>}
                    {mem.accessCount > 0 && <span>• Recalled {mem.accessCount} time{mem.accessCount === 1 ? '' : 's'}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 pt-1">
                  <button
                    onClick={() => handleOpenEditModal(mem)}
                    title="Edit memory"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Edit2 size={13} />
                  </button>
                  {mem.status === 'active' && (
                    <button
                      onClick={() => handleArchive(mem.id)}
                      title="Archive memory"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition"
                    >
                      <Archive size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(mem.id)}
                    title="Permanently delete"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="text-base font-semibold text-white">
                {editingMemory ? 'Edit Memory' : 'Add Memory Context'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMemory} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Memory Content (max 1000 characters)
                </label>
                <textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g., I prefer working uninterrupted between 9 AM and 11 AM."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-white placeholder-slate-500 focus:border-violet-500 focus:outline-none"
                  required
                />
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  <span>Do not include passwords, API keys, or credentials.</span>
                  <span>{formContent.length}/1000</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as MemoryType)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="preference">Preference</option>
                    <option value="working_style">Working Style</option>
                    <option value="scheduling_preference">Scheduling</option>
                    <option value="constraint">Constraint</option>
                    <option value="goal_context">Goal Context</option>
                    <option value="project_context">Project Context</option>
                    <option value="decision">Decision</option>
                    <option value="instruction">Instruction</option>
                    <option value="fact">Fact</option>
                    <option value="temporary_context">Temporary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Importance</label>
                  <select
                    value={formImportance}
                    onChange={e => setFormImportance(e.target.value as MemoryImportance)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Sensitivity</label>
                  <select
                    value={formSensitivity}
                    onChange={e => setFormSensitivity(e.target.value as MemorySensitivity)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-white focus:border-violet-500 focus:outline-none"
                  >
                    <option value="normal">Normal</option>
                    <option value="sensitive">Sensitive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving…' : editingMemory ? 'Update Memory' : 'Save Memory'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
