import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../../lib/api';
import { resolveAdminAccess } from './adminAccess';

const adminUser = {
  id: 'usr_admin',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'admin',
  status: 'active',
  organization: 'MAZ',
  position: 'Administrator',
  class: 'A' as const,
  accommodationProvided: false,
  roomNumber: '',
  transportProvided: false,
  selectedActivity: '',
  checkedIn: false,
  checkedInAt: ''
} as const;

test('resolveAdminAccess redirects unauthenticated visitors to login', () => {
  const result = resolveAdminAccess();
  assert.equal(result.state, 'redirect-login');
});

test('resolveAdminAccess allows verified admins through', () => {
  const result = resolveAdminAccess(adminUser);
  assert.equal(result.state, 'ready');
});

test('resolveAdminAccess blocks authenticated non-admin users', () => {
  const attendee = { ...adminUser, role: 'attendee' as const };
  const result = resolveAdminAccess(attendee);
  assert.equal(result.state, 'forbidden');
});

test('resolveAdminAccess maps 401 responses to login redirect', () => {
  const result = resolveAdminAccess(undefined, new ApiError('Unauthorized', 401));

  assert.equal(result.state, 'redirect-login');
});

test('resolveAdminAccess maps server failures to fatal state', () => {
  const result = resolveAdminAccess(undefined, new ApiError('Server exploded', 500));

  assert.equal(result.state, 'fatal');
});
