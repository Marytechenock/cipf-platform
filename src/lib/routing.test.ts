import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAppRoute } from './routing';

test('parseAppRoute recognizes the canonical admin path', () => {
  assert.deepEqual(parseAppRoute('/admin'), { kind: 'admin' });
  assert.deepEqual(parseAppRoute('/admin/'), { kind: 'admin' });
});

test('parseAppRoute preserves check-in routes', () => {
  assert.deepEqual(parseAppRoute('/checkin/confirm/usr_1'), {
    kind: 'checkin',
    path: '/checkin/confirm/usr_1'
  });
});

test('parseAppRoute falls back to the main app workspace', () => {
  assert.deepEqual(parseAppRoute('/'), { kind: 'app' });
  assert.deepEqual(parseAppRoute('/gallery'), { kind: 'app' });
});

test('parseAppRoute recognizes presenter and session-specific projector pages', () => {
  assert.deepEqual(parseAppRoute('/session-questions/presenter'), { kind: 'session-questions', mode: 'presenter', sessionId: '' });
  assert.deepEqual(parseAppRoute('/session-questions/display/session_1'), { kind: 'session-questions', mode: 'display', sessionId: 'session_1' });
  assert.deepEqual(parseAppRoute('/session-questions/display/%'), { kind: 'app' });
});
