import {
  AvailabilityBlock,
  AvailabilityResult,
  CalendarEvent,
  FreeWindow,
  GoogleCalendar,
  SchedulingCandidateWindow,
  Task,
  UserPlanningProfile,
} from '../types';

/**
 * Converts a time string "HH:mm" to minutes from 00:00 (0..1440).
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return Math.min(1440, Math.max(0, h * 60 + m));
}

/**
 * Formats minutes from 00:00 into "HH:mm" string.
 */
export function minutesToTimeString(minutes: number): string {
  const clamped = Math.min(1440, Math.max(0, Math.round(minutes)));
  if (clamped >= 1440) return '24:00';
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Formats minutes to 12-hour display string (e.g. "2:30 PM").
 */
export function minutesToDisplayTime(minutes: number): string {
  const clamped = Math.min(1440, Math.max(0, Math.round(minutes)));
  if (clamped === 0) return '12:00 AM';
  if (clamped === 1440) return '11:59 PM';
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Converts "YYYY-MM-DD" and minute offset into an ISO 8601 string.
 */
export function dateAndMinutesToIso(dateStr: string, minutes: number, timezone = 'UTC'): string {
  const time = minutesToTimeString(Math.min(1439, minutes));
  return `${dateStr}T${time}:00.000Z`;
}

/**
 * Normalizes raw Google Calendar event payload or application event object.
 */
export function normalizeCalendarEvent(
  rawEvent: any,
  calendarName?: string,
  calendarColor?: string
): CalendarEvent | null {
  if (!rawEvent) return null;
  if (rawEvent.status === 'cancelled') return null;

  const id = rawEvent.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const title = rawEvent.summary || rawEvent.title || '(No title)';
  const description = rawEvent.description || '';
  const location = rawEvent.location || '';
  const transparency = rawEvent.transparency === 'transparent' ? 'transparent' : 'opaque';

  let start = '';
  let end = '';
  let allDay = false;

  if (rawEvent.start?.date) {
    allDay = true;
    start = `${rawEvent.start.date}T00:00:00.000Z`;
    // Google Calendar all-day end date is exclusive
    end = rawEvent.end?.date ? `${rawEvent.end.date}T00:00:00.000Z` : `${rawEvent.start.date}T23:59:59.999Z`;
  } else if (rawEvent.start?.dateTime) {
    allDay = false;
    start = rawEvent.start.dateTime;
    end = rawEvent.end?.dateTime || rawEvent.start.dateTime;
  } else if (typeof rawEvent.start === 'string') {
    start = rawEvent.start;
    end = rawEvent.end || rawEvent.start;
    allDay = !!rawEvent.allDay;
  } else {
    return null;
  }

  return {
    id,
    calendarId: rawEvent.calendarId || 'primary',
    calendarName,
    calendarColor,
    title,
    description,
    start,
    end,
    allDay,
    status: rawEvent.status || 'confirmed',
    recurring: !!rawEvent.recurringEventId,
    location,
    transparency,
  };
}

interface MinuteInterval {
  startMin: number;
  endMin: number;
  source: AvailabilityBlock['source'];
  title: string;
  classification: AvailabilityBlock['classification'];
  eventId?: string;
  calendarId?: string;
  originalStartMin?: number;
  originalEndMin?: number;
  isBuffered?: boolean;
}

/**
 * Merges overlapping intervals of the same or higher priority to avoid double counting.
 */
export function mergeIntervals(intervals: { start: number; end: number }[]): { start: number; end: number }[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals]
    .map(i => ({ start: Math.max(0, i.start), end: Math.min(1440, i.end) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = merged[merged.length - 1];

    if (current.start <= prev.end) {
      // Overlapping or adjacent
      prev.end = Math.max(prev.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Calculates deterministic availability blocks, free scheduling windows,
 * and task candidate matches for a given date.
 */
export function calculateAvailability(params: {
  dateStr: string; // YYYY-MM-DD
  profile: any;
  events: CalendarEvent[];
  selectedCalendarIds?: string[];
  tasks?: Task[];
}): AvailabilityResult {
  const { dateStr, profile, events, selectedCalendarIds, tasks = [] } = params;
  const timezone = profile?.timezone || 'UTC';
  const bufferMinutes = profile?.bufferMinutes !== undefined ? profile.bufferMinutes : 15;

  const targetDate = new Date(`${dateStr}T12:00:00Z`);
  const dayIndex = targetDate.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
  const fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fullDayOfWeek = fullDayNames[dayIndex];
  const shortDayOfWeek = shortDayNames[dayIndex];
  const isWeekend = dayIndex === 0 || dayIndex === 6;

  const hardIntervals: MinuteInterval[] = [];
  const displayBlocks: AvailabilityBlock[] = [];

  // 1. Sleep Schedule (Hard constraint)
  const sleepSchedule = profile?.sleepSchedule;
  const sleepWake = isWeekend && sleepSchedule?.weekendDifferent && sleepSchedule.weekendWake
    ? sleepSchedule.weekendWake
    : sleepSchedule?.weekdayWake || '07:00';
  const sleepBed = isWeekend && sleepSchedule?.weekendDifferent && sleepSchedule.weekendSleep
    ? sleepSchedule.weekendSleep
    : sleepSchedule?.weekdaySleep || '23:00';

  const wakeMinutes = timeStringToMinutes(sleepWake);
  const bedMinutes = timeStringToMinutes(sleepBed);

  // Morning sleep: 00:00 to wakeMinutes
  if (wakeMinutes > 0) {
    hardIntervals.push({
      startMin: 0,
      endMin: wakeMinutes,
      source: 'sleep',
      title: 'Sleep Rhythm',
      classification: 'hard',
    });
    displayBlocks.push({
      id: `sleep_morning_${dateStr}`,
      start: dateAndMinutesToIso(dateStr, 0, timezone),
      end: dateAndMinutesToIso(dateStr, wakeMinutes, timezone),
      durationMinutes: wakeMinutes,
      source: 'sleep',
      title: 'Sleep Rhythm',
      classification: 'hard',
    });
  }

  // Evening sleep: bedMinutes to 24:00 (1440)
  if (bedMinutes < 1440 && bedMinutes > 0) {
    hardIntervals.push({
      startMin: bedMinutes,
      endMin: 1440,
      source: 'sleep',
      title: 'Sleep Rhythm',
      classification: 'hard',
    });
    displayBlocks.push({
      id: `sleep_evening_${dateStr}`,
      start: dateAndMinutesToIso(dateStr, bedMinutes, timezone),
      end: dateAndMinutesToIso(dateStr, 1440, timezone),
      durationMinutes: 1440 - bedMinutes,
      source: 'sleep',
      title: 'Sleep Rhythm',
      classification: 'hard',
    });
  }

  // 2. Fixed Recurring Commitments (Hard constraint)
  if (profile?.recurringBlocks && Array.isArray(profile.recurringBlocks)) {
    for (const block of profile.recurringBlocks) {
      const days = Array.isArray(block.days) ? block.days : [];
      const matchesDay = days.some(
        (d: string) => d === fullDayOfWeek || d === shortDayOfWeek || d.startsWith(shortDayOfWeek)
      );
      if (matchesDay) {
        const startMin = timeStringToMinutes(block.startTime);
        const endMin = timeStringToMinutes(block.endTime);
        if (endMin > startMin) {
          hardIntervals.push({
            startMin,
            endMin,
            source: 'fixed_commitment',
            title: block.title,
            classification: 'hard',
          });
          displayBlocks.push({
            id: `rec_${block.id}_${dateStr}`,
            start: dateAndMinutesToIso(dateStr, startMin, timezone),
            end: dateAndMinutesToIso(dateStr, endMin, timezone),
            durationMinutes: endMin - startMin,
            source: 'fixed_commitment',
            title: block.title,
            classification: 'hard',
            metadata: { type: block.type, location: block.location },
          });
        }
      }
    }
  }

  // 3. Google Calendar Events (Hard constraint when opaque/busy)
  const activeEvents = events.filter(evt => {
    if (evt.status === 'cancelled') return false;
    if (selectedCalendarIds && selectedCalendarIds.length > 0) {
      return selectedCalendarIds.includes(evt.calendarId);
    }
    return true;
  });

  for (const evt of activeEvents) {
    // Check overlap with target date
    const evtStartDateStr = evt.start.split('T')[0];
    const evtEndDateStr = evt.end.split('T')[0];

    // Determine if event touches this day
    const isToday = evtStartDateStr <= dateStr && evtEndDateStr >= dateStr;
    if (!isToday) continue;

    if (evt.allDay) {
      if (evt.transparency === 'transparent') {
        // Transparent all-day event is informational only
        displayBlocks.push({
          id: `cal_${evt.id}`,
          start: dateAndMinutesToIso(dateStr, 0, timezone),
          end: dateAndMinutesToIso(dateStr, 1440, timezone),
          durationMinutes: 1440,
          source: 'calendar_busy',
          title: `${evt.title} (All-day)`,
          classification: 'soft',
          calendarId: evt.calendarId,
          eventId: evt.id,
        });
      } else {
        // Opaque all-day event blocks the full day
        hardIntervals.push({
          startMin: 0,
          endMin: 1440,
          source: 'calendar_busy',
          title: evt.title,
          classification: 'hard',
          eventId: evt.id,
          calendarId: evt.calendarId,
        });
        displayBlocks.push({
          id: `cal_${evt.id}`,
          start: dateAndMinutesToIso(dateStr, 0, timezone),
          end: dateAndMinutesToIso(dateStr, 1440, timezone),
          durationMinutes: 1440,
          source: 'calendar_busy',
          title: evt.title,
          classification: 'hard',
          calendarId: evt.calendarId,
          eventId: evt.id,
        });
      }
      continue;
    }

    // Timed event: extract hour/minute
    let startMin = 0;
    let endMin = 1440;

    const startDate = new Date(evt.start);
    const endDate = new Date(evt.end);

    if (evtStartDateStr === dateStr) {
      startMin = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
    }
    if (evtEndDateStr === dateStr) {
      endMin = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();
    }

    if (endMin <= startMin) {
      // Fallback to avoid invalid 0-duration event
      endMin = Math.min(1440, startMin + 30);
    }

    const durationMinutes = endMin - startMin;

    if (evt.transparency === 'transparent') {
      // Informational event
      displayBlocks.push({
        id: `cal_${evt.id}`,
        start: dateAndMinutesToIso(dateStr, startMin, timezone),
        end: dateAndMinutesToIso(dateStr, endMin, timezone),
        durationMinutes,
        source: 'calendar_busy',
        title: evt.title,
        classification: 'soft',
        calendarId: evt.calendarId,
        eventId: evt.id,
      });
      continue;
    }

    // Apply buffer minutes to create scheduling protected region
    const bufferedStartMin = Math.max(0, startMin - bufferMinutes);
    const bufferedEndMin = Math.min(1440, endMin + bufferMinutes);

    hardIntervals.push({
      startMin: bufferedStartMin,
      endMin: bufferedEndMin,
      source: 'calendar_busy',
      title: evt.title,
      classification: 'hard',
      eventId: evt.id,
      calendarId: evt.calendarId,
      originalStartMin: startMin,
      originalEndMin: endMin,
      isBuffered: bufferMinutes > 0,
    });

    displayBlocks.push({
      id: `cal_${evt.id}`,
      start: dateAndMinutesToIso(dateStr, startMin, timezone),
      end: dateAndMinutesToIso(dateStr, endMin, timezone),
      bufferedStart: dateAndMinutesToIso(dateStr, bufferedStartMin, timezone),
      bufferedEnd: dateAndMinutesToIso(dateStr, bufferedEndMin, timezone),
      durationMinutes,
      source: 'calendar_busy',
      title: evt.title,
      classification: 'hard',
      calendarId: evt.calendarId,
      eventId: evt.id,
    });
  }

  // 3b. Scheduled Tasks on target date (Hard constraint)
  if (tasks && Array.isArray(tasks)) {
    for (const task of tasks) {
      if (!task.scheduledStart || !task.scheduledEnd) continue;
      if (task.status === 'completed' || task.status === 'cancelled') continue;

      const tStartDate = new Date(task.scheduledStart);
      const tEndDate = new Date(task.scheduledEnd);
      if (isNaN(tStartDate.getTime()) || isNaN(tEndDate.getTime())) continue;

      const tStartStr = task.scheduledStart.split('T')[0];
      const tEndStr = task.scheduledEnd.split('T')[0];
      if (tStartStr !== dateStr && tEndStr !== dateStr) continue;

      let startMin = tStartDate.getUTCHours() * 60 + tStartDate.getUTCMinutes();
      let endMin = tEndDate.getUTCHours() * 60 + tEndDate.getUTCMinutes();
      if (endMin <= startMin) endMin = startMin + 30;

      hardIntervals.push({
        startMin,
        endMin,
        source: 'fixed_commitment',
        title: `Task: ${task.title}`,
        classification: 'hard',
      });
      displayBlocks.push({
        id: `task_${task.id}_${dateStr}`,
        start: dateAndMinutesToIso(dateStr, startMin, timezone),
        end: dateAndMinutesToIso(dateStr, endMin, timezone),
        durationMinutes: endMin - startMin,
        source: 'fixed_commitment',
        title: task.title,
        classification: 'hard',
      });
    }
  }

  // 4. Calculate Free Windows between merged hard intervals
  const busyRanges = mergeIntervals(
    hardIntervals.map(i => ({ start: i.startMin, end: i.endMin }))
  );

  const freeWindows: FreeWindow[] = [];
  let currentPointer = 0;

  for (const busy of busyRanges) {
    if (busy.start > currentPointer) {
      const freeStart = currentPointer;
      const freeEnd = busy.start;
      const duration = freeEnd - freeStart;
      if (duration >= 10) {
        // Only consider meaningful windows >= 10 mins
        freeWindows.push(createFreeWindow(dateStr, freeStart, freeEnd, timezone, profile));
      }
    }
    currentPointer = Math.max(currentPointer, busy.end);
  }

  if (currentPointer < 1440) {
    const duration = 1440 - currentPointer;
    if (duration >= 10) {
      freeWindows.push(createFreeWindow(dateStr, currentPointer, 1440, timezone, profile));
    }
  }

  // Add Free Windows to display blocks
  for (const fw of freeWindows) {
    displayBlocks.push({
      id: fw.id,
      start: fw.start,
      end: fw.end,
      durationMinutes: fw.durationMinutes,
      source: 'free_window',
      title: fw.inPreferredFocusPeriod
        ? `Prime Focus Window (${fw.preferredPeriodName || 'Focus'})`
        : fw.inPreferredWorkingHours
        ? 'Available Work Window'
        : 'Available Scheduling Window',
      classification: 'free',
      metadata: {
        inWorkingHours: fw.inPreferredWorkingHours,
        inFocusPeriod: fw.inPreferredFocusPeriod,
        periodName: fw.preferredPeriodName,
      },
    });
  }

  // Sort display blocks chronologically
  displayBlocks.sort((a, b) => a.start.localeCompare(b.start));

  // Compute aggregate statistics
  const totalFreeMinutes = freeWindows.reduce((acc, w) => acc + w.durationMinutes, 0);
  const totalSleepMinutes = (wakeMinutes || 0) + (bedMinutes < 1440 ? 1440 - bedMinutes : 0);

  const totalBusyMinutes = hardIntervals
    .filter(i => i.source === 'calendar_busy')
    .reduce((acc, i) => acc + (i.endMin - i.startMin), 0);

  const totalCommitmentMinutes = hardIntervals
    .filter(i => i.source === 'fixed_commitment')
    .reduce((acc, i) => acc + (i.endMin - i.startMin), 0);

  // 5. Candidate Window Matching for Active Tasks (Section 14 & 17)
  const candidateWindowsForTasks: Record<string, SchedulingCandidateWindow[]> = {};
  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') continue;
    candidateWindowsForTasks[task.id] = findCandidateWindowsForTask(task, freeWindows, profile);
  }

  return {
    date: dateStr,
    timezone,
    blocks: displayBlocks,
    freeWindows,
    totalFreeMinutes,
    totalBusyMinutes,
    totalSleepMinutes,
    totalCommitmentMinutes,
    candidateWindowsForTasks,
  };
}

function createFreeWindow(
  dateStr: string,
  startMin: number,
  endMin: number,
  timezone: string,
  profile: UserPlanningProfile | null
): FreeWindow {
  const durationMinutes = endMin - startMin;
  const startFormatted = minutesToTimeString(startMin);
  const endFormatted = minutesToTimeString(endMin);

  // Check preferred working hours
  const workStart = timeStringToMinutes(profile?.preferredWorkingHours?.startTime || '09:00');
  const workEnd = timeStringToMinutes(profile?.preferredWorkingHours?.endTime || '18:00');
  const inPreferredWorkingHours = startMin >= workStart && endMin <= workEnd;

  // Check preferred focus periods
  let inPreferredFocusPeriod = false;
  let preferredPeriodName: string | undefined;

  const focusPeriods = profile?.preferredPeriods || ['Morning', 'Afternoon'];
  // Conventional mappings for focus periods:
  // Morning: 09:00 - 12:00 (540 - 720)
  // Afternoon: 13:00 - 17:00 (780 - 1020)
  // Evening: 18:00 - 21:00 (1080 - 1260)
  // Late Night: 21:00 - 00:00 (1260 - 1440)
  for (const period of focusPeriods) {
    const periodStr = String(period);
    let pStart = 540;
    let pEnd = 720;
    if (periodStr.includes('Afternoon')) {
      pStart = 780;
      pEnd = 1020;
    } else if (periodStr.includes('Evening')) {
      pStart = 1080;
      pEnd = 1260;
    } else if (periodStr.includes('Late Night')) {
      pStart = 1260;
      pEnd = 1440;
    }

    // If free window overlaps with focus period by at least 30 minutes
    const overlapStart = Math.max(startMin, pStart);
    const overlapEnd = Math.min(endMin, pEnd);
    if (overlapEnd - overlapStart >= 30) {
      inPreferredFocusPeriod = true;
      preferredPeriodName = periodStr;
      break;
    }
  }

  return {
    id: `fw_${dateStr}_${startMin}_${endMin}`,
    start: dateAndMinutesToIso(dateStr, startMin, timezone),
    end: dateAndMinutesToIso(dateStr, endMin, timezone),
    durationMinutes,
    startFormatted,
    endFormatted,
    inPreferredWorkingHours,
    inPreferredFocusPeriod,
    preferredPeriodName,
  };
}

/**
 * Finds candidate scheduling windows where a task can fit comfortably.
 */
export function findCandidateWindowsForTask(
  task: Task,
  freeWindows: FreeWindow[],
  profile: UserPlanningProfile | null
): SchedulingCandidateWindow[] {
  const duration = task.estimatedMinutes || 30;
  const candidates: SchedulingCandidateWindow[] = [];

  for (const fw of freeWindows) {
    if (fw.durationMinutes < duration) {
      continue;
    }

    let score = 50;
    const reasons: string[] = [];

    // Reason: Duration fit
    const spareMinutes = fw.durationMinutes - duration;
    let fit: 'exact' | 'comfortable' | 'tight' = 'comfortable';

    if (spareMinutes === 0) {
      fit = 'exact';
      reasons.push(`Exact fit for your ${duration}m task.`);
      score += 10;
    } else if (spareMinutes < 15) {
      fit = 'tight';
      reasons.push(`Tight fit (${fw.durationMinutes}m window for ${duration}m task).`);
    } else {
      fit = 'comfortable';
      reasons.push(`Comfortable buffer: ${spareMinutes}m spare time remaining.`);
      score += 20;
    }

    // Reason: Focus period
    if (fw.inPreferredFocusPeriod) {
      score += 30;
      reasons.push(`Falls directly inside your preferred ${fw.preferredPeriodName || 'Focus'} window.`);
    }

    // Reason: Working hours
    if (fw.inPreferredWorkingHours) {
      score += 20;
      reasons.push('Within your standard working hours.');
    } else {
      reasons.push('Outside normal work hours (optional flex window).');
    }

    // Priority bonus
    if (task.priority === 'urgent' || task.priority === 'high') {
      score += 15;
    }

    candidates.push({
      window: fw,
      taskDuration: duration,
      fit,
      score,
      reasons,
    });
  }

  // Sort highest score first
  return candidates.sort((a, b) => b.score - a.score);
}
