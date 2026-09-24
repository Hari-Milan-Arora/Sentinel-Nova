import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  Sparkles,
  Clock,
  Calendar,
  Moon,
  ShieldCheck,
  Edit3,
  Sliders,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Brain,
} from 'lucide-react';
import { usePlanningProfile } from '../context/PlanningProfileContext';
import { formatTime12 } from '../utils/scheduleUtils';
import WeeklyScheduleTimeline from '../components/onboarding/WeeklyScheduleTimeline';
import MemoryManagement from '../components/settings/MemoryManagement';

interface SettingsProps {
  user: { email: string; name: string; picture?: string } | null;
  onLogout: () => Promise<void>;
}

export default function Settings({ user, onLogout }: SettingsProps) {
  const navigate = useNavigate();
  const { profile, loading } = usePlanningProfile();
  const [activeTab, setActiveTab] = useState<'profile' | 'memory'>('profile');

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold text-white">Settings</h1>
        <p className="mt-2 text-sm text-slate-400">
          Account, planning rhythm, and Nova memory preferences.
        </p>
      </div>

      {/* Account Profile Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {user?.picture ? (
              <img src={user.picture} alt="" className="h-14 w-14 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-lg font-semibold text-violet-300">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : (user?.email ? user.email.slice(0, 2).toUpperCase() : 'SN')}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-white text-base">{user?.name || user?.email?.split('@')[0] || 'Authenticated User'}</p>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Active Session
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{user?.email || 'No email available'}</p>
            </div>
          </div>

          <button
            onClick={() => void onLogout()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/10 transition"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'profile'
              ? 'border-violet-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles size={14} className={activeTab === 'profile' ? 'text-violet-400' : ''} />
          <span>Planning Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('memory')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'memory'
              ? 'border-violet-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Brain size={14} className={activeTab === 'memory' ? 'text-violet-400' : ''} />
          <span>Nova Memory</span>
          <span className="rounded-full bg-violet-500/20 px-1.5 py-0.2 text-[10px] text-violet-300">
            Day 5B.3
          </span>
        </button>
      </div>

      {activeTab === 'memory' ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <MemoryManagement />
        </div>
      ) : (
        /* Planning Profile Section */
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Planning Profile</h2>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Your baseline schedule constraints and personal planning preferences.
              </p>
            </div>

            <button
              onClick={() => navigate('/app/onboarding?edit=true')}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 transition"
            >
              <Edit3 size={14} />
              <span>Edit planning profile</span>
            </button>
          </div>

          {/* Incomplete / Skipped Warning */}
          {profile && !profile.onboardingCompleted && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-300">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Planning profile is incomplete</p>
                <p className="mt-0.5 text-amber-400/80 leading-relaxed">
                  Nova is operating without your verified baseline schedule. Complete your profile to unlock realistic workload scheduling and prevent conflicts.
                </p>
                <button
                  onClick={() => navigate('/app/onboarding')}
                  className="mt-2 text-xs font-semibold text-amber-200 underline underline-offset-2 hover:text-white"
                >
                  Complete profile setup →
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Loading planning profile…
            </div>
          ) : profile ? (
            <div className="space-y-6">
              {/* 3 Overview Columns */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* 1. Schedule */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                    <Moon size={14} />
                    <span>Sleep & Rest Schedule</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500">Weekdays:</span>
                      <p className="font-medium text-white">
                        {formatTime12(profile.sleepSchedule.weekdaySleep)} – {formatTime12(profile.sleepSchedule.weekdayWake)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Weekends:</span>
                      <p className="font-medium text-white">
                        {profile.sleepSchedule.weekendDifferent && profile.sleepSchedule.weekendSleep && profile.sleepSchedule.weekendWake
                          ? `${formatTime12(profile.sleepSchedule.weekendSleep)} – ${formatTime12(profile.sleepSchedule.weekendWake)}`
                          : 'Same as weekdays'}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-slate-500">Fixed Commitments:</span>
                      <p className="font-medium text-white">
                        {profile.recurringBlocks.length} recurring block{profile.recurringBlocks.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Working Hours */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
                    <Clock size={14} />
                    <span>Working Hours</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500">Preferred Focus Window:</span>
                      <p className="font-medium text-white">
                        {formatTime12(profile.preferredWorkingHours.startTime)} – {formatTime12(profile.preferredWorkingHours.endTime)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Peak Periods:</span>
                      <p className="font-medium text-white truncate">
                        {profile.preferredWorkingHours.preferredPeriods.join(', ')}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-slate-500">Daily Target:</span>
                      <p className="font-medium text-white">{profile.dailyFocusCapacity}</p>
                    </div>
                  </div>
                </div>

                {/* 3. Planning Preferences */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <Sliders size={14} />
                    <span>Planning Preferences</span>
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500">Sequencing Style:</span>
                      <p className="font-medium text-white truncate">{profile.planningStyle}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Transition Buffer:</span>
                      <p className="font-medium text-white">{profile.bufferMinutes} minutes</p>
                    </div>
                    <div className="pt-2 border-t border-slate-800/80">
                      <span className="text-slate-500">Target Major Tasks:</span>
                      <p className="font-medium text-white">{profile.majorTasksPerDay} / day</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Timeline in Settings */}
              <div className="pt-2">
                <WeeklyScheduleTimeline
                  sleep={profile.sleepSchedule}
                  recurringBlocks={profile.recurringBlocks}
                  preferredHours={profile.preferredWorkingHours}
                  interactive={false}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
              <p className="text-xs text-slate-400">No planning profile configured yet.</p>
              <button
                onClick={() => navigate('/app/onboarding')}
                className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white"
              >
                Set up my schedule
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
