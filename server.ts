import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import path from 'path';
import { getDb } from './src/server/db-postgres';
import { getEventPhotoAlbums, isGoogleDriveFolderUrl } from './src/lib/eventPhotoAlbums';
import {
  AdminUserListQuery,
  ApiAuditEntry,
  ApiMetrics,
  ApiMetricsQuery,
  ApiMetricsRange,
  AttendanceRecord,
  AttendanceScanResponse,
  AuthResponseUser,
  ChatMessage,
  CheckInAttendee,
  LoginResponse,
  MeResponse,
  OptionalSessionResponse,
  PublicAttendeeListQuery,
  Election,
  ElectionBallot,
  ElectionCandidate,
  ElectionCandidateCategory,
  ElectionDashboard,
  ElectionVote,
  ElectionVoter,
  QAQuestion,
  QAQuestionType,
  QAResponse,
  StoredUser,
  UserRole,
  DayLink,
  StudyMaterial
} from './src/types';
import multer from 'multer';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { hasMinimumSearchLength, toPublicAttendeeSearchResults } from './src/server/attendee-search';
import { attendanceSessions, findAttendanceSession } from './src/config/attendanceSessions';
import { eventDressCode, getDressCodeContext } from './src/config/dressCode';
import { STUDY_MATERIAL_MAX_SIZE_BYTES, STUDY_MATERIAL_MAX_SIZE_MB } from './src/config/studyMaterials';
import type { SessionQuestionRepository } from './src/server/session-question-store';
import { registerSessionQuestionRoutes } from './src/server/session-question-routes';
import { API_METRICS_WINDOWS, createApiMetricsQuery, summarizeApiMetrics } from './src/server/api-metrics';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_ROOT = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
const ATTENDEE_QR_DIR = path.join(UPLOAD_ROOT, 'attendee-qrcodes');

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME?.trim() || 'cipf_auth';
const DEFAULT_AUTH_TOKEN_TTL = '7d';

function parseBooleanFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return value === 'true';
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
}

function parseDurationToMs(value: string): number {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration "${value}". Use forms like 30m, 12h, or 7d.`);
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * multipliers[unit];
}

const QA_QUESTION_TYPES: QAQuestionType[] = ['short_answer', 'multiple_choice', 'yes_no', 'rating'];
const MULTIPLE_CHOICE_LABELS = ['A', 'B', 'C', 'D'];
const ELECTION_CATEGORIES: ElectionCandidateCategory[] = ['employee_representative', 'employer_cifoz', 'employer_zbca'];

function normalizeQAOptions(type: QAQuestionType, options: unknown): string[] {
  if (type === 'yes_no') return ['Yes', 'No'];
  if (type === 'rating') return ['1', '2', '3', '4', '5'];
  if (type === 'short_answer') return [];

  if (!Array.isArray(options)) return [];
  return options
      .map((option) => String(option).trim())
      .filter(Boolean)
      .slice(0, 4);
}

function validateQAAnswer(question: QAQuestion, answer: string) {
  const normalized = answer.trim();
  if (!normalized) {
    return 'Answer is required.';
  }
  if (question.type === 'short_answer') {
    return normalized.length > 1200 ? 'Short answer is too long.' : '';
  }
  if (question.type === 'multiple_choice') {
    const allowedLabels = MULTIPLE_CHOICE_LABELS.slice(0, question.options.length);
    return allowedLabels.includes(normalized) ? '' : 'Answer is not one of the available options.';
  }
  if (!question.options.includes(normalized)) {
    return 'Answer is not one of the available options.';
  }
  return '';
}

function normalizeQAAnswer(question: QAQuestion, answer: string) {
  const normalized = answer.trim();
  if (question.type !== 'multiple_choice') return normalized;
  if (MULTIPLE_CHOICE_LABELS.includes(normalized)) return normalized;
  const optionIndex = question.options.findIndex(option => option === normalized);
  return optionIndex >= 0 ? MULTIPLE_CHOICE_LABELS[optionIndex] : normalized;
}

function normalizeElectionStatus(value: unknown): Election['status'] {
  return value === 'open' || value === 'closed' || value === 'scheduled' || value === 'draft' ? value : 'draft';
}

function normalizeOptionalDate(value: unknown): string | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : raw.replace(' ', 'T').slice(0, 19);
}

function getTimeZoneOffsetMillis(timezone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Africa/Harare',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
  );
  return asUtc - date.getTime();
}

function parseElectionScheduleDate(value?: string, timezone: string = 'Africa/Harare') {
  if (!value) return null;
  if (/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const [datePart, timePart = '00:00:00'] = value.replace(' ', 'T').split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (Number.isNaN(utcGuess.getTime())) return null;
  const offset = getTimeZoneOffsetMillis(timezone, utcGuess);
  return new Date(utcGuess.getTime() - offset);
}

function getScheduleStatus(startsAt?: string, endsAt?: string, timezone: string = 'Africa/Harare', now = new Date()): Election['status'] {
  const startDate = parseElectionScheduleDate(startsAt, timezone);
  const endDate = parseElectionScheduleDate(endsAt, timezone);
  if (endDate && now >= endDate) return 'closed';
  if (startDate && now < startDate) return 'scheduled';
  return 'open';
}

function getEffectiveElectionStatus(election: Election, now = new Date()): Election['status'] {
  if (election.status === 'closed') return 'closed';
  if (election.status === 'draft') return 'draft';

  return getScheduleStatus(election.startsAt, election.endsAt, election.timezone, now);
}

function normalizeElectionCategory(value: unknown): ElectionCandidateCategory {
  return ELECTION_CATEGORIES.includes(value as ElectionCandidateCategory)
      ? value as ElectionCandidateCategory
      : 'employee_representative';
}

function toBase64Url(value: Buffer | string) {
  return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  return Buffer.from(`${padded}${padding}`, 'base64');
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [name, ...rest] = part.trim().split('=');
    if (!name || rest.length === 0) return cookies;
    cookies[name] = decodeURIComponent(rest.join('='));
    return cookies;
  }, {});
}

function buildUserPayload(user: StoredUser): AuthResponseUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    organization: user.organization,
    position: user.position,
    status: user.status,
    class: user.class,
    accommodationProvided: user.accommodationProvided,
    roomNumber: user.roomNumber,
    transportProvided: user.transportProvided,
    selectedActivity: user.selectedActivity,
    checkedIn: user.checkedIn,
    checkedInAt: user.checkedInAt
  };
}

function buildCheckInPayload(user: StoredUser): CheckInAttendee {
  return {
    ...buildUserPayload(user),
    hasSetPassword: user.hasSetPassword
  };
}

function normalizeLookupText(value: string) {
  return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
}

function matchesVoterName(user: Pick<StoredUser, 'firstName' | 'lastName'>, query: string) {
  const tokens = normalizeLookupText(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return false;
  const forwardName = normalizeLookupText(`${user.firstName} ${user.lastName}`);
  const reverseName = normalizeLookupText(`${user.lastName} ${user.firstName}`);
  return tokens.every(token => forwardName.includes(token) || reverseName.includes(token));
}

function isValidRegistrationPassword(password: string) {
  return password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password);
}

function generateQrToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function buildAttendeeQrPayload(qrToken: string) {
  return `maz-winter-school-2026:attendee:${qrToken}`;
}

function extractQrToken(rawQrValue: string) {
  const trimmed = rawQrValue.trim();
  const prefix = 'maz-winter-school-2026:attendee:';
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
}

function sanitizeFilePart(value: string, fallback = 'Unknown') {
  const cleaned = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  return cleaned || fallback;
}

function getAttendeeQrFilename(user: Pick<StoredUser, 'id' | 'firstName' | 'lastName' | 'organization'>) {
  const name = sanitizeFilePart(`${user.firstName}-${user.lastName}`, 'Attendee');
  const company = sanitizeFilePart(user.organization || 'No-Company', 'No-Company');
  const stableSuffix = crypto.createHash('sha1').update(user.id).digest('hex').slice(0, 8);
  return `${name}__${company}__${stableSuffix}__QR.png`;
}

async function saveAttendeeQrCode(user: StoredUser) {
  if (user.role !== 'attendee' || !user.qrToken) {
    return { saved: false, reason: 'QR code is only generated for attendee profiles.' };
  }

  await fs.promises.mkdir(ATTENDEE_QR_DIR, { recursive: true });
  const filename = getAttendeeQrFilename(user);
  const filePath = path.join(ATTENDEE_QR_DIR, filename);
  await QRCode.toFile(filePath, buildAttendeeQrPayload(user.qrToken), {
    type: 'png',
    width: 720,
    margin: 2,
    errorCorrectionLevel: 'M'
  });
  return { saved: true, filename };
}

const crcTable = new Uint32Array(256).map((_, tableIndex) => {
  let value = tableIndex;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

function createZipArchive(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { time, date } = getDosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const checksum = crc32(entry.data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(entry.data.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, entry.data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(entry.data.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

interface AuthTokenPayload {
  sub: string;
  role: UserRole;
  exp: number;
  method?: 'member_identifier';
  electionId?: string;
  identifierDigest?: string;
}

export interface AppDatabase {
  sessionQuestions?: SessionQuestionRepository;
  ready(): Promise<void>;
  findUserByEmail(email: string): Promise<StoredUser | undefined> | StoredUser | undefined;
  getUserById(id: string): Promise<StoredUser | undefined> | StoredUser | undefined;
  updateUserCheckin(userId: string, updates: Partial<StoredUser>): Promise<StoredUser> | StoredUser;
  findUserByQrToken(qrToken: string): Promise<StoredUser | undefined> | StoredUser | undefined;
  searchAttendees(query: string, limit?: number): Promise<StoredUser[]> | StoredUser[];
  listPublicAttendees(query?: PublicAttendeeListQuery): Promise<{
    items: Array<{ id: string; firstName: string; lastName: string; organization?: string }>;
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> | {
    items: Array<{ id: string; firstName: string; lastName: string; organization?: string }>;
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  listAdminUsers(query?: AdminUserListQuery): Promise<{
    items: StoredUser[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  }> | {
    items: StoredUser[];
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };
  exportAdminUsers(query?: AdminUserListQuery): Promise<StoredUser[]> | StoredUser[];
  getSessions(): Promise<any[]> | any[];
  getSpeakers(): Promise<any[]> | any[];
  getSponsors(): Promise<any[]> | any[];
  getTestimonials(): Promise<any[]> | any[];
  getGallery(): Promise<any[]> | any[];
  getVenue(): Promise<any> | any;
  getAdventures(): Promise<any[]> | any[];
  getGoogleDriveLink(): Promise<string> | string;
  getNotes(userId: string): Promise<Array<{ sessionId: string; content: string }>> | Array<{ sessionId: string; content: string }>;
  saveNote(note: { userId: string; sessionId: string; content?: string }): Promise<any> | any;
  deleteNote(userId: string, sessionId: string): Promise<boolean> | boolean;
  saveFeedback(feedback: any): Promise<any> | any;
  getFeedback(): Promise<any[]> | any[];
  saveUser(user: StoredUser): Promise<StoredUser> | StoredUser;
  deleteUser(id: string): Promise<boolean> | boolean;
  saveApiAuditLog?(entry: ApiAuditEntry): Promise<void> | void;
  listApiAuditLogs?(query: { page: number; pageSize: number; errorsOnly: boolean; search: string }): Promise<{ items: ApiAuditEntry[]; total: number }> | { items: ApiAuditEntry[]; total: number };
  getApiMetrics?(query: ApiMetricsQuery): Promise<ApiMetrics> | ApiMetrics;
  getAttendanceRecord(attendeeId: string, sessionId: string): Promise<AttendanceRecord | undefined> | AttendanceRecord | undefined;
  saveAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> | AttendanceRecord;
  listAttendanceRecords(sessionId: string): Promise<AttendanceRecord[]> | AttendanceRecord[];
  listQAQuestions(sessionId?: string): Promise<QAQuestion[]> | QAQuestion[];
  getQAQuestion(id: string): Promise<QAQuestion | undefined> | QAQuestion | undefined;
  getLiveQAQuestion(sessionId?: string): Promise<QAQuestion | undefined> | QAQuestion | undefined;
  saveQAQuestion(question: QAQuestion): Promise<QAQuestion> | QAQuestion;
  updateQAQuestionStatus(id: string, status: QAQuestion['status']): Promise<QAQuestion | undefined> | QAQuestion | undefined;
  deleteQAQuestion(id: string): Promise<boolean> | boolean;
  listQAResponses(questionId: string): Promise<QAResponse[]> | QAResponse[];
  getQAResponse(questionId: string, attendeeId: string): Promise<QAResponse | undefined> | QAResponse | undefined;
  saveQAResponse(response: QAResponse): Promise<QAResponse> | QAResponse;
  getActiveElection(): Promise<Election | undefined> | Election | undefined;
  getElection(id: string): Promise<Election | undefined> | Election | undefined;
  saveElection(election: Election): Promise<Election> | Election;
  updateElectionStatus(id: string, status: Election['status']): Promise<Election | undefined> | Election | undefined;
  listElectionCandidates(electionId: string): Promise<ElectionCandidate[]> | ElectionCandidate[];
  saveElectionCandidate(candidate: ElectionCandidate): Promise<ElectionCandidate> | ElectionCandidate;
  deleteElectionCandidate(id: string): Promise<boolean> | boolean;
  listElectionVoters(electionId: string): Promise<ElectionVoter[]> | ElectionVoter[];
  saveElectionVoter(voter: ElectionVoter): Promise<ElectionVoter> | ElectionVoter;
  deleteElectionVoter(electionId: string, userId: string): Promise<boolean> | boolean;
  getElectionVoter(electionId: string, userId: string): Promise<ElectionVoter | undefined> | ElectionVoter | undefined;
  listElectionVotes(electionId: string, voterId?: string): Promise<ElectionVote[]> | ElectionVote[];
  saveElectionVotes(electionId: string, voterId: string, votes: ElectionVote[]): Promise<ElectionVote[]> | ElectionVote[];
  getElectionDashboard(electionId?: string): Promise<ElectionDashboard> | ElectionDashboard;
  getElectionBallot(userId: string): Promise<ElectionBallot> | ElectionBallot;
  saveSpeaker(speaker: any): Promise<any> | any;
  deleteSpeaker(id: string): Promise<boolean> | boolean;
  saveSession(session: any): Promise<any> | any;
  deleteSession(id: string): Promise<boolean> | boolean;
  saveSponsor(sponsor: any): Promise<any> | any;
  deleteSponsor(id: string): Promise<boolean> | boolean;
  saveTestimonial(testimonial: any): Promise<any> | any;
  deleteTestimonial(id: string): Promise<boolean> | boolean;
  saveGalleryImage(image: any): Promise<any> | any;
  deleteGalleryImage(id: string): Promise<boolean> | boolean;
  saveVenue(venue: any): Promise<any> | any;
  saveAdventure(adventure: any): Promise<any> | any;
  deleteAdventure(id: string): Promise<boolean> | boolean;
  saveGoogleDriveLink(link: string): Promise<string> | string;
  // Day Links methods
  getDayLinks(): Promise<DayLink[]> | DayLink[];
  saveDayLink(dayLink: DayLink): Promise<DayLink> | DayLink;
  deleteDayLink(id: string): Promise<boolean> | boolean;
  // Study Materials methods
  getStudyMaterials(): Promise<StudyMaterial[]> | StudyMaterial[];
  saveStudyMaterial(material: StudyMaterial): Promise<StudyMaterial> | StudyMaterial;
  deleteStudyMaterial(id: string): Promise<boolean> | boolean;
  incrementStudyMaterialDownloads(id: string): Promise<boolean> | boolean;
}

interface CreateAppOptions {
  db?: AppDatabase;
  authTokenSecret?: string;
  authTokenTtl?: string;
  cookieSecure?: boolean;
  cookieDomain?: string;
  serveFrontend?: boolean;
}

// Ensure upload directories exist
const ensureDirectoryExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Create upload directories - ONLY DECLARED ONCE
const uploadDirs = ['sponsors', 'speakers', 'gallery', 'candidates', 'adventures', 'study-materials'];
uploadDirs.forEach(dir => ensureDirectoryExists(path.join(UPLOAD_ROOT, dir)));

// Configure storage for different types
const createStorage = (folder: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(UPLOAD_ROOT, folder);
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${folder}-${uniqueSuffix}${ext}`);
  }
});

// File filter for images
const imageFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WEBP are allowed.'));
  }
};

// File filter for all documents (PDF, PPTX, DOCX, XLSX, ZIP, RAR, etc.)
const documentFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-rar',
    'application/octet-stream' // For some files that might not have proper MIME
  ];

  const allowedExtensions = ['.pdf', '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls', '.zip', '.rar'];
  const ext = path.extname(file.originalname).toLowerCase();

  // Check MIME type OR extension
  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, PPTX, DOCX, XLSX, ZIP, and RAR files are allowed.'));
  }
};

// Create multer instances
const uploadSponsor = multer({
  storage: createStorage('sponsors'),
  fileFilter: imageFilter,
  limits: { fileSize: 6 * 1024 * 1024 }
});

const uploadSpeaker = multer({
  storage: createStorage('speakers'),
  fileFilter: imageFilter,
  limits: { fileSize: 6 * 1024 * 1024 }
});

const uploadCandidate = multer({
  storage: createStorage('candidates'),
  fileFilter: imageFilter,
  limits: { fileSize: 6 * 1024 * 1024 }
});

const uploadGallery = multer({
  storage: createStorage('gallery'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadAdventure = multer({
  storage: createStorage('adventures'),
  fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const db = options.db ?? getDb();
  const authTokenSecret = options.authTokenSecret ?? process.env.AUTH_TOKEN_SECRET;
  if (!authTokenSecret) {
    throw new Error('AUTH_TOKEN_SECRET is required.');
  }

  const authTokenTtl = parseDurationToMs(options.authTokenTtl ?? process.env.AUTH_TOKEN_TTL ?? DEFAULT_AUTH_TOKEN_TTL);
  const cookieSecure = options.cookieSecure ?? parseBooleanFlag(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
  const cookieDomain = options.cookieDomain ?? (process.env.COOKIE_DOMAIN?.trim() || undefined);
  const serveFrontend = options.serveFrontend ?? process.env.NODE_ENV !== 'test';
  const maxFailedLoginAttempts = 7;
  const failedLoginLockMs = 20 * 60 * 1000;
  const failedLoginAttempts = new Map<string, { count: number; firstFailedAt: number; lockedUntil?: number }>();
  const allowedOrigins = new Set([
    ...parseCsv(process.env.CORS_ALLOWED_ORIGINS),
    ...parseCsv(process.env.CORS_ORIGIN),
    ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'])
  ]);

  await db.ready();

  const auditFallback: ApiAuditEntry[] = [];
  app.use('/api', (req, res, next) => {
    const started = Date.now();
    const id = `req_${crypto.randomUUID()}`;
    let responseError = '';
    let responseErrorCode = '';
    res.setHeader('X-Request-ID', id);
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      if (body && typeof body === 'object') {
        if (typeof body.error === 'string') responseError = body.error;
        if (typeof body.errorCode === 'string') responseErrorCode = body.errorCode;
      }
      return originalJson(body);
    }) as typeof res.json;
    res.on('finish', () => {
      const durationMs = Date.now() - started;
      void (async () => {
        const token = verifyAuthToken(parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME]);
        const actorId = typeof res.locals.auditActorId === 'string' ? res.locals.auditActorId : token?.sub;
        let actor: StoredUser | undefined;
        try { actor = actorId ? await db.getUserById(actorId) : undefined; }
        catch { actor = undefined; }
        const rawCause = res.locals.auditCause || responseError;
        const entry: ApiAuditEntry = {
          id, time: new Date(started).toISOString(), actorId: actor?.id || actorId,
          actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : 'Unknown',
          method: req.method, path: req.originalUrl.split('?')[0], statusCode: res.statusCode,
          durationMs,
          errorCode: res.statusCode >= 400 ? responseErrorCode || `HTTP_${res.statusCode}` : undefined,
          errorCause: res.statusCode >= 400 ? String(rawCause || 'Request failed')
            .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted database URL]')
            .replace(/(["']?(?:password|token|secret|authorization)["']?\s*[:=]\s*)(["'][^"']*["']|\S+)/gi, '$1[redacted]')
            .replace(/[\r\n]+/g, ' ').slice(0, 500) : undefined
        };
        auditFallback.unshift(entry);
        if (auditFallback.length > 2000) auditFallback.length = 2000;
        await db.saveApiAuditLog?.(entry);
      })().catch(error => console.error('Failed to save API audit entry:', error));
    });
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.originalUrl.startsWith('/api/')) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 400;
    const position = error instanceof Error ? error.message.match(/position \d+/i)?.[0] : undefined;
    res.locals.auditCause = status === 413 ? 'Request body exceeded the upload limit.' : `Malformed request body${position ? ` at ${position}` : ''}.`;
    return res.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'Request body could not be parsed.', errorCode: status === 413 ? 'BODY_TOO_LARGE' : 'INVALID_REQUEST_BODY' });
  });

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  const signAuthToken = (payload: AuthTokenPayload) => {
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const signature = crypto
        .createHmac('sha256', authTokenSecret)
        .update(encodedPayload)
        .digest();
    return `${encodedPayload}.${toBase64Url(signature)}`;
  };

  const digestVoterIdentifier = (identifier: string) => crypto
    .createHmac('sha256', authTokenSecret)
    .update(identifier.trim().toLowerCase())
    .digest('hex');

  const verifyAuthToken = (token?: string): AuthTokenPayload | null => {
    if (!token) return null;

    const [encodedPayload, encodedSignature] = token.split('.');
    if (!encodedPayload || !encodedSignature) return null;

    const expectedSignature = crypto
        .createHmac('sha256', authTokenSecret)
        .update(encodedPayload)
        .digest();

    const providedSignature = fromBase64Url(encodedSignature);
    if (
        expectedSignature.length !== providedSignature.length ||
        !crypto.timingSafeEqual(expectedSignature, providedSignature)
    ) {
      return null;
    }

    try {
      const payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as AuthTokenPayload;
      if (!payload.sub || !payload.exp || payload.exp < Date.now()) {
        return null;
      }
      return payload;
    } catch (error) {
      return null;
    }
  };

  const setAuthCookie = (res: express.Response, token: string, rememberMe: boolean) => {
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain,
      ...(rememberMe ? { maxAge: authTokenTtl } : {})
    });
  };

  const clearAuthCookie = (res: express.Response) => {
    res.clearCookie(AUTH_COOKIE_NAME, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: 'lax',
      path: '/',
      domain: cookieDomain
    });
  };

  const parsePositiveInt = (value: unknown, defaultValue: number) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return defaultValue;
    }
    return parsed;
  };

  const getClientIp = (req: express.Request) => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  };

  const getFailedLoginKey = (req: express.Request, email: string) => {
    return `${String(email).trim().toLowerCase()}::${getClientIp(req)}`;
  };

  const getFailedLoginLock = (key: string) => {
    const record = failedLoginAttempts.get(key);
    if (!record?.lockedUntil) return null;
    if (record.lockedUntil <= Date.now()) {
      failedLoginAttempts.delete(key);
      return null;
    }
    return record.lockedUntil;
  };

  const recordFailedLogin = (key: string) => {
    const now = Date.now();
    const existing = failedLoginAttempts.get(key);
    const record = existing && now - existing.firstFailedAt <= failedLoginLockMs
        ? existing
        : { count: 0, firstFailedAt: now };

    record.count += 1;
    if (record.count >= maxFailedLoginAttempts) {
      record.lockedUntil = now + failedLoginLockMs;
    }
    failedLoginAttempts.set(key, record);
    return record;
  };

  const clearFailedLogin = (key: string) => {
    failedLoginAttempts.delete(key);
  };

  const buildFailedLoginMessage = (baseMessage: string, failedCount: number) => {
    const remainingAttempts = Math.max(maxFailedLoginAttempts - failedCount, 0);
    if (failedCount >= 5 && remainingAttempts > 0) {
      return `${baseMessage} Warning: you have ${remainingAttempts} login ${remainingAttempts === 1 ? 'attempt' : 'attempts'} left before a 20-minute lockout.`;
    }
    return baseMessage;
  };

  const parseAdminUserQuery = (req: express.Request): AdminUserListQuery => ({
    q: typeof req.query.q === 'string' ? req.query.q : '',
    status: req.query.status === 'active' || req.query.status === 'disabled' ? req.query.status : 'all',
    role: req.query.role === 'admin' || req.query.role === 'attendee' || req.query.role === 'member' ? req.query.role : 'all',
    checkedIn: req.query.checkedIn === 'true' || req.query.checkedIn === 'false' ? req.query.checkedIn : 'all',
    page: parsePositiveInt(req.query.page, 1),
    pageSize: parsePositiveInt(req.query.pageSize, 25),
    sort: req.query.sort === 'name_asc' ? 'name_asc' : 'created_desc'
  });

  const parsePublicAttendeeQuery = (req: express.Request): PublicAttendeeListQuery => ({
    q: typeof req.query.q === 'string' ? req.query.q : '',
    page: parsePositiveInt(req.query.page, 1),
    pageSize: parsePositiveInt(req.query.pageSize, 25)
  });

  // Serve uploaded files statically
  app.use('/uploads', express.static(UPLOAD_ROOT));

  // Simple Auth Middleware
  const getAuthUser = async (req: express.Request) => {
    const cookies = parseCookies(req.headers.cookie);
    const payload = verifyAuthToken(cookies[AUTH_COOKIE_NAME]);
    if (!payload) {
      return null;
    }
    const user = await db.getUserById(payload.sub);
    if (!user || user.status !== 'active') return null;
    if (payload.method === 'member_identifier') {
      if ((user.role !== 'member' && user.role !== 'attendee') || !payload.electionId || !payload.identifierDigest) return null;
      const election = await db.getActiveElection();
      if (!election || election.id !== payload.electionId) return null;
      const voter = await db.getElectionVoter(election.id, user.id);
      return voter?.identifier?.trim() && digestVoterIdentifier(voter.identifier) === payload.identifierDigest
        ? { ...user, role: 'member' as const } : null;
    }
    if (user.role === 'member') return null;
    return user.hasSetPassword && user.password ? user : null;
  };

  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    getAuthUser(req).then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized access. Please login.' });
      }
      next();
    }).catch(err => {
      res.locals.auditCause = err instanceof Error ? err.message : String(err);
      console.error('Auth error:', err);
      return res.status(500).json({ error: 'Authentication error' });
    });
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    getAuthUser(req).then(user => {
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Access forbidden. Admins only.' });
      }
      next();
    }).catch(err => {
      res.locals.auditCause = err instanceof Error ? err.message : String(err);
      console.error('Auth error:', err);
      return res.status(500).json({ error: 'Authentication error' });
    });
  };

  const requireSuperAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    getAuthUser(req).then(user => {
      if (!user) return res.status(401).json({ error: 'Sign in to access the super admin portal.', errorCode: 'NOT_AUTHENTICATED' });
      if (user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access is required.', errorCode: 'SUPER_ADMIN_REQUIRED' });
      next();
    }).catch(error => {
      res.locals.auditCause = error instanceof Error ? error.message : 'Authentication lookup failed';
      res.status(500).json({ error: 'Could not verify super admin access.', errorCode: 'AUTH_LOOKUP_FAILED' });
    });
  };

  const superAdminFailure = (res: express.Response, error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505' &&
        'constraint' in error && String(error.constraint).toLowerCase().includes('email')) {
      return res.status(409).json({ error: 'This email already belongs to another account.', errorCode: 'ADMIN_EMAIL_EXISTS' });
    }
    const cause = error instanceof Error ? error.message : 'Unexpected server error';
    res.locals.auditCause = cause;
    console.error('Super admin request failed:', error);
    return res.status(500).json({ error: 'The request could not be completed.', errorCode: 'INTERNAL_ERROR' });
  };
  const validAdminEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const adminAccounts = async () => (await db.exportAdminUsers({ role: 'admin', status: 'all' })).filter(user => user.role === 'admin');

  app.get('/api/super-admin/admins', requireSuperAdmin, async (_req, res) => {
    try {
      res.json({ admins: (await adminAccounts()).map(buildUserPayload) });
    } catch (error) { superAdminFailure(res, error); }
  });

  app.post('/api/super-admin/admins', requireSuperAdmin, async (req, res) => {
    try {
      const firstName = String(req.body.firstName || '').trim();
      const lastName = String(req.body.lastName || '').trim();
      const email = String(req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 || email.length > 255 || !validAdminEmail(email)) return res.status(400).json({ error: 'Enter names of at most 100 characters and a valid email address.', errorCode: 'INVALID_ADMIN_DETAILS' });
      if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Temporary password must contain at least 12 characters and at most 72 bytes.', errorCode: 'WEAK_PASSWORD' });
      if (await db.findUserByEmail(email)) return res.status(409).json({ error: 'This email already belongs to an account.', errorCode: 'ADMIN_EMAIL_EXISTS' });
      const admin = await db.saveUser({
        id: `admin_${crypto.randomUUID()}`, email, firstName, lastName, role: 'admin',
        organization: '', position: 'Administrator', status: 'active',
        accommodationProvided: false, roomNumber: '', transportProvided: false,
        checkedIn: false, checkedInAt: '', hasSetPassword: true,
        password: await bcrypt.hash(password, 12), selectedActivity: '', class: 'A'
      });
      res.status(201).json({ admin: buildUserPayload(admin) });
    } catch (error) { superAdminFailure(res, error); }
  });

  app.patch('/api/super-admin/admins/:id', requireSuperAdmin, async (req, res) => {
    try {
      const admin = await db.getUserById(req.params.id);
      if (!admin || admin.role !== 'admin') return res.status(404).json({ error: 'Admin account not found.', errorCode: 'ADMIN_NOT_FOUND' });
      const firstName = String(req.body.firstName ?? admin.firstName).trim();
      const lastName = String(req.body.lastName ?? admin.lastName).trim();
      const email = String(req.body.email ?? admin.email ?? '').trim().toLowerCase();
      const password = req.body.password ? String(req.body.password) : '';
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100 || email.length > 255 || !validAdminEmail(email)) return res.status(400).json({ error: 'Enter names of at most 100 characters and a valid email address.', errorCode: 'INVALID_ADMIN_DETAILS' });
      if (password && (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72)) return res.status(400).json({ error: 'New password must contain at least 12 characters and at most 72 bytes.', errorCode: 'WEAK_PASSWORD' });
      const emailOwner = await db.findUserByEmail(email);
      if (emailOwner && emailOwner.id !== admin.id) return res.status(409).json({ error: 'This email already belongs to another account.', errorCode: 'ADMIN_EMAIL_EXISTS' });
      const saved = await db.saveUser({ ...admin, firstName, lastName, email,
        ...(password ? { password: await bcrypt.hash(password, 12), hasSetPassword: true } : {}) });
      res.json({ admin: buildUserPayload(saved) });
    } catch (error) { superAdminFailure(res, error); }
  });

  app.patch('/api/super-admin/admins/:id/status', requireSuperAdmin, async (req, res) => {
    try {
      const admin = await db.getUserById(req.params.id);
      if (!admin || admin.role !== 'admin') return res.status(404).json({ error: 'Admin account not found.', errorCode: 'ADMIN_NOT_FOUND' });
      if (req.body.status !== 'active' && req.body.status !== 'disabled') return res.status(400).json({ error: 'Choose active or disabled status.', errorCode: 'INVALID_STATUS' });
      const saved = await db.saveUser({ ...admin, status: req.body.status });
      res.json({ admin: buildUserPayload(saved) });
    } catch (error) { superAdminFailure(res, error); }
  });

  app.delete('/api/super-admin/admins/:id', requireSuperAdmin, async (req, res) => {
    try {
      const admin = await db.getUserById(req.params.id);
      if (!admin || admin.role !== 'admin') return res.status(404).json({ error: 'Admin account not found.', errorCode: 'ADMIN_NOT_FOUND' });
      await db.deleteUser(admin.id);
      res.json({ success: true });
    } catch (error) { superAdminFailure(res, error); }
  });

  app.get('/api/super-admin/metrics', requireSuperAdmin, async (req, res) => {
    try {
      const range = String(req.query.range || '3h');
      const method = String(req.query.method || '').toUpperCase();
      const path = String(req.query.path || '');
      const code = String(req.query.code || '');
      if (!Object.prototype.hasOwnProperty.call(API_METRICS_WINDOWS, range)) {
        return res.status(400).json({ error: 'Choose a valid metrics time range.', errorCode: 'INVALID_METRICS_RANGE' });
      }
      if (!['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) || path.length > 500) {
        return res.status(400).json({ error: 'Choose a valid API method and endpoint.', errorCode: 'INVALID_METRICS_FILTER' });
      }
      if (code && !/^[1-5]\d{2}$/.test(code)) {
        return res.status(400).json({ error: 'Choose a valid HTTP response code.', errorCode: 'INVALID_METRICS_CODE' });
      }
      const query = createApiMetricsQuery(range as ApiMetricsRange, method, path, code ? Number(code) : null);
      res.json(db.getApiMetrics ? await db.getApiMetrics(query) : summarizeApiMetrics(auditFallback, query));
    } catch (error) { superAdminFailure(res, error); }
  });

  app.get('/api/super-admin/audit-logs', requireSuperAdmin, async (req, res) => {
    try {
      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const errorsOnly = req.query.errorsOnly === 'true';
      const search = String(req.query.search || '').trim().slice(0, 100);
      const result = db.listApiAuditLogs
        ? await db.listApiAuditLogs({ page, pageSize, errorsOnly, search })
        : (() => {
            const filtered = auditFallback.filter(item => (!errorsOnly || item.statusCode >= 400)
              && (!search || `${item.actorName} ${item.path} ${item.id} ${item.errorCode || ''}`.toLowerCase().includes(search.toLowerCase())));
            return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length };
          })();
      res.json({ ...result, page, pageSize });
    } catch (error) { superAdminFailure(res, error); }
  });

  // Upload sponsor logo
  registerSessionQuestionRoutes(app, db, getAuthUser);

  app.post('/api/upload/sponsor/:id?', requireAdmin, uploadSponsor.single('logo'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/sponsors/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.filename,
        message: 'Logo uploaded successfully'
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload speaker photo
  app.post('/api/upload/speaker/:id?', requireAdmin, uploadSpeaker.single('photo'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/speakers/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.filename,
        message: 'Photo uploaded successfully'
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload election candidate photo
  app.post('/api/upload/candidate/:id?', requireAdmin, uploadCandidate.single('photo'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/candidates/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl,
        filename: req.file.filename,
        message: 'Candidate photo uploaded successfully'
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload gallery image
  app.post('/api/upload/gallery', requireAdmin, uploadGallery.single('image'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/gallery/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.filename,
        message: 'Gallery image uploaded successfully'
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Upload adventure/activity image
  app.post('/api/upload/adventure', requireAdmin, uploadAdventure.single('image'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const imageUrl = `/uploads/adventures/${req.file.filename}`;
      res.json({
        success: true,
        imageUrl,
        filename: req.file.filename,
        message: 'Activity image uploaded successfully'
      });
    } catch (error: any) {
      console.error('Upload error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Delete uploaded file
  app.delete('/api/upload/:type/:filename', requireAdmin, (req, res) => {
    const { type, filename } = req.params;
    const filePath = path.join(UPLOAD_ROOT, type, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'File deleted successfully' });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  });

  app.get('/api/checkin/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }

      if (!hasMinimumSearchLength(q)) {
        return res.status(400).json({ error: 'Enter at least 2 characters to search.' });
      }

      const results = await db.searchAttendees(q, 10);
      res.json(toPublicAttendeeSearchResults(results));
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Search error:', error);
      res.status(500).json({ error: 'Failed to search attendees' });
    }
  });

  // Get attendee details for check-in
  app.get('/api/checkin/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await db.getUserById(userId);

      if (!user) {
        return res.status(404).json({ error: 'Attendee not found' });
      }

      if (user.role !== 'attendee') {
        return res.status(403).json({ error: 'Invalid attendee' });
      }

      res.json(buildCheckInPayload(user));
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching attendee:', error);
      res.status(500).json({ error: 'Failed to fetch attendee details' });
    }
  });

  // Complete check-in
  app.post('/api/checkin/confirm', async (req, res) => {
    try {
      const { userId, password } = req.body;
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!userId || !password) {
        return res.status(400).json({ error: 'User ID and password are required.' });
      }

      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email address is required for check-in.' });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const user = await db.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }

      if (user.role !== 'attendee' || user.status !== 'active') {
        return res.status(403).json({ error: 'An active attendee profile is required for check-in.' });
      }

      if (user.checkedIn) {
        return res.status(400).json({ error: 'Already checked in.' });
      }

      const existingUser = await db.findUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(409).json({ error: 'This email is linked to an existing account. Use your existing login, or contact support to verify the two profiles and reset your password. Do not create another account.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const updatedUser = await db.updateUserCheckin(userId, {
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
        hasSetPassword: true,
        password: hashedPassword,
        email: email
      });

      res.json({
        success: true,
        message: 'Check-in successful! Welcome to Winter School 2026.',
        user: buildUserPayload(updatedUser)
      });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Check-in error:', error);
      res.status(500).json({ error: 'Failed to complete check-in.' });
    }
  });

  // Check check-in status
  app.get('/api/checkin/status/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await db.getUserById(userId);

      if (!user) {
        return res.status(404).json({ error: 'Attendee not found' });
      }

      res.json({
        checkedIn: user.checkedIn || false,
        checkedInAt: user.checkedInAt,
        selectedActivity: user.selectedActivity || ''
      });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error checking status:', error);
      res.status(500).json({ error: 'Failed to check status' });
    }
  });

  app.get('/api/public/attendees', async (req, res) => {
    try {
      const query = parsePublicAttendeeQuery(req);
      const result = await db.listPublicAttendees(query);

      res.json({
        success: true,
        attendees: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore
      });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching public attendees:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch attendees list'
      });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', serverTime: new Date().toISOString() });
  });

  // Imported members sign in with the identifier assigned on the active election register.
  app.post('/api/auth/member-login', async (req, res) => {
    try {
      const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
      if (!identifier) return res.status(400).json({ error: 'Enter your voter identifier.' });
      const failedLoginKey = getFailedLoginKey(req, 'member-voting');
      const lockedUntil = getFailedLoginLock(failedLoginKey);
      if (lockedUntil) {
        res.setHeader('Retry-After', String(Math.ceil((lockedUntil - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Too many sign-in attempts. Please wait 20 minutes before trying again.' });
      }

      const election = await db.getActiveElection();
      if (!election) return res.status(404).json({ error: 'No active election is available.' });
      const matchingVoters = (await db.listElectionVoters(election.id)).filter(voter =>
        voter.identifier?.trim().toLowerCase() === identifier.toLowerCase());
      const voter = matchingVoters.length === 1 ? matchingVoters[0] : undefined;
      const user = voter ? await db.getUserById(voter.userId) : undefined;
      if (!user || (user.role !== 'member' && user.role !== 'attendee') || user.status !== 'active') {
        res.locals.auditCause = matchingVoters.length > 1 ? 'Identifier is duplicated in the active voter register.' : 'Identifier is not assigned to an active member in the active voter register.';
        recordFailedLogin(failedLoginKey);
        return res.status(401).json({ error: 'Identifier not found or not eligible for this election.' });
      }

      res.locals.auditActorId = user.id;
      clearFailedLogin(failedLoginKey);
      const authToken = signAuthToken({ sub: user.id, role: 'member', exp: Date.now() + Math.min(authTokenTtl, 12 * 60 * 60 * 1000), method: 'member_identifier', electionId: election.id, identifierDigest: digestVoterIdentifier(voter.identifier!) });
      setAuthCookie(res, authToken, false);
      const response: LoginResponse = { message: `Welcome, ${user.firstName} ${user.lastName}.`, user: buildUserPayload({ ...user, role: 'member' }) };
      res.json(response);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Member login error:', error);
      res.status(500).json({ error: 'Member sign-in failed.' });
    }
  });

  // Auth: staff and event account login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password, rememberMe } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const failedLoginKey = getFailedLoginKey(req, email);
      const lockedUntil = getFailedLoginLock(failedLoginKey);
      if (lockedUntil) {
        const retryAfterSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({ error: 'Too many failed login attempts. Please wait 20 minutes before trying again.' });
      }

      const user = await db.findUserByEmail(String(email));
      if (!user) {
        res.locals.auditCause = 'No account matches the supplied email.';
        const failedRecord = recordFailedLogin(failedLoginKey);
        return res.status(401).json({
          error: buildFailedLoginMessage('Invalid email address or unlisted attendee.', failedRecord.count)
        });
      }

      res.locals.auditActorId = user.id;

      if (user.role === 'member') {
        return res.status(403).json({ error: 'Members sign in with their voter identifier.' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ error: 'This attendee profile has been disabled by the administrator.' });
      }

      const isValid = Boolean(user.hasSetPassword && user.password)
          ? await bcrypt.compare(password, user.password)
          : false;

      if (!isValid) {
        res.locals.auditCause = user.hasSetPassword ? 'Password did not match this account.' : 'Account has no password set.';
        const failedRecord = recordFailedLogin(failedLoginKey);
        return res.status(401).json({
          error: buildFailedLoginMessage('Incorrect/Invalid password. Please try again.', failedRecord.count)
        });
      }

      clearFailedLogin(failedLoginKey);

      const expiresAt = Date.now() + authTokenTtl;
      const authToken = signAuthToken({
        sub: user.id,
        role: user.role,
        exp: expiresAt
      });
      setAuthCookie(res, authToken, Boolean(rememberMe));

      const response: LoginResponse = {
        message: `Welcome, ${user.firstName} ${user.lastName}.`,
        user: buildUserPayload(user)
      };
      res.json(response);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // Forgot password
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email address is required.' });
      }

      res.json({
        success: true,
        message: 'Password recovery is handled by the MAZ support team. Please contact the administrator to reset your access securely.'
      });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Password recovery is temporarily unavailable. Please contact the administrator for assistance.' });
    }
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
  });

  // Public pages can check for a session without requiring a signed-in user.
  app.get('/api/auth/session', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = await getAuthUser(req);
      const response: OptionalSessionResponse = { user: user ? buildUserPayload(user) : null };
      res.json(response);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Session lookup error:', error);
      res.status(500).json({ error: 'Could not check session.' });
    }
  });

  // Auth: Me
  app.get('/api/auth/me', (req, res) => {
    getAuthUser(req).then(user => {
      if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      const response: MeResponse = { user: buildUserPayload(user) };
      res.json(response);
    }).catch(err => {
      console.error('Auth error:', err);
      res.status(500).json({ error: 'Authentication error' });
    });
  });

  // Get active sessions
  app.get('/api/sessions', async (req, res) => {
    try {
      const sessions = await db.getSessions();
      res.json(sessions);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching sessions:', error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  // Speakers
  app.get('/api/speakers', async (req, res) => {
    try {
      const speakers = await db.getSpeakers();
      res.json(speakers);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching speakers:', error);
      res.status(500).json({ error: 'Failed to fetch speakers' });
    }
  });

  // Sponsors
  app.get('/api/sponsors', async (req, res) => {
    try {
      const sponsors = await db.getSponsors();
      res.json(sponsors);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching sponsors:', error);
      res.status(500).json({ error: 'Failed to fetch sponsors' });
    }
  });

  // Testimonials
  app.get('/api/testimonials', async (req, res) => {
    try {
      const testimonials = await db.getTestimonials();
      res.json(testimonials);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching testimonials:', error);
      res.status(500).json({ error: 'Failed to fetch testimonials' });
    }
  });

  // Gallery
  app.get('/api/gallery', async (req, res) => {
    try {
      const gallery = await db.getGallery();
      res.json(gallery);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching gallery:', error);
      res.status(500).json({ error: 'Failed to fetch gallery' });
    }
  });

  // Venue
  app.get('/api/venue', async (req, res) => {
    try {
      const venue = await db.getVenue();
      res.json(venue);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching venue:', error);
      res.status(500).json({ error: 'Failed to fetch venue' });
    }
  });

  // Adventures
  app.get('/api/adventures', async (req, res) => {
    try {
      const adventures = await db.getAdventures();
      res.json(adventures);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching adventures:', error);
      res.status(500).json({ error: 'Failed to fetch adventures' });
    }
  });

  // Google Drive photo link
  app.get('/api/google-drive-link', async (req, res) => {
    try {
      const link = await db.getGoogleDriveLink();
      res.json({ link });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching Google Drive link:', error);
      res.status(500).json({ error: 'Failed to fetch Google Drive link' });
    }
  });

  // Get user session notes
  app.get('/api/notes/:sessionId', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId } = req.params;
      const notes = await db.getNotes(user.id);
      const sessionNote = notes.find(n => n.sessionId === sessionId);
      res.json({ note: sessionNote ? sessionNote.content : '' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching notes:', error);
      res.status(500).json({ error: 'Failed to fetch notes' });
    }
  });

  // Save session notes
  app.post('/api/notes', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId, content } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
      }
      const note = await db.saveNote({
        userId: user.id,
        sessionId,
        content: content || ''
      });
      res.json({ success: true, note });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving note:', error);
      res.status(500).json({ error: 'Failed to save note' });
    }
  });

  // Delete session note
  app.delete('/api/notes/:sessionId', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId } = req.params;
      await db.deleteNote(user.id, sessionId);
      res.json({ success: true, message: 'Note cleared successfully.' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting note:', error);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  });

  // Save Feedback
  app.post('/api/feedback', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { rating, bestSession, bestFacilitator, improvements, attendAgain, chatTranscript } = req.body;
      const userEmail = user.email ?? '';

      const newFeedback = await db.saveFeedback({
        id: `fb_${Date.now()}`,
        userId: user.id,
        userEmail,
        userName: `${user.firstName} ${user.lastName}`,
        rating: Number(rating) || 5,
        bestSession: bestSession || 'N/A',
        bestFacilitator: bestFacilitator || 'N/A',
        improvements: improvements || '',
        attendAgain: !!attendAgain,
        submittedAt: new Date().toISOString(),
        chatTranscript
      });

      res.json({ success: true, feedback: newFeedback });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving feedback:', error);
      res.status(500).json({ error: 'Failed to save feedback' });
    }
  });

  // --- AI FEEDBACK CHATBOT ENDPOINT ---
  app.post('/api/chatbot/message', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { messages } = req.body as { messages: ChatMessage[] };

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid messages array.' });
      }

      const [
        sessions,
        speakers,
        sponsors,
        venue,
        adventures,
        gallery,
        dayLinks,
        electionDashboard,
        qaQuestions
      ] = await Promise.all([
        db.getSessions(),
        db.getSpeakers(),
        db.getSponsors(),
        db.getVenue(),
        db.getAdventures(),
        db.getGallery(),
        db.getDayLinks(),
        db.getElectionDashboard(),
        db.listQAQuestions()
      ]);

      const formatLine = (value: unknown, fallback = 'Not provided') => {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text || fallback;
      };
      const activeSessionsList = sessions
          .slice(0, 80)
          .map(s => `- Day ${s.day} (${s.category}) ${s.time}: ${formatLine(s.topic)} | Facilitator: ${formatLine(s.facilitator)} | Venue: ${formatLine(s.venue)}`)
          .join('\n') || '- No programme sessions are currently saved.';
      const activeSpeakersList = speakers
          .slice(0, 80)
          .map(s => `- ${formatLine(s.name)} (${formatLine(s.organization)}) | ${formatLine(s.position)} | Topic: ${formatLine(s.topic)} | Time: ${formatLine(s.speakingTime)}`)
          .join('\n') || '- No speakers are currently saved.';
      const sponsorList = sponsors
          .slice(0, 80)
          .map(s => `- ${formatLine(s.name)} | Category: ${formatLine(s.tier)} | ${formatLine(s.description)}`)
          .join('\n') || '- No sponsors are currently saved.';
      const activityList = adventures
          .slice(0, 40)
          .map(a => `- ${formatLine(a.title)}: ${formatLine(a.description)}`)
          .join('\n') || '- No activities are currently saved.';
      const galleryCategories = Array.from(new Set(gallery.map(g => formatLine(g.category, '')).filter(Boolean))).join(', ') || 'No gallery categories saved';
      const driveLinks = dayLinks
          .slice(0, 20)
          .map(d => `- ${formatLine(d.day)}: ${formatLine(d.driveLink)}`)
          .join('\n') || '- No day photo links are currently saved.';
      const election = electionDashboard.election;
      const electionStatus = election ? getEffectiveElectionStatus(election) : 'none';
      const electionSummary = election
          ? [
            `Title: ${election.title}`,
            `Status: ${electionStatus}`,
            `Starts: ${formatLine(election.startsAt, 'Not scheduled')}`,
            `Ends: ${formatLine(election.endsAt, 'Not scheduled')}`,
            `Board seats: ${election.boardSeats}`,
            `Candidates: ${electionDashboard.candidates.length}`,
            `Eligible voters: ${electionDashboard.voters.length}`,
            `Submitted voters: ${electionDashboard.voters.filter(voter => voter.hasVoted).length}`
          ].join(' | ')
          : 'No election is currently configured.';
      const liveQAQuestion = qaQuestions.find(question => question.status === 'live');
      const qaSummary = liveQAQuestion
          ? `Current live Q&A: ${formatLine(liveQAQuestion.questionTitle || liveQAQuestion.questionText)} (${liveQAQuestion.type})`
          : 'No Q&A question is currently live.';

      const systemInstruction = `You are an advanced MAZ Business Institute event assistant for STRATEGIC MARKETING & BUSINESS GROWTH INDABA.
The logged-in user is ${user.firstName} ${user.lastName}. 
You have read-only context from the web system. Use this context to answer questions about the programme, dress codes, speakers, sponsors, venue, activities, gallery, voting, Q&A, and photo links.

CURRENT EVENT CONTEXT:
- Event name: ${eventDressCode.eventName}
- Dates: ${eventDressCode.dates}
- Venue: ${eventDressCode.venue}
- Theme statement: Marketing For Competitive Growth: Innovation, Inclusive Markets & Sustainable Value
- Logged-in user role: ${user.role}

OFFICIAL WHAT TO WEAR GUIDE (same source as the system's What to Wear page):
${getDressCodeContext()}
- Public dress-code enquiries: ${eventDressCode.contact.name}, ${eventDressCode.contact.phone}, ${eventDressCode.contact.email}
- These are the official requirements, not optional suggestions. Use them for clothing, attire, dress code, AGM, dinner, and cruise questions.
- This current guide overrides generic clothing advice and contradictory answers earlier in the conversation. Do not substitute business-casual, semi-formal, cocktail, ties, or other invented dress codes.
- For a specific day, include its conference dress code and all special-event requirements for that day. Day numbers follow this guide; do not infer different dress codes from programme sessions.
- If a requested day or clothing detail is missing, say it is not specified in the system and refer to What to Wear or the public enquiries contact. Do not guess.

VENUE:
- Title: ${formatLine(venue?.title)}
- Overview: ${formatLine(venue?.overview)}
- Accommodation: ${formatLine(venue?.accommodation)}
- Conference: ${formatLine(venue?.conference)}
- Views: ${formatLine(venue?.views)}
- Amenities: ${Array.isArray(venue?.amenities) && venue.amenities.length > 0 ? venue.amenities.map((item: unknown) => formatLine(item)).join(', ') : 'Not provided'}

PROGRAMME SESSIONS:
${activeSessionsList}

SPEAKERS AND FACILITATORS:
${activeSpeakersList}

SPONSORS AND EXHIBITORS:
${sponsorList}

ACTIVITIES:
${activityList}

GALLERY:
- Categories currently saved: ${galleryCategories}
- Day/photo drive links:
${driveLinks}

VOTING:
${electionSummary}

LIVE Q&A:
${qaSummary}

PRIVACY AND SECURITY RULES:
- Never reveal attendee, member, voter, or admin personal data, including emails, phone numbers, QR tokens, auth tokens, passwords, private IDs, room numbers, check-in state, selected activities, or account status.
- Never list eligible voters, members, attendees, people who voted, people who have not voted, or individual voting history.
- Voting answers must stay at public summary level only: title, open/closed/scheduled status, dates, candidate count, eligible voter count, submitted voter count, and general guidance.
- Never reveal vote choices, ballot submissions, vote totals, winners, or result trends unless the system context explicitly provides a public results summary. This context does not provide public results.
- Never expose API keys, environment variables, server logs, stack traces, database table names, request IDs, raw JSON, or internal implementation details.
- If asked for private or restricted data, politely refuse and offer a safe alternative summary or direct the user to an administrator.
- If the user is not an admin, never explain how to access or operate admin pages, admin tabs, admin routes, admin controls, or management workflows. Tell them that only administrators can manage that area.
- If the user is an admin and asks how to manage something, you may give high-level admin navigation guidance, but do not reveal private data.
- If the user asks you to perform an admin action, explain that you cannot make changes. Only direct them to an admin page when the logged-in user role is admin.

BEHAVIOR:
- Be warm, concise, professional, and practical.
- If the user asks about system data, answer from the live context above. If the context does not include the answer, say you do not see it in the system yet.
- Do not invent schedules, dress codes, speaker names, sponsor names, links, votes, or admin actions.
- You are read-only. Do not claim to create, edit, delete, close, publish, vote, or submit admin actions.
- If the user asks how to do something in the system, give only role-appropriate guidance. For attendees and members, explain only attendee/member-facing actions. For admins, you may explain admin-facing page/actions.
- If the logged-in user is a member, remember members only access the voting page.
- If the user wants to give feedback, guide them through the feedback interview below.

FEEDBACK CAPTURE MODE:
Your secondary goal is to conduct an interactive chat interview to gather feedback through 5 structured questions:
1. "How would you rate the overall Strategic Marketing & Business Growth Indaba programme on a scale of 1 to 5?"
2. "Which conference session was the most valuable to you?"
3. "Which facilitator or speaker stood out the most during the event?"
4. "What improvements would you suggest for future MAZ events?"
5. "Would you attend another MAZ Business Institute event in the future?"

INSTRUCTIONS:
- Review the chat history 'messages' to count which questions have already been answered. 
- Ask only ONE feedback question at a time.
- If the user asks an event/system question in the middle of feedback, answer it briefly, then continue the next unanswered feedback question.
- Convert natural language ratings like excellent/great/poor into a reasonable 1-5 score only if the user clearly intends it as their rating.
- Guide them politely. If they answer a question, acknowledge it with useful event-specific context, and then ask the immediate next question.

CRITICAL INSTRUCTION FOR THE FINAL QUESTION (Question 5):
Once they provide their response to this 5th question (whether they would attend again), you must:
1. Warmly thank them for taking the time to share their thoughts regarding the Strategic Marketing & Business Growth Indaba.
2. Tell them: "I have successfully recorded your feedback. It has been securely saved to the database!"
3. End your reply with a JSON block containing the parsed data on a NEW LINE so the application can automatically capture it. This JSON must be wrapped exactly like this:
\`\`\`json
{
  "feedbackData": {
    "rating": <numeric score 1 to 5>,
    "bestSession": "<string extracted best session name>",
    "bestFacilitator": "<string extracted key facilitator name>",
    "improvements": "<string containing suggested improvements>",
    "attendAgain": <boolean true or false based on question 5 response>
  }
}
\`\`\`
Ensure the JSON block is completely valid and correctly placed.`;

      const conversation = [
        { role: 'system', content: systemInstruction }
      ];

      for (const msg of messages) {
        conversation.push({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        });
      }

      const configuredModel = process.env.GROQ_CHAT_MODEL?.trim();
      const modelOptions = [
        configuredModel,
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'groq/compound-mini'
      ].filter((model, index, models): model is string => Boolean(model) && models.indexOf(model) === index);

      let data: any = null;
      let lastGroqError = 'Groq API request failed';

      for (const model of modelOptions) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model,
            messages: conversation,
            temperature: 0.2,
            max_tokens: 500
          })
        });

        if (response.ok) {
          data = await response.json();
          break;
        }

        const errorData = await response.json().catch(() => ({}));
        lastGroqError = errorData.error?.message || `Groq API request failed for model ${model}`;
        console.error(`Groq API error for ${model}:`, errorData);
      }

      if (!data) {
        throw new Error(lastGroqError);
      }

      const replyText = data.choices?.[0]?.message?.content || 'Thank you for your response!';
      res.json({ reply: replyText });

    } catch (e: any) {
      console.error('Groq chatbot error:', e);
      res.status(500).json({ error: 'AI Feedback Assistant is temporarily offline. Please write your feedback directly.' });
    }
  });

  // --- ADMIN MODULE ENDPOINTS ---

  // Attendees: List all
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const query = parseAdminUserQuery(req);
      const result = await db.listAdminUsers(query);
      res.json({
        success: true,
        users: result.items.filter(user => user.role !== 'super_admin').map(buildUserPayload),
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore
      });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.get('/api/admin/users/export', requireAdmin, async (req, res) => {
    try {
      const query = parseAdminUserQuery(req);
      const users = await db.exportAdminUsers(query);
      res.json({ success: true, users: users.filter(user => user.role !== 'super_admin').map(buildUserPayload) });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error exporting users:', error);
      res.status(500).json({ error: 'Failed to export users' });
    }
  });

  app.get('/api/admin/users/attendee-qrcodes/download', requireAdmin, async (_req, res) => {
    try {
      const attendees = await db.exportAdminUsers({ role: 'attendee', status: 'all', sort: 'name_asc' }) as StoredUser[];
      const entries: Array<{ name: string; data: Buffer }> = [];

      for (const attendee of attendees) {
        let qrUser = attendee;
        if (!qrUser.qrToken) {
          qrUser = await db.saveUser({
            ...qrUser,
            qrToken: generateQrToken(),
            qrIssuedAt: new Date().toISOString()
          });
        }

        const qrResult = await saveAttendeeQrCode(qrUser);
        if (!qrResult.saved || !qrResult.filename) continue;
        const filePath = path.join(ATTENDEE_QR_DIR, qrResult.filename);
        entries.push({
          name: `attendee-qrcodes/${qrResult.filename}`,
          data: await fs.promises.readFile(filePath)
        });
      }

      if (entries.length === 0) {
        return res.status(404).json({ error: 'No attendee QR codes are available to download.' });
      }

      const zipBuffer = createZipArchive(entries);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="attendee-qrcodes.zip"');
      res.setHeader('Content-Length', String(zipBuffer.length));
      res.send(zipBuffer);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error downloading attendee QR codes:', error);
      res.status(500).json({ error: 'Failed to download attendee QR codes.' });
    }
  });

  app.get('/api/admin/attendance', requireAdmin, async (req, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required.' });
      }

      const session = findAttendanceSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found.' });
      }

      const records = await db.listAttendanceRecords(sessionId);
      res.json({ success: true, session, records });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading attendance records:', error);
      res.status(500).json({ error: 'Failed to load attendance records.' });
    }
  });

  app.get('/api/admin/attendance/sessions', requireAdmin, async (_req, res) => {
    res.json({ success: true, sessions: attendanceSessions });
  });

  app.post('/api/admin/attendance/scan', requireAdmin, async (req, res) => {
    try {
      const { sessionId, qrValue } = req.body;
      if (!sessionId || !qrValue) {
        return res.status(400).json({ error: 'Session ID and QR value are required.' });
      }

      const scanner = await getAuthUser(req);
      if (!scanner) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const session = findAttendanceSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found.' });
      }

      const qrToken = extractQrToken(String(qrValue));
      const attendee = await db.findUserByQrToken(qrToken);
      if (!attendee || attendee.role !== 'attendee') {
        const response: AttendanceScanResponse = {
          success: false,
          status: 'invalid',
          message: 'QR code not recognized for any active attendee.'
        };
        return res.status(404).json(response);
      }

      if (attendee.status !== 'active') {
        const response: AttendanceScanResponse = {
          success: false,
          status: 'invalid',
          message: `${attendee.firstName} ${attendee.lastName} is disabled and cannot be marked present.`,
          attendee: {
            id: attendee.id,
            firstName: attendee.firstName,
            lastName: attendee.lastName,
            email: attendee.email,
            organization: attendee.organization,
            position: attendee.position,
            class: attendee.class
          }
        };
        return res.status(400).json(response);
      }

      const existingRecord = await db.getAttendanceRecord(attendee.id, sessionId);
      if (existingRecord) {
        const response: AttendanceScanResponse = {
          success: true,
          status: 'duplicate',
          message: `${attendee.firstName} ${attendee.lastName} was already marked present for this session.`,
          record: existingRecord,
          attendee: existingRecord.attendee
        };
        return res.json(response);
      }

      const record = await db.saveAttendanceRecord({
        id: `att_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        attendeeId: attendee.id,
        sessionId,
        scannedBy: scanner.id,
        scannedAt: new Date().toISOString(),
        status: 'present'
      });

      const response: AttendanceScanResponse = {
        success: true,
        status: 'recorded',
        message: `${attendee.firstName} ${attendee.lastName} marked present.`,
        record,
        attendee: record.attendee
      };
      res.json(response);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Attendance scan failed:', error);
      res.status(500).json({ error: 'Failed to record attendance scan.' });
    }
  });

  app.get('/api/admin/qa/questions', requireAdmin, async (req, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
      const questions = await db.listQAQuestions(sessionId);
      res.json({ success: true, questions });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading Q&A questions:', error);
      res.status(500).json({ error: 'Failed to load Q&A questions.' });
    }
  });

  app.post('/api/admin/qa/questions', requireAdmin, async (req, res) => {
    try {
      const admin = await getAuthUser(req);
      if (!admin) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id, sessionId, questionTitle, questionText, type, options, order } = req.body;
      const sessions = await db.getSessions();
      const session = sessions.find((item: any) => item.id === sessionId);
      if (!session) {
        return res.status(400).json({ error: 'Select a valid programme session.' });
      }

      if (!questionText || String(questionText).trim().length < 3) {
        return res.status(400).json({ error: 'Question text is required.' });
      }

      const questionType = QA_QUESTION_TYPES.includes(type) ? type : 'short_answer';
      const normalizedOptions = normalizeQAOptions(questionType, options);
      if (questionType === 'multiple_choice' && normalizedOptions.length < 2) {
        return res.status(400).json({ error: 'Multiple choice questions need at least two options.' });
      }

      const existing = id ? await db.getQAQuestion(String(id)) : undefined;
      const now = new Date().toISOString();
      const nextOrder = existing?.order || (await db.listQAQuestions(sessionId)).length + 1;
      const requestedOrder = Number(order);
      const safeOrder = Number.isFinite(requestedOrder) && requestedOrder > 0 && requestedOrder < 1_000_000
          ? requestedOrder
          : nextOrder;

      const question = await db.saveQAQuestion({
        id: existing?.id || `qa_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        sessionId,
        questionTitle: String(questionTitle || '').trim().slice(0, 160),
        questionText: String(questionText).trim(),
        type: questionType,
        options: normalizedOptions,
        status: existing?.status || 'draft',
        order: safeOrder,
        createdBy: existing?.createdBy || admin.id,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        publishedAt: existing?.publishedAt,
        closedAt: existing?.closedAt
      });

      res.json({ success: true, question });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving Q&A question:', error);
      res.status(500).json({ error: 'Failed to save Q&A question.' });
    }
  });

  app.post('/api/admin/qa/questions/:id/publish', requireAdmin, async (req, res) => {
    try {
      const question = await db.updateQAQuestionStatus(req.params.id, 'live');
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      res.json({ success: true, question });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error publishing Q&A question:', error);
      res.status(500).json({ error: 'Failed to publish Q&A question.' });
    }
  });

  app.post('/api/admin/qa/questions/:id/close', requireAdmin, async (req, res) => {
    try {
      const question = await db.updateQAQuestionStatus(req.params.id, 'closed');
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      res.json({ success: true, question });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error closing Q&A question:', error);
      res.status(500).json({ error: 'Failed to close Q&A question.' });
    }
  });

  app.delete('/api/admin/qa/questions/:id', requireAdmin, async (req, res) => {
    try {
      const success = await db.deleteQAQuestion(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting Q&A question:', error);
      res.status(500).json({ error: 'Failed to delete Q&A question.' });
    }
  });

  app.get('/api/admin/qa/questions/:id/responses', requireAdmin, async (req, res) => {
    try {
      const question = await db.getQAQuestion(req.params.id);
      if (!question) {
        return res.status(404).json({ error: 'Question not found.' });
      }
      const responses = await db.listQAResponses(req.params.id);
      res.json({ success: true, question, responses });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading Q&A responses:', error);
      res.status(500).json({ error: 'Failed to load Q&A responses.' });
    }
  });

  app.get('/api/qa/live', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
      const question = await db.getLiveQAQuestion(sessionId);
      const response = question ? await db.getQAResponse(question.id, user.id) : null;
      res.json({ success: true, question: question || null, response: response || null });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading live Q&A:', error);
      res.status(500).json({ error: 'Failed to load live Q&A.' });
    }
  });

  app.post('/api/qa/responses', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (user.role !== 'attendee') {
        return res.status(403).json({ error: 'Only attendees can submit Q&A responses.' });
      }

      const { questionId, answer } = req.body;
      const question = await db.getQAQuestion(String(questionId || ''));
      if (!question || question.status !== 'live') {
        return res.status(400).json({ error: 'This question is not currently accepting responses.' });
      }

      const normalizedAnswer = normalizeQAAnswer(question, String(answer || ''));
      const answerError = validateQAAnswer(question, normalizedAnswer);
      if (answerError) {
        return res.status(400).json({ error: answerError });
      }

      const existing = await db.getQAResponse(question.id, user.id);
      if (existing) {
        return res.json({ success: true, response: existing, duplicate: true });
      }

      const response = await db.saveQAResponse({
        id: `qar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        questionId: question.id,
        sessionId: question.sessionId,
        attendeeId: user.id,
        answer: normalizedAnswer,
        submittedAt: new Date().toISOString()
      });

      res.json({ success: true, response, duplicate: false });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error submitting Q&A response:', error);
      res.status(500).json({ error: 'Failed to submit Q&A response.' });
    }
  });

  app.get('/api/admin/elections/current', requireAdmin, async (_req, res) => {
    try {
      const dashboard = await db.getElectionDashboard();
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading election dashboard:', error);
      res.status(500).json({ error: 'Failed to load voting dashboard.' });
    }
  });

  app.post('/api/admin/elections', requireAdmin, async (req, res) => {
    try {
      const admin = await getAuthUser(req);
      if (!admin) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const existing = req.body.id ? await db.getElection(String(req.body.id)) : undefined;
      const title = String(req.body.title || '').trim();
      if (title.length < 3) {
        return res.status(400).json({ error: 'Election title is required.' });
      }
      const boardSeats = 3;
      const startsAt = normalizeOptionalDate(req.body.startsAt);
      const endsAt = normalizeOptionalDate(req.body.endsAt);
      const timezone = String(req.body.timezone || existing?.timezone || 'Africa/Harare').trim() || 'Africa/Harare';
      const startDate = parseElectionScheduleDate(startsAt, timezone);
      const endDate = parseElectionScheduleDate(endsAt, timezone);
      if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
        return res.status(400).json({ error: 'Voting closes time must be after voting opens time.' });
      }
      const scheduleChanged = Boolean(existing) && (
        (existing?.startsAt || '') !== (startsAt || '')
        || (existing?.endsAt || '') !== (endsAt || '')
        || (existing?.timezone || 'Africa/Harare') !== timezone
      );
      const status = scheduleChanged
        ? getScheduleStatus(startsAt, endsAt, timezone)
        : existing?.status || normalizeElectionStatus(req.body.status);
      const now = new Date().toISOString();
      const election = await db.saveElection({
        id: existing?.id || `el_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        title,
        description: String(req.body.description || '').trim(),
        status,
        boardSeats,
        startsAt,
        endsAt,
        timezone,
        createdBy: existing?.createdBy || admin.id,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        openedAt: existing?.openedAt,
        closedAt: existing?.closedAt
      });

      const dashboard = await db.getElectionDashboard(election.id);
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving election:', error);
      res.status(500).json({ error: 'Failed to save election.' });
    }
  });

  app.post('/api/admin/elections/:id/status', requireAdmin, async (req, res) => {
    try {
      const status = normalizeElectionStatus(req.body.status);
      if (status === 'open' || status === 'scheduled') {
        const candidates = await db.listElectionCandidates(req.params.id);
        if (ELECTION_CATEGORIES.some(category => !candidates.some(candidate => candidate.category === category))) {
          return res.status(400).json({ error: 'Add at least one candidate for each of the three representative positions before opening voting.' });
        }
      }
      const election = await db.updateElectionStatus(req.params.id, status);
      if (!election) {
        return res.status(404).json({ error: 'Election not found.' });
      }
      const dashboard = await db.getElectionDashboard(election.id);
      res.json({ success: true, ...dashboard });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error updating election status:', error);
      res.status(500).json({ error: 'Failed to update election status.' });
    }
  });

  app.post('/api/admin/elections/:id/candidates', requireAdmin, async (req, res) => {
    try {
      const election = await db.getElection(req.params.id);
      if (!election) {
        return res.status(404).json({ error: 'Election not found.' });
      }

      const fullName = String(req.body.fullName || '').trim();
      if (fullName.length < 2) {
        return res.status(400).json({ error: 'Candidate full name is required.' });
      }
      if (!ELECTION_CATEGORIES.includes(req.body.category)) {
        return res.status(400).json({ error: 'Select a valid representative position.' });
      }

      const existingCandidates = await db.listElectionCandidates(election.id);
      const existing = req.body.id ? existingCandidates.find((candidate: any) => candidate.id === String(req.body.id)) : undefined;
      const now = new Date().toISOString();
      const candidate = await db.saveElectionCandidate({
        id: existing?.id || `cand_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        electionId: election.id,
        category: normalizeElectionCategory(req.body.category),
        fullName,
        organization: String(req.body.organization || '').trim(),
        position: String(req.body.position || '').trim(),
        bio: String(req.body.bio || '').trim(),
        photoUrl: String(req.body.photoUrl || '').trim(),
        displayOrder: Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : existingCandidates.length + 1,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
      res.json({ success: true, candidate });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving election candidate:', error);
      res.status(500).json({ error: 'Failed to save candidate.' });
    }
  });

  app.delete('/api/admin/elections/:electionId/candidates/:candidateId', requireAdmin, async (req, res) => {
    try {
      const success = await db.deleteElectionCandidate(req.params.candidateId);
      if (!success) {
        return res.status(404).json({ error: 'Candidate not found.' });
      }
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting election candidate:', error);
      res.status(500).json({ error: 'Failed to delete candidate.' });
    }
  });

  app.post('/api/admin/elections/:id/members', requireAdmin, async (req, res) => {
    try {
      const election = await db.getElection(req.params.id);
      if (!election) return res.status(404).json({ error: 'Election not found.' });
      if (!ELECTION_CATEGORIES.includes(req.body.eligibleCategory)) {
        return res.status(400).json({ error: 'Select the member’s eligible voting position.' });
      }

      const email = String(req.body.email || '').trim().toLowerCase();
      const identifier = String(req.body.identifier || '').trim();
      if (!identifier) return res.status(400).json({ error: 'Enter the member’s voter identifier.' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address or leave it blank.' });
      }
      const existingVoters = await db.listElectionVoters(election.id);
      if (existingVoters.some(voter => voter.identifier?.trim().toLowerCase() === identifier.toLowerCase())) {
        return res.status(409).json({ error: 'This voter identifier is already used in this election.' });
      }

      let user = email ? await db.findUserByEmail(email) : undefined;
      const reused = Boolean(user);
      if (user) {
        if (user.role !== 'attendee' && user.role !== 'member') {
          return res.status(400).json({ error: 'This email belongs to an administrator. Select an attendee or member profile.' });
        }
        if (user.status !== 'active') {
          return res.status(400).json({ error: 'This profile is disabled. Activate it before adding it to the election.' });
        }
        if (existingVoters.some(voter => voter.userId === user!.id)) {
          return res.status(409).json({ error: 'This member is already on the election voter list.' });
        }
      } else {
        const firstName = String(req.body.firstName || '').trim();
        const lastName = String(req.body.lastName || '').trim();
        if (!firstName || !lastName) {
          return res.status(400).json({ error: 'First name and last name are required for a new member.' });
        }
        user = await db.saveUser({
          id: `usr_member_${crypto.randomUUID()}`,
          firstName, lastName, email: email || undefined,
          organization: String(req.body.organization || '').trim(),
          role: 'member', status: 'active', position: '', class: 'A',
          accommodationProvided: false, roomNumber: '', transportProvided: false,
          checkedIn: false, checkedInAt: '', hasSetPassword: false, password: '', selectedActivity: ''
        });
      }

      await db.saveElectionVoter({
        id: `ev_${crypto.randomUUID()}`, electionId: election.id, userId: user.id,
        identifier, eligibleCategory: req.body.eligibleCategory,
        addedAt: new Date().toISOString()
      });
      res.json({ success: true, user: buildUserPayload(user), reused });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error adding election member:', error);
      res.status(500).json({ error: 'Could not add the member to the election. Please try again.' });
    }
  });

  app.post('/api/admin/elections/:id/voters', requireAdmin, async (req, res) => {
    try {
      const election = await db.getElection(req.params.id);
      if (!election) {
        return res.status(404).json({ error: 'Election not found.' });
      }
      const requestedVoters = Array.isArray(req.body.voters) ? req.body.voters : [];
      const users = await db.exportAdminUsers({ status: 'active' });
      const validVoters = requestedVoters.filter((item: any) =>
        typeof item.identifier === 'string' && item.identifier.trim() && typeof item.memberCategory === 'string' && item.memberCategory.trim() && ELECTION_CATEGORIES.includes(item.eligibleCategory) && users.some((user: any) => user.id === String(item.userId) && (user.role === 'attendee' || user.role === 'member')));
      if (validVoters.length !== requestedVoters.length || validVoters.length === 0) {
        return res.status(400).json({ error: 'Select at least one attendee voter.' });
      }
      const currentVoters = await db.listElectionVoters(election.id);
      const identifiers = validVoters.map((item: any) => item.identifier.trim().toLowerCase());
      if (new Set(identifiers).size !== identifiers.length || validVoters.some((item: any) => currentVoters.some(voter => voter.userId !== String(item.userId) && voter.identifier?.trim().toLowerCase() === item.identifier.trim().toLowerCase()))) {
        return res.status(409).json({ error: 'Each identifier must belong to only one voter in this election.' });
      }

      const voters = [];
      for (const item of validVoters) {
        voters.push(await db.saveElectionVoter({
          id: `ev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          electionId: election.id,
          userId: String(item.userId),
          identifier: item.identifier.trim(),
          memberCategory: item.memberCategory.trim(),
          eligibleCategory: item.eligibleCategory,
          addedAt: new Date().toISOString()
        }));
      }
      res.json({ success: true, voters });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving election voters:', error);
      res.status(500).json({ error: 'Failed to save eligible voters.' });
    }
  });

  app.delete('/api/admin/elections/:electionId/voters/:userId', requireAdmin, async (req, res) => {
    try {
      const success = await db.deleteElectionVoter(req.params.electionId, req.params.userId);
      if (!success) {
        return res.status(404).json({ error: 'Voter not found.' });
      }
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting election voter:', error);
      res.status(500).json({ error: 'Failed to remove eligible voter.' });
    }
  });

  app.get('/api/elections/ballot', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const ballot = await db.getElectionBallot(user.id);
      ballot.candidates = ballot.candidates.filter(candidate => candidate.category === ballot.voter?.eligibleCategory);
      res.json({ success: true, ...ballot });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error loading election ballot:', error);
      res.status(500).json({ error: 'Failed to load voting ballot.' });
    }
  });

  app.post('/api/elections/:id/vote', requireAuth, async (req, res) => {
    try {
      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (user.role !== 'attendee' && user.role !== 'member') {
        return res.status(403).json({ error: 'Only eligible members can vote.' });
      }

      const election = await db.getElection(req.params.id);
      if (!election || getEffectiveElectionStatus(election) !== 'open') {
        return res.status(400).json({ error: 'Voting is not currently open.' });
      }

      const voter = await db.getElectionVoter(election.id, user.id);
      if (!voter) {
        return res.status(403).json({ error: 'You are not on the eligible voter list for this election.' });
      }
      if (!voter.eligibleCategory || !ELECTION_CATEGORIES.includes(voter.eligibleCategory)) {
        return res.status(403).json({ error: 'Your voting position has not been assigned. Contact the election administrator.' });
      }
      const existingVotes = await db.listElectionVotes(election.id, user.id);
      if (existingVotes.length > 0) {
        return res.json({ success: true, votes: existingVotes, duplicate: true });
      }

      const candidateId = String(req.body.candidateId || '');
      if (!candidateId) return res.status(400).json({ error: 'Select one candidate.' });

      const candidates = await db.listElectionCandidates(election.id);
      const candidateMap = new Map<string, ElectionCandidate>(candidates.map((candidate: ElectionCandidate) => [candidate.id, candidate]));
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        return res.status(400).json({ error: 'One or more selected candidates are invalid.' });
      }
      if (candidate.category !== voter.eligibleCategory) {
        return res.status(403).json({ error: 'You can only vote for your assigned representative position.' });
      }

      const submittedAt = new Date().toISOString();
      const votes = [{
          id: `vote_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          electionId: election.id,
          voterId: user.id,
          candidateId,
          category: candidate.category,
          submittedAt
        }];

      const savedVotes = await db.saveElectionVotes(election.id, user.id, votes);
      res.json({ success: true, votes: savedVotes, duplicate: false });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error submitting election vote:', error);
      res.status(500).json({ error: 'Failed to submit vote.' });
    }
  });

  // Attendees: Create / Save
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const {
        id, firstName, lastName, role, organization, position, status,
        accommodationProvided, roomNumber, transportProvided,
        class: userClass
      } = req.body;
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!firstName || !lastName) {
        return res.status(400).json({ error: 'First Name and Last Name are required.' });
      }

      let existingUserById = id ? await db.getUserById(id) : undefined;
      if (role === 'admin' || role === 'super_admin' || existingUserById?.role === 'admin' || existingUserById?.role === 'super_admin') {
        return res.status(403).json({ error: 'Only a super admin can manage administrator accounts.', errorCode: 'SUPER_ADMIN_REQUIRED' });
      }

      if (email && email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return res.status(400).json({ error: 'Invalid email format.' });
        }

        const existingUser = await db.findUserByEmail(email);
        if (existingUser && existingUser.id !== id) {
          if ((!role || role === 'attendee') && existingUser.role === 'member' && !existingUserById) {
            if (existingUser.status !== 'active') {
              return res.status(400).json({ error: 'This profile is disabled. Activate it before adding attendee access.' });
            }
            existingUserById = existingUser;
          } else {
            return res.status(409).json({ error: `This email belongs to ${existingUser.firstName} ${existingUser.lastName} (${existingUser.role}, ${existingUser.status}). Search this email under Attendees with All roles and All statuses, then edit the existing profile or reset its password.` });
          }
        }
      }

      const userId = existingUserById?.id || id || `usr_${Date.now()}`;
      const normalizedRole = role || 'attendee';
      const shouldHaveQrToken = normalizedRole === 'attendee';
      const qrIssuedAt = existingUserById?.qrIssuedAt || (shouldHaveQrToken ? new Date().toISOString() : '');
      const qrToken = existingUserById?.qrToken || (shouldHaveQrToken ? generateQrToken() : '');

      const savedUser = await db.saveUser({
        id: userId,
        email: email?.trim() || undefined,
        firstName,
        lastName,
        role: normalizedRole,
        organization: organization || '',
        position: position || '',
        status: status || 'active',
        accommodationProvided: accommodationProvided || false,
        roomNumber: roomNumber || '',
        transportProvided: transportProvided || false,
        checkedIn: existingUserById?.checkedIn || false,
        checkedInAt: existingUserById?.checkedInAt || '',
        hasSetPassword: existingUserById?.hasSetPassword || false,
        password: existingUserById?.password || '',
        selectedActivity: existingUserById?.selectedActivity || '',
        class: userClass || 'A',
        qrToken,
        qrIssuedAt,
        qrEmailSentAt: existingUserById?.qrEmailSentAt || ''
      });

      const qrCode = await saveAttendeeQrCode(savedUser);
      res.json({ success: true, user: buildUserPayload(savedUser), qrCode });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving user:', error);
      res.status(500).json({ error: 'Failed to save user' });
    }
  });

  app.post('/api/admin/users/:id/reopen-checkin', requireAdmin, async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Account not found.' });
      if (user.role === 'admin' || user.role === 'super_admin') return res.status(403).json({ error: 'Administrator accounts cannot be reopened for attendee check-in.' });
      if (user.status !== 'active') return res.status(400).json({ error: 'Activate this account before reopening check-in.' });
      const updated = await db.saveUser({
        ...user, role: 'attendee', checkedIn: false, checkedInAt: '', hasSetPassword: false, password: '',
        qrToken: user.qrToken || generateQrToken(),
        qrIssuedAt: user.qrIssuedAt || new Date().toISOString()
      });
      const emailPrefix = `${user.email?.trim().toLowerCase()}::`;
      for (const key of failedLoginAttempts.keys()) {
        if (key.startsWith(emailPrefix)) failedLoginAttempts.delete(key);
      }
      res.json({ success: true, user: buildUserPayload(updated), message: 'Check-in reopened. The attendee can select their name and create a new password using the same email.' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Could not reopen check-in:', error);
      res.status(500).json({ error: 'Could not reopen check-in.' });
    }
  });

  app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
    try {
      const user = await db.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Account not found.' });
      if (user.role === 'admin' || user.role === 'super_admin') return res.status(403).json({ error: 'Only a super admin can manage administrator passwords.' });
      if (user.role === 'member') return res.status(403).json({ error: 'Voting members sign in with their voter identifier and have no password to reset.' });
      if (user.status !== 'active') return res.status(400).json({ error: 'Activate this account before resetting its password.' });
      const password = req.body.password;
      if (typeof password !== 'string' || !isValidRegistrationPassword(password) || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ error: 'Use 8 or more characters, including an uppercase letter and a number (maximum 72 bytes).' });
      }
      await db.updateUserCheckin(user.id, { password: await bcrypt.hash(password, 10), hasSetPassword: true });
      const emailPrefix = `${user.email?.trim().toLowerCase()}::`;
      for (const key of failedLoginAttempts.keys()) {
        if (key.startsWith(emailPrefix)) failedLoginAttempts.delete(key);
      }
      res.json({ success: true, message: 'Password reset. The account can now sign in with the new password.' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Password reset failed:', error);
      res.status(500).json({ error: 'Could not reset the password.' });
    }
  });

  // Attendees: Status Toggle
  app.put('/api/admin/users/:id/statusToggle', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userToToggle = await db.getUserById(id);

      if (!userToToggle) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }
      if (userToToggle.role === 'admin' || userToToggle.role === 'super_admin') return res.status(403).json({ error: 'Only a super admin can change administrator status.', errorCode: 'SUPER_ADMIN_REQUIRED' });

      const requestor = await getAuthUser(req);
      if (!requestor) return res.status(401).json({ error: 'Unauthorized' });

      if (requestor.id === id) {
        return res.status(400).json({ error: 'You cannot disable your own admin account.' });
      }

      userToToggle.status = userToToggle.status === 'active' ? 'disabled' : 'active';
      const saved = await db.saveUser(userToToggle);

      res.json({ success: true, user: buildUserPayload(saved) });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error toggling user status:', error);
      res.status(500).json({ error: 'Failed to toggle user status' });
    }
  });

  app.delete('/api/admin/users/members/bulk-delete', requireAdmin, async (req, res) => {
    try {
      const requestor = await getAuthUser(req);
      if (!requestor) return res.status(401).json({ error: 'Unauthorized' });

      const requestedIds: string[] = Array.isArray(req.body?.ids)
          ? Array.from(new Set(req.body.ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)))
          : [];

      if (requestedIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one member to delete.' });
      }

      const members = await db.exportAdminUsers({ role: 'member', status: 'all' }) as StoredUser[];
      const memberIds = new Set<string>(members.map((member) => member.id));
      const idsToDelete = requestedIds.filter((id) => memberIds.has(id));

      const protectedIds = new Set([requestor.id]);
      const safeIdsToDelete = idsToDelete.filter((id) => !protectedIds.has(id));
      if (safeIdsToDelete.length === 0) {
        return res.status(404).json({ error: 'No matching voting members were found to delete.' });
      }

      let deleted = 0;
      for (const id of safeIdsToDelete) {
        if (await db.deleteUser(id)) {
          deleted++;
        }
      }

      res.json({ success: true, deleted });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error bulk deleting members:', error);
      res.status(500).json({ error: 'Failed to delete voting members.' });
    }
  });

  // Attendees: Delete
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const requestor = await getAuthUser(req);
      if (!requestor) return res.status(401).json({ error: 'Unauthorized' });

      if (requestor.id === id) {
        return res.status(400).json({ error: 'You cannot delete your own admin account.' });
      }

      const target = await db.getUserById(id);
      if (target?.role === 'admin' || target?.role === 'super_admin') return res.status(403).json({ error: 'Only a super admin can delete administrator accounts.', errorCode: 'SUPER_ADMIN_REQUIRED' });

      const success = await db.deleteUser(id);
      if (!success) {
        return res.status(404).json({ error: 'Attendee not found.' });
      }
      res.json({ success: true, message: 'Attendee removed successfully.' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  // Speakers: Add/Edit
  app.post('/api/admin/speakers', requireAdmin, async (req, res) => {
    try {
      const speaker = req.body;
      if (!speaker.name || !speaker.position) {
        return res.status(400).json({ error: 'Speaker name and position are required.' });
      }
      if (!speaker.id) {
        speaker.id = `spk_${Date.now()}`;
      }
      const saved = await db.saveSpeaker(speaker);
      res.json({ success: true, speaker: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving speaker:', error);
      res.status(500).json({ error: 'Failed to save speaker' });
    }
  });

  // Speakers: Delete
  app.delete('/api/admin/speakers/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteSpeaker(id);
      if (!success) return res.status(404).json({ error: 'Speaker not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting speaker:', error);
      res.status(500).json({ error: 'Failed to delete speaker' });
    }
  });

  // Programme: Save session
  app.post('/api/admin/sessions', requireAdmin, async (req, res) => {
    try {
      const session = req.body;
      if (!session.topic || !session.time) {
        return res.status(400).json({ error: 'Session topic and time are required.' });
      }
      if (!session.id) {
        session.id = `${session.category === 'Class A' ? 'sa' : 'sb'}_${Date.now()}`;
      }
      const saved = await db.saveSession(session);
      res.json({ success: true, session: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving session:', error);
      res.status(500).json({ error: 'Failed to save session' });
    }
  });

  // Programme: Delete session
  app.delete('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteSession(id);
      if (!success) return res.status(404).json({ error: 'Session not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting session:', error);
      res.status(500).json({ error: 'Failed to delete session' });
    }
  });

  // Sponsors: Save
  app.post('/api/admin/sponsors', requireAdmin, async (req, res) => {
    try {
      const sponsor = req.body;
      if (!sponsor.name || !sponsor.logoUrl) {
        return res.status(400).json({ error: 'Sponsor name and icon emblem are required.' });
      }
      if (!sponsor.id) {
        sponsor.id = `spon_${Date.now()}`;
      }
      const saved = await db.saveSponsor(sponsor);
      res.json({ success: true, sponsor: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving sponsor:', error);
      res.status(500).json({ error: 'Failed to save sponsor' });
    }
  });

  // Sponsors: Delete
  app.delete('/api/admin/sponsors/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteSponsor(id);
      if (!success) return res.status(404).json({ error: 'Sponsor not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting sponsor:', error);
      res.status(500).json({ error: 'Failed to delete sponsor' });
    }
  });

  // Testimonials: Save
  app.post('/api/admin/testimonials', requireAdmin, async (req, res) => {
    try {
      const t = req.body;
      if (!t.name || !t.text) {
        return res.status(400).json({ error: 'Name and testimonial text are required.' });
      }
      if (!t.id) {
        t.id = `t_${Date.now()}`;
      }
      if (!t.accentChar && t.name) {
        t.accentChar = t.name.charAt(0);
      }
      const saved = await db.saveTestimonial(t);
      res.json({ success: true, testimonial: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving testimonial:', error);
      res.status(500).json({ error: 'Failed to save testimonial' });
    }
  });

  // Testimonials: Delete
  app.delete('/api/admin/testimonials/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteTestimonial(id);
      if (!success) return res.status(404).json({ error: 'Testimonial not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting testimonial:', error);
      res.status(500).json({ error: 'Failed to delete testimonial' });
    }
  });

  // Gallery: Add Image
  app.post('/api/admin/gallery', requireAdmin, async (req, res) => {
    try {
      const img = req.body;
      if (!img.url || !img.caption) {
        return res.status(400).json({ error: 'Image URL and descriptive caption are required.' });
      }
      if (!img.id) {
        img.id = `g_${Date.now()}`;
      }
      const saved = await db.saveGalleryImage(img);
      res.json({ success: true, image: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving gallery image:', error);
      res.status(500).json({ error: 'Failed to save gallery image' });
    }
  });

  // Gallery: Delete
  app.delete('/api/admin/gallery/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteGalleryImage(id);
      if (!success) return res.status(404).json({ error: 'Gallery item not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting gallery image:', error);
      res.status(500).json({ error: 'Failed to delete gallery image' });
    }
  });

  // Venue: Edit
  app.post('/api/admin/venue', requireAdmin, async (req, res) => {
    try {
      const venue = req.body;
      const saved = await db.saveVenue(venue);
      res.json({ success: true, venue: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving venue:', error);
      res.status(500).json({ error: 'Failed to save venue' });
    }
  });

  // Adventures: Save
  app.post('/api/admin/adventures', requireAdmin, async (req, res) => {
    try {
      const adventure = req.body;
      if (!adventure.title || !adventure.description) {
        return res.status(400).json({ error: 'Title and description are required.' });
      }
      if (!adventure.id) {
        adventure.id = `adv_${Date.now()}`;
      }
      const saved = await db.saveAdventure(adventure);
      res.json({ success: true, adventure: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving adventure:', error);
      res.status(500).json({ error: 'Failed to save adventure' });
    }
  });

  // Adventures: Delete
  app.delete('/api/admin/adventures/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteAdventure(id);
      if (!success) return res.status(404).json({ error: 'Adventure not found.' });
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting adventure:', error);
      res.status(500).json({ error: 'Failed to delete adventure' });
    }
  });

  // Google Drive photo link save
  app.post('/api/admin/google-drive-link', requireAdmin, async (req, res) => {
    try {
      const { googleDriveLink } = req.body;
      if (!googleDriveLink) {
        return res.status(400).json({ error: 'Photos Folder Link cannot be empty.' });
      }
      const savedLink = await db.saveGoogleDriveLink(googleDriveLink);
      res.json({ success: true, link: savedLink });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving Google Drive link:', error);
      res.status(500).json({ error: 'Failed to save Google Drive link' });
    }
  });

  // ============ DAY LINKS ENDPOINTS ============

  app.get('/api/gallery/days', requireAuth, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const albums = getEventPhotoAlbums(await db.getDayLinks());
      res.json(albums.map(({ id, day, driveLink }) => ({ id, day, driveLink })));
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching event photo albums:', error);
      res.status(500).json({ error: 'Could not load event photo albums.' });
    }
  });

  // Get all day links
  app.get('/api/admin/days', requireAdmin, async (req, res) => {
    try {
      const dayLinks = await db.getDayLinks();
      res.json(dayLinks);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching day links:', error);
      res.status(500).json({ error: 'Failed to fetch day links' });
    }
  });

  // Create or update a day link
  app.post('/api/admin/days', requireAdmin, async (req, res) => {
    try {
      const { id, day, driveLink, order } = req.body;

      if (typeof day !== 'string' || !day.trim() || typeof driveLink !== 'string' || !driveLink.trim()) {
        return res.status(400).json({ error: 'Day name and drive link are required.' });
      }

      if (!isGoogleDriveFolderUrl(driveLink.trim())) {
        return res.status(400).json({ error: 'Enter a valid HTTPS Google Drive folder link.' });
      }

      const dayLinkData: DayLink = {
        id: id || `dl_${Date.now()}`,
        day: day.trim(),
        driveLink: driveLink.trim(),
        order: order || 0
      };

      const saved = await db.saveDayLink(dayLinkData);
      res.json({ success: true, day: saved });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error saving day link:', error);
      res.status(500).json({ error: 'Failed to save day link' });
    }
  });

  // Delete a day link
  app.delete('/api/admin/days/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteDayLink(id);
      if (!success) {
        return res.status(404).json({ error: 'Day link not found.' });
      }
      res.json({ success: true, message: 'Day link deleted successfully.' });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting day link:', error);
      res.status(500).json({ error: 'Failed to delete day link' });
    }
  });

  // ============ END DAY LINKS ENDPOINTS ============

  // ============ STUDY MATERIALS ENDPOINTS ============

  // Get all study materials
  app.get('/api/study-materials', requireAuth, async (req, res) => {
    try {
      const materials = await db.getStudyMaterials();
      res.json({ materials });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching study materials:', error);
      res.status(500).json({ error: 'Failed to fetch study materials' });
    }
  });

  // Upload a study material (admin only) - SUPPORTS ALL DOCUMENT TYPES
  app.post('/api/study-materials/upload', requireAdmin, async (req, res) => {
    try {
      // Configure multer for study materials with document filter
      const uploadStudyMaterial = multer({
        storage: createStorage('study-materials'),
        fileFilter: documentFilter,
        limits: { fileSize: STUDY_MATERIAL_MAX_SIZE_BYTES }
      }).single('file');

      // Wrap multer in a promise
      const multerPromise = new Promise((resolve, reject) => {
        uploadStudyMaterial(req, res, (err: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(req.file);
          }
        });
      });

      const file = await multerPromise as Express.Multer.File;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Get title from body, fallback to filename without extension
      const { title, description } = req.body;
      const fileNameWithoutExt = file.originalname.replace(/\.[^/.]+$/, '');
      const finalTitle = title?.trim() || '';

      const user = await getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const fileUrl = `/uploads/study-materials/${file.filename}`;

      const material: StudyMaterial = {
        id: `sm_${Date.now()}`,
        title: finalTitle,
        description: description?.trim() || null,
        fileName: file.originalname,
        fileUrl: fileUrl,
        fileSize: file.size,
        uploadedBy: user.id,
        downloads: 0,
        isActive: true,
        uploadDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const saved = await db.saveStudyMaterial(material);
      res.json({ success: true, material: saved });

    } catch (error: any) {
      console.error('Error uploading study material:', error);
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${STUDY_MATERIAL_MAX_SIZE_MB} MB.` });
      }
      if (error.message && error.message.includes('Invalid file type')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to upload study material' });
    }
  });

  // Delete a study material (admin only)
  app.delete('/api/study-materials/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.deleteStudyMaterial(id);
      if (!success) {
        return res.status(404).json({ error: 'Study material not found.' });
      }
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error deleting study material:', error);
      res.status(500).json({ error: 'Failed to delete study material' });
    }
  });

  // Track download (authenticated users)
  app.post('/api/study-materials/:id/track-download', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.incrementStudyMaterialDownloads(id);
      if (!success) {
        return res.status(404).json({ error: 'Study material not found.' });
      }
      res.json({ success: true });
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error tracking download:', error);
      res.status(500).json({ error: 'Failed to track download' });
    }
  });

  // ============ END STUDY MATERIALS ENDPOINTS ============

  // Get dynamic Feedback submissions reports
  app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
    try {
      const feedback = await db.getFeedback();
      res.json(feedback);
    } catch (error) {
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.', errorCode: 'API_NOT_FOUND' }));

  // --- VITE WEB APP SERVING ---

  if (serveFrontend && process.env.DISABLE_HMR === 'true') {
    console.log('Control mode: standard server files loading...');
  }

  if (serveFrontend && process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (serveFrontend) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

export async function startServer(options: CreateAppOptions = {}): Promise<Server> {
  const app = await createApp(options);
  const port = Number.parseInt(process.env.PORT || '3000', 10);

  return await new Promise<Server>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`MAZ Kariba Winterschool 2026 server listening on host 0.0.0.0 and port ${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
  });
}
