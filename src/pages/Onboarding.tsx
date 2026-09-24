import React from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Moon,
  Sun,
  Plus,
  Trash2,
  Copy,
  Edit2,
  Clock,
  Calendar,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Target,
  Layers,
  GraduationCap,
  Briefcase,
  User,
  Tag,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { usePlanningProfile } from '../context/PlanningProfileContext';
import {
  SleepSchedule,
  RecurringBlock,
  PreferredWorkingHours,
  DailyFocusCapacity,
  PlanningStyle,
  BufferMinutes,
  MajorTasksPerDay,
  PreferredPeriod,
  UserPlanningProfile,
} from '../types';
import WeeklyScheduleTimeline from '../components/onboarding/WeeklyScheduleTimeline';
import CommitmentModal from '../components/onboarding/CommitmentModal';
import { formatTime12, calculateDurationHours } from '../utils/scheduleUtils';

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';

  const { profile, loading: profileLoading, saveProfile, skipOnboarding } = usePlanningProfile();

  React.useEffect(() => {
    if (!profileLoading && profile?.onboardingCompleted && !isEditMode) {
      navigate('/app', { replace: true });
    }
  }, [profileLoading, profile, isEditMode, navigate]);

  // Step state (1 to 7)
  // If editing existing profile, start at step 2 or 6, or step 2 so they can review all steps
  const [step, setStep] = React.useState<number>(isEditMode ? 2 : 1);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form State
  const [sleep, setSleep] = React.useState<SleepSchedule>({
    weekdaySleep: '23:00',
    weekdayWake: '07:00',
    weekendDifferent: false,
    weekendSleep: '00:00',
    weekendWake: '08:30',
  });

  const [recurringBlocks, setRecurringBlocks] = React.useState<RecurringBlock[]>([]);

  const [preferredHours, setPreferredHours] = React.useState<PreferredWorkingHours>({
    startTime: '09:00',
    endTime: '17:00',
    preferredPeriods: ['Morning', 'Afternoon'],
  });

  const [dailyFocusCapacity, setDailyFocusCapacity] = React.useState<DailyFocusCapacity>('2–4 hours');
  const [planningStyle, setPlanningStyle] = React.useState<PlanningStyle>('Important tasks first');
  const [bufferMinutes, setBufferMinutes] = React.useState<BufferMinutes>(15);
  const [majorTasksPerDay, setMajorTasksPerDay] = React.useState<MajorTasksPerDay>('3–4');

  // Commitment Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingBlock, setEditingBlock] = React.useState<RecurringBlock | null>(null);

  // Initialize from existing profile if available
  React.useEffect(() => {
    if (profile) {
      if (profile.sleepSchedule) setSleep(profile.sleepSchedule);
      if (Array.isArray(profile.recurringBlocks)) setRecurringBlocks(profile.recurringBlocks);
      if (profile.preferredWorkingHours) setPreferredHours(profile.preferredWorkingHours);
      if (profile.dailyFocusCapacity) setDailyFocusCapacity(profile.dailyFocusCapacity);
      if (profile.planningStyle) setPlanningStyle(profile.planningStyle);
      if (profile.bufferMinutes) setBufferMinutes(profile.bufferMinutes);
      if (profile.majorTasksPerDay) setMajorTasksPerDay(profile.majorTasksPerDay);
    }
  }, [profile]);

  // Handle Commitment Actions
  const handleOpenAddModal = () => {
    setEditingBlock(null);
    setModalOpen(true);
  };

  const handleOpenEditModal = (block: RecurringBlock) => {
    setEditingBlock(block);
    setModalOpen(true);
  };

  const handleSaveBlock = (block: RecurringBlock) => {
    setRecurringBlocks(prev => {
      const idx = prev.findIndex(b => b.id === block.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = block;
        return next;
      }
      return [...prev, block];
    });
  };

  const handleDeleteBlock = (blockId: string) => {
    setRecurringBlocks(prev => prev.filter(b => b.id !== blockId));
  };

  const handleDuplicateBlock = (block: RecurringBlock) => {
    const duplicated: RecurringBlock = {
      ...block,
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: `${block.title} (Copy)`,
    };
    setRecurringBlocks(prev => [...prev, duplicated]);
  };

  // Skip Onboarding handler
  const handleSkip = async () => {
    setSaving(true);
    try {
      await skipOnboarding();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip onboarding');
    } finally {
      setSaving(false);
    }
  };

  // Final Save Handler
  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveProfile({
        onboardingCompleted: true,
        onboardingSkipped: false,
        sleepSchedule: sleep,
        recurringBlocks,
        preferredWorkingHours: preferredHours,
        preferredPeriods: preferredHours.preferredPeriods,
        dailyFocusCapacity,
        planningStyle,
        bufferMinutes,
        dailyMajorTaskTarget: majorTasksPerDay,
        majorTasksPerDay,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });

      if (isEditMode) {
        navigate('/app/settings', { replace: true });
      } else {
        navigate('/app', { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  // Step validation
  const validateCurrentStep = (): boolean => {
    setError(null);
    if (step === 2) {
      if (!sleep.weekdaySleep || !sleep.weekdayWake) {
        setError('Please choose your weekday sleep and wake-up times.');
        return false;
      }
      if (sleep.weekdaySleep === sleep.weekdayWake) {
        setError('Sleep time and wake-up time cannot be identical.');
        return false;
      }
      if (sleep.weekendDifferent) {
        if (!sleep.weekendSleep || !sleep.weekendWake) {
          setError('Please choose your weekend sleep and wake-up times.');
          return false;
        }
        if (sleep.weekendSleep === sleep.weekendWake) {
          setError('Weekend sleep and wake-up times cannot be identical.');
          return false;
        }
      }
    }
    if (step === 4) {
      if (preferredHours.startTime && preferredHours.endTime && preferredHours.startTime === preferredHours.endTime) {
        setError('Focus start and end times cannot be identical.');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateCurrentStep()) {
      setStep(prev => Math.min(prev + 1, 7));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    setError(null);
    setStep(prev => Math.max(prev - 1, isEditMode ? 2 : 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Total Steps count
  const totalSteps = 7;
  const progressPercent = Math.round((step / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-md shadow-violet-950">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-tight text-white">Sentinel Nova</span>
              <span className="ml-2 rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                {isEditMode ? 'Settings' : 'Onboarding'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isEditMode ? (
              <button
                onClick={() => navigate('/app/settings')}
                className="text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel & Return
              </button>
            ) : (
              step > 1 && (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={saving}
                  className="text-xs font-medium text-slate-500 hover:text-slate-300"
                >
                  Skip for now
                </button>
              )
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {step > 1 && (
          <div className="h-1 w-full bg-slate-900">
            <div
              className="h-full bg-violet-500 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </header>

      {/* Main Form Container */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:py-12 sm:px-8">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 1: WELCOME SCREEN                                  */}
        {/* ====================================================== */}
        {step === 1 && (
          <div className="py-6 sm:py-10 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3.5 py-1 text-xs font-medium text-violet-300">
              <Sparkles size={14} />
              <span>Step 1 • Getting Started</span>
            </div>

            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Let's build your personal planning rhythm.
            </h1>

            <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg">
              Nova needs to understand how your time normally works before it can plan around it.
            </p>

            <div className="mt-8 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Avoid unrealistic schedules</h4>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    By learning when you sleep, attend class, or work, Nova guarantees it will never schedule tasks during unavailable times.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-violet-500/10 p-2 text-violet-400">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Hard constraints vs. soft preferences</h4>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Your fixed commitments remain locked. Nova only optimizes flexible hours to match your natural energy and focus style.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-sky-500/10 p-2 text-sky-400">
                  <Calendar size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Foundation for calendar integration</h4>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    This baseline works alongside your Google Calendar events without turning your calendar into an unmanageable to-do list.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-violet-900/30 hover:bg-violet-500 transition active:scale-[0.99]"
              >
                <span>Set up my schedule</span>
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 px-5 py-3.5 text-sm font-medium text-slate-400 hover:bg-slate-900 hover:text-white transition"
              >
                <span>Skip for now</span>
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              Note: Skipping marks your profile as incomplete. Nova will prompt you to provide your baseline schedule before generating optimized timelines.
            </p>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 2: SLEEP / REST                                    */}
        {/* ====================================================== */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Step 2 of 7 • Baseline Constraints
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                When do you sleep and recharge?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Sleep represents hard unavailable time. Nova will never schedule work or alert you during these hours. Overnight schedules are fully supported.
              </p>
            </div>

            {/* Schedule Pattern Toggle */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <label className="text-xs font-medium text-slate-300">Schedule Consistency</label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSleep(prev => ({ ...prev, weekendDifferent: false }))}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                    !sleep.weekendDifferent
                      ? 'border-violet-500 bg-violet-600/10 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-semibold">Same every day</span>
                  <span className="mt-1 text-xs text-slate-500">Consistent weekday & weekend sleep</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSleep(prev => ({ ...prev, weekendDifferent: true }))}
                  className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
                    sleep.weekendDifferent
                      ? 'border-violet-500 bg-violet-600/10 text-white'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="text-sm font-semibold">Different on weekends</span>
                  <span className="mt-1 text-xs text-slate-500">Adjusted hours for Saturday & Sunday</span>
                </button>
              </div>
            </div>

            {/* Weekday Times */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">
                  {sleep.weekendDifferent ? 'Weekday Sleep (Monday – Friday)' : 'Daily Sleep'}
                </h4>
                <span className="text-xs font-medium text-indigo-300">
                  {calculateDurationHours(sleep.weekdaySleep, sleep.weekdayWake)} hrs rest
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-400">Usual sleep start time</label>
                  <div className="relative mt-1.5">
                    <Moon className="absolute left-3 top-3 text-indigo-400" size={15} />
                    <input
                      type="time"
                      value={sleep.weekdaySleep}
                      onChange={e => setSleep(prev => ({ ...prev, weekdaySleep: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Typically around {formatTime12(sleep.weekdaySleep)}
                  </p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400">Usual wake-up time</label>
                  <div className="relative mt-1.5">
                    <Sun className="absolute left-3 top-3 text-amber-400" size={15} />
                    <input
                      type="time"
                      value={sleep.weekdayWake}
                      onChange={e => setSleep(prev => ({ ...prev, weekdayWake: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Typically around {formatTime12(sleep.weekdayWake)}
                  </p>
                </div>
              </div>
            </div>

            {/* Weekend Times (if different) */}
            {sleep.weekendDifferent && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Weekend Sleep (Saturday & Sunday)</h4>
                  <span className="text-xs font-medium text-indigo-300">
                    {calculateDurationHours(sleep.weekendSleep || '00:00', sleep.weekendWake || '08:30')} hrs rest
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-400">Weekend sleep start</label>
                    <div className="relative mt-1.5">
                      <Moon className="absolute left-3 top-3 text-indigo-400" size={15} />
                      <input
                        type="time"
                        value={sleep.weekendSleep || '00:00'}
                        onChange={e => setSleep(prev => ({ ...prev, weekendSleep: e.target.value }))}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Typically around {formatTime12(sleep.weekendSleep || '00:00')}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-400">Weekend wake-up</label>
                    <div className="relative mt-1.5">
                      <Sun className="absolute left-3 top-3 text-amber-400" size={15} />
                      <input
                        type="time"
                        value={sleep.weekendWake || '08:30'}
                        onChange={e => setSleep(prev => ({ ...prev, weekendWake: e.target.value }))}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Typically around {formatTime12(sleep.weekendWake || '08:30')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 3: COLLEGE / WORK / FIXED COMMITMENTS              */}
        {/* ====================================================== */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Step 3 of 7 • Fixed Commitments
                </div>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  What fixed commitments shape your week?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Add recurring obligations like college classes, work shifts, commutes, or team practices. You can edit, delete, or duplicate these anytime.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500"
              >
                <Plus size={15} />
                <span>Add Commitment</span>
              </button>
            </div>

            {/* Commitments List */}
            {recurringBlocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-slate-400">
                  <Calendar size={22} />
                </div>
                <h4 className="mt-4 text-sm font-semibold text-slate-200">No recurring commitments added yet</h4>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">
                  If you have regular class lectures, lab shifts, or work hours, add them here so Nova can work around them. If your schedule is completely flexible, you can continue without adding any.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddModal}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  <Plus size={14} />
                  <span>Add First Commitment</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {recurringBlocks.map(block => {
                  const dur = calculateDurationHours(block.startTime, block.endTime);
                  return (
                    <div
                      key={block.id}
                      className="group flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 rounded-xl bg-slate-800 p-2.5 text-slate-300">
                          {block.type === 'College' && <GraduationCap size={16} className="text-sky-400" />}
                          {block.type === 'Work' && <Briefcase size={16} className="text-emerald-400" />}
                          {block.type === 'Personal' && <User size={16} className="text-purple-400" />}
                          {block.type === 'Other' && <Tag size={16} className="text-amber-400" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white">{block.title}</h4>
                            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                              {block.type}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>{block.days.map(d => d.slice(0, 3)).join(', ')}</span>
                            <span>•</span>
                            <span>
                              {formatTime12(block.startTime)} – {formatTime12(block.endTime)} ({dur}h)
                            </span>
                            {block.location && (
                              <>
                                <span>•</span>
                                <span className="text-slate-500">{block.location}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleDuplicateBlock(block)}
                          title="Duplicate"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(block)}
                          title="Edit"
                          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(block.id)}
                          title="Delete"
                          className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 4: PREFERRED WORKING HOURS                         */}
        {/* ====================================================== */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Step 4 of 7 • Focus Windows
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                When do you prefer to do focused work?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These are soft preferences. Nova uses this window to place high-impact deep work and protect your natural peak hours without enforcing rigid limits.
              </p>
            </div>

            {/* Preferred focus window */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-white">Preferred Focus Hours</h4>
                <span className="text-xs text-violet-300">
                  {calculateDurationHours(preferredHours.startTime, preferredHours.endTime)} hr window
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-slate-400">Focus Window Start</label>
                  <div className="relative mt-1.5">
                    <Clock className="absolute left-3 top-3 text-violet-400" size={15} />
                    <input
                      type="time"
                      value={preferredHours.startTime}
                      onChange={e => setPreferredHours(prev => ({ ...prev, startTime: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400">Focus Window End</label>
                  <div className="relative mt-1.5">
                    <Clock className="absolute left-3 top-3 text-violet-400" size={15} />
                    <input
                      type="time"
                      value={preferredHours.endTime}
                      onChange={e => setPreferredHours(prev => ({ ...prev, endTime: e.target.value }))}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white focus:border-violet-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Preferred Period Chips */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <label className="text-xs font-medium text-slate-300">Peak Energy Periods</label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {(['Morning', 'Afternoon', 'Evening', 'No strong preference'] as PreferredPeriod[]).map(period => {
                  const isSelected = preferredHours.preferredPeriods.includes(period);
                  return (
                    <button
                      key={period}
                      type="button"
                      onClick={() => {
                        setPreferredHours(prev => {
                          if (period === 'No strong preference') {
                            return { ...prev, preferredPeriods: ['No strong preference'] };
                          }
                          const filtered = prev.preferredPeriods.filter(p => p !== 'No strong preference');
                          const exists = filtered.includes(period);
                          const nextPeriods = exists
                            ? filtered.filter(p => p !== period)
                            : [...filtered, period];
                          return {
                            ...prev,
                            preferredPeriods: nextPeriods.length ? nextPeriods : ['No strong preference'],
                          };
                        });
                      }}
                      className={`rounded-xl border py-3 px-2 text-xs font-medium text-center transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-600/15 text-violet-200'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {period}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Focus Capacity */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  How much focused work feels realistic in a normal day?
                </label>
                <span className="text-[11px] text-slate-500">Soft preference</span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['Less than 2 hours', '2–4 hours', '4–6 hours', '6+ hours'] as DailyFocusCapacity[]).map(cap => {
                  const isSelected = dailyFocusCapacity === cap;
                  return (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => setDailyFocusCapacity(cap)}
                      className={`rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-600/15 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-sm font-semibold">{cap}</div>
                      <div className="mt-1 text-[10px] text-slate-500">
                        {cap === 'Less than 2 hours' && 'Maintenance'}
                        {cap === '2–4 hours' && 'Balanced & steady'}
                        {cap === '4–6 hours' && 'High intensity'}
                        {cap === '6+ hours' && 'Deep immersion'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 5: PLANNING PREFERENCES                            */}
        {/* ====================================================== */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Step 5 of 7 • Execution Strategy
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                How should Nova structure your day?
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                These preferences guide Nova's schedule formulation. They will influence sequencing and recovery buffers without conflicting with hard calendar appointments.
              </p>
            </div>

            {/* Planning Style Options */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-slate-300">Sequencing Philosophy</label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  {
                    id: 'Deep focus first',
                    title: 'Deep focus first',
                    desc: 'Protect mornings for complex cognitive tasks before administrative work.',
                  },
                  {
                    id: 'Important tasks first',
                    title: 'Important tasks first',
                    desc: 'Prioritize the critical path and goal-aligned milestones first.',
                  },
                  {
                    id: 'Easier tasks first',
                    title: 'Easier tasks first',
                    desc: 'Build momentum with quick wins and low-friction tasks early in the day.',
                  },
                  {
                    id: 'Balanced throughout the day',
                    title: 'Balanced throughout the day',
                    desc: 'Evenly space deep focus sessions with recovery breaks and tactical tasks.',
                  },
                ].map(opt => {
                  const isSelected = planningStyle === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPlanningStyle(opt.id as PlanningStyle)}
                      className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-600/15 text-white'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-sm font-semibold">{opt.title}</span>
                      <span className="mt-1 text-xs text-slate-400 leading-relaxed">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Transition Buffer */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Buffer between commitments
                </label>
                <span className="text-xs text-violet-300">{bufferMinutes} minutes</span>
              </div>
              <p className="text-xs text-slate-400">
                Breathing room added between tasks, meetings, and transitions to reduce cognitive fatigue.
              </p>

              <div className="grid grid-cols-4 gap-3">
                {([5, 10, 15, 30] as BufferMinutes[]).map(b => {
                  const isSelected = bufferMinutes === b;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBufferMinutes(b)}
                      className={`rounded-xl border py-3 text-center transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-600 text-white font-semibold'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-sm">{b} min</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Major Tasks Per Day */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <label className="text-xs font-medium text-slate-300">
                Major tasks to focus on per day
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(['1–2', '3–4', '5+'] as MajorTasksPerDay[]).map(m => {
                  const isSelected = majorTasksPerDay === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMajorTasksPerDay(m)}
                      className={`rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-violet-500 bg-violet-600/15 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-base font-bold">{m} tasks</div>
                      <div className="mt-1 text-[11px] text-slate-500">
                        {m === '1–2' && 'High deep work immersion'}
                        {m === '3–4' && 'Balanced daily capacity'}
                        {m === '5+' && 'Fast task throughput'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 6: WEEKLY STRUCTURE VISUALIZATION                  */}
        {/* ====================================================== */}
        {step === 6 && (
          <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  Step 6 of 7 • Visual Schedule
                </div>
                <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                  Where does your time actually go?
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Here is your baseline weekly distribution. Click any block to adjust times, days, or details.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                <Plus size={14} />
                <span>Add Commitment</span>
              </button>
            </div>

            <WeeklyScheduleTimeline
              sleep={sleep}
              recurringBlocks={recurringBlocks}
              preferredHours={preferredHours}
              onEditBlock={handleOpenEditModal}
              interactive={true}
            />
          </div>
        )}

        {/* ====================================================== */}
        {/* STEP 7: REVIEW                                          */}
        {/* ====================================================== */}
        {step === 7 && (
          <div className="space-y-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                Step 7 of 7 • Review & Finalize
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Your planning rhythm
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Review your baseline setup. You can always refine these constraints and preferences in Settings.
              </p>
            </div>

            {/* Profile Summary Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 space-y-6">
              {/* Hard Constraints Section */}
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-300">
                  <ShieldCheck size={14} />
                  <span>Hard Constraints (Non-negotiable)</span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <span className="text-xs text-slate-500">Sleep & Rest</span>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatTime12(sleep.weekdaySleep)} – {formatTime12(sleep.weekdayWake)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {sleep.weekendDifferent
                        ? `Weekends: ${formatTime12(sleep.weekendSleep || '00:00')} – ${formatTime12(
                            sleep.weekendWake || '08:30'
                          )}`
                        : 'Consistent every day'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5">
                    <span className="text-xs text-slate-500">Recurring Commitments</span>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {recurringBlocks.length} scheduled block{recurringBlocks.length === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                      {recurringBlocks.length > 0
                        ? recurringBlocks.map(b => b.title).join(', ')
                        : 'No fixed commitments'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Soft Preferences Section */}
              <div className="border-t border-slate-800/80 pt-5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-300">
                  <Sparkles size={14} />
                  <span>Soft Preferences (Optimized Around Constraints)</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                    <span className="text-[11px] text-slate-500">Preferred Focus</span>
                    <p className="mt-1 text-xs font-semibold text-white">
                      {formatTime12(preferredHours.startTime)} – {formatTime12(preferredHours.endTime)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                    <span className="text-[11px] text-slate-500">Daily Target</span>
                    <p className="mt-1 text-xs font-semibold text-white">{dailyFocusCapacity}</p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                    <span className="text-[11px] text-slate-500">Planning Style</span>
                    <p className="mt-1 text-xs font-semibold text-white truncate">{planningStyle}</p>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                    <span className="text-[11px] text-slate-500">Buffer Time</span>
                    <p className="mt-1 text-xs font-semibold text-white">{bufferMinutes} minutes</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline preview in review */}
            <WeeklyScheduleTimeline
              sleep={sleep}
              recurringBlocks={recurringBlocks}
              preferredHours={preferredHours}
              interactive={false}
            />
          </div>
        )}

        {/* Step Navigation Actions */}
        {step > 1 && (
          <div className="mt-8 flex items-center justify-between border-t border-slate-800/80 pt-6">
            <button
              type="button"
              onClick={prevStep}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 px-4 py-2.5 text-xs font-medium text-slate-400 hover:bg-slate-900 hover:text-white transition"
            >
              <ArrowLeft size={15} />
              <span>Back</span>
            </button>

            {step < 7 ? (
              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-violet-900/30 hover:bg-violet-500 transition"
              >
                <span>Continue</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-violet-900/40 hover:bg-violet-500 transition"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    <span>Saving your rhythm…</span>
                  </>
                ) : (
                  <>
                    <span>Save my planning rhythm</span>
                    <CheckCircle2 size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </main>

      {/* Commitment Modal */}
      <CommitmentModal
        isOpen={modalOpen}
        initialBlock={editingBlock}
        existingBlocks={recurringBlocks}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveBlock}
        onDelete={handleDeleteBlock}
      />
    </div>
  );
}
