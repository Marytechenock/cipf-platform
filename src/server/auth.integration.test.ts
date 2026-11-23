import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { eventDressCode, getDressCodeContext } from '../config/dressCode';
import type { SessionQuestionRepository } from './session-question-store';
import type { AudienceQuestion, AudienceQuestionAction, SpeakerAssignment } from '../types/sessionQuestions';
import type {
  AdventureActivity,
  DayLink,
  Election,
  ElectionCandidate,
  ElectionVote,
  ElectionVoter,
  FeedbackSubmission,
  GalleryImage,
  Session,
  SessionNote,
  Speaker,
  Sponsor,
  StoredUser,
  Testimonial,
  VenueInfo
} from '../types';

const AUTH_COOKIE_NAME = 'cipf_auth';
const TEST_AUTH_SECRET = 'test-auth-secret';
const SUPPORT_MESSAGE = 'Password recovery is handled by the Marytechenock Solutions support team. Please contact the administrator to reset your access securely.';

type TestDatabase = ReturnType<typeof createTestDatabase>;

function createUser(overrides: Partial<StoredUser>): StoredUser {
  return {
    id: 'user_default',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    role: 'attendee',
    organization: 'MAZ',
    position: 'Delegate',
    status: 'active',
    class: 'A',
    accommodationProvided: false,
    roomNumber: '',
    transportProvided: false,
    selectedActivity: '',
    checkedIn: true,
    checkedInAt: '2026-06-23T08:00:00.000Z',
    hasSetPassword: true,
    password: '',
    ...overrides
  };
}

function createSessionNote(note: Partial<SessionNote> & Pick<SessionNote, 'userId' | 'sessionId'>): SessionNote {
  return {
    id: note.id ?? `note_${Date.now()}`,
    userId: note.userId,
    sessionId: note.sessionId,
    content: note.content ?? '',
    updatedAt: note.updatedAt ?? new Date().toISOString()
  };
}

function createTestDatabase() {
  const state: {
    users: StoredUser[];
    elections: Election[];
    electionVoters: ElectionVoter[];
    electionCandidates: ElectionCandidate[];
    electionVotes: ElectionVote[];
    sessions: Session[];
    notes: SessionNote[];
    feedback: FeedbackSubmission[];
    speakers: Speaker[];
    sponsors: Sponsor[];
    testimonials: Testimonial[];
    gallery: GalleryImage[];
    venue: VenueInfo;
    adventures: AdventureActivity[];
    googleDriveLink: string;
  } = {
    users: [],
    elections: [],
    electionVoters: [],
    electionCandidates: [],
    electionVotes: [],
    sessions: [
      {
        id: 'session_1',
        category: 'Class A',
        day: 1,
        dayLabel: 'Day 1',
        time: '09:00',
        topic: 'Opening Session',
        facilitator: 'MAZ Team',
        venue: 'Main Hall'
      }
    ],
    notes: [],
    feedback: [],
    speakers: [],
    sponsors: [],
    testimonials: [],
    gallery: [],
    venue: {
      id: 'venue_1',
      title: 'Test Venue',
      overview: '',
      accommodation: '',
      conference: '',
      views: '',
      amenities: [],
      imageUrl: ''
    },
    adventures: [],
    googleDriveLink: 'https://example.com/drive'
  };

  const database = {
    state,
    sessionQuestions: undefined as SessionQuestionRepository | undefined,
    async ready() {},
    async getElection(id: string) {
      return state.elections.find(election => election.id === id);
    },
    async getActiveElection() {
      return state.elections[0];
    },
    async getElectionDashboard() {
      return { election: state.elections[0] ?? null, candidates: state.electionCandidates, voters: state.electionVoters, votes: state.electionVotes };
    },
    async getElectionBallot(userId: string) {
      const election = state.elections[0] ?? null;
      return { election, candidates: election ? state.electionCandidates.filter(candidate => candidate.electionId === election.id) : [],
        voter: election ? state.electionVoters.find(voter => voter.electionId === election.id && voter.userId === userId) ?? null : null,
        votes: election ? state.electionVotes.filter(vote => vote.electionId === election.id && vote.voterId === userId) : [] };
    },
    async getDayLinks(): Promise<DayLink[]> {
      return [];
    },
    async listQAQuestions() {
      return [];
    },
    async getElectionVoter(electionId: string, userId: string) {
      return state.electionVoters.find(voter => voter.electionId === electionId && voter.userId === userId);
    },
    async listElectionVoters(electionId: string) {
      return state.electionVoters.filter(voter => voter.electionId === electionId);
    },
    async listElectionCandidates(electionId: string) {
      return state.electionCandidates.filter(candidate => candidate.electionId === electionId);
    },
    async listElectionVotes(electionId: string, userId: string) {
      return state.electionVotes.filter(vote => vote.electionId === electionId && vote.voterId === userId);
    },
    async saveElectionVotes(electionId: string, userId: string, votes: ElectionVote[]) {
      state.electionVotes.push(...votes);
      return votes;
    },
    async saveElectionVoter(voter: ElectionVoter) {
      const existing = state.electionVoters.find(item => item.electionId === voter.electionId && item.userId === voter.userId);
      if (existing) {
        existing.identifier = voter.identifier || existing.identifier;
        existing.memberCategory = voter.memberCategory || existing.memberCategory;
        existing.eligibleCategory = voter.eligibleCategory || existing.eligibleCategory;
        return existing;
      }
      state.electionVoters.push(voter);
      return voter;
    },
    async findUserByEmail(email: string) {
      return state.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
    },
    async getUserById(id: string) {
      return state.users.find(user => user.id === id);
    },
    async updateUserCheckin(userId: string, updates: Partial<StoredUser>) {
      const user = state.users.find(item => item.id === userId);
      if (!user) {
        throw new Error('User not found');
      }
      Object.assign(user, updates);
      return user;
    },
    async searchAttendees() {
      return state.users.filter(user => user.role === 'attendee' && user.status === 'active');
    },
    async listPublicAttendees() {
      const attendees = state.users
        .filter(user => user.role === 'attendee' && user.status === 'active')
        .map(user => ({
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          organization: user.organization
        }));

      return {
        items: attendees,
        page: 1,
        pageSize: attendees.length || 25,
        total: attendees.length,
        hasMore: false
      };
    },
    async listAdminUsers() {
      return {
        items: state.users.slice(),
        page: 1,
        pageSize: state.users.length || 25,
        total: state.users.length,
        hasMore: false
      };
    },
    async exportAdminUsers() {
      return state.users.slice();
    },
    async getSessions() {
      return state.sessions.slice();
    },
    async getSpeakers() {
      return state.speakers.slice();
    },
    async getSponsors() {
      return state.sponsors.slice();
    },
    async getTestimonials() {
      return state.testimonials.slice();
    },
    async getGallery() {
      return state.gallery.slice();
    },
    async getVenue() {
      return { ...state.venue, amenities: [...state.venue.amenities] };
    },
    async getAdventures() {
      return state.adventures.slice();
    },
    async getGoogleDriveLink() {
      return state.googleDriveLink;
    },
    async getNotes(userId: string) {
      return state.notes.filter(note => note.userId === userId);
    },
    async saveNote(note: { userId: string; sessionId: string; content?: string }) {
      const existing = state.notes.find(item => item.userId === note.userId && item.sessionId === note.sessionId);
      if (existing) {
        existing.content = note.content ?? '';
        existing.updatedAt = new Date().toISOString();
        return existing;
      }

      const saved = createSessionNote(note);
      state.notes.push(saved);
      return saved;
    },
    async deleteNote(userId: string, sessionId: string) {
      const before = state.notes.length;
      state.notes = state.notes.filter(note => !(note.userId === userId && note.sessionId === sessionId));
      return state.notes.length !== before;
    },
    async saveFeedback(feedback: FeedbackSubmission) {
      state.feedback.push(feedback);
      return feedback;
    },
    async getFeedback() {
      return state.feedback.slice();
    },
    async saveUser(user: StoredUser) {
      const index = state.users.findIndex(item => item.id === user.id);
      if (index >= 0) {
        state.users[index] = { ...user };
      } else {
        state.users.push({ ...user });
      }
      return user;
    },
    async deleteUser(id: string) {
      const before = state.users.length;
      state.users = state.users.filter(user => user.id !== id);
      return state.users.length !== before;
    },
    async saveSpeaker(speaker: Speaker) {
      return speaker;
    },
    async deleteSpeaker() {
      return true;
    },
    async saveSession(session: Session) {
      return session;
    },
    async deleteSession() {
      return true;
    },
    async saveSponsor(sponsor: Sponsor) {
      return sponsor;
    },
    async deleteSponsor() {
      return true;
    },
    async saveTestimonial(testimonial: Testimonial) {
      return testimonial;
    },
    async deleteTestimonial() {
      return true;
    },
    async saveGalleryImage(image: GalleryImage) {
      return image;
    },
    async deleteGalleryImage() {
      return true;
    },
    async saveVenue(venue: VenueInfo) {
      state.venue = { ...venue };
      return venue;
    },
    async saveAdventure(adventure: AdventureActivity) {
      return adventure;
    },
    async deleteAdventure() {
      return true;
    },
    async saveGoogleDriveLink(link: string) {
      state.googleDriveLink = link;
      return link;
    }
  };

  return database;
}

async function createHarness() {
  process.env.NODE_ENV = 'test';
  const [{ createApp }, adminPassword, attendeePassword, disabledPassword] = await Promise.all([
    import('../../server.ts'),
    bcrypt.hash('AdminPass123!', 4),
    bcrypt.hash('AttendeePass123!', 4),
    bcrypt.hash('DisabledPass123!', 4)
  ]);

  const database = createTestDatabase();
  database.state.users = [
    createUser({
      id: 'admin_1',
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'Owner',
      role: 'admin',
      password: adminPassword
    }),
    createUser({
      id: 'attendee_1',
      email: 'attendee@example.com',
      firstName: 'Attendee',
      lastName: 'Member',
      role: 'attendee',
      password: attendeePassword
    }),
    createUser({
      id: 'disabled_1',
      email: 'disabled@example.com',
      firstName: 'Disabled',
      lastName: 'Member',
      role: 'attendee',
      status: 'disabled',
      password: disabledPassword
    })
  ];

  const app = await createApp({
    db: database as any,
    authTokenSecret: TEST_AUTH_SECRET,
    authTokenTtl: '1h',
    cookieSecure: true,
    serveFrontend: false
  });

  const server = await new Promise<any>((resolve, reject) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    instance.on('error', reject);
  });
  const { port } = server.address() as AddressInfo;

  return {
    db: database,
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

function extractCookie(setCookieHeader: string | null) {
  assert.ok(setCookieHeader, 'Expected a Set-Cookie header.');
  return setCookieHeader.split(';', 1)[0];
}

async function login(baseUrl: string, email: string, password: string, rememberMe = true) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, rememberMe })
  });

  return response;
}

test('election membership reuses attendees and retrying does not duplicate or overwrite their account', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.elections.push({ id: 'election_1', title: 'Board', description: '', status: 'draft', boardSeats: 4, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  const original = { ...harness.db.state.users.find(user => user.id === 'attendee_1')! };
  const cookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${harness.baseUrl}/api/admin/elections/election_1/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: ' ATTENDEE@EXAMPLE.COM ', identifier: 'ATTENDEE-001', firstName: 'Overwrite', lastName: 'Attempt', organization: 'Other', eligibleCategory: 'employee_representative' })
    });
    assert.equal(response.status, attempt === 0 ? 200 : 409);
    if (attempt === 1) continue;
    const result = await response.json();
    assert.equal(result.reused, true);
    assert.equal(result.user.id, original.id);
    assert.equal(result.user.password, undefined);
  }
  assert.deepEqual(harness.db.state.users.find(user => user.id === original.id), original);
  assert.equal(harness.db.state.users.length, 3);
  assert.equal(harness.db.state.electionVoters.length, 1);
  assert.equal(harness.db.state.electionVoters[0].userId, original.id);
  assert.equal((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).status, 200);
});

test('new election members can later gain attendee access while keeping their account and voter entry', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.elections.push({ id: 'election_1', title: 'Board', description: '', status: 'draft', boardSeats: 4, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  const cookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };
  const response = await fetch(`${harness.baseUrl}/api/admin/elections/election_1/members`, {
    method: 'POST', headers, body: JSON.stringify({ identifier: 'NEW-MEMBER-001', email: 'new@example.com', firstName: 'New', lastName: 'Member', organization: 'MAZ', eligibleCategory: 'employer_cifoz' })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.reused, false);
  const member = harness.db.state.users.find(user => user.id === result.user.id)!;
  assert.equal(member.role, 'member');
  assert.equal(member.hasSetPassword, false);
  assert.equal(member.checkedIn, false);
  member.password = await bcrypt.hash('MemberPass123!', 4);
  member.hasSetPassword = true;
  const originalPassword = member.password;
  const memberCookie = extractCookie((await fetch(`${harness.baseUrl}/api/auth/member-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'NEW-MEMBER-001' }) })).headers.get('set-cookie'));
  const existingVote: ElectionVote = { id: 'existing_vote', electionId: 'election_1', voterId: member.id, candidateId: 'chair_1', category: 'chairperson', submittedAt: '2026-10-20T08:00:00Z' };
  harness.db.state.electionVotes.push(existingVote);
  const deniedUpgrade = await fetch(`${harness.baseUrl}/api/admin/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: memberCookie },
    body: JSON.stringify({ id: member.id, firstName: 'New', lastName: 'Member', role: 'attendee' })
  });
  assert.equal(deniedUpgrade.status, 403);
  const attendeeResponse = await fetch(`${harness.baseUrl}/api/admin/users`, {
    method: 'POST', headers, body: JSON.stringify({ id: member.id, email: 'new@example.com', firstName: 'New', lastName: 'Member', role: 'attendee', organization: 'MAZ' })
  });
  assert.equal(attendeeResponse.status, 200);
  const attendeeResult = await attendeeResponse.json();
  if (attendeeResult.qrCode?.saved) {
    const qrPath = path.join(process.cwd(), 'uploads', 'attendee-qrcodes', attendeeResult.qrCode.filename);
    t.after(() => unlink(qrPath));
  }
  const attendee = harness.db.state.users.find(user => user.id === member.id)!;
  assert.equal(attendee.role, 'attendee');
  assert.equal(attendee.password, originalPassword);
  assert.equal(attendee.hasSetPassword, true);
  assert.ok(attendee.qrToken);
  assert.equal(harness.db.state.users.length, 4);
  assert.equal(harness.db.state.electionVoters[0].userId, attendee.id);
  assert.deepEqual(harness.db.state.electionVotes, [existingVote]);
  const session = await fetch(`${harness.baseUrl}/api/auth/session`, { headers: { Cookie: memberCookie } });
  assert.equal(session.status, 200);
  assert.equal((await session.json()).user.role, 'member', 'Identifier sessions remain scoped to voting after a profile upgrade');
  assert.equal((await login(harness.baseUrl, 'new@example.com', 'MemberPass123!')).status, 200);
});

test('adding election members rejects non-admin callers, disabled profiles and administrator emails', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.elections.push({ id: 'election_1', title: 'Board', description: '', status: 'draft', boardSeats: 4, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const attendeeCookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  for (const cookie of ['', attendeeCookie]) {
    const response = await fetch(`${harness.baseUrl}/api/admin/elections/election_1/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email: 'attendee@example.com' })
    });
    assert.equal(response.status, 403);
  }
  for (const email of ['disabled@example.com', 'admin@example.com', 'invalid-email']) {
    const response = await fetch(`${harness.baseUrl}/api/admin/elections/election_1/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ email })
    });
    assert.equal(response.status, 400);
  }
  assert.equal(harness.db.state.users.length, 3);
  assert.equal(harness.db.state.electionVoters.length, 0);
});

test('super admin manages admin accounts and reads API response logs', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.users.push(createUser({
    id: 'super_admin_1', email: 'owner@example.com', firstName: 'System', lastName: 'Owner',
    role: 'super_admin', password: await bcrypt.hash('OwnerPass123!', 4)
  }));
  const ownerCookie = extractCookie((await login(harness.baseUrl, 'owner@example.com', 'OwnerPass123!')).headers.get('set-cookie'));
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const request = (path: string, cookie: string, method = 'GET', body?: object) => fetch(`${harness.baseUrl}${path}`, {
    method, headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const details = { firstName: 'New', lastName: 'Administrator', email: 'new-admin@example.com', password: 'TemporaryPass123!' };
  assert.equal((await request('/api/super-admin/admins', adminCookie, 'POST', details)).status, 403);
  assert.equal((await request('/api/admin/users', adminCookie, 'POST', { ...details, role: 'admin' })).status, 403);
  assert.equal((await request('/api/admin/users', adminCookie, 'POST', { id: 'super_admin_1', ...details, role: 'attendee' })).status, 403);
  assert.equal((await request('/api/admin/users/admin_1/statusToggle', ownerCookie, 'PUT')).status, 403);
  assert.equal((await request('/api/admin/users/super_admin_1/statusToggle', adminCookie, 'PUT')).status, 403);
  assert.equal((await request('/api/admin/users/super_admin_1', adminCookie, 'DELETE')).status, 403);
  const adminExport = await request('/api/admin/users/export', adminCookie);
  assert.equal(adminExport.status, 200);
  assert.ok(!(await adminExport.json()).users.some((account: StoredUser) => account.role === 'super_admin'));
  const invalid = await request('/api/super-admin/admins', ownerCookie, 'POST', { ...details, email: 'invalid' });
  assert.equal(invalid.status, 400);
  const created = await request('/api/super-admin/admins', ownerCookie, 'POST', details);
  assert.equal(created.status, 201);
  const admin = (await created.json()).admin;
  assert.equal(admin.role, 'admin');
  assert.equal((await login(harness.baseUrl, details.email, details.password)).status, 200);
  const updated = await request(`/api/super-admin/admins/${admin.id}`, ownerCookie, 'PATCH', { ...details, firstName: 'Updated', password: '' });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).admin.firstName, 'Updated');
  assert.equal((await request(`/api/super-admin/admins/${admin.id}/status`, ownerCookie, 'PATCH', { status: 'disabled' })).status, 200);
  assert.equal((await login(harness.baseUrl, details.email, details.password)).status, 403);
  const logs = await request('/api/super-admin/audit-logs?errorsOnly=true', ownerCookie);
  assert.equal(logs.status, 200);
  const audit = await logs.json();
  assert.ok(audit.items.some((item: any) => item.statusCode === 400 && item.errorCode === 'INVALID_ADMIN_DETAILS' && item.errorCause.includes('valid email')));
  assert.equal((await request(`/api/super-admin/admins/${admin.id}`, ownerCookie, 'DELETE')).status, 200);
  assert.equal(harness.db.state.users.some(user => user.id === admin.id), false);
});

test('super admin audit log records the underlying cause of a system API error', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.users.push(createUser({ id: 'super_admin_2', email: 'logs-owner@example.com', role: 'super_admin', password: await bcrypt.hash('OwnerPass123!', 4) }));
  const cookie = extractCookie((await login(harness.baseUrl, 'logs-owner@example.com', 'OwnerPass123!')).headers.get('set-cookie'));
  (harness.db as any).getSessions = async () => { throw new Error('Database pool timed out while loading sessions'); };
  const failed = await fetch(`${harness.baseUrl}/api/sessions`);
  assert.equal(failed.status, 500);
  const requestId = failed.headers.get('x-request-id');
  assert.ok(requestId);
  const malformed = await fetch(`${harness.baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const missing = await fetch(`${harness.baseUrl}/api/unknown-route`);
  assert.equal(missing.status, 404);
  const response = await fetch(`${harness.baseUrl}/api/super-admin/audit-logs?errorsOnly=true`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.items.some((item: any) => item.id === requestId && item.errorCause === 'Database pool timed out while loading sessions'));
  assert.ok(payload.items.some((item: any) => item.id === malformed.headers.get('x-request-id') && item.statusCode === 400 && item.errorCode === 'INVALID_REQUEST_BODY'));
  assert.ok(payload.items.some((item: any) => item.id === missing.headers.get('x-request-id') && item.statusCode === 404 && item.errorCode === 'API_NOT_FOUND'));
});

test('super admin metrics are restricted and summarize live API responses', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.users.push(createUser({ id: 'super_admin_metrics', email: 'metrics-owner@example.com', role: 'super_admin', password: await bcrypt.hash('OwnerPass123!', 4) }));
  const ownerCookie = extractCookie((await login(harness.baseUrl, 'metrics-owner@example.com', 'OwnerPass123!')).headers.get('set-cookie'));
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const url = `${harness.baseUrl}/api/super-admin/metrics`;
  assert.equal((await fetch(url, { headers: { Cookie: adminCookie } })).status, 403);
  assert.equal((await fetch(`${url}?range=invalid`, { headers: { Cookie: ownerCookie } })).status, 400);
  assert.equal((await fetch(`${url}?code=999`, { headers: { Cookie: ownerCookie } })).status, 400);
  assert.equal((await fetch(`${harness.baseUrl}/api/unknown-metric-route`)).status, 404);
  let metrics: any;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${url}?range=30m&method=GET`, { headers: { Cookie: ownerCookie } });
    assert.equal(response.status, 200);
    metrics = await response.json();
    if (metrics.statusCounts.some((item: any) => item.statusCode === 404)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(metrics.range, '30m');
  assert.ok(metrics.totalRequests >= 1);
  assert.ok(metrics.statusCounts.some((item: any) => item.statusCode === 404));
  assert.ok(metrics.statusCodeOptions.includes(404));
  assert.ok(metrics.buckets.length >= 30);
  const filtered = await fetch(`${url}?range=30m&code=404`, { headers: { Cookie: ownerCookie } });
  assert.equal(filtered.status, 200);
  const filteredMetrics = await filtered.json();
  assert.ok(filteredMetrics.totalRequests >= 1);
  assert.ok(filteredMetrics.statusCounts.every((item: any) => item.statusCode === 404));
});

test('admin voter upload saves the five-column identifier and eligibility details', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const electionId = 'election_upload';
  harness.db.state.elections.push({ id: electionId, title: 'Board election', description: '', status: 'draft', boardSeats: 3, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  const cookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const upload = (identifier: string) => fetch(`${harness.baseUrl}/api/admin/elections/${electionId}/voters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ voters: [{ userId: 'attendee_1', identifier, memberCategory: 'Employer Representative', eligibleCategory: 'employer_cifoz' }] })
  });
  assert.equal((await upload('FUND1400')).status, 200);
  assert.equal((await upload('FUND1401')).status, 200);
  assert.equal(harness.db.state.electionVoters.length, 1);
  assert.equal(harness.db.state.electionVoters[0].identifier, 'FUND1401');
  assert.equal(harness.db.state.electionVoters[0].memberCategory, 'Employer Representative');
  assert.equal(harness.db.state.electionVoters[0].eligibleCategory, 'employer_cifoz');
});

test('ballot shows and accepts only the voter’s assigned position', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const cookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  const electionId = 'election_three_positions';
  harness.db.state.elections.push({ id: electionId, title: 'Board election', description: '', status: 'open', boardSeats: 3, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  harness.db.state.electionVoters.push({ id: 'ev_three', electionId, userId: 'attendee_1', eligibleCategory: 'employer_cifoz', addedAt: '' });
  const candidates: [string, ElectionCandidate['category']][] = [
    ['employee_1', 'employee_representative'], ['employee_2', 'employee_representative'],
    ['cifoz_1', 'employer_cifoz'], ['zbca_1', 'employer_zbca']
  ];
  harness.db.state.electionCandidates.push(...candidates.map(([id, category]) => ({
    id, electionId, category, fullName: id, organization: '', position: '', bio: '', photoUrl: '', displayOrder: 0, createdAt: '', updatedAt: ''
  })));
  const submit = (body: object) => fetch(`${harness.baseUrl}/api/elections/${electionId}/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body)
  });
  const ballot = await fetch(`${harness.baseUrl}/api/elections/ballot`, { headers: { Cookie: cookie } });
  assert.deepEqual((await ballot.json()).candidates.map((candidate: ElectionCandidate) => candidate.id), ['cifoz_1']);
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const adminBallot = await fetch(`${harness.baseUrl}/api/elections/ballot`, { headers: { Cookie: adminCookie } });
  assert.equal(adminBallot.status, 200);
  assert.deepEqual((await adminBallot.json()).candidates.map((candidate: ElectionCandidate) => candidate.id), candidates.map(([id]) => id));
  const adminVote = await fetch(`${harness.baseUrl}/api/elections/${electionId}/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: adminCookie }, body: JSON.stringify({ candidateId: 'cifoz_1' })
  });
  assert.equal(adminVote.status, 403);
  for (const invalid of ['employee_1', 'zbca_1', 'unknown', '']) {
    assert.notEqual((await submit({ candidateId: invalid })).status, 200);
    assert.equal(harness.db.state.electionVotes.length, 0);
  }
  const accepted = await submit({ candidateId: 'cifoz_1' });
  assert.equal(accepted.status, 200);
  const result = await accepted.json();
  assert.equal(result.votes.length, 1);
  assert.equal(result.votes[0].category, 'employer_cifoz');
  assert.equal((await (await submit({ candidateId: 'cifoz_1' })).json()).duplicate, true);
});

test('imported voter signs in with identifier only and sees only their eligible position', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.users.push(createUser({ id: 'member_identifier', email: undefined, firstName: 'Steve', lastName: 'Chivi', role: 'member', password: '', hasSetPassword: false }));
  harness.db.state.elections.push({ id: 'election_identifier', title: 'Board election', description: '', status: 'open', boardSeats: 3, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  harness.db.state.electionVoters.push({ id: 'ev_identifier', electionId: 'election_identifier', userId: 'member_identifier', identifier: '22222222X22', eligibleCategory: 'employee_representative', addedAt: '' });
  harness.db.state.electionCandidates.push(
    { id: 'candidate_employee', electionId: 'election_identifier', category: 'employee_representative', fullName: 'Employee Candidate', organization: '', position: '', bio: '', photoUrl: '', displayOrder: 0, createdAt: '', updatedAt: '' },
    { id: 'candidate_cifoz', electionId: 'election_identifier', category: 'employer_cifoz', fullName: 'CIFOZ Candidate', organization: '', position: '', bio: '', photoUrl: '', displayOrder: 0, createdAt: '', updatedAt: '' }
  );
  const signIn = (identifier: string) => fetch(`${harness.baseUrl}/api/auth/member-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier })
  });
  assert.equal((await signIn('unknown')).status, 401);
  const signedIn = await signIn(' 22222222x22 ');
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).user.role, 'member');
  const cookie = extractCookie(signedIn.headers.get('set-cookie'));
  const ballot = await fetch(`${harness.baseUrl}/api/elections/ballot`, { headers: { Cookie: cookie } });
  const ballotData = await ballot.json();
  assert.equal(ballotData.voter.eligibleCategory, 'employee_representative');
  assert.deepEqual(ballotData.candidates.map((candidate: ElectionCandidate) => candidate.id), ['candidate_employee']);
  const vote = (candidateId: string) => fetch(`${harness.baseUrl}/api/elections/election_identifier/vote`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ candidateId })
  });
  assert.notEqual((await vote('candidate_cifoz')).status, 200);
  assert.equal(harness.db.state.electionVotes.length, 0);
  assert.equal((await vote('candidate_employee')).status, 200);
  assert.equal(harness.db.state.electionVotes.length, 1);
  harness.db.state.electionVoters.push({ id: 'ev_existing_attendee', electionId: 'election_identifier', userId: 'attendee_1', identifier: 'CIFOZ-001', eligibleCategory: 'employer_cifoz', addedAt: '' });
  const attendeeVoterSignIn = await signIn('cifoz-001');
  assert.equal(attendeeVoterSignIn.status, 200);
  assert.equal((await attendeeVoterSignIn.json()).user.role, 'member');
  const attendeeBallot = await fetch(`${harness.baseUrl}/api/elections/ballot`, { headers: { Cookie: extractCookie(attendeeVoterSignIn.headers.get('set-cookie')) } });
  assert.deepEqual((await attendeeBallot.json()).candidates.map((candidate: ElectionCandidate) => candidate.id), ['candidate_cifoz']);
  assert.equal((await fetch(`${harness.baseUrl}/api/voter-registration/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
  harness.db.state.electionVoters[0].identifier = 'CHANGED-ID';
  assert.equal((await fetch(`${harness.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  harness.db.state.electionVoters.splice(0);
  assert.equal((await fetch(`${harness.baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
});

test('event assistant receives the same official dress codes and event dates as the What to Wear page', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const cookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  const realFetch = globalThis.fetch;
  let providerCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input) !== 'https://api.groq.com/openai/v1/chat/completions') return realFetch(input, init);
    providerCalls++;
    const request = JSON.parse(String(init?.body));
    const systemPrompt = request.messages[0].content;
    assert.equal(request.messages[0].role, 'system');
    assert.ok(systemPrompt.includes(getDressCodeContext()));
    assert.ok(systemPrompt.includes(eventDressCode.dates));
    assert.ok(systemPrompt.includes(eventDressCode.venue));
    assert.ok(systemPrompt.includes('Khaki chinos or trousers and Delta white shirts'));
    assert.ok(systemPrompt.includes('Carry your MAZ blazer for the AGM.'));
    assert.ok(systemPrompt.includes('Presidential dinner: Ethnic dress code.'));
    assert.ok(systemPrompt.includes('overrides generic clothing advice and contradictory answers earlier in the conversation'));
    assert.ok(!systemPrompt.includes('June 24-27, 2026'));
    return new Response(JSON.stringify({ choices: [{ message: { content: 'For Day 2: khaki chinos or trousers and Delta white shirts. Carry your MAZ blazer for the AGM. Presidential dinner: ethnic dress code.' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const response = await fetch(`${harness.baseUrl}/api/chatbot/message`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ messages: [
      { sender: 'bot', text: 'For Day 2, try semi-formal evening wear.', timestamp: '' },
      { sender: 'user', text: 'what to wear day 2', timestamp: '' }
    ] })
  });
  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.match((await response.json()).reply, /Delta white shirts/);
});

test('session questions require speaker assignments and stream all non-hidden questions without approval', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.state.speakers.push({ id: 'speaker_1', name: 'Attendee Member', organization: 'MAZ', position: '', topic: '', speakingTime: '', bio: '', photoUrl: '' });
  harness.db.state.sessions.push({ ...harness.db.state.sessions[0], id: 'session_2', topic: 'Another session' });
  let assignments: SpeakerAssignment[] = [];
  const questions: Array<AudienceQuestion & { authorId: string }> = [];
  let limited = false;
  let reads = 0;
  harness.db.sessionQuestions = {
    async assignments() { return assignments; },
    async assign(speakerId, userId, sessionIds) { assignments = [{ speakerId, userId, sessionIds }]; },
    async presenterSessionIds(userId) { return assignments.filter(item => item.userId === userId).flatMap(item => item.sessionIds); },
    async list(sessionId, scope, userId) {
      reads++;
      return questions.filter(question => question.sessionId === sessionId && (scope === 'admin' || scope === 'own' && question.authorId === userId || ['presenter', 'display'].includes(scope) && ['pending', 'approved', 'answered'].includes(question.status))).map(({ authorId, ...question }) => question);
    },
    async submit(sessionId, userId, text, anonymous) {
      if (limited) return null;
      const question = { id: `aq_${questions.length}`, sessionId, text, authorName: anonymous ? null : 'Attendee Member', status: 'approved' as const, isDisplayed: false, createdAt: new Date().toISOString(), authorId: userId };
      questions.push(question);
      const { authorId, ...publicQuestion } = question;
      return publicQuestion;
    },
    async moderate(sessionId, questionId, action: AudienceQuestionAction) {
      const question = questions.find(item => item.id === questionId && item.sessionId === sessionId);
      if (!question || ['display', 'answer'].includes(action) && question.status !== 'approved') return false;
      if (action === 'display') { questions.forEach(item => { item.isDisplayed = false; }); question.isDisplayed = true; }
      else if (action === 'clear') question.isDisplayed = false;
      else { question.status = { approve: 'approved', hide: 'hidden', answer: 'answered' }[action] as AudienceQuestion['status']; question.isDisplayed = false; }
      return true;
    }
  };
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const attendeeCookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  const call = (url: string, cookie = attendeeCookie, method = 'GET', body?: unknown) => fetch(`${harness.baseUrl}${url}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  harness.db.state.users.push(createUser({ id: 'voter_only', role: 'member', email: 'voter@example.com', password: harness.db.state.users.find(user => user.id === 'attendee_1')!.password }));
  harness.db.state.elections.push({ id: 'election_member', title: 'Board', description: '', status: 'open', boardSeats: 3, createdBy: 'admin_1', createdAt: '', updatedAt: '' });
  harness.db.state.electionVoters.push({ id: 'ev_voter_only', electionId: 'election_member', userId: 'voter_only', identifier: 'VOTER-ONLY', eligibleCategory: 'employee_representative', addedAt: '' });
  const memberCookie = extractCookie((await fetch(`${harness.baseUrl}/api/auth/member-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'VOTER-ONLY' }) })).headers.get('set-cookie'));
  assert.equal((await call('/api/session-questions/my-sessions', memberCookie)).status, 403);
  assert.equal((await call('/api/session-questions/session_1', '')).status, 401);
  assert.equal((await call('/api/admin/session-question-setup')).status, 403);
  assert.equal((await call('/api/session-questions/session_1?mode=presenter')).status, 403);
  assert.equal(reads, 0, 'Unassigned accounts must never read the presenter queue');
  const before = structuredClone(harness.db.state.users);
  assert.equal((await call('/api/admin/session-question-setup/speaker_1', adminCookie, 'PUT', { userId: 'attendee_1', sessionIds: ['session_1'] })).status, 200);
  assert.deepEqual(harness.db.state.users, before, 'Assignments must not change roles, credentials, check-in, or QR tokens');
  const setup = await (await call('/api/admin/session-question-setup', adminCookie)).json();
  assert.equal(setup.accounts[0].password, undefined);
  assert.equal(setup.accounts[0].qrToken, undefined);
  assert.equal((await (await call('/api/session-questions/my-sessions')).json()).sessions.length, 1);
  assert.equal((await call('/api/session-questions/session_2?mode=presenter')).status, 403);
  assert.equal((await call('/api/admin/session-question-setup/speaker_1', adminCookie, 'PUT', { userId: 'disabled_1', sessionIds: ['session_1'] })).status, 400);
  assert.equal((await call('/api/admin/session-question-setup/speaker_1', adminCookie, 'PUT', { userId: 'attendee_1', sessionIds: ['unknown'] })).status, 400);
  assert.equal((await call('/api/session-questions/session_1', attendeeCookie, 'POST', { text: 'short', anonymous: true })).status, 400);
  assert.equal((await call('/api/session-questions/session_1', attendeeCookie, 'POST', { text: 'x'.repeat(1001), anonymous: true })).status, 400);
  const sent = await call('/api/session-questions/session_1', attendeeCookie, 'POST', { text: 'How can this approach be applied in practice?', anonymous: true, authorId: 'admin_1' });
  assert.equal(sent.status, 201);
  const { question } = await sent.json();
  assert.equal(question.authorName, null);
  assert.equal(question.authorId, undefined);
  assert.equal(questions[0].authorId, 'attendee_1', 'Author identity comes from the authenticated session');
  const speakerQueue = await (await call('/api/session-questions/session_1?mode=presenter')).json();
  assert.equal(speakerQueue.questions.length, 1);
  assert.equal(speakerQueue.questions[0].status, 'approved');
  assert.equal(speakerQueue.questions[0].authorName, null);
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 1);
  assert.equal((await call('/api/session-questions/session_1?mode=display')).status, 403);
  assert.equal((await call('/api/session-questions/session_1?mode=admin')).status, 403);
  const moderate = (action: string, cookie = adminCookie) => call(`/api/admin/session-questions/session_1/${question.id}`, cookie, 'POST', { action });
  assert.equal((await moderate('approve', attendeeCookie)).status, 403);
  assert.equal((await moderate('unknown')).status, 400);
  assert.equal((await (await call('/api/session-questions/session_1?mode=presenter')).json()).questions.length, 1);
  assert.equal((await moderate('answer')).status, 200);
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 1);
  const second = await call('/api/session-questions/session_1', attendeeCookie, 'POST', { text: 'A second incoming question for the live screen.', anonymous: false });
  assert.equal(second.status, 201);
  const secondQuestion = (await second.json()).question;
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 2, 'New questions join the existing list automatically');
  assert.equal((await moderate('hide')).status, 200);
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 1);
  assert.equal((await moderate('approve')).status, 200);
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 2);
  await moderate('hide');
  assert.equal((await call(`/api/admin/session-questions/session_1/${secondQuestion.id}`, adminCookie, 'POST', { action: 'hide' })).status, 200);
  assert.equal((await (await call('/api/session-questions/session_1?mode=display', adminCookie)).json()).questions.length, 0);
  limited = true;
  assert.equal((await call('/api/session-questions/session_1', attendeeCookie, 'POST', { text: 'One more question about this session.', anonymous: false })).status, 429);
  await call('/api/admin/session-question-setup/speaker_1', adminCookie, 'PUT', { userId: null, sessionIds: ['session_1'] });
  assert.equal((await call('/api/session-questions/session_1?mode=presenter')).status, 403, 'Revoking the account link takes effect immediately');
});

test('administrators can reopen the same account for check-in without changing its QR identity or votes', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const originalAttendee = harness.db.state.users.find(user => user.id === 'attendee_1')!;
  originalAttendee.qrToken = 'printed-qr-token';
  originalAttendee.qrIssuedAt = '2026-10-01T08:00:00Z';
  originalAttendee.qrEmailSentAt = '2026-10-02T08:00:00Z';
  const original = structuredClone(originalAttendee);
  harness.db.state.electionVotes.push({ id: 'kept_vote', electionId: 'election_1', voterId: original.id, candidateId: 'chair_1', category: 'chairperson', submittedAt: '' });
  harness.db.state.notes.push(createSessionNote({ userId: original.id, sessionId: 'session_1', content: 'Keep my notes' }));
  const originalVotes = structuredClone(harness.db.state.electionVotes);
  const originalNotes = structuredClone(harness.db.state.notes);
  const originalCount = harness.db.state.users.length;
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const attendeeCookie = extractCookie((await login(harness.baseUrl, original.email!, 'AttendeePass123!')).headers.get('set-cookie'));
  const reopen = (id: string, cookie = adminCookie) => fetch(`${harness.baseUrl}/api/admin/users/${id}/reopen-checkin`, { method: 'POST', headers: { Cookie: cookie } });
  for (const cookie of ['', attendeeCookie]) assert.equal((await reopen(original.id, cookie)).status, 403);
  assert.equal((await reopen('admin_1')).status, 403);
  assert.equal((await reopen('disabled_1')).status, 400);
  const response = await reopen(original.id);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.password, undefined);
  const pending = harness.db.state.users.find(user => user.id === original.id)!;
  assert.deepEqual(pending, { ...original, checkedIn: false, checkedInAt: '', hasSetPassword: false, password: '' });
  assert.equal((await login(harness.baseUrl, original.email!, 'AttendeePass123!')).status, 401);
  assert.equal((await (await fetch(`${harness.baseUrl}/api/auth/session`, { headers: { Cookie: attendeeCookie } })).json()).user, null);
  const checkin = await fetch(`${harness.baseUrl}/api/checkin/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: original.id, email: ' ATTENDEE@EXAMPLE.COM ', password: 'ChosenByAttendee123!' })
  });
  assert.equal(checkin.status, 200, 'The existing email is accepted for the same account');
  const completed = harness.db.state.users.find(user => user.id === original.id)!;
  assert.equal(completed.checkedIn, true);
  assert.equal(completed.hasSetPassword, true);
  assert.equal(completed.qrToken, original.qrToken);
  assert.equal(completed.qrIssuedAt, original.qrIssuedAt);
  assert.equal(completed.qrEmailSentAt, original.qrEmailSentAt);
  assert.equal(harness.db.state.users.length, originalCount);
  assert.deepEqual(harness.db.state.electionVotes, originalVotes);
  assert.deepEqual(harness.db.state.notes, originalNotes);
  assert.equal((await login(harness.baseUrl, original.email!, 'ChosenByAttendee123!')).status, 200);
  const voter = createUser({ id: 'reopen_voter', role: 'member', email: 'voter-checkin@example.com', checkedIn: false });
  harness.db.state.users.push(voter);
  assert.equal((await reopen(voter.id)).status, 200);
  assert.equal(harness.db.state.users.find(user => user.id === voter.id)?.role, 'attendee');
  assert.equal((await fetch(`${harness.baseUrl}/api/checkin/${voter.id}`)).status, 200);
});

test('members cannot be given passwords; attendee password resets remain available', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const attendee = harness.db.state.users.find(user => user.id === 'attendee_1')!;
  const member = createUser({ ...attendee, id: 'reset_member', email: 'reset@example.com', role: 'member' });
  harness.db.state.users.push(member);
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const attendeeCookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  const reset = (id: string, password: string, cookie = adminCookie) => fetch(`${harness.baseUrl}/api/admin/users/${id}/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ password })
  });
  for (const cookie of ['', attendeeCookie]) assert.equal((await reset(member.id, 'NewMember123!', cookie)).status, 403);
  assert.equal((await reset('admin_1', 'NewAdmin123!')).status, 403);
  assert.equal((await reset('disabled_1', 'NewDisabled123!')).status, 400);
  assert.equal((await reset('unknown', 'NewMember123!')).status, 404);
  const original = structuredClone(member);
  harness.db.state.electionVotes.push({ id: 'kept_vote', electionId: 'election_1', voterId: member.id, candidateId: 'chair_1', category: 'chairperson', submittedAt: '' });
  const originalVotes = structuredClone(harness.db.state.electionVotes);
  assert.equal((await reset(member.id, 'NewMember123!')).status, 403);
  assert.deepEqual(member, original);
  assert.deepEqual(harness.db.state.electionVotes, originalVotes);
  assert.equal((await login(harness.baseUrl, member.email!, 'AttendeePass123!')).status, 403);
  assert.equal((await reset(attendee.id, 'NewAttendee123!')).status, 200);
});

test('duplicate email errors identify the existing account to admins while check-in protects its identity', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const cookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  const response = await fetch(`${harness.baseUrl}/api/admin/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ email: ' DISABLED@EXAMPLE.COM ', firstName: 'New', lastName: 'Person', role: 'attendee' })
  });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /disabled.*All roles and All statuses/);
  const pending = createUser({ id: 'pending_duplicate', email: undefined, checkedIn: false, hasSetPassword: false, password: '' });
  harness.db.state.users.push(pending);
  const before = structuredClone(harness.db.state.users);
  const checkin = await fetch(`${harness.baseUrl}/api/checkin/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: pending.id, email: ' ATTENDEE@EXAMPLE.COM ', password: 'Password123!' })
  });
  assert.equal(checkin.status, 409);
  assert.match((await checkin.json()).error, /existing account/);
  assert.deepEqual(harness.db.state.users, before);
});

test('event photo folders require login and only administrators can configure them', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.db.getDayLinks = async () => [
    { id: 'monday', day: 'Monday', driveLink: 'https://drive.google.com/drive/folders/day-one' },
    { id: 'day2', day: 'Day 2', driveLink: 'javascript:alert(1)' },
    { id: 'day5', day: 'Day 5', driveLink: 'https://drive.google.com/drive/folders/day-five' }
  ];
  assert.equal((await fetch(`${harness.baseUrl}/api/gallery/days`)).status, 401);
  const attendeeCookie = extractCookie((await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!')).headers.get('set-cookie'));
  const adminCookie = extractCookie((await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!')).headers.get('set-cookie'));
  for (const cookie of [attendeeCookie, adminCookie]) {
    const response = await fetch(`${harness.baseUrl}/api/gallery/days`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const albums = await response.json();
    assert.equal(albums.length, 2);
    assert.equal(albums[0].id, 'monday');
    assert.equal(albums[0].day, 'Monday');
    assert.equal(albums[1].day, 'Day 5');
    assert.equal(albums[0].driveLink, 'https://drive.google.com/drive/folders/day-one');
  }
  assert.equal((await fetch(`${harness.baseUrl}/api/admin/days`, { headers: { Cookie: attendeeCookie } })).status, 403);
  for (const cookie of ['', attendeeCookie, adminCookie]) {
    const response = await fetch(`${harness.baseUrl}/api/admin/days`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ day: 'Day 1', driveLink: 'javascript:alert(1)' })
    });
    assert.equal(response.status, cookie === adminCookie ? 400 : 403);
  }
});

test('login sets a secure auth cookie and returns a sanitized user payload', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const response = await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!');
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.user.email, 'admin@example.com');
  assert.equal(body.user.role, 'admin');
  assert.equal('password' in body.user, false);
  assert.equal('hasSetPassword' in body.user, false);

  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie?.includes(`${AUTH_COOKIE_NAME}=`));
  assert.ok(setCookie?.includes('HttpOnly'));
  assert.ok(setCookie?.includes('SameSite=Lax'));
  assert.ok(setCookie?.includes('Path=/'));
  assert.ok(setCookie?.includes('Secure'));
  assert.ok(setCookie?.includes('Max-Age=3600'));
});

test('login rejects invalid credentials and disabled profiles', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const badPassword = await login(harness.baseUrl, 'admin@example.com', 'wrong-password');
  assert.equal(badPassword.status, 401);

  const missingUser = await login(harness.baseUrl, 'missing@example.com', 'whatever');
  assert.equal(missingUser.status, 401);

  const disabledUser = await login(harness.baseUrl, 'disabled@example.com', 'DisabledPass123!');
  assert.equal(disabledUser.status, 403);
});

test('optional session returns a guest response for missing, tampered, and disabled-user cookies', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const missingResponse = await fetch(`${harness.baseUrl}/api/auth/session`);
  assert.equal(missingResponse.status, 200);
  assert.equal(missingResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await missingResponse.json(), { user: null });

  const loginResponse = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const cookie = extractCookie(loginResponse.headers.get('set-cookie'));
  const tamperedResponse = await fetch(`${harness.baseUrl}/api/auth/session`, {
    headers: { cookie: `${cookie}x` }
  });
  assert.equal(tamperedResponse.status, 200);
  assert.deepEqual(await tamperedResponse.json(), { user: null });

  const attendee = harness.db.state.users.find(user => user.id === 'attendee_1')!;
  attendee.status = 'disabled';
  const disabledResponse = await fetch(`${harness.baseUrl}/api/auth/session`, { headers: { cookie } });
  assert.equal(disabledResponse.status, 200);
  assert.deepEqual(await disabledResponse.json(), { user: null });

  const protectedResponse = await fetch(`${harness.baseUrl}/api/notes/session_1`, { headers: { cookie } });
  assert.equal(protectedResponse.status, 401);
});

test('optional session restores signed-in users without exposing credentials', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const loginResponse = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const cookie = extractCookie(loginResponse.headers.get('set-cookie'));
  const response = await fetch(`${harness.baseUrl}/api/auth/session`, { headers: { cookie } });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.user.id, 'attendee_1');
  assert.equal(body.user.role, 'attendee');
  assert.equal('password' in body.user, false);
  assert.equal('hasSetPassword' in body.user, false);
});

test('auth/me accepts a valid cookie and returns a sanitized session payload', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const loginResponse = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const cookie = extractCookie(loginResponse.headers.get('set-cookie'));

  const meResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: { cookie }
  });

  assert.equal(meResponse.status, 200);
  const body = await meResponse.json();
  assert.equal(body.user.email, 'attendee@example.com');
  assert.equal(body.user.role, 'attendee');
  assert.equal('password' in body.user, false);
  assert.equal('hasSetPassword' in body.user, false);
});

test('auth/me rejects missing, tampered, and disabled-user cookies', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const missingResponse = await fetch(`${harness.baseUrl}/api/auth/me`);
  assert.equal(missingResponse.status, 401);

  const loginResponse = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const cookie = extractCookie(loginResponse.headers.get('set-cookie'));
  const tamperedCookie = `${cookie}x`;

  const tamperedResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: { cookie: tamperedCookie }
  });
  assert.equal(tamperedResponse.status, 401);

  const attendee = harness.db.state.users.find(user => user.id === 'attendee_1');
  assert.ok(attendee);
  attendee.status = 'disabled';

  const disabledResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: { cookie }
  });
  assert.equal(disabledResponse.status, 401);
});

test('logout clears the auth cookie and protected routes no longer work', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const loginResponse = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const cookie = extractCookie(loginResponse.headers.get('set-cookie'));

  const logoutResponse = await fetch(`${harness.baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie }
  });
  assert.equal(logoutResponse.status, 200);

  const clearedCookie = extractCookie(logoutResponse.headers.get('set-cookie'));
  assert.equal(clearedCookie, `${AUTH_COOKIE_NAME}=`);

  const afterLogoutResponse = await fetch(`${harness.baseUrl}/api/auth/me`, {
    headers: { cookie: clearedCookie }
  });
  assert.equal(afterLogoutResponse.status, 401);
});

test('admin routes allow admins, reject attendees, and reject unauthenticated callers', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const adminLogin = await login(harness.baseUrl, 'admin@example.com', 'AdminPass123!');
  const adminCookie = extractCookie(adminLogin.headers.get('set-cookie'));

  const adminResponse = await fetch(`${harness.baseUrl}/api/admin/users`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.json();
  assert.equal(Array.isArray(adminBody.users), true);
  assert.equal('password' in adminBody.users[0], false);
  assert.equal('hasSetPassword' in adminBody.users[0], false);

  const attendeeLogin = await login(harness.baseUrl, 'attendee@example.com', 'AttendeePass123!');
  const attendeeCookie = extractCookie(attendeeLogin.headers.get('set-cookie'));

  const attendeeResponse = await fetch(`${harness.baseUrl}/api/admin/users`, {
    headers: { cookie: attendeeCookie }
  });
  assert.equal(attendeeResponse.status, 403);

  const anonymousResponse = await fetch(`${harness.baseUrl}/api/admin/users`);
  assert.equal(anonymousResponse.status, 403);
});

test('requireAuth routes reject missing cookies', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const response = await fetch(`${harness.baseUrl}/api/notes/session_1`);
  assert.equal(response.status, 401);
});

test('check-in completes without an activity and preserves existing attendee details', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const attendee = harness.db.state.users.find(user => user.id === 'attendee_1')!;
  attendee.checkedIn = false;
  attendee.hasSetPassword = false;
  attendee.selectedActivity = 'sunset_cruise';
  attendee.accommodationProvided = true;
  attendee.transportProvided = true;

  const response = await fetch(`${harness.baseUrl}/api/checkin/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: attendee.id, email: attendee.email, password: 'CheckinPass123!' })
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(attendee.checkedIn, true);
  assert.equal(attendee.hasSetPassword, true);
  assert.ok(attendee.checkedInAt);
  assert.equal(await bcrypt.compare('CheckinPass123!', attendee.password), true);
  assert.equal(attendee.selectedActivity, 'sunset_cruise');
  assert.equal(attendee.accommodationProvided, true);
  assert.equal(attendee.transportProvided, true);
  assert.equal(attendee.position, 'Delegate');
});

test('forgot-password returns the same safe response for known and unknown emails', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());

  const knownResponse = await fetch(`${harness.baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'attendee@example.com' })
  });
  assert.equal(knownResponse.status, 200);
  const knownBody = await knownResponse.json();

  const unknownResponse = await fetch(`${harness.baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'unknown@example.com' })
  });
  assert.equal(unknownResponse.status, 200);
  const unknownBody = await unknownResponse.json();

  assert.deepEqual(knownBody, {
    success: true,
    message: SUPPORT_MESSAGE
  });
  assert.deepEqual(unknownBody, knownBody);
  assert.equal('password' in knownBody, false);
  assert.equal('hint' in knownBody, false);
});
