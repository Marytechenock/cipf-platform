import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import type { User } from '../../types';

export default function ResetPasswordModal({ user, onClose, onReopened }: { user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>; onClose: () => void; onReopened?: (user: User) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<'checkin' | 'password'>('checkin');
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || done) return;
    setError('');
    if (mode === 'checkin') {
      setSaving(true);
      try {
        const result = await api.reopenAdminUserCheckin(user.id);
        setPassword(''); setConfirmation(''); setDone(true);
        onReopened?.(result.user);
      } catch (err) { setError(err instanceof Error ? err.message : 'Could not reopen check-in.'); }
      finally { setSaving(false); }
      return;
    }
    if (password !== confirmation) { setError('Passwords do not match.'); return; }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || new TextEncoder().encode(password).length > 72) {
      setError('Use at least 8 characters, including an uppercase letter and a number (maximum 72 bytes).'); return;
    }
    setSaving(true);
    try {
      await api.resetAdminUserPassword(user.id, password);
      setPassword(''); setConfirmation(''); setDone(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not reset the password.'); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialogRef} aria-labelledby="reset-password-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
    style={{ width: 'calc(100% - 2rem)' }} className="m-auto max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl backdrop:bg-black/50">
    <h2 id="reset-password-title" className="text-lg font-bold">Reset password</h2>
    <p className="mt-2 text-sm text-gray-700">{user.firstName} {user.lastName} · {user.email || 'No email recorded'}</p>
    {done ? <div role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{mode === 'checkin' ? <>
      <p>Check-in is pending again. Ask the attendee to find their name, enter their email and choose a new password. Their old password no longer works.</p>
      <p className="mt-2">Existing QR codes, account ID, submitted votes and event records are kept.</p>
      <a href={`/checkin/confirm/${encodeURIComponent(user.id)}`} className="mt-3 inline-block font-semibold underline">Open this attendee’s check-in page</a>
    </> : 'Password reset successfully. Share the new password privately with the account owner. Their login email, event access and ballot are unchanged.'}</div> : <form id="admin-reset-password" onSubmit={submit} className="mt-4 space-y-4">
      <fieldset disabled={saving} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">Recovery method</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="recovery-method" checked={mode === 'checkin'} onChange={() => { setMode('checkin'); setError(''); }} />Let attendee create their password through check-in</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="recovery-method" checked={mode === 'password'} onChange={() => { setMode('password'); setError(''); }} />Set a new password for them</label>
      </fieldset>
      {mode === 'checkin' ? <p className="rounded-lg bg-amber-50 p-3 text-xs text-[#8B6914]">Verify the account owner first. This clears their password, returns the existing account to pending check-in and enables attendee access. QR codes, votes and other event records are kept.</p> : <>
      <p className="text-xs text-gray-500">Verify the account owner before resetting. Set a new password and share it privately with them.</p>
      <label className="block text-sm font-semibold">New password<input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={event => setPassword(event.target.value)} disabled={saving} className="mt-1 block w-full rounded-lg border border-gray-300 p-3 font-normal" /></label>
      <label className="block text-sm font-semibold">Confirm password<input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} className="mt-1 block w-full rounded-lg border border-gray-300 p-3 font-normal" /></label>
      </>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>}
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">{done ? 'Close' : 'Cancel'}</button>
      {!done && <button type="submit" form="admin-reset-password" disabled={saving} className="rounded-lg bg-[#8B6914] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Resetting…' : mode === 'checkin' ? 'Reopen check-in' : 'Reset password'}</button>}
    </div>
  </dialog>;
}
