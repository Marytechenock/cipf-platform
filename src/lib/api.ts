/**
 * Unified API Client for MAZ Kariba Winter School 2026 EMS
 */

import {
  AdminUserListQuery,
  ApiAuditEntry,
  ApiMetrics,
  ApiMetricsRange,
  AdminUserListResponse,
  AdventureActivity,
  AttendanceRecord,
  AttendanceScanResponse,
  AuthResponseUser,
  CheckInAttendee,
  FeedbackSubmission,
  GalleryImage,
  LoginResponse,
  MeResponse,
  OptionalSessionResponse,
  PublicAttendeeListQuery,
  PublicAttendeeListResponse,
  AttendeeLiveQA,
  ElectionBallot,
  ElectionCandidate,
  ElectionCandidateCategory,
  ElectionDashboard,
  ElectionVote,
  QAQuestion,
  QAQuestionType,
  QAResponse,
  Session,
  Speaker,
  Sponsor,
  StudyMaterial,
  Testimonial,
  User,
  VenueInfo
} from '../types';

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function isApiErrorStatus(error: unknown, statuses: number[]) {
  return error instanceof ApiError && statuses.includes(error.status);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const SAME_ORIGIN_CREDENTIALS = 'include' as const;

async function parseResponseBody(res: Response) {
  const text = await res.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError(`Received an invalid response from ${res.url || 'the server'}.`, res.status || 500, text);
  }
}

const handleResponse = async <T>(res: Response): Promise<T> => {
  const data = await parseResponseBody(res);
  if (!res.ok) {
    const message = typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
};

function ensureArray<T>(data: unknown, label: string): T[] {
  if (!Array.isArray(data)) {
    throw new ApiError(`${label} response was not in the expected list format.`, 500, data);
  }
  return data as T[];
}

function ensureObject(data: unknown, label: string): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ApiError(`${label} response was not in the expected object format.`, 500, data);
  }
  return data as Record<string, unknown>;
}

function normalizeAdminUserListResponse(data: unknown): AdminUserListResponse {
  const payload = ensureObject(data, 'Admin users');
  return {
    success: typeof payload.success === 'boolean' ? payload.success : true,
    users: ensureArray<User>(payload.users, 'Admin users'),
    page: typeof payload.page === 'number' ? payload.page : 1,
    pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : 25,
    total: typeof payload.total === 'number' ? payload.total : 0,
    hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : false
  };
}

function normalizePublicAttendeeListResponse(data: unknown): PublicAttendeeListResponse {
  const payload = ensureObject(data, 'Public attendees');
  return {
    success: typeof payload.success === 'boolean' ? payload.success : true,
    attendees: ensureArray(payload.attendees, 'Public attendees'),
    page: typeof payload.page === 'number' ? payload.page : 1,
    pageSize: typeof payload.pageSize === 'number' ? payload.pageSize : 25,
    total: typeof payload.total === 'number' ? payload.total : 0,
    hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : false
  } as PublicAttendeeListResponse;
}

export const api = {
  async getSuperAdminMetrics(params: { range: ApiMetricsRange; method: string; path: string; code: string }): Promise<ApiMetrics> {
    const query = new URLSearchParams({ range: params.range, method: params.method, path: params.path, code: params.code });
    return handleResponse(await fetch(`/api/super-admin/metrics?${query}`, { credentials: SAME_ORIGIN_CREDENTIALS }));
  },
  async getSuperAdminAccounts(): Promise<{ admins: User[] }> {
    return handleResponse(await fetch('/api/super-admin/admins', { credentials: SAME_ORIGIN_CREDENTIALS }));
  },
  async createSuperAdminAccount(data: { firstName: string; lastName: string; email: string; password: string }): Promise<{ admin: User }> {
    return handleResponse(await fetch('/api/super-admin/admins', { method: 'POST', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS, body: JSON.stringify(data) }));
  },
  async updateSuperAdminAccount(id: string, data: { firstName: string; lastName: string; email: string; password?: string }): Promise<{ admin: User }> {
    return handleResponse(await fetch(`/api/super-admin/admins/${encodeURIComponent(id)}`, { method: 'PATCH', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS, body: JSON.stringify(data) }));
  },
  async setSuperAdminAccountStatus(id: string, status: 'active' | 'disabled'): Promise<{ admin: User }> {
    return handleResponse(await fetch(`/api/super-admin/admins/${encodeURIComponent(id)}/status`, { method: 'PATCH', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS, body: JSON.stringify({ status }) }));
  },
  async deleteSuperAdminAccount(id: string): Promise<{ success: boolean }> {
    return handleResponse(await fetch(`/api/super-admin/admins/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: SAME_ORIGIN_CREDENTIALS }));
  },
  async getSuperAdminAuditLogs(params: { page: number; pageSize: number; errorsOnly: boolean; search: string }): Promise<{ items: ApiAuditEntry[]; total: number; page: number; pageSize: number }> {
    const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize), errorsOnly: String(params.errorsOnly), search: params.search });
    return handleResponse(await fetch(`/api/super-admin/audit-logs?${query}`, { credentials: SAME_ORIGIN_CREDENTIALS }));
  },
  // Authentication
  async login(body: any): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(body)
    });
    return handleResponse(res);
  },

  async loginMember(identifier: string): Promise<LoginResponse> {
    return handleResponse(await fetch('/api/auth/member-login', {
      method: 'POST', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ identifier })
    }));
  },

  async changeAdminPassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return handleResponse(await fetch('/api/auth/change-password', {
      method: 'POST', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ currentPassword, newPassword })
    }));
  },

  async forgotPassword(email: string): Promise<{ success?: boolean; message: string }> {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ email })
    });
    return handleResponse(res);
  },

  async resetAdminUserPassword(userId: string, password: string): Promise<{ success: boolean; message: string }> {
    return handleResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: 'POST', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ password })
    }));
  },

  async reopenAdminUserCheckin(userId: string): Promise<{ success: boolean; user: User; message: string }> {
    return handleResponse(await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reopen-checkin`, {
      method: 'POST', credentials: SAME_ORIGIN_CREDENTIALS
    }));
  },

  async logout(): Promise<{ success: boolean }> {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getMe(): Promise<MeResponse> {
    const res = await fetch('/api/auth/me', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getOptionalSession(): Promise<OptionalSessionResponse> {
    const res = await fetch('/api/auth/session', {
      credentials: SAME_ORIGIN_CREDENTIALS,
      cache: 'no-store'
    });
    return handleResponse(res);
  },

  // Sessions Program
  async getSessions(): Promise<Session[]> {
    const res = await fetch('/api/sessions');
    return ensureArray<Session>(await handleResponse<unknown>(res), 'Sessions');
  },

  // Note per session
  async getNote(sessionId: string): Promise<{ note: string }> {
    const res = await fetch(`/api/notes/${sessionId}`, {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveNote(sessionId: string, content: string): Promise<{ success: boolean; note: any }> {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ sessionId, content })
    });
    return handleResponse(res);
  },

  async deleteNote(sessionId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/notes/${sessionId}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  // General Metadata retrieval
  async getSpeakers(): Promise<Speaker[]> {
    const res = await fetch('/api/speakers');
    return ensureArray<Speaker>(await handleResponse<unknown>(res), 'Speakers');
  },

  async getSponsors(): Promise<Sponsor[]> {
    const res = await fetch('/api/sponsors');
    return ensureArray<Sponsor>(await handleResponse<unknown>(res), 'Sponsors');
  },

  async getTestimonials(): Promise<Testimonial[]> {
    const res = await fetch('/api/testimonials');
    return ensureArray<Testimonial>(await handleResponse<unknown>(res), 'Testimonials');
  },

  async getGallery(): Promise<GalleryImage[]> {
    const res = await fetch('/api/gallery');
    return ensureArray<GalleryImage>(await handleResponse<unknown>(res), 'Gallery');
  },

  async getVenue(): Promise<VenueInfo> {
    const res = await fetch('/api/venue');
    return handleResponse(res);
  },

  async getAdventures(): Promise<AdventureActivity[]> {
    const res = await fetch('/api/adventures');
    return ensureArray<AdventureActivity>(await handleResponse<unknown>(res), 'Adventures');
  },

  async getGoogleDriveLink(): Promise<{ link: string }> {
    const res = await fetch('/api/google-drive-link');
    const payload = ensureObject(await handleResponse<unknown>(res), 'Google Drive link');
    return { link: typeof payload.link === 'string' ? payload.link : '' };
  },

  // ============ STUDY MATERIALS ENDPOINTS ============

  async getStudyMaterials(): Promise<{ materials: StudyMaterial[] }> {
    const res = await fetch('/api/study-materials', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<unknown>(res);
    const payload = ensureObject(data, 'Study materials');
    return {
      materials: ensureArray<StudyMaterial>(payload.materials, 'Study materials')
    };
  },

  async uploadStudyMaterial(formData: FormData): Promise<{ success: boolean; material: StudyMaterial }> {
    const res = await fetch('/api/study-materials/upload', {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });
    return handleResponse(res);
  },

  async deleteStudyMaterial(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/study-materials/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async trackStudyMaterialDownload(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/study-materials/${id}/track-download`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  // ============ DAY LINKS ENDPOINTS ============

  async getGalleryDayLinks(signal?: AbortSignal): Promise<{ id: string; day: string; driveLink: string }[]> {
    const res = await fetch('/api/gallery/days', { credentials: SAME_ORIGIN_CREDENTIALS, cache: 'no-store', signal });
    return ensureArray<{ id: string; day: string; driveLink: string }>(await handleResponse<unknown>(res), 'Event photo albums');
  },

  async getDayLinks(): Promise<{ id: string; day: string; driveLink: string }[]> {
    const res = await fetch('/api/admin/days', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return ensureArray<{ id: string; day: string; driveLink: string }>(
        await handleResponse<unknown>(res),
        'Day links'
    );
  },

  async saveDayLink(data: { id?: string; day: string; driveLink: string }): Promise<{ success: boolean; day: { id: string; day: string; driveLink: string } }> {
    const res = await fetch('/api/admin/days', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async deleteDayLink(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/days/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  // ============ END DAY LINKS ENDPOINTS ============

  // Chatbot message processing
  async sendChatMessage(messages: any[]): Promise<{ reply: string }> {
    const res = await fetch('/api/chatbot/message', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ messages })
    });
    return handleResponse(res);
  },

  // Direct feedback submission
  async submitFeedback(feedback: any): Promise<{ success: boolean; feedback: FeedbackSubmission }> {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(feedback)
    });
    return handleResponse(res);
  },

  async uploadSponsorLogo(sponsorId: string | undefined, file: File): Promise<{ success: boolean; imageUrl: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('logo', file);

    const res = await fetch(`/api/upload/sponsor/${sponsorId || ''}`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });

    return handleResponse(res);
  },

  async uploadSpeakerPhoto(speakerId: string | undefined, file: File): Promise<{ success: boolean; imageUrl: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`/api/upload/speaker/${speakerId || ''}`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });

    return handleResponse(res);
  },

  async uploadCandidatePhoto(candidateId: string | undefined, file: File): Promise<{ success: boolean; imageUrl: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('photo', file);

    const res = await fetch(`/api/upload/candidate/${candidateId || ''}`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });

    return handleResponse(res);
  },

  async uploadGalleryImage(file: File): Promise<{ success: boolean; imageUrl: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/upload/gallery', {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });

    return handleResponse(res);
  },

  async uploadAdventureImage(file: File): Promise<{ success: boolean; imageUrl: string; filename: string; message: string }> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/upload/adventure', {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: formData
    });

    return handleResponse(res);
  },

  async deleteUploadedFile(type: string, filename: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/upload/${type}/${filename}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async searchAttendees(query: string): Promise<{ id: string; firstName: string; lastName: string; organization?: string }[]> {
    const res = await fetch(`/api/checkin/search?q=${encodeURIComponent(query)}`);
    return handleResponse(res);
  },

  async getPublicAttendees(params: PublicAttendeeListQuery = {}): Promise<PublicAttendeeListResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));

    const res = await fetch(`/api/public/attendees?${query.toString()}`);
    return normalizePublicAttendeeListResponse(await handleResponse<unknown>(res));
  },

  async getAttendeeForCheckin(userId: string): Promise<CheckInAttendee> {
    const res = await fetch(`/api/checkin/${userId}`);
    return handleResponse(res);
  },

  async confirmCheckin(data: {
    userId: string;
    password: string;
    email: string;
  }): Promise<{ success: boolean; message: string; user: AuthResponseUser }> {
    const res = await fetch('/api/checkin/confirm', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getCheckinStatus(userId: string): Promise<{
    checkedIn: boolean;
    checkedInAt?: string;
    selectedActivity?: string;
  }> {
    const res = await fetch(`/api/checkin/status/${userId}`);
    return handleResponse(res);
  },

  // ============ CHECK-IN ADMIN ENDPOINTS (ADMIN ONLY) ============

  async getCheckedInUsers(): Promise<User[]> {
    const res = await fetch('/api/admin/checkins', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getPendingCheckInUsers(): Promise<User[]> {
    const res = await fetch('/api/admin/checkins/pending', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getAdminAttendance(sessionId: string): Promise<{ success: boolean; session: Session; records: AttendanceRecord[] }> {
    const query = new URLSearchParams({ sessionId });
    const res = await fetch(`/api/admin/attendance?${query.toString()}`, {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getAdminAttendanceSessions(): Promise<Session[]> {
    const res = await fetch('/api/admin/attendance/sessions', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<{ success: boolean; sessions: Session[] }>(res);
    return ensureArray<Session>(data.sessions, 'Attendance sessions');
  },

  async scanAdminAttendance(data: { sessionId: string; qrValue: string }): Promise<AttendanceScanResponse> {
    const res = await fetch('/api/admin/attendance/scan', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getAdminQAQuestions(sessionId?: string, signal?: AbortSignal): Promise<QAQuestion[]> {
    const query = new URLSearchParams();
    if (sessionId) query.set('sessionId', sessionId);
    const res = await fetch(`/api/admin/qa/questions${query.toString() ? `?${query.toString()}` : ''}`, {
      signal,
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<{ success: boolean; questions: QAQuestion[] }>(res);
    return ensureArray<QAQuestion>(data.questions, 'Q&A questions');
  },

  async saveAdminQAQuestion(data: {
    id?: string;
    sessionId: string;
    questionTitle?: string;
    questionText: string;
    type: QAQuestionType;
    options: string[];
    order?: number;
  }): Promise<{ success: boolean; question: QAQuestion }> {
    const res = await fetch('/api/admin/qa/questions', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async publishAdminQAQuestion(id: string): Promise<{ success: boolean; question: QAQuestion }> {
    const res = await fetch(`/api/admin/qa/questions/${id}/publish`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async closeAdminQAQuestion(id: string): Promise<{ success: boolean; question: QAQuestion }> {
    const res = await fetch(`/api/admin/qa/questions/${id}/close`, {
      method: 'POST',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async deleteAdminQAQuestion(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/qa/questions/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getAdminQAResponses(questionId: string, signal?: AbortSignal): Promise<{ success: boolean; question: QAQuestion; responses: QAResponse[] }> {
    const res = await fetch(`/api/admin/qa/questions/${questionId}/responses`, {
      signal,
      cache: 'no-store',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getLiveQA(): Promise<AttendeeLiveQA> {
    const res = await fetch('/api/qa/live', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<{ success: boolean; question: QAQuestion | null; response: QAResponse | null }>(res);
    return { question: data.question, response: data.response };
  },

  async submitQAResponse(data: { questionId: string; answer: string }): Promise<{ success: boolean; response: QAResponse; duplicate: boolean }> {
    const res = await fetch('/api/qa/responses', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async getAdminElectionDashboard(): Promise<ElectionDashboard> {
    const res = await fetch('/api/admin/elections/current', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<{ success: boolean } & ElectionDashboard>(res);
    return {
      election: data.election,
      candidates: ensureArray<ElectionCandidate>(data.candidates, 'Election candidates'),
      voters: ensureArray(data.voters, 'Election voters'),
      votes: ensureArray(data.votes, 'Election votes')
    };
  },

  async saveAdminElection(data: {
    id?: string;
    title: string;
    description: string;
    boardSeats: number;
    startsAt?: string;
    endsAt?: string;
    timezone?: string;
  }): Promise<ElectionDashboard> {
    const res = await fetch('/api/admin/elections', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    const result = await handleResponse<{ success: boolean } & ElectionDashboard>(res);
    return result;
  },

  async updateAdminElectionStatus(id: string, status: 'draft' | 'scheduled' | 'open' | 'closed'): Promise<ElectionDashboard> {
    const res = await fetch(`/api/admin/elections/${id}/status`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ status })
    });
    return handleResponse(res);
  },

  async saveAdminElectionCandidate(electionId: string, data: {
    id?: string;
    category: ElectionCandidateCategory;
    fullName: string;
    organization: string;
    position: string;
    bio: string;
    photoUrl: string;
    displayOrder?: number;
  }): Promise<{ success: boolean; candidate: ElectionCandidate }> {
    const res = await fetch(`/api/admin/elections/${electionId}/candidates`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async deleteAdminElectionCandidate(electionId: string, candidateId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/elections/${electionId}/candidates/${candidateId}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async addAdminElectionMember(electionId: string, data: { identifier: string; email?: string; firstName: string; lastName: string; organization: string; eligibleCategory: ElectionCandidateCategory }): Promise<{ success: boolean; user: User; reused: boolean }> {
    const res = await fetch(`/api/admin/elections/${electionId}/members`, {
      method: 'POST', headers: JSON_HEADERS, credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  async addAdminElectionVoters(electionId: string, voters: { userId: string; identifier: string; memberCategory: string; eligibleCategory: ElectionCandidateCategory }[]): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/elections/${electionId}/voters`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ voters })
    });
    return handleResponse(res);
  },

  async deleteAdminElectionVoter(electionId: string, userId: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/elections/${electionId}/voters/${userId}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async getElectionBallot(): Promise<ElectionBallot> {
    const res = await fetch('/api/elections/ballot', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    const data = await handleResponse<{ success: boolean } & ElectionBallot>(res);
    return data;
  },

  async submitElectionVote(electionId: string, data: {
    candidateId: string;
  }): Promise<{ success: boolean; duplicate: boolean; votes: ElectionVote[] }> {
    const res = await fetch(`/api/elections/${electionId}/vote`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(data)
    });
    return handleResponse(res);
  },

  // --- ADMIN PORTAL ENDPOINTS ---
  async getAdminUsers(params: AdminUserListQuery = {}): Promise<AdminUserListResponse> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.role && params.role !== 'all') query.set('role', params.role);
    if (params.checkedIn && params.checkedIn !== 'all') query.set('checkedIn', params.checkedIn);
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.sort) query.set('sort', params.sort);

    const queryString = query.toString();
    const res = await fetch(`/api/admin/users${queryString ? `?${queryString}` : ''}`, {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return normalizeAdminUserListResponse(await handleResponse<unknown>(res));
  },

  async exportAdminUsers(params: AdminUserListQuery = {}): Promise<{ success: boolean; users: User[] }> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.role && params.role !== 'all') query.set('role', params.role);
    if (params.checkedIn && params.checkedIn !== 'all') query.set('checkedIn', params.checkedIn);
    if (params.sort) query.set('sort', params.sort);

    const queryString = query.toString();
    const res = await fetch(`/api/admin/users/export${queryString ? `?${queryString}` : ''}`, {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminUser(user: any): Promise<{ success: boolean; user: User; qrCode?: { saved: boolean; filename?: string; reason?: string } }> {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(user)
    });
    return handleResponse(res);
  },

  async downloadAdminAttendeeQRCodes(): Promise<Blob> {
    const res = await fetch('/api/admin/users/attendee-qrcodes/download', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    if (!res.ok) {
      const data = await parseResponseBody(res);
      const message = typeof data === 'object' && data && 'error' in data && typeof data.error === 'string'
          ? data.error
          : `Request failed with status ${res.status}`;
      throw new ApiError(message, res.status, data);
    }
    return res.blob();
  },

  async toggleAdminUserStatus(id: string): Promise<{ success: boolean; user: User }> {
    const res = await fetch(`/api/admin/users/${id}/statusToggle`, {
      method: 'PUT',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async deleteAdminUser(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async bulkDeleteAdminMembers(ids: string[]): Promise<{ success: boolean; deleted: number }> {
    const res = await fetch('/api/admin/users/members/bulk-delete', {
      method: 'DELETE',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ ids })
    });
    return handleResponse(res);
  },

  async saveAdminSpeaker(speaker: any): Promise<{ success: boolean; speaker: Speaker }> {
    const res = await fetch('/api/admin/speakers', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(speaker)
    });
    return handleResponse(res);
  },

  async deleteAdminSpeaker(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/speakers/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminSession(session: any): Promise<{ success: boolean; session: Session }> {
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(session)
    });
    return handleResponse(res);
  },

  async deleteAdminSession(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/sessions/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminSponsor(sponsor: any): Promise<{ success: boolean; sponsor: Sponsor }> {
    const res = await fetch('/api/admin/sponsors', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(sponsor)
    });
    return handleResponse(res);
  },

  async deleteAdminSponsor(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/sponsors/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminTestimonial(testimonial: any): Promise<{ success: boolean; testimonial: Testimonial }> {
    const res = await fetch('/api/admin/testimonials', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(testimonial)
    });
    return handleResponse(res);
  },

  async deleteAdminTestimonial(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/testimonials/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminGallery(image: any): Promise<{ success: boolean; image: GalleryImage }> {
    const res = await fetch('/api/admin/gallery', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(image)
    });
    return handleResponse(res);
  },

  async deleteAdminGallery(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/gallery/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminVenue(venue: any): Promise<{ success: boolean; venue: VenueInfo }> {
    const res = await fetch('/api/admin/venue', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(venue)
    });
    return handleResponse(res);
  },

  async saveAdminAdventure(adventure: any): Promise<{ success: boolean; adventure: AdventureActivity }> {
    const res = await fetch('/api/admin/adventures', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify(adventure)
    });
    return handleResponse(res);
  },

  async deleteAdminAdventure(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/admin/adventures/${id}`, {
      method: 'DELETE',
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return handleResponse(res);
  },

  async saveAdminGoogleDriveLink(link: string): Promise<{ success: boolean; link: string }> {
    const res = await fetch('/api/admin/google-drive-link', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: SAME_ORIGIN_CREDENTIALS,
      body: JSON.stringify({ googleDriveLink: link })
    });
    return handleResponse(res);
  },

  async getAdminFeedbackReports(): Promise<FeedbackSubmission[]> {
    const res = await fetch('/api/admin/feedback', {
      credentials: SAME_ORIGIN_CREDENTIALS
    });
    return ensureArray<FeedbackSubmission>(await handleResponse<unknown>(res), 'Feedback reports');
  }
};
