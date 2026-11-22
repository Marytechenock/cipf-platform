import assert from 'node:assert/strict';
import test from 'node:test';
import type { Session, Speaker } from '../types';
import { getInitialSpeakerSessionIds, getProgrammeSpeakerSessionIds } from './speakerSessions';

const speaker: Speaker = { id: 'sp_1', name: 'Dr. Jane Smith', topic: 'Marketing Strategy', organization: '', position: '', speakingTime: '', bio: '', photoUrl: '' };
const session = (overrides: Partial<Session> = {}): Session => ({ id: 'session_1', facilitator: 'Dr Jane Smith', topic: 'Session 1: Marketing Strategy', category: 'Class B', day: 1, dayLabel: 'Day 1', time: '10:00–11:00', venue: 'Main Room', type: 'session', ...overrides });

test('speaker selection preselects Programme sessions across cohorts and panels using full names', () => {
  const sessions = [session(), session({ id: 'panel', facilitator: 'Panel: Mr Alex Jones; Prof. JANE SMITH' }), session({ id: 'class_a', category: 'Class A' })];
  assert.deepEqual(getInitialSpeakerSessionIds(speaker, sessions, { speakerId: speaker.id, userId: null, sessionIds: [], configured: false }), ['session_1', 'panel', 'class_a']);
});

test('preselection does not confuse surnames, partial names, different presenters or social events', () => {
  const sessions = [session({ facilitator: 'Janet Smith' }), session({ id: 'surname', facilitator: 'Smith' }), session({ id: 'different', facilitator: 'Alex Jones' }), session({ id: 'social', type: 'social' }), session({ id: 'break', type: 'break' })];
  assert.deepEqual(getProgrammeSpeakerSessionIds(speaker, sessions), []);
  assert.deepEqual(getProgrammeSpeakerSessionIds({ ...speaker, name: 'Smith' }, [session()]), []);
});

test('an exact topic can suggest an unassigned session but never override another facilitator', () => {
  assert.deepEqual(getProgrammeSpeakerSessionIds(speaker, [session({ facilitator: 'TBA' }), session({ id: 'blank', facilitator: '' }), session({ id: 'other', facilitator: 'Alex Jones' })]), ['session_1', 'blank']);
});

test('saved assignments preserve added sessions and intentionally unticked sessions', () => {
  const sessions = [session(), session({ id: 'extra', facilitator: 'Another Speaker' })];
  assert.deepEqual(getInitialSpeakerSessionIds(speaker, sessions, { speakerId: speaker.id, userId: 'user_1', sessionIds: ['extra'], configured: true }), ['extra']);
  assert.deepEqual(getInitialSpeakerSessionIds(speaker, sessions, { speakerId: speaker.id, userId: null, sessionIds: [], configured: true }), []);
});

test('minor spelling differences require administrator review instead of silently granting access', () => {
  assert.deepEqual(getProgrammeSpeakerSessionIds({ ...speaker, name: 'Patson Gasura' }, [session({ facilitator: 'Patson Gatsura' })]), []);
});
