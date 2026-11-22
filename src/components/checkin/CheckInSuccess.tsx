import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Building2, Clock3, LoaderCircle, LogIn, Mail } from 'lucide-react';
import { api } from '../../lib/api';
import type { CheckInAttendee } from '../../types';
import { CheckInBackground } from './CheckInBackground';
import WhatsAppGroupCard from '../WhatsAppGroupCard';
import './checkin.css';

export default function CheckInSuccess() {
  const [attendee, setAttendee] = useState<CheckInAttendee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const userId = window.location.pathname.split('/').filter(Boolean).pop();
    if (!userId) {
      setError('Check-in details not found.');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    api.getAttendeeForCheckin(userId).then(data => {
      if (cancelled) return;
      if (!data.checkedIn) {
        window.location.href = `/checkin/confirm/${encodeURIComponent(userId)}`;
        return;
      }
      setAttendee(data);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your check-in details.');
    }).finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const checkedInAt = attendee?.checkedInAt ? new Date(attendee.checkedInAt) : null;
  const formattedDate = checkedInAt && !Number.isNaN(checkedInAt.getTime())
    ? checkedInAt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Confirmed';

  return (
    <main className="professional-checkin">
      <CheckInBackground />
      <div className="checkin-panel checkin-success-panel">
        {isLoading ? (
          <div className="checkin-status" role="status">
            <LoaderCircle className="animate-spin" size={32} aria-hidden="true" />
            <header className="checkin-heading"><h1>Confirming your check-in</h1><p>Loading your registration details...</p></header>
          </div>
        ) : error || !attendee ? (
          <div className="checkin-status">
            <span className="checkin-status-icon is-error"><AlertCircle size={30} aria-hidden="true" /></span>
            <header className="checkin-heading"><h1>Unable to load</h1><p role="alert">{error || 'Check-in details not found.'}</p></header>
            <a className="checkin-gold-button" href="/checkin">Back to check-in <ArrowRight size={17} aria-hidden="true" /></a>
          </div>
        ) : (
          <>
            <span className="checkin-animated-success" aria-hidden="true">
              <svg viewBox="0 0 88 88" fill="none">
                <circle cx="44" cy="44" r="26" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.5" />
                <circle className="checkin-success-ring" cx="44" cy="44" r="26" pathLength="100" transform="rotate(-90 44 44)" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="100" />
                <path className="checkin-success-tick" d="M33 44L41 52L55 37" pathLength="1" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <header className="checkin-heading">
              <h1>Check-in complete!</h1>
              <p>Your registration is confirmed. You're ready to go.</p>
            </header>

            <div className="checkin-selected-attendee">
              <span className="checkin-avatar checkin-success-initials" aria-hidden="true">{attendee.firstName.charAt(0)}{attendee.lastName.charAt(0)}</span>
              <div className="checkin-person-info"><strong>{attendee.firstName} {attendee.lastName}</strong><span>Registered attendee</span></div>
            </div>

            <dl className="checkin-confirmation-details">
              <div><dt><Mail size={16} aria-hidden="true" /> Email address</dt><dd>{attendee.email || 'Not provided'}</dd></div>
              <div><dt><Building2 size={16} aria-hidden="true" /> Organization</dt><dd>{attendee.organization || 'Not listed'}</dd></div>
              <div><dt><Clock3 size={16} aria-hidden="true" /> Check-in time</dt><dd>{formattedDate}</dd></div>
            </dl>

            <a className="checkin-gold-button" href="/"><LogIn size={17} aria-hidden="true" /> Go to Login <ArrowRight size={17} aria-hidden="true" /></a>
            <p className="checkin-success-note">Log in with your email and the password you just created.</p>
            <WhatsAppGroupCard compact />
          </>
        )}
      </div>
    </main>
  );
}
