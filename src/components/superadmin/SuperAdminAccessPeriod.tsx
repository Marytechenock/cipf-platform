import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Save } from 'lucide-react';
import { api } from '../../lib/api';
import type { AccessPeriod } from '../../types';

function toLocalInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function SuperAdminAccessPeriod() {
  const [period, setPeriod] = useState<AccessPeriod | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    api.getAccessPeriod().then(result => {
      if (!active) return;
      setPeriod(result.period);
      if (result.period) {
        setStartsAt(toLocalInput(result.period.startsAt));
        setEndsAt(toLocalInput(result.period.endsAt));
      }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load the access period.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const status = !period ? 'Not configured' : now < Date.parse(period.startsAt) ? 'Upcoming' : now >= Date.parse(period.endsAt) ? 'Expired' : 'Active';
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setNotice('');
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (!startsAt || !endsAt || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError('Choose valid dates and times. Access must end after it starts.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.saveAccessPeriod(start.toISOString(), end.toISOString());
      setPeriod(result.period);
      setNow(Date.now());
      setNotice('Access period saved. Admins and voters can use the system only during this period.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the access period.'); }
    finally { setSaving(false); }
  };

  return <section className="max-w-3xl">
    <div className="flex items-center gap-3"><CalendarClock className="text-[#8B6914] dark:text-amber-300" size={25} /><div><h1 className="text-2xl font-black">System access period</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Set when administrators and voters can sign in and use the system.</p></div></div>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
    {notice && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
    <div className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Current status</p><p className="mt-1 text-lg font-bold">{loading ? 'Loading…' : status}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>{status}</span></div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{status === 'Active' ? 'Admin and voter access is currently open.' : status === 'Upcoming' ? 'Access will open automatically at the start time.' : status === 'Expired' ? 'Admin and voter access has stopped. Set a new end time to reopen it.' : 'Set a period to enable admin and voter access.'} The super admin portal remains available at all times.</p>
      {period && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Last updated {new Date(period.updatedAt).toLocaleString()}</p>}
    </div>
    <form onSubmit={save} className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Access starts<input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" /></label>
        <label className="block text-sm font-semibold">Access ends<input type="datetime-local" required value={endsAt} min={startsAt} onChange={event => setEndsAt(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" /></label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Times use this device’s local timezone. Access starts at the selected time and stops exactly at the end time.</p>
      <button type="submit" disabled={loading || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-4 py-2.5 text-sm font-bold text-white hover:bg-black disabled:opacity-50 dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"><Save size={17} /> {saving ? 'Saving…' : 'Save access period'}</button>
    </form>
  </section>;
}
