import { useEffect, useState, type FormEvent } from 'react';
import { Activity, ChartNoAxesCombined, Download, Eye, EyeOff, LogOut, Moon, Pencil, Search, Sun, Trash2, UserCheck, UserPlus, UserX, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { ApiAuditEntry, User } from '../../types';
import SuperAdminMetrics from './SuperAdminMetrics';
import logo from '@/assets/images/logo-1.png';

type AccountForm = { firstName: string; lastName: string; email: string; password: string };
const emptyForm: AccountForm = { firstName: '', lastName: '', email: '', password: '' };
const SUPER_ADMIN_THEME_KEY = 'super-admin-theme';

export default function SuperAdminPortal({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return window.localStorage.getItem(SUPER_ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light'; }
    catch { return 'light'; }
  });
  const [tab, setTab] = useState<'metrics' | 'accounts' | 'logs'>('metrics');
  const [admins, setAdmins] = useState<User[]>([]);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logs, setLogs] = useState<ApiAuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const pageSize = 25;

  useEffect(() => {
    try { window.localStorage.setItem(SUPER_ADMIN_THEME_KEY, theme); }
    catch { /* Continue with the selected theme for this session. */ }
  }, [theme]);

  useEffect(() => {
    let active = true;
    api.getSuperAdminAccounts().then(result => {
      if (active) setAdmins(result.admins);
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load admin accounts.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tab !== 'logs') return;
    let active = true;
    const timer = window.setTimeout(() => {
      api.getSuperAdminAuditLogs({ page, pageSize, errorsOnly, search }).then(result => {
        if (!active) return;
        setLogs(result.items);
        setTotal(result.total);
        setSelectedLogId(current => result.items.some(item => item.id === current) ? current : null);
      }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load API logs.'); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [tab, page, errorsOnly, search]);

  const selectedLog = logs.find(item => item.id === selectedLogId);

  useEffect(() => {
    if (!selectedLog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedLogId(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedLog]);
  const openCreate = () => { setEditingId(null); setForm(emptyForm); setShowPassword(false); setShowForm(true); setError(''); setNotice(''); };
  const openEdit = (admin: User) => {
    setEditingId(admin.id);
    setForm({ firstName: admin.firstName, lastName: admin.lastName, email: admin.email || '', password: '' });
    setShowPassword(false);
    setShowForm(true); setError(''); setNotice('');
  };
  const saveAccount = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = editingId
        ? await api.updateSuperAdminAccount(editingId, form)
        : await api.createSuperAdminAccount(form);
      setAdmins(current => editingId ? current.map(item => item.id === result.admin.id ? result.admin : item) : [...current, result.admin]);
      setNotice(editingId ? 'Admin account updated.' : 'Admin account created. Share the temporary password through a secure channel.');
      setForm(emptyForm); setShowPassword(false); setShowForm(false); setEditingId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save admin account.'); }
    finally { setBusy(false); }
  };
  const toggleStatus = async (admin: User) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const next = admin.status === 'active' ? 'disabled' : 'active';
      const result = await api.setSuperAdminAccountStatus(admin.id, next);
      setAdmins(current => current.map(item => item.id === admin.id ? result.admin : item));
      setNotice(`Admin account ${next === 'active' ? 'reactivated' : 'deactivated'}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not change admin status.'); }
    finally { setBusy(false); }
  };
  const deleteAccount = async (admin: User) => {
    if (!window.confirm(`Delete ${admin.firstName} ${admin.lastName}'s admin account? This cannot be undone.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.deleteSuperAdminAccount(admin.id);
      setAdmins(current => current.filter(item => item.id !== admin.id));
      setNotice('Admin account deleted. Its API audit entries remain available.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete admin account.'); }
    finally { setBusy(false); }
  };
  const downloadPage = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [
      ['Time', 'Actor', 'Method', 'Endpoint', 'HTTP code', 'Latency ms', 'Request ID', 'Error code', 'Error cause'],
      ...logs.map(item => [item.time, item.actorName, item.method, item.path, item.statusCode, item.durationMs, item.id, item.errorCode, item.errorCause])
    ].map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `api-audit-logs-page-${page}.csv`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className={`flex h-screen h-dvh flex-col overflow-hidden bg-white text-slate-900 dark:bg-[#11161D] dark:text-slate-100 ${theme === 'dark' ? 'dark' : ''}`} style={{ colorScheme: theme }}>
    <header className="flex min-h-20 shrink-0 items-center justify-between gap-4 bg-[#1A1A1A] px-5 text-white dark:bg-[#0B0F14] sm:px-8">
      <div className="flex items-center gap-4"><img src={logo} alt="CIPF" className="h-12 w-28 bg-white object-contain" /><div><p className="text-sm font-bold">Super Admin</p><p className="text-xs text-amber-300">System access</p></div></div>
      <div className="flex items-center gap-3 sm:gap-4">
        <div role="group" aria-label="Super admin color theme" className="flex items-center gap-1 rounded-lg border border-white/20 p-1">
          <button type="button" aria-label="Use light mode" aria-pressed={theme === 'light'} onClick={() => setTheme('light')} className={`rounded-md p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${theme === 'light' ? 'bg-white text-[#8B6914]' : 'text-slate-300 hover:bg-white/10'}`}><Sun size={17} /></button>
          <button type="button" aria-label="Use dark mode" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')} className={`rounded-md p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${theme === 'dark' ? 'bg-amber-300 text-slate-950' : 'text-slate-300 hover:bg-white/10'}`}><Moon size={17} /></button>
        </div>
        <span className="hidden text-xs font-semibold sm:inline">{user.firstName} {user.lastName}</span>
        <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10"><LogOut size={16} /> Sign out</button>
      </div>
    </header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <nav aria-label="Super admin sections" className="flex shrink-0 gap-2 overflow-x-auto bg-[#F2EEE5] px-4 py-2 dark:bg-[#1D2632] md:w-56 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-4">
        <button type="button" onClick={() => { setTab('metrics'); setSelectedLogId(null); setError(''); }} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-left font-display text-sm font-semibold ${tab === 'metrics' ? 'bg-white text-[#8B6914] shadow-sm dark:bg-[#344252] dark:text-amber-300' : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'}`}><ChartNoAxesCombined size={17} /> Metrics</button>
        <button type="button" onClick={() => { setTab('accounts'); setSelectedLogId(null); setError(''); }} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-left font-display text-sm font-semibold ${tab === 'accounts' ? 'bg-white text-[#8B6914] shadow-sm dark:bg-[#344252] dark:text-amber-300' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'}`}><Users size={17} /> Admin accounts</button>
        <button type="button" onClick={() => { setTab('logs'); setError(''); }} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-left font-display text-sm font-semibold ${tab === 'logs' ? 'bg-white text-[#8B6914] shadow-sm dark:bg-[#344252] dark:text-amber-300' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10'}`}><Activity size={17} /> API audit logs</button>
      </nav>
      <div className={`min-h-0 min-w-0 flex-1 ${tab === 'metrics' ? 'bg-white dark:bg-[#151B23]' : 'bg-[#F7F6F3] p-4 dark:bg-[#11161D]'}`}>
      <main className={`mx-auto h-full w-full max-w-6xl min-h-0 min-w-0 bg-white dark:bg-[#151B23] ${tab === 'metrics' ? 'overflow-y-auto px-4 py-5 sm:px-6' : `rounded-2xl border border-slate-200 p-5 shadow-sm dark:border-slate-700 ${tab === 'logs' ? 'flex flex-col overflow-hidden sm:p-5' : 'overflow-y-auto sm:p-7'}`}`}>
        {tab !== 'metrics' && error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
        {tab !== 'metrics' && notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
        {tab === 'metrics' ? <SuperAdminMetrics darkMode={theme === 'dark'} /> : tab === 'accounts' ? <>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Admin accounts</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create and manage administrators of the voting system.</p></div><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#1A1A1A] px-4 py-2.5 text-sm font-bold text-white hover:bg-black dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"><UserPlus size={17} /> Create admin</button></div>
          {showForm && <form onSubmit={saveAccount} className="mt-6 grid gap-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20 sm:grid-cols-2">
            <h2 className="sm:col-span-2 text-base font-bold">{editingId ? 'Edit admin' : 'Create admin'}</h2>
            <label className="text-xs font-semibold">First name<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" required value={form.firstName} onChange={e => setForm(current => ({ ...current, firstName: e.target.value }))} /></label>
            <label className="text-xs font-semibold">Last name<input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" required value={form.lastName} onChange={e => setForm(current => ({ ...current, lastName: e.target.value }))} /></label>
            <label className="text-xs font-semibold">Email<input type="email" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" required value={form.email} onChange={e => setForm(current => ({ ...current, email: e.target.value }))} /></label>
            <div className="text-xs font-semibold">
              <label htmlFor="super-admin-password">{editingId ? 'New password' : 'Temporary password'}</label>
              <div className="relative mt-1">
                <input id="super-admin-password" type={showPassword ? 'text' : 'password'} minLength={12} autoComplete="new-password" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 pr-11 text-sm dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100" required={!editingId} value={form.password} onChange={e => setForm(current => ({ ...current, password: e.target.value }))} />
                <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:text-slate-400 dark:hover:text-white">
                  {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-amber-300 dark:text-slate-950">{busy ? 'Saving...' : 'Save admin'}</button><button type="button" onClick={() => { setShowForm(false); setForm(emptyForm); setShowPassword(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-600">Cancel</button></div>
          </form>}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[610px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500 dark:border-slate-700 dark:bg-[#202A36] dark:text-slate-300"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
              <tbody>{admins.map(admin => <tr key={admin.id} className="border-b border-slate-100 dark:border-slate-700">
                <td className="p-3 font-semibold">{admin.firstName} {admin.lastName}</td>
                <td className="p-3">{admin.email}</td>
                <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${admin.status === 'active' ? 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{admin.status === 'active' ? 'Active' : 'Deactivated'}</span></td>
                <td className="p-3"><div className="flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(admin)} aria-label={`Edit ${admin.firstName} ${admin.lastName}`} title="Edit admin" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-800 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/60"><Pencil size={16} aria-hidden="true" /></button>
                  <button type="button" disabled={busy} onClick={() => void toggleStatus(admin)} aria-label={`${admin.status === 'active' ? 'Deactivate' : 'Reactivate'} ${admin.firstName} ${admin.lastName}`} title={admin.status === 'active' ? 'Deactivate admin' : 'Reactivate admin'} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">{admin.status === 'active' ? <UserX size={17} aria-hidden="true" /> : <UserCheck size={17} aria-hidden="true" />}</button>
                  <button type="button" disabled={busy} onClick={() => void deleteAccount(admin)} aria-label={`Delete ${admin.firstName} ${admin.lastName}`} title="Delete admin" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/60"><Trash2 size={16} aria-hidden="true" /></button>
                </div></td>
              </tr>)}</tbody>
            </table>
            {admins.length === 0 && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No admin accounts found.</p>}
          </div>
        </> : <>
          <div><h1 className="text-xl font-black">API audit logs</h1><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">System requests, response codes, and error causes.</p></div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="relative w-full sm:w-80 lg:w-96"><Search size={16} className="absolute left-3 top-2.5 text-slate-400" /><input aria-label="Search API logs" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search actor, endpoint or request ID" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-[#11161D] dark:text-slate-100 dark:placeholder:text-slate-400" /></label>
            <button type="button" role="switch" aria-checked={errorsOnly} onClick={() => { setErrorsOnly(current => !current); setPage(1); }} className="inline-flex items-center gap-2.5 whitespace-nowrap text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8922A] focus-visible:ring-offset-2">
              <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${errorsOnly ? 'bg-[#B8922A]' : 'bg-[#E5E5E5] dark:bg-slate-600'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${errorsOnly ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </span>
              <span>Show errors only</span>
            </button>
            <button type="button" onClick={downloadPage} disabled={!logs.length} className="ml-auto inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-50 dark:border-slate-600 dark:hover:bg-white/10"><Download size={16} /> Download page CSV</button>
          </div>
          <div className="mt-3 min-h-0 flex-1 overflow-auto overscroll-contain">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 uppercase text-slate-500 dark:border-slate-700 dark:bg-[#202A36] dark:text-slate-300"><tr><th className="p-3">Request time</th><th className="p-3">Actor</th><th className="p-3">API request</th><th className="p-3">Code</th><th className="p-3">Latency</th><th className="p-3">Request ID</th><th className="p-3">Error</th></tr></thead>
              <tbody>{logs.map(log => <tr key={log.id} className={`border-b border-slate-100 dark:border-slate-700 ${selectedLogId === log.id ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}`}>
                <td className="whitespace-nowrap p-3">{new Date(log.time).toLocaleString()}</td>
                <td className="p-3">{log.actorName}</td>
                <td className="p-3"><button type="button" onClick={() => setSelectedLogId(log.id)} className="text-left font-semibold text-[#8B6914] underline decoration-amber-200 underline-offset-2 dark:text-amber-300 dark:decoration-amber-700">{log.method} {log.path}</button></td>
                <td className="p-3"><span className={`rounded-md px-2 py-1 font-bold ${log.statusCode < 400 ? 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'}`}>{log.statusCode}</span></td>
                <td className="p-3">{log.durationMs} ms</td>
                <td className="p-3 font-mono">{log.id.slice(0, 12)}…</td>
                <td className="p-3 text-red-700 dark:text-red-300">{log.errorCode || '—'}</td>
              </tr>)}</tbody>
            </table>
            {logs.length === 0 && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No matching API requests.</p>}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>{total} requests · page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><div className="flex gap-2"><button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600">Previous</button><button type="button" disabled={page * pageSize >= total} onClick={() => setPage(current => current + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40 dark:border-slate-600">Next</button></div></div>
        </>}
      </main>
      </div>
    </div>
    {selectedLog && tab === 'logs' && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedLogId(null); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-[#151B23]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-700">
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#8B6914] dark:text-amber-300">API audit log</p><h2 id="audit-detail-title" className="mt-1 text-xl font-black">Request details</h2></div>
          <button type="button" aria-label="Close request details" onClick={() => setSelectedLogId(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6 text-sm">
          <div className="flex items-center gap-3"><span className={`rounded-lg px-3 py-1.5 text-sm font-black ${selectedLog.statusCode < 400 ? 'bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300'}`}>HTTP {selectedLog.statusCode}</span><span className="text-slate-500 dark:text-slate-400">{new Date(selectedLog.time).toLocaleString()}</span></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Request</p><p className="mt-2 break-all rounded-lg bg-slate-50 p-3 font-mono text-xs font-semibold text-slate-800 dark:bg-[#202A36] dark:text-slate-100">{selectedLog.method} {selectedLog.path}</p></div>
          <dl className="divide-y divide-slate-100 border-y border-slate-100 dark:divide-slate-700 dark:border-slate-700">
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500 dark:text-slate-400">Actor</dt><dd className="text-right font-semibold">{selectedLog.actorName}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500 dark:text-slate-400">Latency</dt><dd className="font-semibold">{selectedLog.durationMs} ms</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500 dark:text-slate-400">Error code</dt><dd className="font-semibold">{selectedLog.errorCode || '—'}</dd></div>
          </dl>
          <div className={`rounded-xl border p-4 ${selectedLog.statusCode >= 400 ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' : 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'}`}><p className="text-xs font-bold uppercase tracking-wide">{selectedLog.statusCode >= 400 ? 'Error cause' : 'Outcome'}</p><p className="mt-2 break-words leading-relaxed">{selectedLog.errorCause || 'Request completed successfully.'}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Request ID</p><p className="mt-2 break-all font-mono text-xs text-slate-700 dark:text-slate-300">{selectedLog.id}</p></div>
        </div>
      </aside>
    </div>}
  </div>;
}
