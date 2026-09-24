import { DayOfWeek, RecurringBlock, SleepSchedule, PreferredWorkingHours } from '../types';

export const DAYS_OF_WEEK: DayOfWeek[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export function formatTime12(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : `${m}`;
  return `${displayH}:${displayM} ${ampm}`;
}

export function parseMinutes(time24: string): number {
  if (!time24) return 0;
  const [h, m] = time24.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function calculateDurationHours(start: string, end: string): number {
  const startMin = parseMinutes(start);
  const endMin = parseMinutes(end);
  if (endMin >= startMin) {
    return Math.round(((endMin - startMin) / 60) * 10) / 10;
  }
  // Crosses midnight (e.g. 23:00 to 07:00)
  return Math.round(((1440 - startMin + endMin) / 60) * 10) / 10;
}

export function isOvernight(start: string, end: string): boolean {
  return parseMinutes(end) < parseMinutes(start);
}

export function doIntervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  if (s1 === e1 || s2 === e2) return false;
  // If either interval crosses midnight:
  const spans1 = e1 > s1 ? [[s1, e1]] : [[s1, 1440], [0, e1]];
  const spans2 = e2 > s2 ? [[s2, e2]] : [[s2, 1440], [0, e2]];
  for (const [a1, b1] of spans1) {
    for (const [a2, b2] of spans2) {
      if (a1 < b2 && a2 < b1) return true;
    }
  }
  return false;
}

export interface OverlapConflict {
  blockA: RecurringBlock;
  blockB: RecurringBlock;
  day: DayOfWeek;
}

export function detectCommitmentOverlaps(blocks: RecurringBlock[]): OverlapConflict[] {
  const conflicts: OverlapConflict[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const b1 = blocks[i];
      const b2 = blocks[j];
      // Common days
      const commonDays = b1.days.filter(d => b2.days.includes(d));
      if (commonDays.length > 0) {
        const s1 = parseMinutes(b1.startTime);
        const e1 = parseMinutes(b1.endTime);
        const s2 = parseMinutes(b2.startTime);
        const e2 = parseMinutes(b2.endTime);
        if (doIntervalsOverlap(s1, e1, s2, e2)) {
          commonDays.forEach(day => {
            conflicts.push({ blockA: b1, blockB: b2, day });
          });
        }
      }
    }
  }
  return conflicts;
}

export interface TimelineSegment {
  id: string;
  title: string;
  type: 'sleep' | 'commitment' | 'focus';
  commitmentType?: string;
  startMinutes: number; // 0 to 1440
  endMinutes: number;   // 0 to 1440
  displayStart: string;
  displayEnd: string;
  colorClass: string;
  originalBlock?: RecurringBlock;
}

export function getDayScheduleSegments(
  day: DayOfWeek,
  sleep: SleepSchedule,
  recurringBlocks: RecurringBlock[],
  preferredHours?: PreferredWorkingHours
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const isWeekend = day === 'Saturday' || day === 'Sunday';

  const sleepStart = isWeekend && sleep.weekendDifferent && sleep.weekendSleep
    ? sleep.weekendSleep
    : sleep.weekdaySleep;
  const sleepWake = isWeekend && sleep.weekendDifferent && sleep.weekendWake
    ? sleep.weekendWake
    : sleep.weekdayWake;

  // Add sleep segment(s)
  const sleepStartMin = parseMinutes(sleepStart);
  const sleepWakeMin = parseMinutes(sleepWake);

  if (sleepWakeMin <= sleepStartMin) {
    // Overnight sleep: [0, wakeMin] and [startMin, 1440]
    segments.push({
      id: `sleep_morning_${day}`,
      title: 'Sleep / Rest',
      type: 'sleep',
      startMinutes: 0,
      endMinutes: sleepWakeMin,
      displayStart: '12:00 AM',
      displayEnd: formatTime12(sleepWake),
      colorClass: 'bg-indigo-950/80 border-indigo-800/60 text-indigo-300',
    });
    segments.push({
      id: `sleep_night_${day}`,
      title: 'Sleep / Rest',
      type: 'sleep',
      startMinutes: sleepStartMin,
      endMinutes: 1440,
      displayStart: formatTime12(sleepStart),
      displayEnd: '11:59 PM',
      colorClass: 'bg-indigo-950/80 border-indigo-800/60 text-indigo-300',
    });
  } else {
    segments.push({
      id: `sleep_${day}`,
      title: 'Sleep / Rest',
      type: 'sleep',
      startMinutes: sleepStartMin,
      endMinutes: sleepWakeMin,
      displayStart: formatTime12(sleepStart),
      displayEnd: formatTime12(sleepWake),
      colorClass: 'bg-indigo-950/80 border-indigo-800/60 text-indigo-300',
    });
  }

  // Add recurring blocks for this day
  recurringBlocks
    .filter(b => b.days.includes(day))
    .forEach(b => {
      const bStart = parseMinutes(b.startTime);
      const bEnd = parseMinutes(b.endTime);

      let colorClass = 'bg-slate-800/90 border-slate-700 text-slate-200';
      if (b.type === 'College') {
        colorClass = 'bg-sky-950/80 border-sky-800/70 text-sky-300';
      } else if (b.type === 'Work') {
        colorClass = 'bg-emerald-950/80 border-emerald-800/70 text-emerald-300';
      } else if (b.type === 'Personal') {
        colorClass = 'bg-purple-950/80 border-purple-800/70 text-purple-300';
      } else {
        colorClass = 'bg-amber-950/80 border-amber-800/70 text-amber-300';
      }

      if (bEnd < bStart) {
        // spans midnight
        segments.push({
          id: `${b.id}_1_${day}`,
          title: b.title,
          type: 'commitment',
          commitmentType: b.type,
          startMinutes: bStart,
          endMinutes: 1440,
          displayStart: formatTime12(b.startTime),
          displayEnd: '11:59 PM',
          colorClass,
          originalBlock: b,
        });
      } else {
        segments.push({
          id: `${b.id}_${day}`,
          title: b.title,
          type: 'commitment',
          commitmentType: b.type,
          startMinutes: bStart,
          endMinutes: bEnd,
          displayStart: formatTime12(b.startTime),
          displayEnd: formatTime12(b.endTime),
          colorClass,
          originalBlock: b,
        });
      }
    });

  // Preferred Focus block indicator (if not conflicting with sleep)
  if (preferredHours?.startTime && preferredHours?.endTime) {
    const fStart = parseMinutes(preferredHours.startTime);
    const fEnd = parseMinutes(preferredHours.endTime);
    if (fEnd > fStart) {
      segments.push({
        id: `focus_${day}`,
        title: 'Preferred Focus',
        type: 'focus',
        startMinutes: fStart,
        endMinutes: fEnd,
        displayStart: formatTime12(preferredHours.startTime),
        displayEnd: formatTime12(preferredHours.endTime),
        colorClass: 'border border-dashed border-violet-500/50 bg-violet-950/30 text-violet-300',
      });
    }
  }

  return segments;
}
