import assert from 'node:assert/strict';
import test from 'node:test';
import type { Election } from '../types';
import { getEffectiveElectionStatus, parseElectionScheduleDate } from './electionSchedule';

const dailyElection: Election = {
  id: 'election_1', title: 'Board election', description: '',
  status: 'scheduled', controlStatus: 'scheduled', scheduleMode: 'daily', boardSeats: 3,
  startsAt: '2026-12-01T07:00:00', endsAt: '2026-12-04T17:00:00', timezone: 'Africa/Harare',
  createdBy: 'admin_1', createdAt: '', updatedAt: ''
};

test('a four-day election opens at 07:00 and pauses at 17:00 each day', () => {
  const statusAt = (instant: string) => getEffectiveElectionStatus(dailyElection, new Date(instant));
  assert.equal(parseElectionScheduleDate(dailyElection.startsAt, dailyElection.timezone)?.toISOString(), '2026-12-01T05:00:00.000Z');
  assert.equal(statusAt('2026-12-01T04:59:59Z'), 'scheduled');
  assert.equal(statusAt('2026-12-01T05:00:00Z'), 'open');
  assert.equal(statusAt('2026-12-01T14:59:59Z'), 'open');
  assert.equal(statusAt('2026-12-01T15:00:00Z'), 'scheduled');
  assert.equal(statusAt('2026-12-02T04:59:59Z'), 'scheduled');
  assert.equal(statusAt('2026-12-02T05:00:00Z'), 'open');
  assert.equal(statusAt('2026-12-04T14:59:59Z'), 'open');
  assert.equal(statusAt('2026-12-04T15:00:00Z'), 'closed');
});

test('manual controls override daily hours until automatic scheduling is resumed', () => {
  const night = new Date('2026-12-02T20:00:00Z');
  assert.equal(getEffectiveElectionStatus({ ...dailyElection, controlStatus: 'open' }, night), 'open');
  assert.equal(getEffectiveElectionStatus({ ...dailyElection, controlStatus: 'closed' }, new Date('2026-12-02T08:00:00Z')), 'closed');
  assert.equal(getEffectiveElectionStatus({ ...dailyElection, controlStatus: 'scheduled' }, night), 'scheduled');
  assert.equal(getEffectiveElectionStatus({ ...dailyElection, controlStatus: 'draft' }, new Date('2026-12-02T08:00:00Z')), 'draft');
});

test('continuous election keeps one opening and closing window', () => {
  const election = { ...dailyElection, scheduleMode: 'continuous' as const };
  assert.equal(getEffectiveElectionStatus(election, new Date('2026-12-02T20:00:00Z')), 'open');
  assert.equal(getEffectiveElectionStatus(election, new Date('2026-12-04T15:00:00Z')), 'closed');
});
