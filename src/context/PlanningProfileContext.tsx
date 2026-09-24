import React from 'react';
import { UserPlanningProfile } from '../types';
import { useAuth } from '../auth/AuthContext';

interface PlanningProfileContextValue {
  profile: UserPlanningProfile | null;
  loading: boolean;
  error: string | null;
  saveProfile: (data: Partial<UserPlanningProfile>) => Promise<UserPlanningProfile>;
  skipOnboarding: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const PlanningProfileContext = React.createContext<PlanningProfileContextValue | null>(null);

export function PlanningProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = React.useState<UserPlanningProfile | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const refreshProfile = React.useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/profile/planning', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to fetch planning profile');
      }
      const data = await res.json();
      setProfile(data.profile ?? null);
      setError(null);
    } catch (err) {
      console.error('Error loading planning profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const saveProfile = React.useCallback(async (data: Partial<UserPlanningProfile>): Promise<UserPlanningProfile> => {
    setError(null);
    const res = await fetch('/api/profile/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    const resData = await res.json();
    if (!res.ok) {
      const msg = resData.error || 'Failed to save planning profile';
      setError(msg);
      throw new Error(msg);
    }

    setProfile(resData.profile);
    return resData.profile;
  }, []);

  const skipOnboarding = React.useCallback(async () => {
    await saveProfile({
      onboardingCompleted: false,
      onboardingSkipped: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
  }, [saveProfile]);

  return (
    <PlanningProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        saveProfile,
        skipOnboarding,
        refreshProfile,
      }}
    >
      {children}
    </PlanningProfileContext.Provider>
  );
}

export function usePlanningProfile() {
  const ctx = React.useContext(PlanningProfileContext);
  if (!ctx) {
    throw new Error('usePlanningProfile must be used within PlanningProfileProvider');
  }
  return ctx;
}
