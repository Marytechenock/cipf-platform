import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, UserPlus, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { ElectionCandidateCategory, User } from '../../types';

interface AddVotingMemberModalProps {
  electionId: string;
  existingProfiles: User[];
  onAdded: () => Promise<void>;
  onClose: () => void;
}

export default function AddVotingMemberModal({ electionId, existingProfiles, onAdded, onClose }: AddVotingMemberModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', identifier: '', email: '', organization: '', eligibleCategory: '' as ElectionCandidateCategory | '' });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const existingProfile = existingProfiles.find(profile => profile.email?.trim().toLowerCase() === form.email.trim().toLowerCase() && Boolean(form.email.trim()));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector('input')?.focus();
    return () => dialog?.close();
  }, []);

  const saveMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    if (!form.identifier.trim() || !form.eligibleCategory || (!existingProfile && (!form.firstName.trim() || !form.lastName.trim()))) {
      setError('Enter the member’s name, voter identifier, and eligible position.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await api.addAdminElectionMember(electionId, {
        identifier: form.identifier.trim(),
        email: form.email.trim(),
        firstName: existingProfile?.firstName || form.firstName.trim(),
        lastName: existingProfile?.lastName || form.lastName.trim(),
        organization: existingProfile?.organization || form.organization.trim(),
        eligibleCategory: form.eligibleCategory
      });
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the member. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} aria-labelledby="add-voting-member-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-slate-950 shadow-2xl backdrop:bg-slate-950/55"
      style={{ width: 'calc(100% - 2rem)' }}
      onCancel={event => { event.preventDefault(); if (!isSaving) onClose(); }}>
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gradient-to-br from-white via-amber-50 to-yellow-50 p-5">
        <div>
          <h2 id="add-voting-member-title" className="flex items-center gap-2 text-lg font-bold"><UserPlus className="h-5 w-5 text-[#8B6914]" /> Add Member</h2>
          <p className="mt-2 text-xs leading-relaxed text-gray-500">Add a voter with an identifier and their eligible position.</p>
        </div>
        <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close add member"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"><X className="h-4 w-4" /></button>
      </div>
      <form onSubmit={saveMember} className="space-y-4 p-5">
        <fieldset disabled={isSaving} className="space-y-4">
          <legend className="sr-only">Member details</legend>
          <label className="block text-xs font-semibold text-gray-600">Voter identifier
            <input type="text" required autoComplete="off" value={form.identifier} onChange={event => { setForm(current => ({ ...current, identifier: event.target.value })); setError(''); }}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-[#B8922A] focus:ring-2 focus:ring-amber-100" placeholder="Identifier on voter list" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">Email address <span className="font-normal text-gray-400">(only to match an existing event profile)</span>
            <input type="email" autoComplete="email" value={form.email} onChange={event => { setForm(current => ({ ...current, email: event.target.value })); setError(''); }}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-[#B8922A] focus:ring-2 focus:ring-amber-100" placeholder="Optional" />
          </label>
          {existingProfile && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-relaxed text-emerald-800">
            Existing {existingProfile.role} found: <strong>{existingProfile.firstName} {existingProfile.lastName}</strong>. Their event profile will be kept.
          </p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-gray-600">First name
              <input required={!existingProfile} disabled={Boolean(existingProfile)} autoComplete="given-name" value={existingProfile?.firstName ?? form.firstName} onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-[#B8922A] focus:ring-2 focus:ring-amber-100" />
            </label>
            <label className="block text-xs font-semibold text-gray-600">Last name
              <input required={!existingProfile} disabled={Boolean(existingProfile)} autoComplete="family-name" value={existingProfile?.lastName ?? form.lastName} onChange={event => setForm(current => ({ ...current, lastName: event.target.value }))}
                className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-[#B8922A] focus:ring-2 focus:ring-amber-100" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-gray-600">Company <span className="font-normal text-gray-400">(optional)</span>
            <input disabled={Boolean(existingProfile)} autoComplete="organization" value={existingProfile ? existingProfile.organization || '' : form.organization} onChange={event => setForm(current => ({ ...current, organization: event.target.value }))}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-[#B8922A] focus:ring-2 focus:ring-amber-100" />
          </label>
          <label className="block text-xs font-semibold text-gray-600">Eligible voting position
            <select required value={form.eligibleCategory} onChange={event => setForm(current => ({ ...current, eligibleCategory: event.target.value as ElectionCandidateCategory }))} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-slate-950">
              <option value="">Select position</option>
              <option value="employee_representative">Employee Representative</option>
              <option value="employer_cifoz">Employer Representative (CIFOZ)</option>
              <option value="employer_zbca">Employer Representative (ZBCA)</option>
            </select>
          </label>
        </fieldset>
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-[#8B6914]">Members sign in to vote with their voter identifier. No email or password is needed.</p>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-[#B07A12] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#94640f] disabled:cursor-wait disabled:opacity-60">
            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {isSaving ? 'Adding member...' : existingProfile ? 'Add to Election' : 'Add Member'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
