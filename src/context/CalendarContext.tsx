import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  CalendarConnectionStatus,
  CalendarEvent,
  GoogleCalendar,
  AvailabilityResult,
} from '../types';
import { useAuth } from '../auth/AuthContext';
import { usePlanningProfile } from './PlanningProfileContext';
import { useTasks } from './TaskContext';
import { calculateAvailability } from '../utils/availabilityEngine';

interface CalendarContextType {
  status: CalendarConnectionStatus;
  connectedEmail: string | null;
  connectedAt: string | null;
  lastSync: string | null;
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  events: CalendarEvent[];
  selectedDate: string;
  availability: AvailabilityResult | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  connectCalendar: () => Promise<void>;
  disconnectCalendar: () => Promise<void>;
  toggleCalendarSelection: (calendarId: string) => Promise<void>;
  refreshEvents: () => Promise<void>;
  setSelectedDate: (dateStr: string) => void;
  clearError: () => void;
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined);

export const CalendarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { profile } = usePlanningProfile();
  const { tasks } = useTasks();

  const [status, setStatus] = useState<CalendarConnectionStatus>('not_connected');
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch calendar status and initial calendar list from server
  const fetchStatusAndCalendars = useCallback(async () => {
    if (!user) {
      setStatus('not_connected');
      setCalendars([]);
      setSelectedCalendarIds([]);
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const statusRes = await fetch('/api/calendar/status', { credentials: 'include' });
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data.status || 'not_connected');
        setConnectedEmail(data.connectedEmail || user.email);
        setConnectedAt(data.connectedAt || null);
        setLastSync(data.lastSync || null);
        setSelectedCalendarIds(data.selectedCalendarIds || []);
        if (data.error) setError(data.error);
      }

      const calRes = await fetch('/api/calendar/calendars', { credentials: 'include' });
      if (calRes.ok) {
        const calData = await calRes.json();
        setCalendars(calData.calendars || []);
      }

      // Fetch cached events
      const eventsRes = await fetch('/api/calendar/events', { credentials: 'include' });
      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setEvents(eventsData.events || []);
      }
    } catch (err) {
      console.error('Failed to load calendar data:', err);
      setError('Unable to load calendar state.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchStatusAndCalendars();
  }, [fetchStatusAndCalendars]);

  // Connect via Google Identity Services Token Client
  const connectCalendar = useCallback(async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google Calendar is not configured yet.');
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setError('Google Identity Services library is still loading. Please try again in a moment.');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            setError(tokenResponse.error_description || tokenResponse.error || 'Google Calendar authorization failed.');
            setStatus('error');
            return;
          }

          if (!tokenResponse.access_token) {
            setError('Did not receive access token from Google.');
            setStatus('error');
            return;
          }

          await connectWithToken(tokenResponse.access_token);
        },
        error_callback: (err: any) => {
          setError(err?.message || 'Google authorization dialog closed or interrupted.');
          setStatus('error');
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch Google authorization.');
      setStatus('error');
    }
  }, [user]);

  // Send token to server
  const connectWithToken = useCallback(async (token: string) => {
    setStatus('connecting');
    setError(null);
    try {
      const res = await fetch('/api/calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accessToken: token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to connect Google Calendar.');
      }

      setStatus(data.status?.status || 'connected');
      setConnectedEmail(data.status?.connectedEmail || user?.email || null);
      setConnectedAt(data.status?.connectedAt || new Date().toISOString());
      setLastSync(data.status?.lastSync || new Date().toISOString());
      setCalendars(data.calendars || []);
      setSelectedCalendarIds(data.status?.selectedCalendarIds || []);

      // Trigger fresh events fetch
      await refreshEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Google Calendar.');
      setStatus('error');
    }
  }, [user]);

  // Disconnect calendar
  const disconnectCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to disconnect calendar.');

      setStatus('disconnected');
      setEvents([]);
      setLastSync(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Toggle calendar selection
  const toggleCalendarSelection = useCallback(async (calendarId: string) => {
    const nextSelected = selectedCalendarIds.includes(calendarId)
      ? selectedCalendarIds.filter(id => id !== calendarId)
      : [...selectedCalendarIds, calendarId];

    setSelectedCalendarIds(nextSelected);

    try {
      const res = await fetch('/api/calendar/calendars/selection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ selectedCalendarIds: nextSelected }),
      });
      if (res.ok) {
        const data = await res.json();
        setCalendars(data.calendars || []);
        // Trigger background refresh of events
        void refreshEvents();
      }
    } catch (err) {
      console.error('Failed to update calendar selection:', err);
    }
  }, [selectedCalendarIds]);

  // Refresh events from Google Calendar API
  const refreshEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/calendar/events?refresh=true', { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setEvents(data.events || []);
        setLastSync(new Date().toISOString());
        setError(null);
      } else if (data.error) {
        setError(data.error);
        if (res.status === 401) {
          setStatus('error');
        }
      }
    } catch (err) {
      console.error('Failed to refresh events:', err);
    }
  }, []);

  // Compute availability deterministically using Availability Engine
  const availability = React.useMemo(() => {
    return calculateAvailability({
      dateStr: selectedDate,
      profile,
      events,
      selectedCalendarIds,
      tasks,
    });
  }, [selectedDate, profile, events, selectedCalendarIds, tasks]);

  const clearError = useCallback(() => setError(null), []);

  return (
    <CalendarContext.Provider
      value={{
        status,
        connectedEmail,
        connectedAt,
        lastSync,
        calendars,
        selectedCalendarIds,
        events,
        selectedDate,
        availability,
        loading,
        error,
        isConfigured: Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID),
        connectCalendar,
        disconnectCalendar,
        toggleCalendarSelection,
        refreshEvents,
        setSelectedDate,
        clearError,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context) {
    throw new Error('useCalendar must be used inside CalendarProvider');
  }
  return context;
}
