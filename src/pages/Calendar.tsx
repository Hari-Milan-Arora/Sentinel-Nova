import React, { useState } from 'react';
import {
  CalendarDays,
  CalendarCheck2,
  Clock,
  RefreshCw,
  Unplug,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Moon,
  Layers,
  CheckCircle2,
  SlidersHorizontal,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useCalendar } from '../context/CalendarContext';
import { usePlanningProfile } from '../context/PlanningProfileContext';
import { useTasks } from '../context/TaskContext';
import { minutesToDisplayTime, timeStringToMinutes } from '../utils/availabilityEngine';
import { Task } from '../types';

export default function CalendarPage() {
  const {
    status,
    connectedEmail,
    lastSync,
    calendars,
    selectedCalendarIds,
    events,
    selectedDate,
    availability,
    loading,
    error,
    isConfigured,
    connectCalendar,
    disconnectCalendar,
    toggleCalendarSelection,
    refreshEvents,
    setSelectedDate,
    clearError,
  } = useCalendar();

  const { profile } = usePlanningProfile();
  const { tasks } = useTasks();

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Active uncompleted tasks for scheduling preview
  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

  // Set default selected task if none selected
  React.useEffect(() => {
    if (!selectedTaskId && activeTasks.length > 0) {
      setSelectedTaskId(activeTasks[0].id);
    }
  }, [selectedTaskId, activeTasks]);

  const selectedTask = activeTasks.find(t => t.id === selectedTaskId) || activeTasks[0];
  const candidateWindows = selectedTask && availability?.candidateWindowsForTasks
    ? availability.candidateWindowsForTasks[selectedTask.id] || []
    : [];

  // Date Navigation handlers
  const handlePrevDay = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  // Formatted date string (e.g. "Monday, September 7, 2026")
  const formattedDateTitle = React.useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-7 text-slate-100">
      {/* Header & Connection Ribbon */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600/20 text-violet-400">
              <CalendarDays size={20} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-white">Calendar & Availability</h1>
              <p className="text-xs text-slate-400">
                Google Calendar commitments + planning profile rhythm → verified free scheduling windows
              </p>
            </div>
          </div>
        </div>

        {/* Connection Action / State */}
        <div className="flex flex-wrap items-center gap-2.5">
          {status === 'connected' ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Connected: <strong>{connectedEmail}</strong></span>
              </div>
              <button
                onClick={() => void refreshEvents()}
                disabled={loading}
                title="Sync calendar now"
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700 hover:text-white"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Sync</span>
              </button>
              <button
                onClick={() => void disconnectCalendar()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-500/20 hover:text-white"
              >
                <Unplug size={13} />
                <span>Disconnect</span>
              </button>
            </div>
          ) : status === 'connecting' ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
              <RefreshCw size={14} className="animate-spin" />
              <span>Connecting to Google Calendar…</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void connectCalendar()}
                className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-slate-950 shadow transition hover:bg-slate-200"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Connect Google Calendar</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Configuration Status Notice (When client ID is not yet configured) */}
      {!isConfigured && status !== 'connected' && !error && (
        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-slate-400 shrink-0" />
            <span>Google Calendar is not configured yet.</span>
          </div>
          <button
            onClick={() => void refreshEvents()}
            className="flex items-center gap-1 font-medium text-slate-300 hover:text-white"
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-3">
            {error.toLowerCase().includes('reconnect') || error.toLowerCase().includes('expired') || error.toLowerCase().includes('revoked') ? (
              <button
                onClick={() => { clearError(); void connectCalendar(); }}
                className="font-semibold text-white underline hover:text-slate-200"
              >
                Reconnect
              </button>
            ) : error.toLowerCase().includes('not configured') ? (
              <button
                onClick={() => { clearError(); void refreshEvents(); }}
                className="font-semibold text-white underline hover:text-slate-200"
              >
                Retry
              </button>
            ) : null}
            <button onClick={clearError} className="font-semibold underline hover:text-white">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Calendar Selection Pills */}
      {calendars.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
              <SlidersHorizontal size={14} className="text-violet-400" />
              <span>Included Calendars for Availability ({selectedCalendarIds.length} of {calendars.length} active)</span>
            </div>
            {lastSync && (
              <span className="text-[11px] text-slate-500">
                Last synced: {new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {calendars.map(cal => {
              const isSelected = selectedCalendarIds.includes(cal.id);
              return (
                <button
                  key={cal.id}
                  onClick={() => void toggleCalendarSelection(cal.id)}
                  className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                    isSelected
                      ? 'border border-violet-500/40 bg-violet-500/10 text-violet-200'
                      : 'border border-slate-800 bg-slate-950 text-slate-500 hover:border-slate-700 hover:text-slate-300'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cal.backgroundColor || '#8b5cf6' }}
                  />
                  <span>{cal.name}</span>
                  {cal.primary && <span className="text-[10px] text-slate-500">(Primary)</span>}
                  {isSelected && <CheckCircle2 size={12} className="text-violet-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Date Navigation & Timezone Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleToday}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              isToday ? 'bg-violet-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Today
          </button>
          <button
            onClick={handleNextDay}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Next Day"
          >
            <ChevronRight size={16} />
          </button>
          <div className="ml-2">
            <span className="text-sm font-semibold text-white">{formattedDateTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock size={13} className="text-slate-500" />
          <span>Rhythm Timezone: <strong>{profile?.timezone || 'UTC'}</strong></span>
          <span className="text-slate-600">•</span>
          <span>Buffer: <strong>{profile?.bufferMinutes ?? 15}m</strong></span>
        </div>
      </div>

      {/* Key Availability Metrics Ribbon */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Free Scheduling Time</span>
            <Sparkles size={14} />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {availability ? `${Math.floor(availability.totalFreeMinutes / 60)}h ${availability.totalFreeMinutes % 60}m` : '0h 0m'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {availability?.freeWindows.length || 0} candidate free windows
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Calendar Busy</span>
            <CalendarCheck2 size={14} className="text-violet-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {availability ? `${Math.floor(availability.totalBusyMinutes / 60)}h ${availability.totalBusyMinutes % 60}m` : '0h 0m'}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Protected with {profile?.bufferMinutes ?? 15}m buffers
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Sleep Schedule</span>
            <Moon size={14} className="text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {availability ? `${Math.floor(availability.totalSleepMinutes / 60)}h ${availability.totalSleepMinutes % 60}m` : '8h 0m'}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {profile?.sleepSchedule?.weekdaySleep || '23:00'} → {profile?.sleepSchedule?.weekdayWake || '07:00'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Fixed Commitments</span>
            <Coffee size={14} className="text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {availability ? `${Math.floor(availability.totalCommitmentMinutes / 60)}h ${availability.totalCommitmentMinutes % 60}m` : '0h 0m'}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            College, meals & routine
          </p>
        </div>
      </div>

      {/* Main Two-Column Layout: Availability Timeline & Task Scheduling Preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Availability Timeline (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              Availability Timeline — When Can Nova Plan?
            </h2>
            <span className="text-[11px] text-slate-500">
              {availability?.blocks.length || 0} scheduled segments
            </span>
          </div>

          <div className="space-y-2.5">
            {availability && availability.blocks.length > 0 ? (
              availability.blocks.map(block => {
                const startTimeStr = block.start.split('T')[1]?.slice(0, 5) || '00:00';
                const endTimeStr = block.end.split('T')[1]?.slice(0, 5) || '24:00';
                const startDisplay = minutesToDisplayTime(timeStringToMinutes(startTimeStr));
                const endDisplay = minutesToDisplayTime(timeStringToMinutes(endTimeStr));

                if (block.classification === 'free') {
                  return (
                    <div
                      key={block.id}
                      className="group rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 transition hover:border-emerald-500/50 hover:bg-emerald-500/[0.09]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                            <span className="text-xs font-semibold text-emerald-300">
                              {block.title}
                            </span>
                            {block.metadata?.inFocusPeriod && (
                              <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                Preferred Focus
                              </span>
                            )}
                            {block.metadata?.inWorkingHours && (
                              <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                Working Hours
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-medium text-slate-300">
                            {startDisplay} – {endDisplay}
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="rounded-lg bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
                            {block.durationMinutes} mins free
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (block.source === 'calendar_busy') {
                  return (
                    <div
                      key={block.id}
                      className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-violet-400" />
                            <span className="text-xs font-semibold text-violet-200">
                              {block.title}
                            </span>
                            <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[10px] text-violet-300">
                              Calendar Event
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {startDisplay} – {endDisplay} ({block.durationMinutes}m)
                          </div>
                          {block.bufferedStart && block.bufferedEnd && (
                            <div className="text-[10px] text-slate-500">
                              Protected buffer: {minutesToDisplayTime(timeStringToMinutes(block.bufferedStart.split('T')[1]?.slice(0, 5)))} – {minutesToDisplayTime(timeStringToMinutes(block.bufferedEnd.split('T')[1]?.slice(0, 5)))}
                            </div>
                          )}
                        </div>

                        <span className="text-[11px] font-medium text-slate-500">Busy</span>
                      </div>
                    </div>
                  );
                }

                if (block.source === 'sleep') {
                  return (
                    <div
                      key={block.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-3.5"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <Moon size={13} className="text-indigo-400" />
                          <span>{block.title} ({startDisplay} – {endDisplay})</span>
                        </div>
                        <span>Protected Sleep</span>
                      </div>
                    </div>
                  );
                }

                // Fixed recurring commitment (College, Work, etc.)
                return (
                  <div
                    key={block.id}
                    className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex h-2 w-2 rounded-full bg-amber-400" />
                          <span className="text-xs font-semibold text-amber-200">
                            {block.title}
                          </span>
                          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                            Recurring Commitment
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {startDisplay} – {endDisplay} ({block.durationMinutes}m)
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-amber-400/80">Committed</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                No availability blocks calculated for this date.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Task Scheduling Preview (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Task Scheduling Preview</h2>
            <span className="flex items-center gap-1 text-[11px] text-violet-400">
              <ShieldCheck size={12} />
              <span>User Controlled</span>
            </span>
          </div>

          {/* User Control Notice */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 text-xs text-slate-400">
            <div className="flex items-start gap-2">
              <Info size={14} className="text-violet-400 shrink-0 mt-0.5" />
              <p className="leading-5">
                <strong>Preview only:</strong> Nova identifies candidate free windows where tasks realistically fit. Nova will never automatically create, move, or modify Google Calendar events.
              </p>
            </div>
          </div>

          {/* Task Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Select Task to Evaluate</label>
            <select
              value={selectedTaskId || ''}
              onChange={e => setSelectedTaskId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-violet-500 focus:outline-none"
            >
              {activeTasks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title} ({t.estimatedMinutes || 30}m • {t.priority})
                </option>
              ))}
            </select>
          </div>

          {/* Selected Task Details */}
          {selectedTask ? (
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white">{selectedTask.title}</span>
                  <span className="rounded-md bg-violet-600/20 px-2 py-0.5 text-[11px] font-bold text-violet-300">
                    {selectedTask.estimatedMinutes || 30} mins
                  </span>
                </div>
                {selectedTask.description && (
                  <p className="text-[11px] text-slate-400 line-clamp-2">{selectedTask.description}</p>
                )}
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                  <span>Priority: <strong className="capitalize text-slate-300">{selectedTask.priority}</strong></span>
                  {selectedTask.dueDate && (
                    <>
                      <span>•</span>
                      <span>Due: <strong className="text-slate-300">{selectedTask.dueDate}</strong></span>
                    </>
                  )}
                </div>
              </div>

              {/* Candidate Free Windows List */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="text-xs font-semibold text-slate-300">
                  Candidate Free Windows ({candidateWindows.length})
                </div>

                {candidateWindows.length > 0 ? (
                  candidateWindows.map((cand, idx) => (
                    <div
                      key={cand.window.id || idx}
                      className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-xs font-bold text-white">
                            {cand.window.startFormatted} – {cand.window.endFormatted}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            ({cand.window.durationMinutes}m window)
                          </span>
                        </div>
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          {cand.score}% fit
                        </span>
                      </div>

                      {/* Suitability Reasons */}
                      <ul className="space-y-1 text-[11px] text-slate-400">
                        {cand.reasons.map((r, rIdx) => (
                          <li key={rIdx} className="flex items-center gap-1.5">
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
                    No free window on this day is large enough for this {selectedTask.estimatedMinutes || 30}m task. Consider reducing task duration or breaking it into subtasks.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              No active tasks available to preview. Add tasks to see candidate scheduling windows.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
