import fs from "fs";
import path from "path";

export interface GoogleCalendar {
  id: string;
  name: string;
  description?: string;
  primary?: boolean;
  selected: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  accessRole?: string;
  timeZone?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  calendarName?: string;
  calendarColor?: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  recurring?: boolean;
  location?: string;
  transparency?: 'opaque' | 'transparent';
}

export type CalendarConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'disconnected';

export interface CalendarStatusResponse {
  status: CalendarConnectionStatus;
  connectedEmail?: string | null;
  connectedAt?: string | null;
  lastSync?: string | null;
  selectedCalendarIds: string[];
  calendarCount: number;
  error?: string | null;
}

export interface UserCalendarState {
  userId: string;
  status: CalendarConnectionStatus;
  connectedEmail?: string | null;
  connectedAt?: string | null;
  lastSync?: string | null;
  selectedCalendarIds: string[];
  calendars: GoogleCalendar[];
  cachedEvents: CalendarEvent[];
  error?: string | null;
  updatedAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CALENDAR_FILE = path.join(DATA_DIR, "calendar.json");

// In-memory token cache: sensitive OAuth tokens are NEVER saved to disk or JSON
const inMemoryTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

let calendarStoreCache: Record<string, UserCalendarState> | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error("Could not create data directory:", e);
    }
  }
}

function loadCalendarData(): Record<string, UserCalendarState> {
  if (calendarStoreCache !== null) return calendarStoreCache;
  ensureDataDir();

  if (!fs.existsSync(CALENDAR_FILE)) {
    calendarStoreCache = {};
    return calendarStoreCache;
  }

  try {
    const raw = fs.readFileSync(CALENDAR_FILE, "utf-8");
    calendarStoreCache = JSON.parse(raw);
  } catch (e) {
    console.error("Failed to read calendar data file, resetting:", e);
    calendarStoreCache = {};
  }

  return calendarStoreCache || {};
}

function saveCalendarData() {
  ensureDataDir();
  try {
    fs.writeFileSync(CALENDAR_FILE, JSON.stringify(calendarStoreCache || {}, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save calendar data file:", e);
  }
}

function getOrCreateUserState(userId: string): UserCalendarState {
  const store = loadCalendarData();
  if (!store[userId]) {
    store[userId] = {
      userId,
      status: 'not_connected',
      connectedEmail: null,
      connectedAt: null,
      lastSync: null,
      selectedCalendarIds: [],
      calendars: [],
      cachedEvents: [],
      error: null,
      updatedAt: new Date().toISOString(),
    };
    saveCalendarData();
  }
  return store[userId];
}

export function getUserCalendarStatus(userId: string): CalendarStatusResponse {
  const state = getOrCreateUserState(userId);
  return {
    status: state.status,
    connectedEmail: state.connectedEmail,
    connectedAt: state.connectedAt,
    lastSync: state.lastSync,
    selectedCalendarIds: state.selectedCalendarIds || [],
    calendarCount: state.calendars ? state.calendars.length : 0,
    error: state.error,
  };
}

export function getCalendars(userId: string): GoogleCalendar[] {
  const state = getOrCreateUserState(userId);
  const selectedSet = new Set(state.selectedCalendarIds || []);
  return (state.calendars || []).map(cal => ({
    ...cal,
    selected: selectedSet.has(cal.id),
  }));
}

export function updateCalendarSelection(userId: string, selectedCalendarIds: string[]): GoogleCalendar[] {
  const state = getOrCreateUserState(userId);
  // Ensure selected IDs only refer to existing calendars for this user
  const validIds = (state.calendars || []).map(c => c.id);
  const filtered = selectedCalendarIds.filter(id => validIds.includes(id));

  state.selectedCalendarIds = filtered;
  state.updatedAt = new Date().toISOString();
  saveCalendarData();

  return getCalendars(userId);
}

export function disconnectCalendar(userId: string): void {
  const state = getOrCreateUserState(userId);
  inMemoryTokenCache.delete(userId);

  state.status = 'disconnected';
  state.cachedEvents = [];
  state.error = null;
  state.lastSync = null;
  state.updatedAt = new Date().toISOString();
  saveCalendarData();
}

export async function connectCalendar(
  userId: string,
  accessToken: string,
  userEmail?: string
): Promise<{ success: boolean; calendars: GoogleCalendar[]; error?: string }> {
  const state = getOrCreateUserState(userId);

  if (!accessToken || typeof accessToken !== 'string' || !accessToken.trim()) {
    return { success: false, calendars: [], error: 'Valid Google OAuth access token is required.' };
  }

  try {
    // 1. Validate token and retrieve user's calendar list from Google Calendar API
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      let msg = "Google Calendar authorization failed.";
      try {
        const parsed = JSON.parse(errBody);
        msg = parsed.error?.message || msg;
      } catch {}
      state.status = 'error';
      state.error = msg;
      state.updatedAt = new Date().toISOString();
      saveCalendarData();
      return { success: false, calendars: [], error: msg };
    }

    const data = await response.json() as { items?: any[] };
    const items = data.items || [];

    const calendars: GoogleCalendar[] = items.map(item => ({
      id: item.id,
      name: item.summary || item.id,
      description: item.description,
      primary: !!item.primary,
      selected: !!item.primary,
      backgroundColor: item.backgroundColor || '#6366f1',
      foregroundColor: item.foregroundColor || '#ffffff',
      accessRole: item.accessRole,
      timeZone: item.timeZone,
    }));

    // Default selection: primary calendar, or first if no primary found
    let initialSelected = calendars.filter(c => c.primary).map(c => c.id);
    if (initialSelected.length === 0 && calendars.length > 0) {
      initialSelected = [calendars[0].id];
      calendars[0].selected = true;
    }

    // Save token securely in memory only
    inMemoryTokenCache.set(userId, {
      accessToken,
      expiresAt: Date.now() + 3500 * 1000,
    });

    const now = new Date().toISOString();
    state.status = 'connected';
    state.connectedEmail = userEmail || state.connectedEmail || null;
    state.connectedAt = state.connectedAt || now;
    state.lastSync = now;
    state.calendars = calendars;
    state.selectedCalendarIds = initialSelected;
    state.error = null;
    state.updatedAt = now;
    saveCalendarData();

    // Trigger initial event sync in background (non-blocking)
    void syncCalendarEvents(userId).catch(e => console.error("Initial calendar sync error:", e));

    return { success: true, calendars: getCalendars(userId) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to connect Google Calendar.";
    state.status = 'error';
    state.error = errorMsg;
    state.updatedAt = new Date().toISOString();
    saveCalendarData();
    return { success: false, calendars: [], error: errorMsg };
  }
}

export async function syncCalendarEvents(
  userId: string,
  timeMinParam?: string,
  timeMaxParam?: string,
  timeZoneParam?: string
): Promise<{ events: CalendarEvent[]; error?: string }> {
  const state = getOrCreateUserState(userId);
  const tokenRecord = inMemoryTokenCache.get(userId);

  if (!tokenRecord || Date.now() >= tokenRecord.expiresAt) {
    // If not connected or token expired
    if (state.status === 'connected') {
      state.status = 'error';
      state.error = 'Google authorization expired. Please reconnect.';
      saveCalendarData();
    }
    return {
      events: state.cachedEvents || [],
      error: 'Google authorization expired. Please reconnect your calendar.',
    };
  }

  const selectedCalendarIds = state.selectedCalendarIds && state.selectedCalendarIds.length > 0
    ? state.selectedCalendarIds
    : (state.calendars || []).slice(0, 1).map(c => c.id);

  if (selectedCalendarIds.length === 0) {
    return { events: [] };
  }

  // Bounded date range: default to yesterday until 14 days from today
  const now = new Date();
  const defaultMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const defaultMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const timeMin = timeMinParam || defaultMin;
  const timeMax = timeMaxParam || defaultMax;

  const collectedEvents: CalendarEvent[] = [];
  const calendarMap = new Map((state.calendars || []).map(c => [c.id, c]));

  for (const calId of selectedCalendarIds) {
    try {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true"); // automatically expands recurring events!
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");
      if (timeZoneParam) {
        url.searchParams.set("timeZone", timeZoneParam);
      }

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${tokenRecord.accessToken}`,
        },
      });

      if (!res.ok) {
        console.warn(`Could not fetch events for calendar ${calId}: status ${res.status}`);
        continue;
      }

      const data = await res.json() as { items?: any[] };
      const items = data.items || [];
      const calInfo = calendarMap.get(calId);

      for (const item of items) {
        if (item.status === 'cancelled') continue;

        let start = '';
        let end = '';
        let allDay = false;

        if (item.start?.date) {
          allDay = true;
          start = `${item.start.date}T00:00:00.000Z`;
          end = item.end?.date ? `${item.end.date}T00:00:00.000Z` : `${item.start.date}T23:59:59.999Z`;
        } else if (item.start?.dateTime) {
          allDay = false;
          start = item.start.dateTime;
          end = item.end?.dateTime || item.start.dateTime;
        } else {
          continue;
        }

        collectedEvents.push({
          id: item.id || `evt_${Math.random()}`,
          calendarId: calId,
          calendarName: calInfo?.name || calId,
          calendarColor: calInfo?.backgroundColor || '#6366f1',
          title: item.summary || '(Untitled Event)',
          description: item.description,
          start,
          end,
          allDay,
          status: item.status || 'confirmed',
          recurring: !!item.recurringEventId,
          location: item.location,
          transparency: item.transparency === 'transparent' ? 'transparent' : 'opaque',
        });
      }
    } catch (err) {
      console.warn(`Error fetching events for calendar ${calId}:`, err);
    }
  }

  // Update cached events for user
  state.cachedEvents = collectedEvents;
  state.lastSync = new Date().toISOString();
  state.status = 'connected';
  state.error = null;
  state.updatedAt = new Date().toISOString();
  saveCalendarData();

  return { events: collectedEvents };
}

export function getCachedEvents(userId: string, timeMin?: string, timeMax?: string): CalendarEvent[] {
  const state = getOrCreateUserState(userId);
  const events = state.cachedEvents || [];
  if (!timeMin && !timeMax) return events;

  return events.filter(evt => {
    if (timeMin && evt.end < timeMin) return false;
    if (timeMax && evt.start > timeMax) return false;
    return true;
  });
}
