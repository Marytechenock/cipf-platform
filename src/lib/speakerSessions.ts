import type { Session, Speaker } from '../types';
import type { SpeakerAssignment } from '../types/sessionQuestions';

function normalize(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(dr|doctor|prof|professor|mr|mrs|ms|miss|sir|eng|engineer)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function topic(value: string) {
  return normalize(value).replace(/^session\s+\d+\s*/, '');
}

/** Suggestions only: presenter access is granted through the administrator's Save action. */
export function getProgrammeSpeakerSessionIds(speaker: Speaker, sessions: Session[]): string[] {
  const name = normalize(speaker.name);
  if (name.split(' ').length < 2) return [];
  return sessions.filter(session => {
    if (session.type && session.type !== 'session') return false;
    const facilitator = normalize(session.facilitator || '');
    // Full-name boundaries support panels and role prefixes without matching surnames alone.
    if (` ${facilitator} `.includes(` ${name} `)) return true;
    // A topic can identify an unassigned session, but never override a different facilitator.
    const unassigned = !facilitator || ['tba', 'tbc', 'to be announced', 'to be confirmed'].includes(facilitator);
    return unassigned && Boolean(topic(speaker.topic)) && topic(speaker.topic) === topic(session.topic);
  }).map(session => session.id);
}

export function getInitialSpeakerSessionIds(speaker: Speaker, sessions: Session[], assignment?: SpeakerAssignment): string[] {
  const configured = assignment?.configured ?? Boolean(assignment?.userId || assignment?.sessionIds.length);
  return configured ? [...(assignment?.sessionIds || [])] : getProgrammeSpeakerSessionIds(speaker, sessions);
}
