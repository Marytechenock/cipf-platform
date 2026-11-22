import CheckInSearch from './CheckInSearch';

export default function CheckInConfirm() {
  const attendeeId = window.location.pathname.split('/').filter(Boolean).pop() || '';
  return <CheckInSearch attendeeId={attendeeId} />;
}
