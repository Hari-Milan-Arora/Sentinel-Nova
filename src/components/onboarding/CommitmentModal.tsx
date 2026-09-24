import React from 'react';
import { CommitmentType, DayOfWeek, RecurringBlock } from '../../types';
import { DAYS_OF_WEEK, formatTime12, calculateDurationHours, doIntervalsOverlap, parseMinutes } from '../../utils/scheduleUtils';
import { X, GraduationCap, Briefcase, User, Tag, Clock, MapPin, AlignLeft, Trash2, Copy, AlertTriangle } from 'lucide-react';

interface CommitmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (block: RecurringBlock) => void;
  onDelete?: (blockId: string) => void;
  initialBlock?: RecurringBlock | null;
  existingBlocks?: RecurringBlock[];
}

export default function CommitmentModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialBlock,
  existingBlocks = [],
}: CommitmentModalProps) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<CommitmentType>('College');
  const [days, setDays] = React.useState<DayOfWeek[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [startTime, setStartTime] = React.useState('09:00');
  const [endTime, setEndTime] = React.useState('16:00');
  const [location, setLocation] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialBlock) {
      setTitle(initialBlock.title);
      setType(initialBlock.type);
      setDays(initialBlock.days);
      setStartTime(initialBlock.startTime);
      setEndTime(initialBlock.endTime);
      setLocation(initialBlock.location || '');
      setNotes(initialBlock.notes || '');
    } else {
      setTitle('');
      setType('College');
      setDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
      setStartTime('09:00');
      setEndTime('16:00');
      setLocation('');
      setNotes('');
    }
    setError(null);
  }, [initialBlock, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (day: DayOfWeek) => {
    setDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const selectWeekdays = () => {
    setDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  };

  const selectWeekends = () => {
    setDays(['Saturday', 'Sunday']);
  };

  const selectAllDays = () => {
    setDays([...DAYS_OF_WEEK]);
  };

  const detectedOverlap = React.useMemo(() => {
    if (!existingBlocks || !startTime || !endTime || startTime === endTime) return null;
    const s1 = parseMinutes(startTime);
    const e1 = parseMinutes(endTime);
    for (const b of existingBlocks) {
      if (b.id === initialBlock?.id) continue;
      const commonDays = b.days.filter(d => days.includes(d));
      if (commonDays.length > 0) {
        const s2 = parseMinutes(b.startTime);
        const e2 = parseMinutes(b.endTime);
        if (doIntervalsOverlap(s1, e1, s2, e2)) {
          return { block: b, days: commonDays };
        }
      }
    }
    return null;
  }, [existingBlocks, initialBlock, startTime, endTime, days]);

  const handleSave = () => {
    if (!title.trim()) {
      setError('Please provide a name for this commitment.');
      return;
    }
    if (days.length === 0) {
      setError('Please select at least one day.');
      return;
    }
    if (!startTime || !endTime) {
      setError('Start time and end time are required.');
      return;
    }
    if (startTime === endTime) {
      setError('Start time and end time cannot be identical.');
      return;
    }

    const block: RecurringBlock = {
      id: initialBlock?.id || `block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      type,
      days,
      startTime,
      endTime,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSave(block);
    onClose();
  };

  const durationHours = calculateDurationHours(startTime, endTime);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {initialBlock ? 'Edit Fixed Commitment' : 'Add Recurring Commitment'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Fixed obligations that anchor your schedule.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {detectedOverlap && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Schedule overlap detected</p>
              <p className="mt-0.5 text-amber-300/80">
                Overlaps with <strong>{detectedOverlap.block.title}</strong> ({formatTime12(detectedOverlap.block.startTime)} – {formatTime12(detectedOverlap.block.endTime)}) on {detectedOverlap.days.map(d => d.slice(0, 3)).join(', ')}.
              </p>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <div className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Commitment Name <span className="text-violet-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Computer Science Lectures, Work Shift, Gym"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-300">Type</label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {(['College', 'Work', 'Personal', 'Other'] as CommitmentType[]).map(t => {
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-2 text-xs font-medium transition ${
                      isSelected
                        ? 'border-violet-500 bg-violet-600/15 text-violet-200'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {t === 'College' && <GraduationCap size={16} />}
                    {t === 'Work' && <Briefcase size={16} />}
                    {t === 'Personal' && <User size={16} />}
                    {t === 'Other' && <Tag size={16} />}
                    <span>{t}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Days */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Days of Week <span className="text-violet-400">*</span>
              </label>
              <div className="flex gap-2 text-[11px] text-slate-400">
                <button
                  type="button"
                  onClick={selectWeekdays}
                  className="hover:text-violet-300 underline underline-offset-2"
                >
                  Weekdays
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={selectWeekends}
                  className="hover:text-violet-300 underline underline-offset-2"
                >
                  Weekends
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={selectAllDays}
                  className="hover:text-violet-300 underline underline-offset-2"
                >
                  All
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {DAYS_OF_WEEK.map(d => {
                const isSelected = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-xl border py-2 text-xs font-semibold transition ${
                      isSelected
                        ? 'border-violet-500 bg-violet-600 text-white'
                        : 'border-slate-800 bg-slate-950/70 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time Range */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-300">
                Time Window <span className="text-violet-400">*</span>
              </label>
              <span className="text-[11px] text-slate-400">
                {formatTime12(startTime)} → {formatTime12(endTime)} ({durationHours} hrs)
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">Start Time</label>
                <div className="relative mt-1">
                  <Clock className="absolute left-3 top-2.5 text-slate-500" size={14} />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 uppercase tracking-wider">End Time</label>
                <div className="relative mt-1">
                  <Clock className="absolute left-3 top-2.5 text-slate-500" size={14} />
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white focus:border-violet-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Location <span className="text-slate-500">(Optional)</span>
            </label>
            <div className="relative mt-1.5">
              <MapPin className="absolute left-3 top-2.5 text-slate-500" size={14} />
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Science Hall, Room 302, or Remote"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300">
              Notes <span className="text-slate-500">(Optional)</span>
            </label>
            <div className="relative mt-1.5">
              <AlignLeft className="absolute left-3 top-2.5 text-slate-500" size={14} />
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special context or constraints..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white placeholder-slate-600 focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
          <div>
            {initialBlock && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(initialBlock.id);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500"
            >
              {initialBlock ? 'Update Commitment' : 'Add Commitment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
