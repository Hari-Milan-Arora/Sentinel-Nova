import fs from "fs";
import path from "path";

export interface SleepSchedule {
  weekdaySleep: string;
  weekdayWake: string;
  weekendDifferent: boolean;
  weekendSleep?: string;
  weekendWake?: string;
}

export interface RecurringBlock {
  id: string;
  title: string;
  type: 'College' | 'Work' | 'Personal' | 'Other';
  days: string[];
  startTime: string;
  endTime: string;
  location?: string;
  notes?: string;
}

export interface PreferredWorkingHours {
  startTime: string;
  endTime: string;
  preferredPeriods: string[];
}

export interface UserPlanningProfile {
  userId: string;
  onboardingCompleted: boolean;
  onboardingSkipped?: boolean;
  timezone: string;
  sleepSchedule: SleepSchedule;
  recurringBlocks: RecurringBlock[];
  preferredWorkingHours: PreferredWorkingHours;
  preferredPeriods: string[];
  dailyFocusCapacity: 'Less than 2 hours' | '2–4 hours' | '4–6 hours' | '6+ hours';
  planningStyle: 'Deep focus first' | 'Important tasks first' | 'Easier tasks first' | 'Balanced throughout the day';
  bufferMinutes: 5 | 10 | 15 | 30;
  dailyMajorTaskTarget: '1–2' | '3–4' | '5+';
  majorTasksPerDay: '1–2' | '3–4' | '5+';
  createdAt: string;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const PROFILES_FILE = path.join(DATA_DIR, "planning_profiles.json");

// In-memory cache backed by JSON file persistence
let profilesCache: Record<string, UserPlanningProfile> | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Could not create data directory:", e);
    }
  }
}

function loadProfiles(): Record<string, UserPlanningProfile> {
  if (profilesCache !== null) return profilesCache;
  ensureDataDir();
  if (fs.existsSync(PROFILES_FILE)) {
    try {
      const raw = fs.readFileSync(PROFILES_FILE, "utf-8");
      profilesCache = JSON.parse(raw);
      return profilesCache || {};
    } catch (e) {
      console.error("Failed to load profiles file, initializing empty:", e);
      profilesCache = {};
      return profilesCache;
    }
  }
  profilesCache = {};
  return profilesCache;
}

async function persistProfiles() {
  ensureDataDir();
  try {
    await fs.promises.writeFile(PROFILES_FILE, JSON.stringify(profilesCache || {}, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to persist profiles to disk:", e);
  }
}

export function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function doIntervalsOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  if (s1 === e1 || s2 === e2) return false;
  const spans1 = e1 > s1 ? [[s1, e1]] : [[s1, 1440], [0, e1]];
  const spans2 = e2 > s2 ? [[s2, e2]] : [[s2, 1440], [0, e2]];
  for (const [a1, b1] of spans1) {
    for (const [a2, b2] of spans2) {
      if (a1 < b2 && a2 < b1) return true;
    }
  }
  return false;
}

export function detectRecurringBlockOverlaps(blocks: RecurringBlock[]): Array<{ blockA: string; blockB: string; day: string }> {
  const overlaps: Array<{ blockA: string; blockB: string; day: string }> = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const b1 = blocks[i];
      const b2 = blocks[j];
      const commonDays = b1.days.filter(d => b2.days.includes(d));
      if (commonDays.length > 0) {
        const s1 = timeToMinutes(b1.startTime);
        const e1 = timeToMinutes(b1.endTime);
        const s2 = timeToMinutes(b2.startTime);
        const e2 = timeToMinutes(b2.endTime);
        if (doIntervalsOverlap(s1, e1, s2, e2)) {
          commonDays.forEach(day => {
            overlaps.push({ blockA: b1.title, blockB: b2.title, day });
          });
        }
      }
    }
  }
  return overlaps;
}

export function isValidTimeString(t: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(t);
}

export function validatePlanningProfile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data) {
    return { valid: false, errors: ["Missing profile data."] };
  }

  // Sleep schedule validation
  if (!data.sleepSchedule) {
    errors.push("Sleep schedule is required.");
  } else {
    const { weekdaySleep, weekdayWake, weekendDifferent, weekendSleep, weekendWake } = data.sleepSchedule;
    if (!weekdaySleep || !isValidTimeString(weekdaySleep)) {
      errors.push("Weekday sleep time must be in HH:mm format.");
    }
    if (!weekdayWake || !isValidTimeString(weekdayWake)) {
      errors.push("Weekday wake time must be in HH:mm format.");
    }
    if (weekdaySleep && weekdayWake && weekdaySleep === weekdayWake) {
      errors.push("Sleep time and wake time cannot be identical.");
    }
    if (weekendDifferent) {
      if (!weekendSleep || !isValidTimeString(weekendSleep)) {
        errors.push("Weekend sleep time must be in HH:mm format.");
      }
      if (!weekendWake || !isValidTimeString(weekendWake)) {
        errors.push("Weekend wake time must be in HH:mm format.");
      }
      if (weekendSleep && weekendWake && weekendSleep === weekendWake) {
        errors.push("Weekend sleep time and wake time cannot be identical.");
      }
    }
  }

  // Recurring blocks validation
  if (Array.isArray(data.recurringBlocks)) {
    for (let i = 0; i < data.recurringBlocks.length; i++) {
      const block = data.recurringBlocks[i];
      if (!block.title || !String(block.title).trim()) {
        errors.push(`Recurring block #${i + 1} must have a title.`);
      }
      if (!Array.isArray(block.days) || block.days.length === 0) {
        errors.push(`Recurring block "${block.title || `#${i + 1}`}" must have at least one day selected.`);
      }
      if (!block.startTime || !isValidTimeString(block.startTime)) {
        errors.push(`Recurring block "${block.title || `#${i + 1}`}" has an invalid start time.`);
      }
      if (!block.endTime || !isValidTimeString(block.endTime)) {
        errors.push(`Recurring block "${block.title || `#${i + 1}`}" has an invalid end time.`);
      }
      if (block.startTime && block.endTime && block.startTime === block.endTime) {
        errors.push(`Recurring block "${block.title || `#${i + 1}`}" cannot have identical start and end times.`);
      }
    }
  }

  // Preferred working hours validation
  if (data.preferredWorkingHours) {
    const { startTime, endTime } = data.preferredWorkingHours;
    if (startTime && !isValidTimeString(startTime)) {
      errors.push("Preferred focus start time has an invalid format.");
    }
    if (endTime && !isValidTimeString(endTime)) {
      errors.push("Preferred focus end time has an invalid format.");
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function getPlanningProfile(userId: string): Promise<UserPlanningProfile | null> {
  const store = loadProfiles();
  return store[userId] || null;
}

export async function savePlanningProfile(
  userId: string,
  data: Partial<UserPlanningProfile>
): Promise<UserPlanningProfile> {
  const store = loadProfiles();
  const existing = store[userId];
  const now = new Date().toISOString();

  const majorTaskTarget = data.dailyMajorTaskTarget || data.majorTasksPerDay || existing?.dailyMajorTaskTarget || existing?.majorTasksPerDay || "3–4";
  const preferredPeriods = data.preferredPeriods || data.preferredWorkingHours?.preferredPeriods || existing?.preferredPeriods || existing?.preferredWorkingHours?.preferredPeriods || ["Morning"];

  const profile: UserPlanningProfile = {
    userId,
    onboardingCompleted: data.onboardingSkipped
      ? false
      : (data.onboardingCompleted !== undefined
        ? Boolean(data.onboardingCompleted)
        : (existing ? existing.onboardingCompleted : false)),
    onboardingSkipped: data.onboardingSkipped ?? (existing ? existing.onboardingSkipped : false),
    timezone: data.timezone || (existing ? existing.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    sleepSchedule: data.sleepSchedule || (existing ? existing.sleepSchedule : {
      weekdaySleep: "23:00",
      weekdayWake: "07:00",
      weekendDifferent: false,
    }),
    recurringBlocks: Array.isArray(data.recurringBlocks) ? data.recurringBlocks : (existing?.recurringBlocks || []),
    preferredWorkingHours: data.preferredWorkingHours || (existing ? existing.preferredWorkingHours : {
      startTime: "09:00",
      endTime: "17:00",
      preferredPeriods,
    }),
    preferredPeriods,
    dailyFocusCapacity: data.dailyFocusCapacity || (existing ? existing.dailyFocusCapacity : "2–4 hours"),
    planningStyle: data.planningStyle || (existing ? existing.planningStyle : "Important tasks first"),
    bufferMinutes: data.bufferMinutes || (existing ? existing.bufferMinutes : 15),
    dailyMajorTaskTarget: majorTaskTarget,
    majorTasksPerDay: majorTaskTarget,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  store[userId] = profile;
  await persistProfiles();
  return profile;
}
