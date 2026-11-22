import test from 'node:test';
import assert from 'node:assert/strict';
import { StoredUser as User } from '../types';
import {
  filterAdminUsers,
  hasMinimumSearchLength,
  listAdminUsers,
  listPublicAttendees,
  searchAttendees,
  toPublicAttendeeSearchResults
} from './attendee-search';

const attendees: User[] = [
  {
    id: 'usr_1',
    firstName: 'Collins',
    lastName: 'Tonhodzayi',
    email: 'collins@delta.co.zw',
    role: 'attendee',
    organization: 'Delta',
    position: 'Sales Specialist',
    status: 'active',
    class: 'A',
    accommodationProvided: false,
    roomNumber: '',
    transportProvided: false,
    selectedActivity: '',
    checkedIn: false,
    checkedInAt: '',
    hasSetPassword: false,
    password: ''
  },
  {
    id: 'usr_2',
    firstName: 'Linda',
    lastName: 'Matowa',
    email: 'linda@nedbank.co.zw',
    role: 'attendee',
    organization: 'Nedbank',
    position: 'Marketing Officer',
    status: 'active',
    class: 'A',
    accommodationProvided: false,
    roomNumber: '',
    transportProvided: false,
    selectedActivity: '',
    checkedIn: false,
    checkedInAt: '',
    hasSetPassword: false,
    password: ''
  },
  {
    id: 'usr_3',
    firstName: 'Dr',
    lastName: 'Hidden',
    email: 'hidden@example.com',
    role: 'admin',
    organization: 'Admin Org',
    position: 'Admin',
    status: 'active',
    class: 'A',
    accommodationProvided: false,
    roomNumber: '',
    transportProvided: false,
    selectedActivity: '',
    checkedIn: false,
    checkedInAt: '',
    hasSetPassword: false,
    password: ''
  },
  {
    id: 'usr_4',
    firstName: 'Mary',
    lastName: 'Techenock',
    email: 'mary@example.com',
    role: 'attendee',
    organization: 'Marytech',
    position: 'Advisor',
    status: 'disabled',
    class: 'A',
    accommodationProvided: false,
    roomNumber: '',
    transportProvided: false,
    selectedActivity: '',
    checkedIn: false,
    checkedInAt: '',
    hasSetPassword: false,
    password: ''
  }
];

test('matches exact full names with flexible spacing and case', () => {
  const results = searchAttendees(attendees, '  COLLINS   tonhodzayi ');
  assert.deepEqual(results.map(user => user.id), ['usr_1']);
});

test('matches reversed name order and ignores honorifics in query', () => {
  const results = searchAttendees(attendees, 'Mr Tonhodzayi Collins');
  assert.deepEqual(results.map(user => user.id), ['usr_1']);
});

test('matches by partial tokens and email fragments', () => {
  const byName = searchAttendees(attendees, 'lind mat');
  const byEmail = searchAttendees(attendees, 'nedbank.co.zw');

  assert.deepEqual(byName.map(user => user.id), ['usr_2']);
  assert.deepEqual(byEmail.map(user => user.id), ['usr_2']);
});

test('excludes admins and disabled attendees', () => {
  assert.deepEqual(searchAttendees(attendees, 'hidden').map(user => user.id), []);
  assert.deepEqual(searchAttendees(attendees, 'mary').map(user => user.id), []);
});

test('ranks exact full-name matches ahead of partial matches', () => {
  const users: User[] = [
    ...attendees,
    {
      ...attendees[1],
      id: 'usr_5',
      firstName: 'Collins Tonhodzayi',
      lastName: 'Junior',
      email: 'collins.tonhodzayi.junior@example.com',
      status: 'active'
    }
  ];

  const results = searchAttendees(users, 'Collins Tonhodzayi');
  assert.deepEqual(results.map(user => user.id).slice(0, 2), ['usr_1', 'usr_5']);
});

test('enforces minimum search length and trims public payload', () => {
  assert.equal(hasMinimumSearchLength(' c '), false);
  assert.equal(hasMinimumSearchLength(' c o '), true);

  const results = toPublicAttendeeSearchResults(searchAttendees(attendees, 'collins'));
  assert.deepEqual(results, [
    {
      id: 'usr_1',
      firstName: 'Collins',
      lastName: 'Tonhodzayi',
      organization: 'Delta'
    }
  ]);
});

test('lists public attendees with pagination and search by organization', () => {
  const results = listPublicAttendees(attendees, { q: 'delta', page: 1, pageSize: 10 });
  assert.equal(results.total, 1);
  assert.equal(results.hasMore, false);
  assert.deepEqual(results.items.map(item => item.id), ['usr_1']);
});

test('filters admin users by status, role, and checked-in state', () => {
  const adminUsers = filterAdminUsers([
    ...attendees,
    {
      ...attendees[0],
      id: 'usr_6',
      role: 'admin',
      checkedIn: true
    }
  ], {
    role: 'admin',
    checkedIn: 'true',
    status: 'active'
  });

  assert.deepEqual(adminUsers.map(user => user.id), ['usr_6']);
});

test('paginates admin users', () => {
  const paged = listAdminUsers([
    ...attendees,
    {
      ...attendees[0],
      id: 'usr_7',
      firstName: 'Aaron',
      lastName: 'Zulu',
      status: 'active'
    }
  ], {
    page: 1,
    pageSize: 1,
    status: 'active',
    role: 'attendee',
    sort: 'name_asc'
  });

  assert.equal(paged.total, 3);
  assert.equal(paged.hasMore, true);
  assert.deepEqual(paged.items.map(user => user.id), ['usr_2']);
});
