import type { Election, ElectionStatus } from '../types';

export const DEFAULT_ELECTION_TIMEZONE = 'Africa/Harare';

export function isValidElectionTimezone(timezone: string) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function parseElectionScheduleDate(value?: string, timezone: string = DEFAULT_ELECTION_TIMEZONE) {
  if (!value) return null;
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '00'] = match;
  const guess = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  if (Number.isNaN(guess.getTime()) || guess.toISOString().slice(0, 19) !== `${year}-${month}-${day}T${hour}:${minute}:${second}`) return null;
  const parts = zonedParts(guess, timezone);
  const offset = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function getEffectiveElectionStatus(election: Election, now = new Date()): ElectionStatus {
  const control = election.controlStatus || election.status;
  if (control === 'draft' || control === 'closed') return control;
  if (election.scheduleMode === 'daily' && control === 'open') return 'open'; // Manual override.

  const timezone = election.timezone || DEFAULT_ELECTION_TIMEZONE;
  const start = parseElectionScheduleDate(election.startsAt, timezone);
  const end = parseElectionScheduleDate(election.endsAt, timezone);
  if (end && now >= end) return 'closed';
  if (start && now < start) return 'scheduled';
  if (election.scheduleMode !== 'daily') return 'open';
  if (!start || !end || !election.startsAt || !election.endsAt) return 'scheduled';

  const opensAt = election.startsAt.slice(11, 16);
  const closesAt = election.endsAt.slice(11, 16);
  const current = zonedParts(now, timezone);
  const currentTime = `${current.hour}:${current.minute}`;
  return currentTime >= opensAt && currentTime < closesAt ? 'open' : 'scheduled';
}
