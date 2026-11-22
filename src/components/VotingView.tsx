import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader, Lock, ShieldCheck, UsersRound, Vote, X } from 'lucide-react';
import { api } from '../lib/api';
import type { ElectionBallot, ElectionCandidate, ElectionCandidateCategory, User } from '../types';

const POSITIONS: { category: ElectionCandidateCategory; label: string }[] = [
  { category: 'employee_representative', label: 'Employee Representative' },
  { category: 'employer_cifoz', label: 'Employer Representative (CIFOZ)' },
  { category: 'employer_zbca', label: 'Employer Representative (ZBCA)' }
];

interface VotingViewProps {
  user: User;
}

function formatElectionDateTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function CandidateCard({
  candidate,
  selected,
  disabled,
  onSelect
}: {
  candidate: ElectionCandidate;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const [isManifestoExpanded, setIsManifestoExpanded] = useState(false);
  const [isManifestoTruncated, setIsManifestoTruncated] = useState(false);
  const previewRef = useRef<HTMLParagraphElement>(null);
  const manifestoId = useId();

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const checkTruncation = () => {
      if (preview.clientHeight > 0) {
        setIsManifestoTruncated(preview.scrollHeight > preview.clientHeight + 1);
      }
    };

    checkTruncation();
    const observer = new ResizeObserver(checkTruncation);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [candidate.bio, isManifestoExpanded]);

  const initials = candidate.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

  return (
    <div
      className={`group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all ${
        selected
          ? 'border-emerald-300 shadow-lg ring-2 ring-emerald-100'
          : 'border-gray-200 hover:border-sky-200 hover:shadow-md'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`Select ${candidate.fullName}`}
        className="flex w-full flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 disabled:cursor-not-allowed"
      >
        <div className="relative h-[272px] w-full bg-gradient-to-br from-slate-50 to-slate-100 sm:h-[288px]">
          <div className="flex h-full w-full items-center justify-center">
            {candidate.photoUrl ? (
              <img src={candidate.photoUrl} alt={candidate.fullName} className="h-full w-full object-cover object-top" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-xl font-bold text-slate-400 shadow-sm">
                {initials || 'C'}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-bold leading-snug text-slate-950 sm:text-sm">{candidate.fullName}</h3>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-red-500">
                {candidate.position || 'Candidate'}
              </p>
            </div>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              selected ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white text-transparent'
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
            {candidate.organization || 'Organization not listed'}
          </p>
          {candidate.bio && !isManifestoExpanded && (
            <p ref={previewRef} className="mt-2 line-clamp-2 whitespace-pre-wrap break-words text-[11px] font-medium leading-relaxed text-slate-500">
              {candidate.bio}
            </p>
          )}
        </div>
      </button>
      {candidate.bio && (isManifestoTruncated || isManifestoExpanded) && (
        <div className="px-3 pb-3">
          <div
            id={manifestoId}
            hidden={!isManifestoExpanded}
            className="mb-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600"
          >
            {candidate.bio}
          </div>
          <button
            type="button"
            onClick={() => setIsManifestoExpanded(current => !current)}
            aria-expanded={isManifestoExpanded}
            aria-controls={manifestoId}
            aria-label={`${isManifestoExpanded ? 'Show less' : 'Read full manifesto'} for ${candidate.fullName}`}
            className="flex h-11 w-full items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <ChevronDown aria-hidden="true" className={`h-5 w-5 transition-transform ${isManifestoExpanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function VotingView({ user }: VotingViewProps) {
  const [ballot, setBallot] = useState<ElectionBallot | null>(null);
  const [selections, setSelections] = useState<Partial<Record<ElectionCandidateCategory, string>>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [successDismissed, setSuccessDismissed] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const ballotHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadBallot = async () => {
    setError('');
    try {
      const data = await api.getElectionBallot();
      setBallot(data);
      setSelections(Object.fromEntries(data.votes.map(vote => [vote.category, vote.candidateId])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load voting ballot.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBallot();
  }, []);

  const hasVoted = (ballot?.votes.length || 0) > 0;
  const showSuccess = !successDismissed && !isLoading && Boolean(ballot?.election) && (hasVoted || Boolean(message));

  useEffect(() => {
    if (showSuccess) successRef.current?.focus();
    else if (successDismissed) ballotHeadingRef.current?.focus();
  }, [showSuccess, successDismissed]);

  const eligiblePosition = POSITIONS.find(position => position.category === ballot?.voter?.eligibleCategory);
  const canVote = ballot?.election?.status === 'open' && ballot.voter && eligiblePosition && !hasVoted;
  const selectedId = eligiblePosition ? selections[eligiblePosition.category] : undefined;
  const isBallotComplete = Boolean(selectedId);
  const unavailableVotingMessage = ballot?.election?.status === 'scheduled' && ballot.election.startsAt
    ? `Voting opens on ${formatElectionDateTime(ballot.election.startsAt)}.`
    : ballot?.election?.status === 'closed'
      ? 'Voting has closed.'
      : 'Voting is not open right now.';

  const submitVote = async () => {
    if (!ballot?.election || !canVote || isSubmitting) return;
    if (!isBallotComplete) {
      setError('Select one candidate for your representative position.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setMessage('');
    try {
      const result = await api.submitElectionVote(ballot.election.id, {
        candidateId: selectedId!
      });
      setBallot(current => current ? { ...current, votes: result.votes } : current);
      setSelections(Object.fromEntries(result.votes.map(vote => [vote.category, vote.candidateId])));
      setMessage(result.duplicate ? 'Your ballot has already been submitted successfully.' : 'Your ballot has been submitted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit vote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-xl">
        <Loader className="mx-auto h-8 w-8 animate-spin text-[#B8922A]" />
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.22em] text-[#8B6914]">Loading voting ballot</p>
      </div>
    );
  }

  if (!ballot?.election) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
        <Vote className="mx-auto h-10 w-10 text-slate-300" />
        <h2 className="mt-4 text-lg font-bold text-slate-950">No election has been prepared yet</h2>
        <p className="mt-2 text-sm font-medium text-slate-500">The voting ballot will appear here once the administrator creates an election.</p>
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center px-1 py-8 sm:py-12">
        <div ref={successRef} tabIndex={-1} role="status" aria-labelledby="ballot-success-title" onKeyDown={event => { if (event.key === 'Escape') setSuccessDismissed(true); }} className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-[#B8922A]/25 bg-white text-center shadow-xl focus:outline-none">
          <div className="h-2 bg-gradient-to-r from-[#8B6914] via-[#D4B04C] to-[#B8922A]" />
          <button type="button" onClick={() => setSuccessDismissed(true)} aria-label="Close voting confirmation" className="absolute right-3 top-4 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-amber-100 hover:text-[#8B6914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8922A]">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="bg-gradient-to-b from-amber-50/70 via-white to-white px-6 py-10 sm:px-10 sm:py-12">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#B8922A]/25 bg-[#B8922A]/10" aria-hidden="true">
              <CheckCircle2 className="h-10 w-10 text-[#A17B24]" />
            </span>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-[#8B6914]">Voting complete</p>
            <h1 id="ballot-success-title" className="mt-3 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">Ballot submitted successfully</h1>
            <p className="mt-4 text-base font-semibold text-[#8B6914]">Thank you for voting, {user.firstName}!</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">Your vote has been recorded. Thank you for taking part in the election.</p>
            <div className="mt-7 rounded-2xl border border-gray-200 bg-slate-50 px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{ballot.election.title}</p>
              <p className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700"><ShieldCheck className="h-4 w-4 text-[#8B6914]" aria-hidden="true" /> Submission confirmed</p>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs leading-relaxed text-slate-500"><Lock className="h-4 w-4 shrink-0" aria-hidden="true" /> Your ballot is final and cannot be changed.</p>
            <button type="button" onClick={() => setSuccessDismissed(true)} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#B8922A] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#8B6914] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B8922A]">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 animate-fadeIn">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-white">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.26em] text-sky-200">
            <ShieldCheck className="h-4 w-4" /> Secure Voting
          </p>
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 ref={ballotHeadingRef} tabIndex={-1} className="text-xl font-bold leading-tight outline-none sm:text-2xl">{ballot.election.title}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-relaxed text-slate-300">
                Select one candidate for your assigned representative position.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-semibold">
              {hasVoted ? 'Ballot submitted' : ballot.election.status === 'open' ? 'Voting open' : ballot.election.status === 'scheduled' ? 'Voting scheduled' : 'Voting not open'}
            </div>
          </div>
        </div>

        <div className="grid gap-4 bg-slate-50 p-4 sm:p-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700">Voter</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{user.firstName} {user.lastName}</p>
            <p className="text-xs font-medium text-slate-500">{user.organization || user.email}</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Board Seats</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{eligiblePosition?.label || 'Position not assigned'}</p>
            <p className="text-xs font-medium text-slate-500">{selectedId ? 'Candidate selected' : 'Select one candidate'}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Eligibility</p>
            <p className="mt-2 text-sm font-bold text-slate-950">{ballot.voter ? 'Eligible voter' : 'Not eligible'}</p>
            <p className="text-xs font-medium text-slate-500">{hasVoted ? 'Vote already recorded' : 'One final submission allowed'}</p>
          </div>
        </div>
      </div>

      {(error || !ballot.voter || !eligiblePosition || ballot.election.status !== 'open') && (
        <div role={error ? 'alert' : 'status'} className={`rounded-2xl border p-4 text-sm font-semibold shadow-sm ${
          error
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          {error || (ballot.voter ? eligiblePosition ? unavailableVotingMessage : 'Your voting position has not been assigned. Contact the election administrator.' : 'You are not on the eligible voter list for this election.')}
        </div>
      )}

      {(user.role === 'admin' ? POSITIONS : eligiblePosition ? [eligiblePosition] : []).map(position => (
        <section key={position.category} className="space-y-3">
          <div><h2 className="text-base font-bold text-slate-950">{position.label}</h2><p className="text-xs font-medium text-slate-500">Select one candidate.</p></div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ballot.candidates.filter(candidate => candidate.category === position.category).map(candidate => (
              <div key={candidate.id} className="w-full"><CandidateCard candidate={candidate} selected={selections[position.category] === candidate.id} disabled={!canVote || isSubmitting} onSelect={() => { setSelections(current => ({ ...current, [position.category]: candidate.id })); setError(''); }} /></div>
            ))}
          </div>
        </section>
      ))}

      {!hasVoted && !message && <div className="sticky bottom-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
            <Lock className="h-4 w-4 text-slate-400" />
            <div>
              <p>Your ballot can only be submitted once.</p>
              <p id="ballot-selection-requirement" className="mt-1">Select one candidate for {eligiblePosition?.label || 'your assigned position'}.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={submitVote}
            disabled={!canVote || isSubmitting || !isBallotComplete}
            aria-describedby="ballot-selection-requirement"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
          >
            <UsersRound className="h-4 w-4" /> {isSubmitting ? 'Submitting...' : 'Submit Final Vote'}
          </button>
        </div>
      </div>}
    </div>
  );
}
