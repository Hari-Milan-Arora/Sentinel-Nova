import React from 'react';
import { RecurringBlock, SleepSchedule, PreferredWorkingHours, DayOfWeek } from '../../types';
import { DAYS_OF_WEEK, getDayScheduleSegments, TimelineSegment, formatTime12 } from '../../utils/scheduleUtils';
import { Moon, GraduationCap, Briefcase, User, Tag, Clock, Sparkles } from 'lucide-react';

interface WeeklyScheduleTimelineProps {
  sleep: SleepSchedule;
  recurringBlocks: RecurringBlock[];
  preferredHours: PreferredWorkingHours;
  onEditBlock?: (block: RecurringBlock) => void;
  interactive?: boolean;
}

export default function WeeklyScheduleTimeline({
  sleep,
  recurringBlocks,
  preferredHours,
  onEditBlock,
  interactive = true,
}: WeeklyScheduleTimelineProps) {
  const [selectedDay, setSelectedDay] = React.useState<DayOfWeek>('Monday');

  // Time ticks: 12 AM (0h), 6 AM (6h), 9 AM (9h), 12 PM (12h), 3 PM (15h), 6 PM (18h), 9 PM (21h), 12 AM (24h)
  const timeTicks = [
    { label: '12 AM', min: 0 },
    { label: '6 AM', min: 360 },
    { label: '9 AM', min: 540 },
    { label: '12 PM', min: 720 },
    { label: '3 PM', min: 900 },
    { label: '6 PM', min: 1080 },
    { label: '9 PM', min: 1260 },
    { label: '12 AM', min: 1440 },
  ];

  const getIcon = (segment: TimelineSegment) => {
    if (segment.type === 'sleep') return <Moon size={13} className="text-indigo-300" />;
    if (segment.type === 'focus') return <Sparkles size={13} className="text-violet-300" />;
    if (segment.commitmentType === 'College') return <GraduationCap size={13} className="text-sky-300" />;
    if (segment.commitmentType === 'Work') return <Briefcase size={13} className="text-emerald-300" />;
    if (segment.commitmentType === 'Personal') return <User size={13} className="text-purple-300" />;
    return <Tag size={13} className="text-amber-300" />;
  };

  // Calculate weekly metrics
  const totalWeeklySleepHours = React.useMemo(() => {
    const weekdayDuration = getDuration(sleep.weekdaySleep, sleep.weekdayWake);
    const weekendDuration = sleep.weekendDifferent && sleep.weekendSleep && sleep.weekendWake
      ? getDuration(sleep.weekendSleep, sleep.weekendWake)
      : weekdayDuration;
    return Math.round((weekdayDuration * 5 + weekendDuration * 2) * 10) / 10;
  }, [sleep]);

  const totalWeeklyCommitmentHours = React.useMemo(() => {
    let total = 0;
    recurringBlocks.forEach(b => {
      const dur = getDuration(b.startTime, b.endTime);
      total += dur * b.days.length;
    });
    return Math.round(total * 10) / 10;
  }, [recurringBlocks]);

  const totalOpenHours = Math.max(0, Math.round((168 - totalWeeklySleepHours - totalWeeklyCommitmentHours) * 10) / 10);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-semibold text-white">Weekly Time Distribution</h4>
          <p className="mt-1 text-xs text-slate-400">
            {interactive
              ? 'Visual timeline of your commitments. Click any block to edit.'
              : 'Summary of your scheduled commitments across the week.'}
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
            <span className="text-slate-400">Sleep</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
            <span className="text-slate-400">College</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-400">Work</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
            <span className="text-slate-400">Personal</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-violet-400" />
            <span className="text-slate-400">Focus Window</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-slate-800/80 bg-slate-950/50 p-3.5 text-center text-xs">
        <div>
          <span className="text-slate-500">Weekly Rest</span>
          <p className="mt-1 text-base font-semibold text-indigo-300">{totalWeeklySleepHours} hrs</p>
        </div>
        <div>
          <span className="text-slate-500">Fixed Commitments</span>
          <p className="mt-1 text-base font-semibold text-emerald-300">{totalWeeklyCommitmentHours} hrs</p>
        </div>
        <div>
          <span className="text-slate-500">Flexible Time</span>
          <p className="mt-1 text-base font-semibold text-violet-300">{totalOpenHours} hrs</p>
        </div>
      </div>

      {/* Desktop / Tablet: Full 7-Day Timeline Matrix */}
      <div className="mt-6 hidden md:block overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Time axis header */}
          <div className="relative mb-2 ml-24 h-6 text-[11px] text-slate-500">
            {timeTicks.map(tick => {
              const leftPercent = (tick.min / 1440) * 100;
              return (
                <div
                  key={tick.label + tick.min}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${leftPercent}%` }}
                >
                  {tick.label}
                </div>
              );
            })}
          </div>

          {/* Days Rows */}
          <div className="space-y-3">
            {DAYS_OF_WEEK.map(day => {
              const segments = getDayScheduleSegments(day, sleep, recurringBlocks, preferredHours);
              const isWeekend = day === 'Saturday' || day === 'Sunday';

              return (
                <div key={day} className="flex items-center gap-3">
                  <div className="w-20 text-xs font-medium text-slate-400 flex items-center justify-between">
                    <span>{day.slice(0, 3)}</span>
                    {isWeekend && <span className="text-[10px] text-slate-600">wknd</span>}
                  </div>

                  {/* 24-hour bar container */}
                  <div className="relative h-9 flex-1 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                    {/* Tick grid lines */}
                    {timeTicks.map(tick => (
                      <div
                        key={tick.min}
                        className="absolute top-0 bottom-0 w-[1px] bg-slate-800/40 pointer-events-none"
                        style={{ left: `${(tick.min / 1440) * 100}%` }}
                      />
                    ))}

                    {/* Segments */}
                    {segments.map(seg => {
                      const left = (seg.startMinutes / 1440) * 100;
                      const width = Math.max(0.5, ((seg.endMinutes - seg.startMinutes) / 1440) * 100);
                      const isClickable = interactive && seg.originalBlock && onEditBlock;

                      return (
                        <div
                          key={seg.id}
                          onClick={() => {
                            if (isClickable && seg.originalBlock) {
                              onEditBlock(seg.originalBlock);
                            }
                          }}
                          title={`${seg.title} (${seg.displayStart} – ${seg.displayEnd})`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          className={`absolute top-1 bottom-1 flex items-center gap-1 overflow-hidden rounded-lg border px-1.5 text-[10px] font-medium transition ${
                            seg.colorClass
                          } ${
                            isClickable ? 'cursor-pointer hover:brightness-125 hover:z-20 shadow-md' : ''
                          }`}
                        >
                          <span className="shrink-0">{getIcon(seg)}</span>
                          <span className="truncate">{seg.title}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile: Day Tabs + Detailed Daily Breakdown */}
      <div className="mt-6 block md:hidden">
        <div className="flex gap-1 overflow-x-auto pb-2 border-b border-slate-800">
          {DAYS_OF_WEEK.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                selectedDay === d
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>

        {/* Selected Day Timeline for Mobile */}
        <div className="mt-4">
          <div className="relative mb-2 h-5 text-[10px] text-slate-500">
            {timeTicks.filter((_, i) => i % 2 === 0).map(tick => (
              <div
                key={tick.min}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${(tick.min / 1440) * 100}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>

          <div className="relative h-12 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
            {getDayScheduleSegments(selectedDay, sleep, recurringBlocks, preferredHours).map(seg => {
              const left = (seg.startMinutes / 1440) * 100;
              const width = Math.max(1, ((seg.endMinutes - seg.startMinutes) / 1440) * 100);
              const isClickable = interactive && seg.originalBlock && onEditBlock;

              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    if (isClickable && seg.originalBlock) onEditBlock(seg.originalBlock);
                  }}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  className={`absolute top-1 bottom-1 flex items-center justify-center rounded-lg border px-1 text-[10px] ${
                    seg.colorClass
                  } ${isClickable ? 'cursor-pointer active:scale-95' : ''}`}
                >
                  <span className="truncate text-center">{seg.title}</span>
                </div>
              );
            })}
          </div>

          {/* List of blocks for selected day */}
          <div className="mt-4 space-y-2">
            {getDayScheduleSegments(selectedDay, sleep, recurringBlocks, preferredHours).map(seg => (
              <div
                key={seg.id}
                onClick={() => {
                  if (interactive && seg.originalBlock && onEditBlock) onEditBlock(seg.originalBlock);
                }}
                className={`flex items-center justify-between rounded-xl border p-2.5 text-xs ${seg.colorClass} ${
                  seg.originalBlock && interactive ? 'cursor-pointer hover:brightness-110' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  {getIcon(seg)}
                  <span className="font-medium">{seg.title}</span>
                </div>
                <span className="text-slate-400">
                  {seg.displayStart} – {seg.displayEnd}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const sMin = sh * 60 + sm;
  const eMin = eh * 60 + em;
  if (eMin >= sMin) return (eMin - sMin) / 60;
  return (1440 - sMin + eMin) / 60;
}
