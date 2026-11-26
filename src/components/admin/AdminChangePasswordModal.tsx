import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Circle, Eye, EyeOff } from 'lucide-react';
import { api } from '../../lib/api';
import { getAdminPasswordChecks, isValidAdminPassword } from '../../lib/adminPasswordPolicy';

export default function AdminChangePasswordModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const checks = getAdminPasswordChecks(newPassword);
  const requirements = [
    { label: 'At least 8 characters', met: checks.length },
    { label: 'Uppercase letter', met: checks.uppercase },
    { label: 'Number', met: checks.number },
    { label: 'Special character', met: checks.special }
  ];
  const metCount = requirements.filter(item => item.met).length;
  const strengthScore = newPassword ? Math.max(1, metCount + (Array.from(newPassword).length >= 12 ? 1 : 0)) : 0;
  const strengthLabel = strengthScore === 0 ? 'Enter a password' : strengthScore <= 2 ? 'Weak' : strengthScore === 3 ? 'Fair' : strengthScore === 4 ? 'Good' : 'Strong';
  const strengthColor = strengthScore <= 2 ? 'bg-red-500' : strengthScore === 3 ? 'bg-amber-500' : strengthScore === 4 ? 'bg-lime-500' : 'bg-emerald-600';

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || done) return;
    setError('');
    if (newPassword !== confirmation) { setError('New passwords do not match.'); return; }
    if (!isValidAdminPassword(newPassword)) {
      setError('Use at least 8 characters, an uppercase letter, a number, and a special character (maximum 72 bytes).'); return;
    }
    if (currentPassword === newPassword) { setError('Choose a password different from your current password.'); return; }
    setSaving(true);
    try {
      await api.changeAdminPassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setVisible({}); setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not change your password.');
    } finally { setSaving(false); }
  };

  const field = (id: string, label: string, value: string, setValue: (value: string) => void, autoComplete: 'current-password' | 'new-password') => (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-800">{label}</label>
      <div className="relative mt-1">
        <input id={id} type={visible[id] ? 'text' : 'password'} autoComplete={autoComplete} required
          value={value} onChange={event => setValue(event.target.value)} disabled={saving}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 pr-11 text-sm text-slate-900 focus:border-[#B8922A] focus:outline-none focus:ring-2 focus:ring-[#B8922A]/20" />
        <button type="button" disabled={saving} onClick={() => setVisible(current => ({ ...current, [id]: !current[id] }))}
          aria-label={`${visible[id] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={Boolean(visible[id])}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-[#B8922A]">
          {visible[id] ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

  return <dialog ref={dialogRef} aria-labelledby="admin-change-password-title"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
    style={{ width: 'calc(100% - 2rem)' }}
    className="m-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-black/60">
    <h2 id="admin-change-password-title" className="text-xl font-bold">Change password</h2>
    {done ? <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Password changed. Use your new password the next time you sign in.</p> : <>
      <p className="mt-2 text-sm text-slate-600">Replace your temporary password with one only you know.</p>
      <form id="admin-change-password-form" onSubmit={submit} className="mt-5 space-y-4">
        {field('admin-current-password', 'Current password', currentPassword, setCurrentPassword, 'current-password')}
        {field('admin-new-password', 'New password', newPassword, setNewPassword, 'new-password')}
        <div aria-label="New password strength" className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600">Password strength</span>
            <span aria-live="polite" className="text-slate-800">{strengthLabel}</span>
          </div>
          <div role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strengthScore} aria-valuetext={strengthLabel}
            className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-all duration-200 ${strengthColor}`} style={{ width: `${strengthScore * 20}%` }} />
          </div>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {requirements.map(item => <li key={item.label} className={`flex items-center gap-1.5 text-xs font-medium ${item.met ? 'text-emerald-700' : 'text-slate-500'}`}>
              {item.met ? <Check size={14} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
              {item.label}
            </li>)}
          </ul>
          {/*<p className="mt-2 text-[11px] text-slate-500">12 or more characters improves strength. Maximum 72 bytes.</p>*/}
        </div>
        {field('admin-confirm-password', 'Confirm new password', confirmation, setConfirmation, 'new-password')}
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      </form>
    </>}
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{done ? 'Close' : 'Cancel'}</button>
      {!done && <button type="submit" form="admin-change-password-form" disabled={saving} className="rounded-lg bg-[#1A1A1A] px-4 py-2 text-sm font-bold text-white hover:bg-[#333] disabled:opacity-50">{saving ? 'Saving…' : 'Change password'}</button>}
    </div>
  </dialog>;
}
