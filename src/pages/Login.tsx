import React from 'react';
import { ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

declare global { interface Window { google?: any; } }

export default function Login() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  React.useEffect(() => {
    if (user) { navigate('/app', { replace: true }); return; }
    if (!clientId) { setReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError('Google Sign-In could not be loaded. Check your network connection.');
    document.head.appendChild(script);
    return () => { script.remove(); };
  }, [clientId, navigate, user]);

  React.useEffect(() => {
    if (!ready || !clientId || !window.google) return;
    window.google.accounts.id.initialize({ client_id: clientId, callback: async (response: { credential: string }) => {
      setError('');
      try {
        const result = await fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ credential: response.credential }) });
        const data = await result.json();
        if (!result.ok) throw new Error(data.error || 'Google authentication failed.');
        await refresh();
        const from = (location.state as { from?: string } | null)?.from;
        navigate(from?.startsWith('/app') ? from : '/app', { replace: true });
      } catch (err) { setError(err instanceof Error ? err.message : 'Google authentication failed.'); }
    }, auto_select: false });
    const target = document.getElementById('google-button');
    if (target) { target.innerHTML = ''; window.google.accounts.id.renderButton(target, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'continue_with', width: 360 }); }
  }, [ready, clientId, refresh, navigate, location.state]);

  return <div className="min-h-screen bg-slate-950 text-white"><div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-2"><section className="hidden flex-col justify-between border-r border-slate-900 p-10 lg:flex"><Link to="/" className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600"><Sparkles size={18}/></span><span className="font-semibold">Sentinel Nova</span></Link><div className="max-w-md"><p className="text-sm text-violet-400">Your AI Chief of Staff</p><h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">Your plan should adapt when reality does.</h1><p className="mt-5 text-sm leading-6 text-slate-500">Nova connects your goals, tasks and calendar so you can spend less time managing the system and more time doing the work.</p></div><div className="flex items-center gap-2 text-xs text-slate-600"><ShieldCheck size={14}/> Secure, user-controlled planning</div></section><main className="flex items-center justify-center p-6 sm:p-10"><div className="w-full max-w-md"><Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-white"><ArrowLeft size={15}/> Back to Sentinel Nova</Link><div className="mt-14"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 lg:hidden"><Sparkles size={19}/></div><h2 className="mt-6 text-3xl font-semibold tracking-tight">Welcome back.</h2><p className="mt-2 text-sm leading-6 text-slate-500">Sign in to open your personal planning workspace.</p><div className="mt-9"><div id="google-button" className="min-h-11 flex justify-center"/>{!clientId && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-300">Google Sign-In is not configured yet. Add <code>VITE_GOOGLE_CLIENT_ID</code> to your environment.</div>}{error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs leading-5 text-red-300">{error}</p>}</div><p className="mt-8 text-center text-[11px] leading-5 text-slate-600">By continuing, you agree to use Sentinel Nova responsibly. Nova recommends actions; you remain in control of consequential changes.</p></div></div></main></div></div>;
}
