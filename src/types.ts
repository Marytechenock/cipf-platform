/**
 * Shared Type Definitions for MAZ Kariba Winter School 2026 EMS
 */

export type UserRole = 'super_admin' | 'admin' | 'attendee' | 'member';
export type UserClass = 'A' | 'B';
export type AdminUserSort = 'created_desc' | 'name_asc';

export interface AccessPeriod {
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface LoginAttempt {
  count: number;
  firstFailedAt: string;
  lockedUntil: string | null;
}

export interface User {
  id: string;
  email?: string; // Made optional - can be added during check-in
  firstName: string;
  lastName: string;
  role: UserRole;
  organization?: string;
  position?: string;
  status: 'active' | 'disabled';
  class?: UserClass; // NEW: Class A or B

  accommodationProvided: boolean;      // Is accommodation provided by MAZ?
  roomNumber: string;                  // Room number if accommodation provided
  transportProvided: boolean;          // Is transport provided by MAZ?
  selectedActivity: string;            // Selected activity (sunset_cruise, game_drive, quad_biking)
  checkedIn: boolean;                  // Whether attendee has checked in
  checkedInAt: string;                 // Timestamp of check-in
}

export interface StoredUser extends User {
  hasSetPassword: boolean;             // Whether password has been set
  password: string;                    // Hashed password (for checked-in users)
  qrToken?: string;                    // Secure attendee identity token for QR attendance scanning
  qrIssuedAt?: string;                 // Timestamp when the attendee QR identity was issued
  qrEmailSentAt?: string;              // Timestamp when the QR email was last sent
}

export interface CheckInAttendee extends User {
  hasSetPassword: boolean;
}

export interface AuthResponseUser extends User {
}

export interface ApiAuditEntry {
  id: string;
  time: string;
  actorId?: string;
  actorName: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  errorCode?: string;
  errorCause?: string;
}

export type ApiMetricsRange = '30m' | '1h' | '3h' | '6h' | '12h' | '24h' | '3d' | '5d' | '7d';

export interface ApiMetricsQuery {
  range: ApiMetricsRange;
  from: string;
  to: string;
  bucketMs: number;
  method: string;
  path: string;
  statusCode: number | null;
}

export interface ApiMetrics {
  range: ApiMetricsRange;
  from: string;
  to: string;
  bucketMs: number;
  totalRequests: number;
  errorRequests: number;
  averageDurationMs: number;
  statusCounts: Array<{ statusCode: number; count: number }>;
  buckets: Array<{ start: string; counts: Record<string, number> }>;
  topEndpoints: Array<{ path: string; count: number }>;
  endpointOptions: string[];
  statusCodeOptions: number[];
}

export interface LoginResponse {
  message: string;
  user: AuthResponseUser;
}

export interface MeResponse {
  user: AuthResponseUser;
}

export interface OptionalSessionResponse {
  user: AuthResponseUser | null;
}

export interface Session {
  id: string;
  category: 'Class A' | 'Class B';
  day: number; // 1, 2, 3, 4
  dayLabel: string; // e.g. "Day 1 - Wednesday 24 June"
  time: string; // e.g. "14:00 - 16:00"
  topic: string;
  facilitator: string;
  venue: string;
  duration?: string;
  notesLabel?: string;
  type?: 'session' | 'social' | 'break';
}

export interface SessionNote {
  id: string;
  userId: string;
  sessionId: string;
  content: string;
  updatedAt: string;
}

export interface Speaker {
  id: string;
  name: string;
  position: string;
  organization: string;
  topic: string;
  speakingTime: string;
  bio: string;
  photoUrl: string; // fallback icon or avatar can be used
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  description: string;
  website: string;
  durationLabel: string; // e.g., "2021 - Present"
  tier: 'Dinner' | 'Giveaways' | 'Session' | 'Exhibitor' | 'Technology Partner' | 'Gold' | 'Silver';
}

export interface Testimonial {
  id: string;
  name: string;
  company: string;
  position: string;
  text: string;
  photoUrl: string;
  accentChar?: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  caption: string;
  description?: string;
  category: '2024' | '2025' | '2026' | '17th Annual Marketers Convention 2025 Bulawayo' | '18th Annual Marketers Convention 2026 Victoria Falls';
}

// ============ DAY LINKS - NEW ============

export interface DayLink {
  id: string;
  day: string;           // e.g., "Day 1", "Day 2", "Day 5"
  driveLink: string;     // Google Drive folder URL
  order?: number;        // Optional: for custom sorting
  createdAt?: string;
  updatedAt?: string;
}

// ============ END DAY LINKS ============

export interface VenueInfo {
  id: string;
  title: string;
  overview: string;
  accommodation: string;
  conference: string;
  views: string;
  amenities: string[];
  imageUrl: string;
}
// In types.ts
export interface StudyMaterial {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadedBy?: string;
  downloads: number;
  isActive: boolean;
  uploadDate: string;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceScanStatus = 'recorded' | 'duplicate' | 'invalid' | 'error';

export interface AttendanceRecord {
  id: string;
  attendeeId: string;
  sessionId: string;
  scannedBy: string;
  scannedAt: string;
  status: 'present';
  attendee?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'organization' | 'position' | 'class'>;
  session?: Pick<Session, 'id' | 'day' | 'dayLabel' | 'time' | 'topic' | 'category' | 'venue'>;
  scannedByUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
}

export interface AttendanceScanResponse {
  success: boolean;
  status: AttendanceScanStatus;
  message: string;
  record?: AttendanceRecord;
  attendee?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'organization' | 'position' | 'class'>;
}

export type QAQuestionType = 'short_answer' | 'multiple_choice' | 'yes_no' | 'rating';
export type QAQuestionStatus = 'draft' | 'live' | 'closed';

export interface QAQuestion {
  id: string;
  sessionId: string;
  questionTitle?: string;
  questionText: string;
  type: QAQuestionType;
  options: string[];
  status: QAQuestionStatus;
  order: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  closedAt?: string;
  responseCount?: number;
  session?: Pick<Session, 'id' | 'day' | 'dayLabel' | 'time' | 'topic' | 'category' | 'venue'>;
}

export interface QAResponse {
  id: string;
  questionId: string;
  sessionId: string;
  attendeeId: string;
  answer: string;
  submittedAt: string;
  attendee?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'organization' | 'position' | 'class'>;
}

export interface AttendeeLiveQA {
  question: QAQuestion | null;
  response: QAResponse | null;
}

export type ElectionStatus = 'draft' | 'scheduled' | 'open' | 'closed';
export type ElectionCandidateCategory = 'employee_representative' | 'employer_cifoz' | 'employer_zbca' | 'chairperson' | 'board_member';

export interface Election {
  id: string;
  title: string;
  description: string;
  status: ElectionStatus;
  /** Stored control state. A scheduled daily election follows its configured hours. */
  controlStatus?: ElectionStatus;
  scheduleMode?: 'continuous' | 'daily';
  boardSeats: number;
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  closedAt?: string;
}

export interface ElectionCandidate {
  id: string;
  electionId: string;
  category: ElectionCandidateCategory;
  fullName: string;
  organization: string;
  position: string;
  bio: string;
  photoUrl: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  voteCount?: number;
}

export interface ElectionVoter {
  id: string;
  electionId: string;
  userId: string;
  identifier?: string;
  memberCategory?: string;
  addedAt: string;
  eligibleCategory?: ElectionCandidateCategory;
  hasVoted?: boolean;
  votedAt?: string;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'organization' | 'position' | 'class'>;
}

export interface ElectionVote {
  id: string;
  electionId: string;
  voterId: string;
  candidateId: string;
  category: ElectionCandidateCategory;
  submittedAt: string;
}

export interface ElectionDashboard {
  election: Election | null;
  candidates: ElectionCandidate[];
  voters: ElectionVoter[];
  votes: ElectionVote[];
}

export interface ElectionBallot {
  election: Election | null;
  candidates: ElectionCandidate[];
  voter: ElectionVoter | null;
  votes: ElectionVote[];
}

export interface AdventureActivity {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
}

export interface FeedbackSubmission {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  rating: number; // 1 to 5
  bestSession: string;
  bestFacilitator: string;
  improvements: string;
  attendAgain: boolean;
  submittedAt: string;
  chatTranscript?: ChatMessage[];
}

export interface DatabaseState {
  users: StoredUser[];
  sessions: Session[];
  notes: SessionNote[];
  speakers: Speaker[];
  sponsors: Sponsor[];
  testimonials: Testimonial[];
  gallery: GalleryImage[];
  venue: VenueInfo;
  adventures: AdventureActivity[];
  feedback: FeedbackSubmission[];
  googleDriveLink: string;
  dayLinks: DayLink[]; // NEW: Day links in database state
  attendanceRecords?: AttendanceRecord[];
  qaQuestions?: QAQuestion[];
  qaResponses?: QAResponse[];
  elections?: Election[];
  electionCandidates?: ElectionCandidate[];
  electionVoters?: ElectionVoter[];
  electionVotes?: ElectionVote[];
}

// ============ CHECK-IN SPECIFIC TYPES ============

export interface CheckInData {
  userId: string;
  selectedActivity: 'sunset_cruise' | 'quad_biking';
  password: string;
  email: string; // Email is now required for check-in
}

export interface CheckInStatus {
  checkedIn: boolean;
  checkedInAt?: string;
  selectedActivity?: string;
  email?: string;
}

export interface PublicAttendeeDirectoryEntry {
  id: string;
  firstName: string;
  lastName: string;
  organization?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface PublicAttendeeListQuery {
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface PublicAttendeeListResponse {
  success: boolean;
  attendees: PublicAttendeeDirectoryEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface AdminUserListQuery {
  q?: string;
  status?: 'active' | 'disabled' | 'all';
  role?: UserRole | 'all';
  checkedIn?: 'true' | 'false' | 'all';
  page?: number;
  pageSize?: number;
  sort?: AdminUserSort;
}

export interface AdminUserListResponse {
  success: boolean;
  users: User[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface ActivityOption {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export const ACTIVITY_OPTIONS: ActivityOption[] = [
  {
    id: 'sunset_cruise',
    name: 'Sunset Cruise Vessel',
    icon: '⛵',
    description: 'Double-deck Lake Kariba Cruise with sunset views'
  },
  {
    id: 'quad_biking',
    name: 'Exciting Quad Trails',
    icon: '🏍️',
    description: 'High-powered quads across scenic lakeside ridges'
  }
];
