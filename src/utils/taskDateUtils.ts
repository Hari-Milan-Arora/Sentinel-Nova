import { TaskPriority } from '../types';

/**
 * Returns YYYY-MM-DD in the specified timezone (or local if undefined)
 */
export function getTodayString(timezone?: string): string {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

/**
 * Returns YYYY-MM-DD for tomorrow in the specified timezone
 */
export function getTomorrowString(timezone?: string): string {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(tomorrow);
  } catch {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

export type DueDateStatus = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'none';

export function getDueDateCategory(
  dueDate?: string | null,
  dueTime?: string | null,
  timezone?: string
): DueDateStatus {
  if (!dueDate) return 'none';

  const today = getTodayString(timezone);
  const tomorrow = getTomorrowString(timezone);

  if (dueDate < today) {
    return 'overdue';
  }
  if (dueDate === today) {
    // If due today and has dueTime, check if past due time
    if (dueTime) {
      try {
        const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const nowStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date());
        if (nowStr > dueTime) {
          return 'overdue';
        }
      } catch {
        // Fallback to today
      }
    }
    return 'today';
  }
  if (dueDate === tomorrow) {
    return 'tomorrow';
  }
  return 'upcoming';
}

export function formatDueDateDisplay(
  dueDate?: string | null,
  dueTime?: string | null,
  timezone?: string
): { label: string; status: DueDateStatus; timeFormatted?: string } {
  if (!dueDate) {
    return { label: 'No due date', status: 'none' };
  }

  const status = getDueDateCategory(dueDate, dueTime, timezone);
  let timeFormatted: string | undefined;

  if (dueTime) {
    const [hStr, mStr] = dueTime.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(h) && !isNaN(m)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      const displayM = m < 10 ? `0${m}` : `${m}`;
      timeFormatted = `${displayH}:${displayM} ${ampm}`;
    }
  }

  if (status === 'overdue') {
    const parts = dueDate.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
    const day = parseInt(parts[2], 10);
    return {
      label: `Overdue (${month} ${day}${timeFormatted ? ` at ${timeFormatted}` : ''})`,
      status: 'overdue',
      timeFormatted,
    };
  }

  if (status === 'today') {
    return {
      label: timeFormatted ? `Today at ${timeFormatted}` : 'Due today',
      status: 'today',
      timeFormatted,
    };
  }

  if (status === 'tomorrow') {
    return {
      label: timeFormatted ? `Tomorrow at ${timeFormatted}` : 'Tomorrow',
      status: 'tomorrow',
      timeFormatted,
    };
  }

  // Upcoming date
  const parts = dueDate.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[parseInt(parts[1], 10) - 1] || parts[1];
  const day = parseInt(parts[2], 10);
  return {
    label: `${month} ${day}${timeFormatted ? ` at ${timeFormatted}` : ''}`,
    status: 'upcoming',
    timeFormatted,
  };
}

export function formatDurationMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '15m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export interface ParsedQuickAdd {
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  priority?: TaskPriority;
  estimatedMinutes?: number;
  tags?: string[];
}

/**
 * Lightweight, transparent rule-based natural language task parser.
 * Supports:
 * - "today", "tomorrow"
 * - "at 6pm", "at 6:30 PM", "at 14:00"
 * - "!urgent", "!high", "!medium", "!low"
 * - "#tagname"
 * - "~30m", "~1h", "~2h", "~45m"
 */
export function parseQuickAddText(rawText: string, timezone?: string): ParsedQuickAdd {
  let text = rawText.trim();
  let dueDate: string | null | undefined = undefined;
  let dueTime: string | null | undefined = undefined;
  let priority: TaskPriority | undefined = undefined;
  let estimatedMinutes: number | undefined = undefined;
  const tags: string[] = [];

  // 1. Tags (#tag)
  const tagMatches = text.match(/#([a-zA-Z0-9_\-]+)/g);
  if (tagMatches) {
    tagMatches.forEach(tagMatch => {
      tags.push(tagMatch.slice(1));
      text = text.replace(tagMatch, '');
    });
  }

  // 2. Priority (!urgent, !high, !med, !medium, !low)
  if (/\b!(urgent|critical)\b/i.test(text)) {
    priority = 'urgent';
    text = text.replace(/\b!(urgent|critical)\b/i, '');
  } else if (/\b!(high)\b/i.test(text)) {
    priority = 'high';
    text = text.replace(/\b!(high)\b/i, '');
  } else if (/\b!(medium|med)\b/i.test(text)) {
    priority = 'medium';
    text = text.replace(/\b!(medium|med)\b/i, '');
  } else if (/\b!(low)\b/i.test(text)) {
    priority = 'low';
    text = text.replace(/\b!(low)\b/i, '');
  }

  // 3. Estimated Duration (~30m, ~1h, ~90m, ~2.5h)
  const durationMatch = text.match(/~([0-9.]+)\s*(m|min|h|hr|hours)?\b/i);
  if (durationMatch) {
    const val = parseFloat(durationMatch[1]);
    const unit = (durationMatch[2] || 'm').toLowerCase();
    if (!isNaN(val)) {
      if (unit.startsWith('h')) {
        estimatedMinutes = Math.round(val * 60);
      } else {
        estimatedMinutes = Math.round(val);
      }
    }
    text = text.replace(durationMatch[0], '');
  }

  // 4. Time parsing ("at 6pm", "at 6:30 PM", "at 14:00")
  const timeMatch = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

    if (meridian === 'pm' && hour < 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;

    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      dueTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    text = text.replace(timeMatch[0], '');
  }

  // 5. Date parsing ("tomorrow", "today")
  if (/\b(tomorrow)\b/i.test(text)) {
    dueDate = getTomorrowString(timezone);
    text = text.replace(/\b(tomorrow)\b/i, '');
  } else if (/\b(today)\b/i.test(text)) {
    dueDate = getTodayString(timezone);
    text = text.replace(/\b(today)\b/i, '');
  }

  // Clean remaining text as title
  const cleanedTitle = text
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s-]+|[,.\s-]+$/g, '')
    .trim();

  return {
    title: cleanedTitle || rawText.trim(),
    dueDate,
    dueTime,
    priority,
    estimatedMinutes,
    tags: tags.length ? tags : undefined,
  };
}
