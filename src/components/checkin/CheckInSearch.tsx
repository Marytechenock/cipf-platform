import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, Search, UserRound } from 'lucide-react';
import { api, isApiErrorStatus } from '../../lib/api';
import { CheckInBackground } from './CheckInBackground';
import './checkin.css';

type SearchResult = Awaited<ReturnType<typeof api.searchAttendees>>[number];
type Attendee = Awaited<ReturnType<typeof api.getAttendeeForCheckin>>;

export default function CheckInSearch({ attendeeId = '' }: { attendeeId?: string }) {
  const isAccountStep = Boolean(attendeeId);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedId, setSelectedId] = useState(attendeeId);
  const [attendee, setAttendee] = useState<Attendee | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingAttendee, setLoadingAttendee] = useState(isAccountStep);
  const [searchError, setSearchError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [emailConflict, setEmailConflict] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const hasQuery = query.trim().replace(/\s+/g, '').length >= 2;
  const passwordStrength = password.length === 0 ? 0 : Math.min(4,
    Number(password.length >= 6) + Number(password.length >= 10) +
    Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) + Number(/[^a-zA-Z]/.test(password))
  );

  useEffect(() => {
    if (isAccountStep) return;
    if (!hasQuery) {
      setResults([]);
      setSearching(false);
      setSearchError('');
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError('');
    setResults([]);
    const timeout = window.setTimeout(async () => {
      try {
        const matches = await api.searchAttendees(query.trim());
        if (!cancelled) setResults(matches);
      } catch (error) {
        if (!cancelled) setSearchError(error instanceof Error ? error.message : 'Could not search. Please try again.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [query, hasQuery, isAccountStep]);

  useEffect(() => {
    if (!attendeeId) return;
    let cancelled = false;
    setLoadingAttendee(true);
    api.getAttendeeForCheckin(attendeeId).then(data => {
      if (cancelled) return;
      if (data.checkedIn) {
        window.location.href = `/checkin/success/${data.id}`;
        return;
      }
      setAttendee(data);
      setEmail(data.email || '');
    }).catch(error => {
      if (!cancelled) setAccountError(error instanceof Error ? error.message : 'Could not load your details. Please go back and search again.');
    }).finally(() => { if (!cancelled) setLoadingAttendee(false); });
    return () => { cancelled = true; };
  }, [attendeeId]);

  const continueCheckin = () => {
    if (!selectedId) return;
    window.location.href = `/checkin/confirm/${encodeURIComponent(selectedId)}`;
  };

  const createAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!attendee || submitting) return;
    setAccountError('');
    setEmailConflict(false);
    if (password.length < 6) {
      setAccountError('Use at least 6 characters for your password.');
      return;
    }
    if (password !== confirmation) {
      setAccountError('Your passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await api.confirmCheckin({ userId: attendee.id, email: email.trim(), password });
      window.location.href = `/checkin/success/${attendee.id}`;
    } catch (error) {
      setEmailConflict(isApiErrorStatus(error, [409]));
      setAccountError(error instanceof Error ? error.message : 'Could not complete check-in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="professional-checkin">
      <CheckInBackground />
      <div className="checkin-panel">
        <header className="checkin-heading">
          <h1>18th Annual Marketers Convention 2026</h1>
          <p>Find your name and create your account to continue.</p>
        </header>
        <ol className="checkin-steps" aria-label="Check-in progress">
          <li className="is-active" aria-current={!isAccountStep ? 'step' : undefined}>
            <span>{isAccountStep ? <Check size={14} aria-hidden="true" /> : '1'}</span>
            <span className="sr-only">Find your name</span>
          </li>
          <li className={isAccountStep ? 'is-active' : ''} aria-current={isAccountStep ? 'step' : undefined}>
            <span>2</span><span className="sr-only">Create your account</span>
          </li>
        </ol>
        <div className="checkin-content">
          {!isAccountStep && <section className="checkin-stage" aria-labelledby="checkin-find-heading">
            <h2 id="checkin-find-heading">Find your name</h2>
            <p className="checkin-description">Search for your name in the registered attendees list to get started.</p>
            <div className="checkin-field">
              <Search size={18} aria-hidden="true" />
              <input aria-label="Search your name" type="search" placeholder="Search your name" value={query}
                disabled={submitting || loadingAttendee}
                onChange={event => {
                  setQuery(event.target.value);
                  setSelectedId('');
                  setAttendee(null);
                  setEmail('');
                  setPassword('');
                  setConfirmation('');
                  setAccountError('');
                }} />
              {searching && <LoaderCircle size={16} className="animate-spin" aria-label="Searching" />}
            </div>
            <div className="checkin-results" aria-live="polite" aria-busy={searching || loadingAttendee}>
              {searchError && <p className="checkin-error" role="alert">{searchError}</p>}
              {!searchError && !searching && hasQuery && results.length === 0 && <p className="checkin-hint">No matching attendees. Check your spelling or visit the registration desk.</p>}
              {!searchError && !hasQuery && results.length === 0 && !loadingAttendee && <p className="checkin-hint">Enter at least 2 characters to find your registration.</p>}
              {results.map(person => (
                <button key={person.id} type="button" className={`checkin-person ${selectedId === person.id ? 'is-selected' : ''}`}
                  aria-pressed={selectedId === person.id} disabled={submitting || loadingAttendee}
                  onClick={() => {
                    setSelectedId(person.id);
                    setAttendee(null);
                    setEmail('');
                    setPassword('');
                    setConfirmation('');
                    setShowPassword(false);
                    setShowConfirmation(false);
                    setAccountError('');
                  }}>
                  <span className="checkin-avatar"><UserRound size={21} aria-hidden="true" /></span>
                  <span className="checkin-person-info"><strong>{person.firstName} {person.lastName}</strong><span>{person.organization || 'Registered attendee'}</span></span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ))}
            </div>
            <button className="checkin-gold-button" type="button" onClick={continueCheckin}
              disabled={!selectedId || loadingAttendee || submitting}>
              {loadingAttendee ? <><LoaderCircle size={17} className="animate-spin" /> Loading...</> : <>Continue <ArrowRight size={18} aria-hidden="true" /></>}
            </button>
          </section>}
          {isAccountStep && <section className="checkin-stage" aria-labelledby="checkin-account-heading">
            <h2 id="checkin-account-heading">Create your account</h2>
            <p className="checkin-description">Add your email and create a password to complete your check-in.</p>
            {loadingAttendee && <p className="checkin-hint" role="status"><LoaderCircle size={16} className="inline animate-spin" /> Loading your registration...</p>}
            {attendee && <div className="checkin-selected-attendee">
              <span className="checkin-avatar"><UserRound size={21} aria-hidden="true" /></span>
              <div className="checkin-person-info"><strong>{attendee.firstName} {attendee.lastName}</strong><span>{attendee.organization || 'Registered attendee'}</span></div>
            </div>}
            <form onSubmit={createAccount} className="checkin-account-form">
              <fieldset disabled={!attendee || submitting || loadingAttendee}>
                <legend className="sr-only">Account details{attendee ? ` for ${attendee.firstName} ${attendee.lastName}` : ''}</legend>
                <div className="checkin-field"><Mail size={17} aria-hidden="true" />
                  <input aria-label="Email address" type="email" autoComplete="email" required placeholder="Email address" value={email} onChange={event => setEmail(event.target.value)} />
                </div>
                <div className="checkin-field"><LockKeyhole size={17} aria-hidden="true" />
                  <input aria-label="Create password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} required placeholder="Create password" value={password} onChange={event => setPassword(event.target.value)} />
                  <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(current => !current)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
                <div className="checkin-field"><LockKeyhole size={17} aria-hidden="true" />
                  <input aria-label="Confirm password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" minLength={6} required placeholder="Confirm password" value={confirmation} onChange={event => setConfirmation(event.target.value)} />
                  <button type="button" aria-label={showConfirmation ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmation} onClick={() => setShowConfirmation(current => !current)}>{showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
                <div className="checkin-password-strength">
                  <span>Password strength{password ? `: ${['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][passwordStrength]}` : ''}</span>
                  <div aria-hidden="true">{[1, 2, 3, 4].map(level => <i key={level} className={passwordStrength >= level ? 'is-filled' : ''} />)}</div>
                </div>
              </fieldset>
              {accountError && <p className="checkin-error" role="alert">{accountError}</p>}
              {emailConflict && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-gray-700">
                <p>Your voting account may already use this email. Support can verify the records and reset your password or correct the attendee profile.</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <a href="/" className="font-semibold text-[#8B6914] underline">Go to login</a>
                  <a href="/checkin/support" className="font-semibold text-[#8B6914] underline">Get help with check-in or password reset</a>
                </div>
              </div>}
              <button className="checkin-gold-button" type="submit" disabled={!attendee || submitting || loadingAttendee}>
                {submitting ? <><LoaderCircle size={17} className="animate-spin" /> Creating account...</> : <>Create account <ArrowRight size={18} aria-hidden="true" /></>}
              </button>
            </form>
            {!submitting && <a href="/checkin" className="checkin-back-link"><ArrowLeft size={16} aria-hidden="true" /> Back to find your name</a>}
          </section>}
        </div>
      </div>
    </main>
  );
}
