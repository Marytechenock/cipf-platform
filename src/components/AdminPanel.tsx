import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AddVotingMemberModal from './admin/AddVotingMemberModal';
import ResetPasswordModal from './admin/ResetPasswordModal';
import SessionQuestionsAdmin from './sessionQuestions/SessionQuestionsAdmin';
import { STUDY_MATERIAL_MAX_SIZE_BYTES, STUDY_MATERIAL_MAX_SIZE_MB } from '../config/studyMaterials';
import { api, ApiError, isApiErrorStatus } from '../lib/api';
import { parseVotingEligibility } from '../lib/electionEligibility';
import { readVoterImportRows } from '../lib/voterImport';
import { parseElectionScheduleDate } from '../lib/electionSchedule';
import { AdminUserListQuery, AdventureActivity, AttendanceRecord, AttendanceScanResponse, Election, ElectionCandidate, ElectionCandidateCategory, ElectionVoter, FeedbackSubmission, GalleryImage, QAQuestion, QAQuestionType, QAResponse, Session, Speaker, Sponsor, Testimonial, User } from '../types';
import {
  Users, Shield, UserX, UserCheck, Trash2, Edit, Save,
  FileSpreadsheet, Image, HelpCircle, LayoutList, CloudUpload,
  Upload, Building2, Briefcase, Calendar, Clock, MapPin, User as UserIcon,
  Mail, UserPlus, Globe, Star, Trophy, Award, Heart,Eye,
  MessageSquare, Quote, Camera, FolderOpen, Download, TrendingUp, CheckCircle,
  Home, Car, Activity, X, FileDown, Bike, PawPrint, Ship, AlertTriangle, RefreshCcw,
  Folder, BookOpen, FileText, ChevronLeft, QrCode, ScanLine, Radio, Send, BarChart3, Vote, Search,
  GripVertical, Copy, List, Play, Square, PlusCircle, Compass, Zap, Package
} from 'lucide-react';

// Add StudyMaterial interface
interface StudyMaterial {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  uploadDate: string;
  downloads: number;
}

const MULTIPLE_CHOICE_LABELS = ['A', 'B', 'C', 'D'];
const DEFAULT_ELECTION_TIMEZONE = 'Africa/Harare';
const MARKETERS_CONVENTION_GALLERY_CATEGORY = '17th Annual Marketers Convention 2025 Bulawayo';
const CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY = '18th Annual Marketers Convention 2026 Victoria Falls';

function toDateTimeLocalValue(value?: string, timezone: string = DEFAULT_ELECTION_TIMEZONE) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return value.slice(0, 16);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || DEFAULT_ELECTION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return '';
  return `${value}:00`;
}

function formatElectionSchedule(value?: string, timezone: string = DEFAULT_ELECTION_TIMEZONE) {
  if (!value) return 'Not set';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const [datePart, timePart] = value.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    const monthLabel = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(Date.UTC(year, month - 1, day)));
    return `${String(day).padStart(2, '0')} ${monthLabel} ${year}, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-GB', {
    timeZone: timezone || DEFAULT_ELECTION_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

interface AdminPanelProps {
  user: User;
  onRefreshCore: () => void;
  onAuthFailure: (error: ApiError) => void;
}

export default function AdminPanel({ user, onRefreshCore, onAuthFailure }: AdminPanelProps) {
  const [subTab, setSubTab] = useState<'users' | 'speakers' | 'programme' | 'sponsors' | 'attendance' | 'qa' | 'session-questions' | 'voting' | 'voting-members' | 'testimonials' | 'gallery' | 'days' | 'reports' | 'study-materials'>('voting');
  const [passwordResetUser, setPasswordResetUser] = useState<Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> | null>(null);
  const loadedTabsRef = useRef<Record<string, boolean>>({});
  const qrScannerRef = useRef<any>(null);
  const lastCameraScanRef = useRef<{ value: string; scannedAt: number }>({ value: '', scannedAt: 0 });
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isTabLoading, setIsTabLoading] = useState(false);

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize] = useState(25);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userFilters, setUserFilters] = useState<AdminUserListQuery>({
    q: '',
    status: 'all',
    role: 'attendee',
    checkedIn: 'all',
    page: 1,
    pageSize: 25,
    sort: 'created_desc'
  });
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<Session[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [adventures, setAdventures] = useState<AdventureActivity[]>([]);
  const [feedback, setFeedback] = useState<FeedbackSubmission[]>([]);
  const [driveLink, setDriveLink] = useState('');
  const [attendanceSessionId, setAttendanceSessionId] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceInput, setAttendanceInput] = useState('');
  const [attendanceScanResult, setAttendanceScanResult] = useState<AttendanceScanResponse | null>(null);
  const [isAttendanceSubmitting, setIsAttendanceSubmitting] = useState(false);
  const [isCameraScannerActive, setIsCameraScannerActive] = useState(false);
  const [cameraScannerError, setCameraScannerError] = useState('');
  const [qaSessionId, setQaSessionId] = useState('');
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([]);
  const [globalLiveQAQuestion, setGlobalLiveQAQuestion] = useState<QAQuestion | null>(null);
  const [qaResponses, setQaResponses] = useState<QAResponse[]>([]);
  const [selectedQAQuestionId, setSelectedQAQuestionId] = useState('');
  const [qaClockNow, setQaClockNow] = useState(() => Date.now());
  const [qaForm, setQaForm] = useState<{ id: string; questionTitle: string; questionText: string; type: QAQuestionType; optionsText: string }>({
    id: '',
    questionTitle: '',
    questionText: '',
    type: 'short_answer',
    optionsText: ''
  });
  const [election, setElection] = useState<Election | null>(null);
  const [electionCandidates, setElectionCandidates] = useState<ElectionCandidate[]>([]);
  const [electionVoters, setElectionVoters] = useState<ElectionVoter[]>([]);
  const [eligibleAttendees, setEligibleAttendees] = useState<User[]>([]);
  const [voterImportSummary, setVoterImportSummary] = useState<{
    status: 'success' | 'partial' | 'error';
    total: number;
    added: number;
    updated: number;
    created: number;
    issues: string[];
    error?: string;
  } | null>(null);
  const [votingMemberSearch, setVotingMemberSearch] = useState('');
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedVotingMemberIds, setSelectedVotingMemberIds] = useState<string[]>([]);
  const [isDeletingVotingMembers, setIsDeletingVotingMembers] = useState(false);
  const [editingVotingMember, setEditingVotingMember] = useState<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: User['role'];
    organization: string;
    position: string;
    status: User['status'];
    class: 'A' | 'B';
    accommodationProvided: boolean;
    roomNumber: string;
    transportProvided: boolean;
  } | null>(null);
  const [electionForm, setElectionForm] = useState({
    id: '',
    title: 'Board Members Election 2026',
    description: '',
    boardSeats: 3,
    startsAt: '',
    endsAt: '',
    timezone: 'Africa/Harare',
    scheduleMode: 'continuous' as 'continuous' | 'daily'
  });
  const [candidateForm, setCandidateForm] = useState({
    id: '',
    category: 'employee_representative' as ElectionCandidateCategory,
    fullName: '',
    organization: '',
    position: '',
    bio: '',
    photoUrl: ''
  });
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [isElectionDetailsEditing, setIsElectionDetailsEditing] = useState(false);

  // Study Materials State
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  const [studyMaterialForm, setStudyMaterialForm] = useState({
    id: '',
    title: '',
    description: '',
    file: null as File | null
  });

  // Days State
  const [days, setDays] = useState<{ id: string; day: string; driveLink: string }[]>([]);
  const [dayForm, setDayForm] = useState({ id: '', day: '', driveLink: '' });

  // Upload states
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Form states
  const [userForm, setUserForm] = useState({
    id: '', email: '', firstName: '', lastName: '', role: 'attendee',
    organization: '', position: '',
    accommodationProvided: false, roomNumber: '', transportProvided: false,
    class: 'A'
  });
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [speakerForm, setSpeakerForm] = useState({ id: '', name: '', position: '', organization: '', topic: '', speakingTime: '', bio: '', photoUrl: '' });
  const [sessionForm, setSessionForm] = useState({ id: '', category: 'Class B', day: 1, dayLabel: 'Day 1 · Monday 19 October 2026', time: '', topic: '', facilitator: '', venue: '', type: 'session' });
  const [sponsorForm, setSponsorForm] = useState({ id: '', name: '', logoUrl: '🏢', description: '', website: '', durationLabel: '2026', tier: 'Dinner' });
  const [testimonialForm, setTestimonialForm] = useState({ id: '', name: '', company: '', position: '', text: '', photoUrl: 'T' });
  const [galleryForm, setGalleryForm] = useState({
    id: '',
    url: '',
    caption: '',
    description: '',
    category: CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY,
    imageFile: null as File | null
  });
  const [adventureForm, setAdventureForm] = useState({
    id: '',
    title: '',
    description: '',
    imageUrl: '',
    imageFile: null as File | null
  });

  const shouldDelegateAuthFailure = (error: unknown) => {
    if (error instanceof ApiError && isApiErrorStatus(error, [401, 403])) {
      onAuthFailure(error);
      return true;
    }
    return false;
  };

  const reportPanelError = (error: unknown, fallbackMessage: string) => {
    if (shouldDelegateAuthFailure(error)) {
      return;
    }

    console.error(error);
    setPanelError(error instanceof Error ? error.message : fallbackMessage);
  };

  const loadUsers = async (query: AdminUserListQuery = userFilters) => {
    setIsTabLoading(true);
    setPanelError(null);
    try {
      const data = await api.getAdminUsers(query);
      setUsers(data.users);
      setUsersTotal(data.total);
      setUsersPage(data.page);
      setUsersHasMore(data.hasMore);
      loadedTabsRef.current.users = true;
    } catch (error) {
      reportPanelError(error, 'Failed to load admin users.');
    } finally {
      setIsTabLoading(false);
    }
  };

  // Load Study Materials
  const loadStudyMaterials = async () => {
    setIsTabLoading(true);
    setPanelError(null);
    try {
      const data = await api.getStudyMaterials();
      setStudyMaterials(data.materials);
      loadedTabsRef.current['study-materials'] = true;
    } catch (error) {
      reportPanelError(error, 'Failed to load study materials.');
    } finally {
      setIsTabLoading(false);
    }
  };

  // Handle Study Material Upload
  const handleStudyMaterialUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studyMaterialForm.file) {
      alert('Please select a file to upload.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', studyMaterialForm.file);
      formData.append('title', studyMaterialForm.title || studyMaterialForm.file.name.replace(/\.[^/.]+$/, ''));
      formData.append('description', studyMaterialForm.description || '');

      await api.uploadStudyMaterial(formData);

      setStudyMaterialForm({ id: '', title: '', description: '', file: null });
      loadedTabsRef.current['study-materials'] = false;
      await loadStudyMaterials();
      alert('Study material uploaded successfully!');
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Handle Study Material Delete
  const handleStudyMaterialDelete = async (id: string) => {
    if (!window.confirm('Delete this study material permanently?')) return;
    try {
      await api.deleteStudyMaterial(id);
      loadedTabsRef.current['study-materials'] = false;
      await loadStudyMaterials();
      alert('Material deleted successfully!');
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  // Format file size helper
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Load Admin Data on tab changes
  useEffect(() => {
    if (subTab !== 'users') {
      void loadAllAdminData(false, subTab);
    }
    if (subTab === 'study-materials') {
      void loadStudyMaterials();
    }
  }, [subTab]);

  useEffect(() => {
    return () => {
      if (qrScannerRef.current) {
        void qrScannerRef.current.stop().catch(() => undefined);
        qrScannerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (subTab !== 'attendance' && qrScannerRef.current) {
      void qrScannerRef.current.stop().catch(() => undefined);
      qrScannerRef.current = null;
      setIsCameraScannerActive(false);
    }
  }, [subTab]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setUserFilters(current => ({
        ...current,
        q: userSearchInput.trim(),
        page: 1
      }));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [userSearchInput]);

  useEffect(() => {
    if (subTab === 'users') {
      void loadUsers(userFilters);
    }
  }, [subTab, userFilters]);

  // Load Days
  const loadDays = async () => {
    try {
      const data = await api.getDayLinks();
      setDays(data);
      loadedTabsRef.current.days = true;
    } catch (error) {
      reportPanelError(error, 'Failed to load days.');
    }
  };

  const loadAllAdminData = async (forceRefresh: boolean = false, targetTab: typeof subTab = subTab) => {
    setIsTabLoading(true);
    setPanelError(null);
    try {
      if (!forceRefresh && loadedTabsRef.current[targetTab]) {
        return;
      }

      if (targetTab === 'speakers') {
        const data = await api.getSpeakers();
        setSpeakers(data);
      } else if (targetTab === 'programme') {
        const data = await api.getSessions();
        setSessions(data);
      } else if (targetTab === 'attendance') {
        const [sessionData, attendeeData] = await Promise.all([
          api.getAdminAttendanceSessions(),
          api.getAdminUsers({ role: 'attendee', status: 'active', page: 1, pageSize: 1 })
        ]);
        setAttendanceSessions(sessionData);
        setUsersTotal(attendeeData.total);
        if (!attendanceSessionId && sessionData.length > 0) {
          setAttendanceSessionId(sessionData[0].id);
        }
      } else if (targetTab === 'qa') {
        const sessionData = await api.getSessions();
        setSessions(sessionData);
        await loadGlobalLiveQAQuestion();
        const activeSessionId = qaSessionId || sessionData[0]?.id || '';
        if (!qaSessionId && activeSessionId) {
          setQaSessionId(activeSessionId);
        }
        if (activeSessionId) {
          const questions = await api.getAdminQAQuestions(activeSessionId);
          setQaQuestions(questions);
          if (questions[0] && !selectedQAQuestionId) {
            setSelectedQAQuestionId(questions[0].id);
          }
        }
      } else if (targetTab === 'voting' || targetTab === 'voting-members') {
        const [dashboard, attendeeData] = await Promise.all([
          api.getAdminElectionDashboard(),
          api.exportAdminUsers({ status: 'active', sort: 'name_asc' })
        ]);
        setElection(dashboard.election);
        setElectionCandidates(dashboard.candidates);
        setElectionVoters(dashboard.voters);
        setEligibleAttendees(attendeeData.users.filter(item => item.role === 'attendee' || item.role === 'member'));
        if (dashboard.election) {
          setElectionForm({
            id: dashboard.election.id,
            title: dashboard.election.title,
            description: dashboard.election.description,
            boardSeats: dashboard.election.boardSeats,
            startsAt: dashboard.election.startsAt || '',
            endsAt: dashboard.election.endsAt || '',
            timezone: dashboard.election.timezone || DEFAULT_ELECTION_TIMEZONE,
            scheduleMode: dashboard.election.scheduleMode || 'continuous'
          });
        }
      } else if (targetTab === 'sponsors') {
        const data = await api.getSponsors();
        setSponsors(data);
      } else if (targetTab === 'testimonials') {
        const data = await api.getTestimonials();
        setTestimonials(data);
      } else if (targetTab === 'gallery') {
        const data = await api.getGallery();
        setGallery(data);
        const ld = await api.getGoogleDriveLink();
        setDriveLink(ld.link);
      } else if (targetTab === 'adventures') {
        const data = await api.getAdventures();
        setAdventures(data);
      } else if (targetTab === 'days') {
        await loadDays();
      } else if (targetTab === 'reports') {
        const data = await api.getAdminFeedbackReports();
        setFeedback(data);
      }
      loadedTabsRef.current[targetTab] = true;
    } catch (error) {
      reportPanelError(error, `Failed to load ${targetTab} admin data.`);
    } finally {
      setIsTabLoading(false);
    }
  };

  const loadAttendanceRecords = async (sessionId: string = attendanceSessionId) => {
    if (!sessionId) return;
    setPanelError(null);
    try {
      const data = await api.getAdminAttendance(sessionId);
      setAttendanceRecords(data.records);
    } catch (error) {
      reportPanelError(error, 'Failed to load attendance records.');
    }
  };

  const loadQAQuestions = async (sessionId: string = qaSessionId) => {
    if (!sessionId) return;
    setPanelError(null);
    try {
      const questions = await api.getAdminQAQuestions(sessionId);
      setQaQuestions(questions);
      await loadGlobalLiveQAQuestion();
      if (questions.length > 0 && !questions.some(question => question.id === selectedQAQuestionId)) {
        setSelectedQAQuestionId(questions[0].id);
      }
      if (questions.length === 0) {
        setSelectedQAQuestionId('');
        setQaResponses([]);
      }
    } catch (error) {
      reportPanelError(error, 'Failed to load Q&A questions.');
    }
  };

  const loadGlobalLiveQAQuestion = async () => {
    try {
      const questions = await api.getAdminQAQuestions();
      const liveQuestions = questions
        .filter(question => question.status === 'live')
        .sort((a, b) => new Date(b.publishedAt || b.updatedAt).getTime() - new Date(a.publishedAt || a.updatedAt).getTime());
      setGlobalLiveQAQuestion(liveQuestions[0] || null);
    } catch (error) {
      reportPanelError(error, 'Failed to load current live Q&A question.');
    }
  };

  const loadQAResponses = async (questionId: string = selectedQAQuestionId) => {
    if (!questionId) return;
    try {
      const data = await api.getAdminQAResponses(questionId);
      setQaResponses(data.responses);
    } catch (error) {
      reportPanelError(error, 'Failed to load Q&A responses.');
    }
  };

  const loadElectionDashboard = async () => {
    setPanelError(null);
    try {
      const dashboard = await api.getAdminElectionDashboard();
      setElection(dashboard.election);
      setElectionCandidates(dashboard.candidates);
      setElectionVoters(dashboard.voters);
      if (dashboard.election) {
        setElectionForm({
          id: dashboard.election.id,
          title: dashboard.election.title,
          description: dashboard.election.description,
          boardSeats: dashboard.election.boardSeats,
          startsAt: dashboard.election.startsAt || '',
          endsAt: dashboard.election.endsAt || '',
          timezone: dashboard.election.timezone || DEFAULT_ELECTION_TIMEZONE,
          scheduleMode: dashboard.election.scheduleMode || 'continuous'
        });
      }
    } catch (error) {
      reportPanelError(error, 'Failed to load voting dashboard.');
    }
  };

  const refreshVotingRegister = async () => {
    const [dashboard, attendeeData] = await Promise.all([
      api.getAdminElectionDashboard(),
      api.exportAdminUsers({ status: 'active', sort: 'name_asc' })
    ]);
    setElection(dashboard.election);
    setElectionCandidates(dashboard.candidates);
    setElectionVoters(dashboard.voters);
    setEligibleAttendees(attendeeData.users.filter(item => item.role === 'attendee' || item.role === 'member'));
    setSelectedVotingMemberIds(current => current.filter(id => dashboard.voters.some(voter => voter.userId === id)));
    if (dashboard.election) {
      setElectionForm({
        id: dashboard.election.id,
        title: dashboard.election.title,
        description: dashboard.election.description,
        boardSeats: dashboard.election.boardSeats,
        startsAt: dashboard.election.startsAt || '',
        endsAt: dashboard.election.endsAt || '',
        timezone: dashboard.election.timezone || DEFAULT_ELECTION_TIMEZONE,
        scheduleMode: dashboard.election.scheduleMode || 'continuous'
      });
    }
  };

  useEffect(() => {
    if (subTab === 'attendance' && attendanceSessionId) {
      void loadAttendanceRecords(attendanceSessionId);
    }
  }, [subTab, attendanceSessionId]);

  useEffect(() => {
    if (subTab === 'qa' && qaSessionId) {
      void loadQAQuestions(qaSessionId);
    }
  }, [subTab, qaSessionId]);

  useEffect(() => {
    if (subTab === 'qa' && selectedQAQuestionId) {
      void loadQAResponses(selectedQAQuestionId);
    }
  }, [subTab, selectedQAQuestionId]);

  useEffect(() => {
    if (subTab !== 'qa') return;
    const interval = window.setInterval(() => setQaClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [subTab]);

  useEffect(() => {
    if (subTab !== 'voting') return;
    const interval = window.setInterval(() => {
      void api.getAdminElectionDashboard().then(dashboard => setElection(dashboard.election)).catch(() => {});
    }, 30000);
    return () => window.clearInterval(interval);
  }, [subTab]);

  const saveElection = async (showNotice = true) => {
    try {
      const dashboard = await api.saveAdminElection({ ...electionForm, boardSeats: 3 });
      setElection(dashboard.election);
      setElectionCandidates(dashboard.candidates);
      setElectionVoters(dashboard.voters);
      if (dashboard.election) {
        setElectionForm({
          id: dashboard.election.id,
          title: dashboard.election.title,
          description: dashboard.election.description,
          boardSeats: dashboard.election.boardSeats,
          startsAt: dashboard.election.startsAt || '',
          endsAt: dashboard.election.endsAt || '',
          timezone: dashboard.election.timezone || DEFAULT_ELECTION_TIMEZONE,
          scheduleMode: dashboard.election.scheduleMode || 'continuous'
        });
      }
      loadedTabsRef.current.voting = true;
      if (showNotice) alert('Election saved.');
      return dashboard.election;
    } catch (error) {
      reportPanelError(error, 'Failed to save election.');
      return null;
    }
  };

  const updateElectionStatus = async (status: Election['status']) => {
    if (!election) return;
    try {
      const dashboard = await api.updateAdminElectionStatus(election.id, status);
      setElection(dashboard.election);
      setElectionCandidates(dashboard.candidates);
      setElectionVoters(dashboard.voters);
    } catch (error) {
      reportPanelError(error, 'Failed to update election status.');
    }
  };

  const closeElectionWithConfirmation = async () => {
    if (!election) return;
    const confirmed = window.confirm(election.scheduleMode === 'daily'
      ? 'Close voting now? The daily schedule will remain paused until you run the automatic schedule again.'
      : 'Close this election now? Voters will no longer be able to submit ballots.');
    if (!confirmed) return;
    await updateElectionStatus('closed');
  };

  const publishElection = async () => {
    const targetElection = await saveElection(false);
    if (!targetElection) return;
    const start = parseElectionScheduleDate(electionForm.startsAt, electionForm.timezone);
    const status: Election['status'] = electionForm.scheduleMode === 'daily' || (start && start > new Date()) ? 'scheduled' : 'open';

    try {
      const dashboard = await api.updateAdminElectionStatus(targetElection.id, status);
      setElection(dashboard.election);
      setElectionCandidates(dashboard.candidates);
      setElectionVoters(dashboard.voters);
    } catch (error) {
      reportPanelError(error, 'Failed to publish election.');
    }
  };

  const resetCandidateForm = () => {
    setCandidateForm({ id: '', category: 'employee_representative', fullName: '', organization: '', position: '', bio: '', photoUrl: '' });
  };

  const openNewCandidateModal = () => {
    resetCandidateForm();
    setIsCandidateModalOpen(true);
  };

  const downloadElectionVoterTemplate = () => {
    const csv = [
      ['Member / Employer Name', 'Identifier', 'Catetory Category', 'Employer / Employee Association', 'Eligibility to vote for'],
      ['Tendai Moyo', 'MEMBER001', 'Active Member', 'ZCATWU', 'Board Member Employee Representative only']
    ].map(row => row.map(value => `"${value}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'election-voters-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const saveElectionCandidate = async () => {
    if (!election) {
      alert('Create and save an election first.');
      return;
    }
    try {
      await api.saveAdminElectionCandidate(election.id, {
        ...candidateForm,
        displayOrder: electionCandidates.length + 1
      });
      resetCandidateForm();
      setIsCandidateModalOpen(false);
      await loadElectionDashboard();
    } catch (error) {
      reportPanelError(error, 'Failed to save candidate.');
    }
  };

  const handleCandidatePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 6 * 1024 * 1024) {
      alert('File too large. Maximum size is 6MB.');
      event.target.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid image type. Please upload JPEG, PNG, GIF, or WEBP.');
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadCandidatePhoto(candidateForm.id, file);
      setCandidateForm(current => ({ ...current, photoUrl: result.imageUrl }));
      alert('Candidate photo uploaded.');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Failed to upload candidate photo.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const editElectionCandidate = (candidate: ElectionCandidate) => {
    setCandidateForm({
      id: candidate.id,
      category: candidate.category,
      fullName: candidate.fullName,
      organization: candidate.organization,
      position: candidate.position,
      bio: candidate.bio,
      photoUrl: candidate.photoUrl
    });
    setIsCandidateModalOpen(true);
  };

  const deleteElectionCandidate = async (candidateId: string) => {
    if (!election || !confirm('Delete this candidate? Any votes for this candidate will also be removed.')) return;
    try {
      await api.deleteAdminElectionCandidate(election.id, candidateId);
      await loadElectionDashboard();
    } catch (error) {
      reportPanelError(error, 'Failed to delete candidate.');
    }
  };

  const handleElectionVoterBulkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!election) {
      setVoterImportSummary({ status: 'error', total: 0, added: 0, updated: 0, created: 0, issues: [], error: 'Create and save an election first.' });
      return;
    }

    setUploading(true);
    setVoterImportSummary(null);
    let total = 0;
    let added = 0;
    let updated = 0;
    let created = 0;
    const issues: string[] = [];
    try {
      const table: unknown[][] = [];
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv') {
        let row: string[] = [];
        let field = '';
        let quoted = false;
        const csv = await file.text();
        for (let index = 0; index < csv.length; index += 1) {
          const char = csv[index];
          const next = csv[index + 1];
          if (char === '"' && quoted && next === '"') {
            field += '"';
            index += 1;
          } else if (char === '"') {
            quoted = !quoted;
          } else if (char === ',' && !quoted) {
            row.push(field);
            field = '';
          } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') index += 1;
            row.push(field);
            if (row.some((value) => value !== '')) table.push(row);
            row = [];
            field = '';
          } else {
            field += char;
          }
        }
        if (field || row.length > 0) {
          row.push(field);
          if (row.some((value) => value !== '')) table.push(row);
        }
      } else if (extension === 'xlsx') {
        const ExcelJS = await import('exceljs');
        const { Workbook } = ExcelJS.default;
        const workbook = new Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const sheet = workbook.worksheets[0];
        sheet.eachRow({ includeEmpty: true }, (row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          table.push(values as unknown[]);
        });
      } else {
        throw new Error('Unsupported voter file. Please upload an .xlsx or .csv file.');
      }
      const rows = readVoterImportRows(table);

      if (rows.length === 0) throw new Error('The uploaded file does not contain any voter rows.');
      total = rows.length;

      const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

      const attendeesByName = new Map<string, User>();
      const ambiguousNames = new Set<string>();
      for (const attendee of eligibleAttendees) {
        const key = normalize(`${attendee.firstName} ${attendee.lastName}`);
        if (attendeesByName.has(key)) ambiguousNames.add(key);
        else attendeesByName.set(key, attendee);
      }

      const matchedVoters = new Map<string, { identifier: string; memberCategory: string; eligibleCategory: ElectionCandidateCategory }>();
      const labelsByUserId = new Map<string, string>();
      const rowsToCreate: Array<{ label: string; identifier: string; memberCategory: string; firstName: string; lastName: string; company: string; eligibleCategory: ElectionCandidateCategory }> = [];
      const existingByIdentifier = new Map(electionVoters.filter(voter => voter.identifier).map(voter => [normalize(voter.identifier), voter.userId]));
      const seenIdentifiers = new Set<string>();
      const fileNameCounts = new Map<string, number>();
      for (const row of rows) {
        const name = row.fullName;
        if (name) fileNameCounts.set(normalize(name), (fileNameCounts.get(normalize(name)) || 0) + 1);
      }

      for (const row of rows) {
        const { identifier, memberCategory, fullName } = row;
        const company = row.association;
        const eligibleCategory = parseVotingEligibility(row.eligibility);
        const label = fullName || identifier || 'Unnamed row';
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const resolvedFirstName = nameParts[0] || '';
        const resolvedLastName = nameParts.slice(1).join(' ') || '';

        const rowProblems = [
          !fullName && 'member / employer name is missing',
          !identifier && 'identifier is missing',
          !memberCategory && 'category is missing',
          !row.eligibility ? 'voting eligibility is missing' : !eligibleCategory && `voting eligibility was not recognized: ${row.eligibility}`
        ].filter(Boolean);
        if (rowProblems.length > 0 || !eligibleCategory) { issues.push(`${label}: ${rowProblems.join('; ')}`); continue; }
        if (seenIdentifiers.has(normalize(identifier))) { issues.push(`${label}: duplicate identifier in file`); continue; }
        seenIdentifiers.add(normalize(identifier));
        const nameKey = normalize(fullName);
        const existingUserId = existingByIdentifier.get(normalize(identifier));
        if (existingUserId && !eligibleAttendees.some(item => item.id === existingUserId)) {
          issues.push(`${label}: existing voter profile is unavailable`);
          continue;
        }
        const attendee = existingUserId ? eligibleAttendees.find(item => item.id === existingUserId) :
          (ambiguousNames.has(nameKey) || (fileNameCounts.get(nameKey) || 0) > 1 ? undefined : attendeesByName.get(nameKey));

        if (attendee) {
          matchedVoters.set(attendee.id, { identifier, memberCategory, eligibleCategory });
          labelsByUserId.set(attendee.id, `${label} (${identifier})`);
        } else if (resolvedFirstName && resolvedLastName) {
          rowsToCreate.push({
            label,
            identifier,
            memberCategory,
            firstName: resolvedFirstName,
            lastName: resolvedLastName,
            company,
            eligibleCategory
          });
        } else {
          issues.push(`${label}: provide a full name`);
        }
      }

      const createdIds: string[] = [];
      for (const row of rowsToCreate) {
        try {
          const result = await api.saveAdminUser({
            id: `usr_bulk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            firstName: row.firstName,
            lastName: row.lastName,
            role: 'member',
            organization: row.company,
            position: '',
            status: 'active',
            accommodationProvided: false,
            roomNumber: '',
            transportProvided: false,
            class: 'A'
          });
          createdIds.push(result.user.id);
          created++;
          matchedVoters.set(result.user.id, { identifier: row.identifier, memberCategory: row.memberCategory, eligibleCategory: row.eligibleCategory });
          labelsByUserId.set(result.user.id, `${row.label} (${row.identifier})`);
        } catch (error) {
          if (shouldDelegateAuthFailure(error)) {
            setVoterImportSummary({ status: 'error', total, added, updated, created, issues, error: 'Import stopped because the admin session ended.' });
            return;
          }
          console.error('Failed to create voter from bulk upload:', error);
          issues.push(`${row.label}: ${error instanceof Error ? error.message : 'Could not create voter profile'}`);
        }
      }

      const existingVoterIds = new Set(electionVoters.map(voter => voter.userId));
      for (const [userId, details] of matchedVoters) {
        try {
          await api.addAdminElectionVoters(election.id, [{ userId, ...details }]);
          if (existingVoterIds.has(userId)) updated++;
          else added++;
        } catch (error) {
          if (shouldDelegateAuthFailure(error)) {
            setVoterImportSummary({ status: added + updated > 0 ? 'partial' : 'error', total, added, updated, created, issues, error: 'Import stopped because the admin session ended.' });
            return;
          }
          issues.push(`${labelsByUserId.get(userId) || details.identifier}: ${error instanceof Error ? error.message : 'Could not add voter'}`);
        }
      }

      if (added + updated > 0) {
        await loadElectionDashboard();
      }
      if (createdIds.length > 0) {
        const refreshedAttendees = await api.exportAdminUsers({ status: 'active', sort: 'name_asc' });
        setEligibleAttendees(refreshedAttendees.users.filter(item => item.role === 'attendee' || item.role === 'member'));
      }

      setVoterImportSummary({
        status: issues.length === 0 ? 'success' : added + updated > 0 ? 'partial' : 'error',
        total, added, updated, created, issues
      });
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) {
        setVoterImportSummary({ status: added + updated > 0 ? 'partial' : 'error', total, added, updated, created, issues, error: 'Import stopped because the admin session ended.' });
        return;
      }
      setVoterImportSummary({
        status: added + updated > 0 ? 'partial' : 'error',
        total, added, updated, created, issues,
        error: error instanceof Error ? error.message : 'Failed to import eligible voters.'
      });
    } finally {
      setUploading(false);
    }
  };

  const deleteElectionVoter = async (userId: string) => {
    if (!election || !confirm('Remove this eligible voter? Any submitted vote by this voter will also be removed.')) return;
    try {
      await api.deleteAdminElectionVoter(election.id, userId);
      await loadElectionDashboard();
    } catch (error) {
      reportPanelError(error, 'Failed to remove voter.');
    }
  };

  const bulkDeleteVotingMembers = async () => {
    const selectedCount = selectedVotingMemberIds.length;
    const message = `Delete ${selectedCount} selected voting member${selectedCount === 1 ? '' : 's'}? This removes them from the members database and voting register.`;
    if (selectedCount === 0) return;
    if (!window.confirm(message)) return;

    setIsDeletingVotingMembers(true);
    try {
      const result = await api.bulkDeleteAdminMembers(selectedVotingMemberIds);
      setSelectedVotingMemberIds([]);
      await refreshVotingRegister();
      alert(`${result.deleted} voting member${result.deleted === 1 ? '' : 's'} deleted.`);
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Failed to delete voting members.');
    } finally {
      setIsDeletingVotingMembers(false);
    }
  };

  const openVotingMemberEdit = (voter: ElectionVoter) => {
    const fullUser = eligibleAttendees.find(attendee => attendee.id === voter.userId);
    const member = fullUser || voter.user;
    if (!member) {
      alert('This member profile could not be loaded. Refresh the voting register and try again.');
      return;
    }

    setEditingVotingMember({
      id: voter.userId,
      email: member.email || '',
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      role: fullUser?.role || 'member',
      organization: member.organization || '',
      position: member.position || '',
      status: fullUser?.status || 'active',
      class: (member.class || 'A') as 'A' | 'B',
      accommodationProvided: fullUser?.accommodationProvided || false,
      roomNumber: fullUser?.roomNumber || '',
      transportProvided: fullUser?.transportProvided || false
    });
  };

  const saveVotingMemberEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingVotingMember || isSavingUser) return;

    setIsSavingUser(true);
    try {
      const result = await api.saveAdminUser(editingVotingMember);
      setEligibleAttendees(current => current.map(member => member.id === result.user.id ? result.user : member));
      await loadElectionDashboard();
      setEditingVotingMember(null);
      alert('Voting member details updated.');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Failed to update voting member.');
    } finally {
      setIsSavingUser(false);
    }
  };

  const submitAttendanceScan = async (qrValue: string) => {
    const trimmedQrValue = qrValue.trim();
    if (!attendanceSessionId) {
      setAttendanceScanResult({
        success: false,
        status: 'error',
        message: 'Select a session before scanning.'
      });
      return;
    }

    if (!trimmedQrValue || isAttendanceSubmitting) return;

    setIsAttendanceSubmitting(true);
    setCameraScannerError('');
    try {
      const result = await api.scanAdminAttendance({
        sessionId: attendanceSessionId,
        qrValue: trimmedQrValue
      });
      setAttendanceScanResult(result);
      setAttendanceInput('');
      await loadAttendanceRecords(attendanceSessionId);
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      setAttendanceScanResult({
        success: false,
        status: 'error',
        message: error.message || 'Attendance scan failed.'
      });
    } finally {
      setIsAttendanceSubmitting(false);
    }
  };

  const handleAttendanceSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void submitAttendanceScan(attendanceInput);
  };

  const resetQAForm = () => {
    setQaForm({ id: '', questionTitle: '', questionText: '', type: 'short_answer', optionsText: '' });
  };

  const handleQASave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!qaSessionId) {
      alert('Select a session first.');
      return;
    }

    try {
      const options = qaForm.optionsText
        .split('\n')
        .map(option => option.trim())
        .filter(Boolean);
      const result = await api.saveAdminQAQuestion({
        id: qaForm.id || undefined,
        sessionId: qaSessionId,
        questionTitle: qaForm.questionTitle,
        questionText: qaForm.questionText,
        type: qaForm.type,
        options,
        order: qaForm.id ? qaQuestions.find(question => question.id === qaForm.id)?.order : qaQuestions.length + 1
      });
      resetQAForm();
      await loadQAQuestions(qaSessionId);
      setSelectedQAQuestionId(result.question.id);
      alert('Q&A question saved.');
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Failed to save Q&A question.');
    }
  };

  const editQAQuestion = (question: QAQuestion) => {
    setQaForm({
      id: question.id,
      questionTitle: question.questionTitle || '',
      questionText: question.questionText,
      type: question.type,
      optionsText: question.options.join('\n')
    });
  };

  const publishQAQuestion = async (questionId: string) => {
    try {
      await api.publishAdminQAQuestion(questionId);
      await loadQAQuestions(qaSessionId);
      await loadGlobalLiveQAQuestion();
      setSelectedQAQuestionId(questionId);
      await loadQAResponses(questionId);
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Failed to publish Q&A question.');
    }
  };

  const closeQAQuestion = async (questionId: string) => {
    try {
      await api.closeAdminQAQuestion(questionId);
      await loadQAQuestions(qaSessionId);
      await loadGlobalLiveQAQuestion();
      await loadQAResponses(questionId);
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Failed to close Q&A question.');
    }
  };

  const deleteQAQuestion = async (questionId: string) => {
    if (!window.confirm('Delete this Q&A question and its responses?')) return;
    try {
      await api.deleteAdminQAQuestion(questionId);
      await loadQAQuestions(qaSessionId);
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error instanceof Error ? error.message : 'Failed to delete Q&A question.');
    }
  };

  const formatQAResponseAnswer = (question: QAQuestion | undefined, answer: string) => {
    if (!question || question.type !== 'multiple_choice') return answer;
    const optionIndex = MULTIPLE_CHOICE_LABELS.indexOf(answer);
    const optionText = optionIndex >= 0 ? question.options[optionIndex] : '';
    return optionText ? `${answer} — ${optionText}` : answer;
  };

  const stopCameraScanner = async () => {
    if (!qrScannerRef.current) return;
    try {
      await qrScannerRef.current.stop();
    } catch {
      // Scanner may already be stopped by the browser/device.
    } finally {
      qrScannerRef.current = null;
      setIsCameraScannerActive(false);
    }
  };

  const startCameraScanner = async () => {
    if (!attendanceSessionId) {
      setCameraScannerError('Select a session before starting the camera scanner.');
      return;
    }

    setCameraScannerError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (qrScannerRef.current) {
        await stopCameraScanner();
      }

      const scanner = new Html5Qrcode('attendance-camera-scanner');
      qrScannerRef.current = scanner;
      setIsCameraScannerActive(true);

      await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const now = Date.now();
            const recentlyScannedSameValue = lastCameraScanRef.current.value === decodedText && now - lastCameraScanRef.current.scannedAt < 3000;
            if (!isAttendanceSubmitting && !recentlyScannedSameValue) {
              lastCameraScanRef.current = { value: decodedText, scannedAt: now };
              void submitAttendanceScan(decodedText);
            }
          },
          () => undefined
      );
    } catch (error: any) {
      setIsCameraScannerActive(false);
      qrScannerRef.current = null;
      setCameraScannerError(error?.message || 'Camera scanner could not start. Use the manual scanner input instead.');
    }
  };

  // --- DAYS CRUD OPERATIONS ---

  // Save Day
  const handleDaySave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveDayLink(dayForm);
      setDayForm({ id: '', day: '', driveLink: '' });
      loadedTabsRef.current.days = false;
      await loadDays();
      alert('Day added successfully!');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Error saving day');
    }
  };

  // Delete Day
  const handleDayDelete = async (id: string) => {
    if (!window.confirm('Delete this day?')) return;
    try {
      await api.deleteDayLink(id);
      loadedTabsRef.current.days = false;
      await loadDays();
      alert('Day deleted successfully!');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Error deleting day');
    }
  };

  // --- EXPORT TO EXCEL ---
  const exportToExcel = () => {
    void (async () => {
      const ExcelJS = await import('exceljs');
      const { Workbook } = ExcelJS.default;
      const response = await api.exportAdminUsers(userFilters);
      const exportUsers = response.users;
      if (exportUsers.length === 0) {
        alert('No attendees to export.');
        return;
      }

      const activityNames: { [key: string]: string } = {
        'sunset_cruise': 'Sunset Cruise',
        'game_drive': 'Game Safari',
        'quad_biking': 'Quad Biking'
      };

      const exportData = exportUsers.map(item => ({
        'First Name': item.firstName,
        'Last Name': item.lastName,
        'Email': item.email || 'Not provided',
        'Organization': item.organization || 'N/A',
        'Checked In': item.checkedIn ? 'Yes' : 'No',
        'Selected Activity': item.selectedActivity ? (activityNames[item.selectedActivity] || item.selectedActivity) : 'Not selected',
        'Role': item.role,
        'Checked In At': item.checkedInAt ? new Date(item.checkedInAt).toLocaleString() : 'N/A'
      }));

      const wb = new Workbook();
      const ws = wb.addWorksheet('Attendees');
      ws.columns = [
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Organization', key: 'organization', width: 25 },
        { header: 'Checked In', key: 'checkedIn', width: 12 },
        { header: 'Selected Activity', key: 'selectedActivity', width: 20 },
        { header: 'Role', key: 'role', width: 12 },
        { header: 'Checked In At', key: 'checkedInAt', width: 25 }
      ];
      ws.addRows(exportData);
      const fileName = `MAZ_Winter_School_2026_Attendees_${new Date().toISOString().split('T')[0]}.xlsx`;
      const buffer = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    })().catch((error: any) => {
      console.error('Export failed:', error);
      alert(error.message || 'Failed to export attendees.');
    });
  };

  // --- GALLERY IMAGE UPLOAD ---
  const handleGalleryFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 6 * 1024 * 1024) {
      alert('File too large! Maximum size is 6MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF, or WEBP.');
      return;
    }

    setSelectedFile(file);
    setGalleryForm({...galleryForm, imageFile: file});
    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);
  };

  const clearPreview = () => {
    setSelectedFile(null);
    setUploadPreview(null);
    setGalleryForm({...galleryForm, imageFile: null});
  };

  const handleAdventureFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large! Maximum size is 10MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF, or WEBP.');
      return;
    }

    setSelectedFile(file);
    setAdventureForm({...adventureForm, imageFile: file});
    setUploadPreview(URL.createObjectURL(file));
  };

  const clearAdventurePreview = () => {
    setSelectedFile(null);
    setUploadPreview(null);
    setAdventureForm({...adventureForm, imageFile: null});
  };

  // Gallery Save
  const handleGallerySave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!galleryForm.url && !galleryForm.imageFile) {
      alert('Please provide either an Image URL or select a file to upload.');
      return;
    }

    setUploading(true);

    try {
      let imageUrl = galleryForm.url;

      if (galleryForm.imageFile) {
        const reader = new FileReader();
        const result = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(galleryForm.imageFile!);
        });
        imageUrl = result;
      }

      const newImage = {
        id: galleryForm.id || `g_${Date.now()}`,
        url: imageUrl,
        caption: galleryForm.caption,
        description: galleryForm.description,
        category: galleryForm.category
      };

      await api.saveAdminGallery(newImage);

      setGalleryForm({ id: '', url: '', caption: '', description: '', category: CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY, imageFile: null });
      setSelectedFile(null);
      setUploadPreview(null);

      loadedTabsRef.current.gallery = false;
      loadAllAdminData(true, 'gallery');
      onRefreshCore();
      alert('Image uploaded successfully!');
    } catch (error) {
      if (shouldDelegateAuthFailure(error)) return;
      console.error('Error saving image:', error);
      alert('Failed to save image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleAdventureSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!adventureForm.title.trim() || !adventureForm.description.trim()) {
      alert('Please provide an activity title and description.');
      return;
    }

    setUploading(true);

    try {
      let imageUrl = adventureForm.imageUrl.trim();
      if (adventureForm.imageFile) {
        const uploaded = await api.uploadAdventureImage(adventureForm.imageFile);
        imageUrl = uploaded.imageUrl;
      }

      await api.saveAdminAdventure({
        id: adventureForm.id || `adv_${Date.now()}`,
        title: adventureForm.title,
        description: adventureForm.description,
        imageUrl
      });

      setAdventureForm({ id: '', title: '', description: '', imageUrl: '', imageFile: null });
      setSelectedFile(null);
      setUploadPreview(null);
      loadedTabsRef.current.adventures = false;
      loadAllAdminData(true, 'adventures');
      onRefreshCore();
      alert('Activity saved successfully.');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      alert(error.message || 'Failed to save activity.');
    } finally {
      setUploading(false);
    }
  };

  // --- IMAGE UPLOAD HANDLERS ---

  const handleSponsorLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 6 * 1024 * 1024) {
      alert('File too large! Maximum size is 6MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF, or WEBP.');
      return;
    }

    setUploading(true);
    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);

    try {
      const result = await api.uploadSponsorLogo(sponsorForm.id, file);
      setSponsorForm({ ...sponsorForm, logoUrl: result.imageUrl });
      alert('Logo uploaded successfully!');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      console.error('Upload error:', error);
      alert(error.message || 'Upload failed. Please try again.');
      setUploadPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleSpeakerPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 6 * 1024 * 1024) {
      alert('File too large! Maximum size is 6MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Please upload JPEG, PNG, GIF, or WEBP.');
      return;
    }

    setUploading(true);
    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);

    try {
      const result = await api.uploadSpeakerPhoto(speakerForm.id, file);
      setSpeakerForm({ ...speakerForm, photoUrl: result.imageUrl });
      alert('Photo uploaded successfully!');
    } catch (error: any) {
      if (shouldDelegateAuthFailure(error)) return;
      console.error('Upload error:', error);
      alert(error.message || 'Upload failed. Please try again.');
      setUploadPreview(null);
    } finally {
      setUploading(false);
    }
  };

  // --- REPORT EXPORTS ---
  const exportToCSV = () => {
    if (feedback.length === 0) return alert('No feedback records to export.');

    const headers = ['FeedbackID', 'Attendee', 'Email', 'OverallRating', 'BestSession', 'BestSpeaker', 'Improvements', 'AttendAgain', 'DateAdded'];
    const rows = feedback.map(item => [
      item.id,
      item.userName,
      item.userEmail,
      item.rating,
      `"${item.bestSession.replace(/"/g, '""')}"`,
      `"${item.bestFacilitator.replace(/"/g, '""')}"`,
      `"${(item.improvements || '').replace(/"/g, '""')}"`,
      item.attendAgain ? 'Yes' : 'No',
      item.submittedAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
        + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MAZ_Kariba_2026_Feedback_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (feedback.length === 0) return alert('No feedback records to export.');
    const jsonStr = JSON.stringify(feedback, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `MAZ_Kariba_2026_Feedback_Report_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- ACTIONS ---

  const handleUserToggle = async (userId: string) => {
    try {
      await api.toggleAdminUserStatus(userId);
      loadUsers(userFilters);
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message || 'Error toggling attendee status.');
    }
  };

  const handleUserDelete = async (id: string) => {
    if (!window.confirm('Delete attendee permanently?')) return;
    try {
      await api.deleteAdminUser(id);
      loadUsers(userFilters);
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message || 'Error deleting user');
    }
  };

  const handleUserSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingUser) return;

    setIsSavingUser(true);
    try {
      const result = await api.saveAdminUser(userForm);
      setUserForm({
        id: '', email: '', firstName: '', lastName: '', role: 'attendee',
        organization: '', position: '',
        accommodationProvided: false, roomNumber: '', transportProvided: false,
        class: 'A'
      });
      loadUsers(userFilters);
      const qrMessage = result.qrCode?.saved
          ? ` QR file saved: ${result.qrCode.filename}.`
          : result.qrCode?.reason
              ? ` QR file: ${result.qrCode.reason}`
              : '';
      alert(`Attendee successfully created/updated.${qrMessage}`);
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message || 'Error saving user');
    } finally {
      setIsSavingUser(false);
    }
  };

  const downloadAttendeeQRCodes = async () => {
    try {
      const blob = await api.downloadAdminAttendeeQRCodes();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'attendee-qrcodes.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message || 'Failed to download attendee QR codes.');
    }
  };

  const handleSpeakerSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveAdminSpeaker(speakerForm);
      setSpeakerForm({ id: '', name: '', position: '', organization: '', topic: '', speakingTime: '', bio: '', photoUrl: '' });
      loadedTabsRef.current.speakers = false;
      loadAllAdminData(true, 'speakers');
      alert('Speaker successfully updated.');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message || 'Error saving speaker info');
    }
  };

  const handleSpeakerDelete = async (id: string) => {
    if (!window.confirm('Delete speaker permanently?')) return;
    try {
      await api.deleteAdminSpeaker(id);
      loadedTabsRef.current.speakers = false;
      loadAllAdminData(true, 'speakers');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleSessionSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveAdminSession(sessionForm);
      setSessionForm({ id: '', category: 'Class B', day: 1, dayLabel: 'Day 1 · Monday 19 October 2026', time: '', topic: '', facilitator: '', venue: '', type: 'session' });
      loadedTabsRef.current.programme = false;
      loadAllAdminData(true, 'programme');
      alert('Session timeline scheduled.');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleSessionDelete = async (id: string) => {
    if (!window.confirm('Clear session permanently?')) return;
    try {
      await api.deleteAdminSession(id);
      loadedTabsRef.current.programme = false;
      loadAllAdminData(true, 'programme');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleSponsorSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveAdminSponsor(sponsorForm);
      setSponsorForm({ id: '', name: '', logoUrl: '🏢', description: '', website: '', durationLabel: '2026', tier: 'Dinner' });
      loadedTabsRef.current.sponsors = false;
      loadAllAdminData(true, 'sponsors');
      onRefreshCore();
      alert('Loyal sponsor added.');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleSponsorDelete = async (id: string) => {
    if (!window.confirm('Delete sponsor?')) return;
    try {
      await api.deleteAdminSponsor(id);
      loadedTabsRef.current.sponsors = false;
      loadAllAdminData(true, 'sponsors');
      onRefreshCore();
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleTestimonialSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.saveAdminTestimonial(testimonialForm);
      setTestimonialForm({ id: '', name: '', company: '', position: '', text: '', photoUrl: 'T' });
      loadedTabsRef.current.testimonials = false;
      loadAllAdminData(true, 'testimonials');
      onRefreshCore();
      alert('Testimonial added.');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleTestimonialDelete = async (id: string) => {
    if (!window.confirm('Delete attendee quote?')) return;
    try {
      await api.deleteAdminTestimonial(id);
      loadedTabsRef.current.testimonials = false;
      loadAllAdminData(true, 'testimonials');
      onRefreshCore();
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleGalleryDelete = async (id: string) => {
    if (!window.confirm('Confirm deletion of photos item?')) return;
    try {
      await api.deleteAdminGallery(id);
      loadedTabsRef.current.gallery = false;
      loadAllAdminData(true, 'gallery');
      onRefreshCore();
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleAdventureDelete = async (id: string) => {
    if (!window.confirm('Delete this activity?')) return;
    try {
      await api.deleteAdminAdventure(id);
      loadedTabsRef.current.adventures = false;
      loadAllAdminData(true, 'adventures');
      onRefreshCore();
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const handleDriveLinkSave = async () => {
    try {
      await api.saveAdminGoogleDriveLink(driveLink);
      onRefreshCore();
      alert('Live Photo Gallery Link successfully saved!');
    } catch (e: any) {
      if (shouldDelegateAuthFailure(e)) return;
      alert(e.message);
    }
  };

  const getSponsorCategoryIcon = (category: string) => {
    if (category === 'Technology Partner') return <Zap className="h-3 w-3 text-blue-500" />;
    if (category === 'Exhibitor') return <Building2 className="h-3 w-3 text-emerald-600" />;
    if (category === 'Dinner') return <Award className="h-3 w-3 text-amber-500" />;
    if (category === 'Giveaways') return <Package className="h-3 w-3 text-purple-500" />;
    if (category === 'Session') return <MessageSquare className="h-3 w-3 text-[#8B6914]" />;
    return <Award className="h-3 w-3 text-gray-500" />;
  };

  const getActivityDisplay = (activityId?: string) => {
    if (!activityId) return 'Not selected';
    const activityMap: { [key: string]: string } = {
      'sunset_cruise': 'Sunset Cruise',
      'game_drive': 'Game Safari',
      'quad_biking': 'Quad Biking'
    };
    return activityMap[activityId] || activityId;
  };

  const getActivityIcon = (activityId?: string) => {
    if (!activityId) return null;
    const iconMap: { [key: string]: React.ReactElement } = {
      'sunset_cruise': <Ship className="h-3 w-3" />,
      'game_drive': <PawPrint className="h-3 w-3" />,
      'quad_biking': <Bike className="h-3 w-3" />
    };
    return iconMap[activityId] || null;
  };

  const selectedAttendanceSession = attendanceSessions.find(session => session.id === attendanceSessionId);
  const expectedAttendanceCount = usersTotal;
  const attendancePresentCount = attendanceRecords.length;
  const attendanceMissingCount = Math.max(expectedAttendanceCount - attendancePresentCount, 0);
  const selectedQASession = sessions.find(session => session.id === qaSessionId);
  const selectedQAQuestion = qaQuestions.find(question => question.id === selectedQAQuestionId);
  const liveQAQuestion = globalLiveQAQuestion;
  const liveQAStartedAt = liveQAQuestion?.publishedAt || liveQAQuestion?.updatedAt;
  const liveQATime = liveQAStartedAt
    ? `${String(Math.floor(Math.max(qaClockNow - new Date(liveQAStartedAt).getTime(), 0) / 60000)).padStart(2, '0')}:${String(Math.floor((Math.max(qaClockNow - new Date(liveQAStartedAt).getTime(), 0) % 60000) / 1000)).padStart(2, '0')}`
    : '00:00';
  const candidateGroups: { category: ElectionCandidateCategory; label: string; icon: typeof Users }[] = [
    { category: 'employee_representative', label: 'Employee Representative', icon: UserIcon },
    { category: 'employer_cifoz', label: 'Employer Representative (CIFOZ)', icon: Users },
    { category: 'employer_zbca', label: 'Employer Representative (ZBCA)', icon: Users }
  ];
  const electionSubmittedCount = electionVoters.filter(voter => voter.hasVoted).length;
  const normalizedVotingMemberSearch = votingMemberSearch.trim().toLowerCase();
  const eligibleUserById = eligibleAttendees.reduce<Record<string, User>>((lookup, attendee) => {
    lookup[attendee.id] = attendee;
    return lookup;
  }, {});
  const filteredElectionVoters = normalizedVotingMemberSearch
    ? electionVoters.filter(voter => {
      const member = voter.user;
      return [
        member?.firstName,
        member?.lastName,
        member?.email,
        voter.identifier,
        member?.organization,
        member?.position,
        voter.hasVoted ? 'submitted' : 'not voted'
      ].join(' ').toLowerCase().includes(normalizedVotingMemberSearch);
    })
    : electionVoters;
  const filteredVotingMemberIds = filteredElectionVoters
    .filter(voter => eligibleUserById[voter.userId]?.role === 'member')
    .map(voter => voter.userId);
  const allVisibleVotingMembersSelected = filteredVotingMemberIds.length > 0
    && filteredVotingMemberIds.every(id => selectedVotingMemberIds.includes(id));
  const isElectionStartInFuture = Boolean(electionForm.startsAt && (parseElectionScheduleDate(electionForm.startsAt, electionForm.timezone)?.getTime() || 0) > Date.now());
  const publishElectionLabel = electionForm.scheduleMode === 'daily' ? 'Run Automatic Schedule' : isElectionStartInFuture ? 'Schedule Election' : 'Publish Election';
  return (
      <div className={`space-y-6 rounded-2xl border border-gray-200 bg-[#FAF8F5] shadow-xl sm:p-6 ${subTab === 'attendance' ? 'p-1.5' : 'p-3'}`}>

        {panelError && (
            <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-red-500">Protected Admin Load Failed</p>
                  <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" /> The admin panel could not load safely
                  </h3>
                  <p className="text-xs font-semibold leading-relaxed text-gray-500">{panelError}</p>
                </div>
                <button
                    onClick={() => subTab === 'users' ? void loadUsers(userFilters) : void loadAllAdminData(true, subTab)}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-[#FFD700] transition-all hover:bg-black"
                >
                  <RefreshCcw className="h-4 w-4" /> Retry load
                </button>
              </div>
            </div>
        )}

        {isTabLoading && !panelError && (
            <div className="rounded-2xl border border-amber-100 bg-white px-5 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8B6914]">Loading protected admin data…</p>
            </div>
        )}

        {/* SUB TAB VIEW CONTROLLER */}

        {subTab === 'attendance' && (
            <div className="-mx-1 space-y-4 animate-fadeIn sm:mx-0 sm:space-y-5">
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl sm:rounded-2xl">
                <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
                  <div className="bg-gradient-to-b from-white to-[#FAF8F5] p-2.5 text-gray-900 sm:p-6">
                    <div className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm sm:rounded-2xl sm:p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1A1A1A] text-[#FFD700] shadow-sm">
                            <ScanLine className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.26em] text-[#8B6914]">Live QR Scanner</p>
                            {/*<h3 className="mt-1 text-base font-black tracking-tight text-gray-950 sm:text-lg">*/}
                            {/*  Live QR Scanner*/}
                            {/*</h3>*/}
                            <p className="mt-1 max-w-xl text-[11px] font-semibold leading-relaxed text-gray-500">
                              Select a session, activate the camera, and scan attendee QR badges.
                            </p>
                          </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => loadAttendanceRecords(attendanceSessionId)}
                            disabled={!attendanceSessionId}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" /> Refresh
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:mt-4 sm:rounded-2xl sm:p-4">
                      <label className="block">
                        <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-gray-500">Active Session</span>
                        <select
                            value={attendanceSessionId}
                            onChange={(event) => {
                              setAttendanceSessionId(event.target.value);
                              setAttendanceScanResult(null);
                            }}
                            className="w-full rounded-xl border border-gray-300 bg-[#FAF8F5] px-3 py-3 text-[11px] font-bold text-gray-900 shadow-sm focus:border-[#B8922A] focus:outline-none"
                        >
                          {attendanceSessions.length === 0 && <option value="">No sessions available</option>}
                          {attendanceSessions.map(session => (
                              <option key={session.id} value={session.id}>
                                {session.topic} · {session.time}
                              </option>
                          ))}
                        </select>
                      </label>

                      {selectedAttendanceSession && (
                          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#8B6914]">Now Marking</p>
                            <p className="mt-1 text-xs font-black text-gray-950">{selectedAttendanceSession.topic}</p>
                            <p className="mt-1 text-[11px] font-semibold text-gray-600">
                              {selectedAttendanceSession.dayLabel} · {selectedAttendanceSession.time} · {selectedAttendanceSession.venue || 'Venue TBA'}
                            </p>
                          </div>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-gray-900 shadow-md shadow-amber-900/5 sm:mt-4 sm:rounded-2xl sm:p-4">
                      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-700">
                            <QrCode className="h-4 w-4 text-[#B8922A]" /> Camera Scanner
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-gray-500">Use the admin device camera to scan attendee QR badges.</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-[9px] font-black uppercase ${isCameraScannerActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isCameraScannerActive ? 'Scanning Active' : 'Scanner Idle'}
                        </span>
                      </div>

                      <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50 p-1.5 shadow-inner sm:rounded-2xl sm:p-2">
                        <div id="attendance-camera-scanner" className="attendance-scanner-frame aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#FAF8F5]" />
                        {!isCameraScannerActive && (
                            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border border-dashed border-[#D4B04C]/40 bg-white/75">
                              <div className="text-center">
                                <QrCode className="mx-auto h-8 w-8 text-[#B8922A]" />
                                <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-900">Camera Ready</p>
                                <p className="mt-1 text-[10px] font-semibold text-gray-500">Start scanner to begin attendance capture</p>
                              </div>
                            </div>
                        )}
                      </div>

                      {cameraScannerError && (
                          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{cameraScannerError}</p>
                      )}

                      {attendanceScanResult && (
                          <div className={`mt-4 rounded-xl border p-4 ${
                              attendanceScanResult.status === 'recorded'
                                  ? 'border-emerald-200 bg-emerald-50'
                                  : attendanceScanResult.status === 'duplicate'
                                      ? 'border-amber-200 bg-amber-50'
                                      : 'border-red-200 bg-red-50'
                          }`}>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{attendanceScanResult.status}</p>
                            <p className="mt-1 text-sm font-black text-gray-900">{attendanceScanResult.message}</p>
                            {attendanceScanResult.attendee && (
                                <p className="mt-1 text-xs font-semibold text-gray-600">
                                  {attendanceScanResult.attendee.organization || 'Organization not listed'} · {attendanceScanResult.attendee.class || 'Class N/A'}
                                </p>
                            )}
                          </div>
                      )}

                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                            type="button"
                            onClick={startCameraScanner}
                            disabled={isCameraScannerActive || !attendanceSessionId}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-[#FFD700] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                        >
                          <Camera className="h-4 w-4" /> Start Camera Scanner
                        </button>
                        <button
                            type="button"
                            onClick={stopCameraScanner}
                            disabled={!isCameraScannerActive}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Stop Scanner
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 bg-white p-4 sm:p-5 lg:border-l lg:border-t-0">
                  <div className="mb-5 grid grid-cols-3 gap-2 rounded-xl border border-gray-200 bg-[#FAF8F5] p-3">
                    <div className="rounded-lg bg-white px-3 py-3 text-center shadow-sm">
                      <p className="text-[9px] font-black uppercase text-gray-400">Present</p>
                      <p className="text-xl font-black text-emerald-600">{attendancePresentCount}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3 text-center shadow-sm">
                      <p className="text-[9px] font-black uppercase text-gray-400">Expected</p>
                      <p className="text-xl font-black text-gray-950">{expectedAttendanceCount}</p>
                    </div>
                    <div className="rounded-lg bg-white px-3 py-3 text-center shadow-sm">
                      <p className="text-[9px] font-black uppercase text-gray-400">Missing</p>
                      <p className="text-xl font-black text-[#B8922A]">{attendanceMissingCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#8B6914]">Session Register</p>
                      <h3 className="mt-1 text-sm font-black text-gray-950">Recent Attendance</h3>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase text-emerald-700">
                      {attendanceRecords.length} present
                    </span>
                  </div>

                  <div className="mt-4 max-h-[620px] overflow-y-auto pr-1">
                    {attendanceRecords.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
                          <QrCode className="mx-auto h-8 w-8 text-gray-300" />
                          <p className="mt-2 text-xs font-black text-gray-700">No scans yet</p>
                          <p className="mt-1 text-xs font-semibold text-gray-400">Scanned attendees will appear here immediately.</p>
                        </div>
                    ) : (
                        <div>
                          <div className="hidden overflow-hidden rounded-xl border border-gray-200 sm:block">
                            <table className="min-w-full divide-y divide-gray-100 text-left">
                              <thead className="bg-[#FAF8F5]">
                              <tr>
                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Attendee</th>
                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Class</th>
                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Time</th>
                                <th className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Status</th>
                              </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                              {attendanceRecords.map(record => (
                                  <tr key={record.id} className="transition hover:bg-amber-50/40">
                                    <td className="px-3 py-3">
                                      <p className="text-xs font-black text-gray-950">
                                        {record.attendee?.firstName} {record.attendee?.lastName}
                                      </p>
                                      <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
                                        {record.attendee?.organization || 'Organization not listed'}
                                      </p>
                                    </td>
                                    <td className="px-3 py-3 text-[11px] font-bold text-gray-600">
                                      {record.attendee?.class || 'N/A'}
                                    </td>
                                    <td className="px-3 py-3">
                                      <p className="text-[10px] font-bold text-gray-700">{new Date(record.scannedAt).toLocaleTimeString()}</p>
                                      <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">
                                        {record.scannedByUser ? `${record.scannedByUser.firstName} ${record.scannedByUser.lastName}` : 'Admin'}
                                      </p>
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">
                                        Present
                                      </span>
                                    </td>
                                  </tr>
                              ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="space-y-2 sm:hidden">
                            {attendanceRecords.map(record => (
                                <div key={record.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-black text-gray-950">
                                        {record.attendee?.firstName} {record.attendee?.lastName}
                                      </p>
                                      <p className="mt-0.5 text-[11px] font-semibold text-gray-500">
                                        {record.attendee?.organization || 'Organization not listed'} · {record.attendee?.class || 'Class N/A'}
                                      </p>
                                    </div>
                                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">
                                      Present
                                    </span>
                                  </div>
                                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                    {new Date(record.scannedAt).toLocaleString()} · By {record.scannedByUser ? `${record.scannedByUser.firstName} ${record.scannedByUser.lastName}` : 'Admin'}
                                  </p>
                                </div>
                            ))}
                          </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>
        )}

        {subTab === 'qa' && (
            <div className="animate-fadeIn rounded-sm border border-gray-200 bg-white p-4 shadow-xl">
              <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-gray-800">Programme / Session</span>
                  <select
                    value={qaSessionId}
                    onChange={(event) => {
                      setQaSessionId(event.target.value);
                      setSelectedQAQuestionId('');
                      setQaResponses([]);
                      resetQAForm();
                    }}
                    className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-xs font-medium text-gray-600 focus:border-[#B8922A] focus:outline-none"
                  >
                    <option value="">Select a programme / session</option>
                    {sessions.map(session => (
                      <option key={session.id} value={session.id}>
                        Day {session.day} · {session.time} · {session.topic}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 bg-white px-4 py-2">
                    <p className="text-xs font-semibold text-[#A88D55]">Current Live Question</p>
                  </div>
                  <div className="grid grid-cols-[74px_minmax(0,1fr)_90px_90px] items-center gap-3 px-4 py-3">
                    <span className={`inline-flex h-9 items-center justify-center rounded-md px-3 text-[11px] font-semibold uppercase text-white ${liveQAQuestion ? 'bg-[#168DE2]' : 'bg-gray-400'}`}>
                      {liveQAQuestion ? 'Live' : 'Idle'}
                    </span>
                    <div className="min-w-0 border-r border-gray-300 pr-3">
                      <p className="truncate text-xs font-semibold text-gray-900">{liveQAQuestion?.questionText || 'No question is currently live'}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500">{liveQAQuestion ? 'Attendees can submit responses now' : 'Publish a question to start the live Q&A'}</p>
                    </div>
                    <div className="border-r border-gray-300 text-center">
                      <p className="text-xl font-semibold text-black">{liveQAQuestion?.responseCount || 0}</p>
                      <p className="text-[10px] font-medium text-gray-500">Responses</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-semibold text-black">{liveQATime}</p>
                      <p className="text-[10px] font-medium text-gray-500">Time Live</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(430px,1.08fr)_minmax(430px,0.92fr)]">
                <form onSubmit={handleQASave} className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <div className="border-b border-gray-100 bg-white px-4 py-3">
                    <h3 className="text-base font-semibold text-[#A88D55]">Question Builder</h3>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="grid items-start gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <label className="pt-2 text-xs font-semibold text-gray-800">Question Title</label>
                      <div>
                        <input
                          maxLength={120}
                          value={qaForm.questionTitle}
                          onChange={(event) => setQaForm({ ...qaForm, questionTitle: event.target.value })}
                          placeholder="Enter question title"
                          className="h-10 w-full rounded-md border border-gray-300 px-3 text-xs font-medium focus:border-[#B8922A] focus:outline-none"
                        />
                        <p className="mt-1 text-right text-[11px] font-medium text-gray-400">{qaForm.questionTitle.length}/120</p>
                      </div>
                    </div>

                    <div className="grid items-center gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <p className="text-xs font-semibold text-gray-800">Question Type</p>
                      <div className="grid grid-cols-3 overflow-hidden rounded-md border border-gray-300 bg-gray-100">
                        {[
                          { value: 'short_answer', label: 'Short Answer', icon: MessageSquare },
                          { value: 'multiple_choice', label: 'Multiple Choice', icon: List },
                          { value: 'rating', label: 'Rating', icon: Star }
                        ].map(type => {
                          const Icon = type.icon;
                          const selected = qaForm.type === type.value || (type.value === 'multiple_choice' && qaForm.type === 'yes_no');
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => setQaForm({ ...qaForm, type: type.value as QAQuestionType })}
                              className={`flex h-9 items-center justify-center gap-1.5 text-[10px] font-semibold transition ${
                                selected ? 'bg-[#168DE2] text-white shadow-inner' : 'bg-gray-100 text-gray-800 hover:bg-white'
                              }`}
                            >
                              <Icon className="h-3.5 w-3.5" /> {type.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid items-start gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                      <label className="pt-2 text-xs font-semibold text-gray-800">Question Text</label>
                      <div>
                        <textarea
                          required
                          maxLength={300}
                          value={qaForm.questionText}
                          onChange={(event) => setQaForm({ ...qaForm, questionText: event.target.value })}
                          rows={4}
                          placeholder="Enter your question for attendees..."
                          className="w-full resize-none rounded-md border border-gray-300 p-3 text-xs font-medium focus:border-[#B8922A] focus:outline-none"
                        />
                        <p className="mt-1 text-right text-[11px] font-medium text-gray-400">{qaForm.questionText.length}/300</p>
                      </div>
                    </div>

                    {qaForm.type === 'multiple_choice' && (
                      <div className="grid items-start gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <p className="pt-2 text-xs font-semibold text-gray-800">Options (A, B, C, D)</p>
                        <div className="space-y-2">
                          {MULTIPLE_CHOICE_LABELS.map((label, index) => {
                            const options = qaForm.optionsText.split('\n');
                            return (
                              <div key={label} className="grid grid-cols-[42px_minmax(0,1fr)_34px] gap-2">
                                <span className="flex h-9 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-800">{label}</span>
                                <input
                                  value={options[index] || ''}
                                  onChange={(event) => {
                                    const nextOptions = [...options];
                                    nextOptions[index] = event.target.value;
                                    setQaForm({ ...qaForm, optionsText: nextOptions.slice(0, 4).join('\n') });
                                  }}
                                  placeholder={`Enter option ${label}`}
                                  className="h-9 rounded-md border border-gray-300 px-3 text-xs font-medium focus:border-[#B8922A] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOptions = [...options];
                                    nextOptions[index] = '';
                                    setQaForm({ ...qaForm, optionsText: nextOptions.slice(0, 4).join('\n') });
                                  }}
                                  className="flex h-9 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-[#168DE2] bg-white px-3 py-1.5 text-[10px] font-semibold text-[#168DE2]">
                            <PlusCircle className="h-3.5 w-3.5" /> Add Option
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-3 pt-2 sm:grid-cols-3">
                      <button type="submit" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-gray-200 text-[11px] font-semibold text-black hover:bg-gray-300">
                        <Save className="h-3.5 w-3.5" /> Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const result = await api.saveAdminQAQuestion({
                            id: qaForm.id || undefined,
                            sessionId: qaSessionId,
                            questionTitle: qaForm.questionTitle,
                            questionText: qaForm.questionText,
                            type: qaForm.type,
                            options: qaForm.optionsText.split('\n').map(option => option.trim()).filter(Boolean),
                            order: qaForm.id ? qaQuestions.find(question => question.id === qaForm.id)?.order : qaQuestions.length + 1
                          });
                          await publishQAQuestion(result.question.id);
                          resetQAForm();
                        }}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[#168DE2] text-[11px] font-semibold text-white hover:bg-[#0878C5]"
                      >
                        <Play className="h-3.5 w-3.5 fill-white" /> Publish Live
                      </button>
                      <button
                        type="button"
                        onClick={() => liveQAQuestion && closeQAQuestion(liveQAQuestion.id)}
                        disabled={!liveQAQuestion}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-red-600 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                      >
                        <Square className="h-3.5 w-3.5 fill-white" /> Close Question
                      </button>
                    </div>
                  </div>
                </form>

                <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
                  <div className="flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
                    <h3 className="text-base font-semibold text-[#A88D55]">Session Question Queue</h3>
                    <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#A88D55]">
                      <GripVertical className="h-4 w-4" /> Drag to reorder
                    </span>
                  </div>

                  <div className="overflow-x-auto p-3">
                    <table className="w-full min-w-[620px] border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-gray-100 text-[10px] font-semibold text-gray-700">
                          <th className="w-10 px-2 py-3">#</th>
                          <th className="px-2 py-3">Question</th>
                          <th className="w-24 px-2 py-3 text-center">Type</th>
                          <th className="w-24 px-2 py-3 text-center">Status</th>
                          <th className="w-32 px-2 py-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qaQuestions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-10 text-center text-xs font-medium text-gray-400">
                              No questions yet. Create the first question from the builder.
                            </td>
                          </tr>
                        ) : qaQuestions.map((question, index) => (
                          <tr key={question.id} className={`${selectedQAQuestionId === question.id ? 'bg-amber-50' : index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-b border-gray-100`}>
                            <td className="px-2 py-3">
                              <div className="flex items-center gap-2">
                                <GripVertical className="h-4 w-4 text-gray-400" />
                                <span className="font-semibold">{index + 1}</span>
                              </div>
                            </td>
                            <td className="px-2 py-3">
                              <button type="button" onClick={() => setSelectedQAQuestionId(question.id)} className="line-clamp-2 max-w-[260px] text-left text-[11px] font-medium leading-tight text-gray-900">
                                {question.questionText}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-center">
                              {question.type === 'multiple_choice' ? <List className="mx-auto h-5 w-5 text-black" /> : question.type === 'rating' ? <Star className="mx-auto h-5 w-5 text-black" /> : <MessageSquare className="mx-auto h-5 w-5 text-black" />}
                            </td>
                            <td className="px-2 py-3 text-center">
                              <span className={`inline-flex min-w-16 justify-center rounded-full px-3 py-1 text-[10px] font-semibold capitalize ${
                                question.status === 'live'
                                  ? 'bg-[#168DE2] text-white'
                                  : question.status === 'closed'
                                    ? 'bg-red-100 text-red-600'
                                    : index === 1
                                      ? 'bg-[#F9D65C] text-[#4A3100]'
                                      : 'bg-gray-200 text-gray-600'
                              }`}>
                                {question.status === 'draft' && index === 1 ? 'Next' : question.status}
                              </span>
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex items-center justify-center gap-2">
                                <button type="button" onClick={() => editQAQuestion(question)} className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-700 hover:bg-gray-50">
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => window.open(`/admin/qa-results/${question.id}`, '_blank', 'noopener,noreferrer')} className="rounded-md border border-gray-200 bg-white p-1.5 text-gray-700 hover:bg-gray-50">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button type="button" onClick={() => deleteQAQuestion(question.id)} className="rounded-md p-1.5 text-red-500 hover:bg-red-50">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
        )}

        {subTab === 'voting' && (
            <div className="animate-fadeIn space-y-4">
              <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#B8922A]">Election Control Room</p>
                  <h3 className="mt-1 text-[16px] font-semibold text-slate-90 ">Board Members Election 2026</h3>
                  <p className="mt-1 text-xs font-medium text-slate-500">Manage the election setup, candidates and eligible voters.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-4 xl:min-w-[620px]">
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
                    <FileText className="h-5 w-5 text-[#B07A12]" />
                    <div>
                      <p className="text-[10px] font-medium text-slate-500">Status</p>
                      <p className="text-base font-semibold capitalize text-slate-950">{election?.status || 'draft'}</p>
                      {election?.scheduleMode === 'daily' && <p className="text-[10px] font-medium text-slate-600">{election.controlStatus === 'scheduled' ? 'Automatic' : election.controlStatus === 'open' || election.controlStatus === 'closed' ? 'Manual override' : 'Not published'}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3">
                    <Users className="h-5 w-5 text-sky-700" />
                    <div>
                      <p className="text-[10px] font-medium text-slate-500">Voters</p>
                      <p className="text-base font-semibold text-slate-950">{electionVoters.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                    <CheckCircle className="h-5 w-5 text-emerald-700" />
                    <div>
                      <p className="text-[10px] font-medium text-slate-500">Submitted</p>
                      <p className="text-base font-semibold text-slate-950">{electionSubmittedCount}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/admin/election-results'; }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-[11px] font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                  >
                    <BarChart3 className="h-4 w-4" /> View Results
                  </button>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(330px,0.95fr)_minmax(0,1.05fr)]">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-4">
                    <FileText className="h-5 w-5 text-[#B07A12]" />
                    <h4 className="text-sm font-semibold text-slate-950">Election Details</h4>
                  </div>

                  {isElectionDetailsEditing ? (
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Election Title</span>
                        <input
                          value={electionForm.title}
                          onChange={(event) => setElectionForm({ ...electionForm, title: event.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none"
                          placeholder="Election title"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Board Seats</span>
                        <p className="text-sm font-medium text-slate-900">3: Employee, CIFOZ Employer, ZBCA Employer</p>
                      </label>
                      <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-[#B07A12]" />
                          <div>
                            <p className="text-sm font-semibold text-slate-950">Election Schedule</p>
                            <p className="text-[11px] font-medium text-slate-500">Set when voting will automatically open and close.</p>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="min-w-0 rounded-xl border border-amber-200 bg-white p-3">
                            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><Clock className="h-4 w-4" /> Voting Opens</p>
                            <input type="datetime-local" aria-label="Voting opens" value={toDateTimeLocalValue(electionForm.startsAt, electionForm.timezone)}
                              onChange={event => setElectionForm({ ...electionForm, startsAt: fromDateTimeLocalValue(event.target.value) })}
                              className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-[#B8922A] focus:outline-none" />
                          </div>
                          <div className="min-w-0 rounded-xl border border-amber-200 bg-white p-3">
                            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600"><Clock className="h-4 w-4" /> Voting Closes</p>
                            <input type="datetime-local" aria-label="Voting closes" value={toDateTimeLocalValue(electionForm.endsAt, electionForm.timezone)}
                              onChange={event => setElectionForm({ ...electionForm, endsAt: fromDateTimeLocalValue(event.target.value) })}
                              className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-[#B8922A] focus:outline-none" />
                          </div>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-700">
                          <input type="checkbox" checked={electionForm.scheduleMode === 'daily'} onChange={event => setElectionForm({ ...electionForm, scheduleMode: event.target.checked ? 'daily' : 'continuous' })} className="accent-[#B07A12]" />
                          Repeat daily between selected dates
                        </label>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-[11px] font-semibold text-slate-500">Timezone</span>
                          <input
                            value={electionForm.timezone}
                            onChange={(event) => setElectionForm({ ...electionForm, timezone: event.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none"
                            placeholder={DEFAULT_ELECTION_TIMEZONE}
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-500">Description</span>
                        <textarea
                          value={electionForm.description}
                          onChange={(event) => setElectionForm({ ...electionForm, description: event.target.value })}
                          rows={3}
                          className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none"
                          placeholder="Short description for voters"
                        />
                      </label>
                      <div className="flex gap-2 pt-1">
                        <button type="button" onClick={async () => { if (await saveElection()) setIsElectionDetailsEditing(false); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B07A12] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#94640f]">
                          <Save className="h-4 w-4" /> Save Details
                        </button>
                        <button type="button" onClick={() => {
                          setIsElectionDetailsEditing(false);
                          if (election) setElectionForm({
                            id: election.id, title: election.title, description: election.description,
                            boardSeats: election.boardSeats, startsAt: election.startsAt || '', endsAt: election.endsAt || '',
                            timezone: election.timezone || DEFAULT_ELECTION_TIMEZONE,
                            scheduleMode: election.scheduleMode || 'continuous'
                          });
                        }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="border-b border-slate-100 pb-3">
                        <p className="text-[11px] font-semibold text-slate-500">Election Title</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">{electionForm.title || 'Board Members Election 2026'}</p>
                      </div>
                      <div className="border-b border-slate-100 pb-3">
                        <p className="text-[11px] font-semibold text-slate-500">Board Seats</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">3</p>
                      </div>
                      <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                        <div className="mb-3 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-[#B07A12]" />
                          <p className="text-sm font-semibold text-slate-950">Election Schedule</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-amber-200 bg-white p-3">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Clock className="h-3.5 w-3.5" /> Voting Opens</p>
                            <p className="mt-1 text-sm font-semibold text-slate-950">{formatElectionSchedule(electionForm.startsAt, electionForm.timezone)}</p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white p-3">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Clock className="h-3.5 w-3.5" /> Voting Closes</p>
                            <p className="mt-1 text-sm font-semibold text-slate-950">{formatElectionSchedule(electionForm.endsAt, electionForm.timezone)}</p>
                          </div>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600">
                          <input type="checkbox" checked={electionForm.scheduleMode === 'daily'} disabled readOnly className="accent-[#B07A12]" />
                          Repeat daily between selected dates
                        </label>
                        <div className="mt-3 rounded-md bg-white p-3 ring-1 ring-amber-100">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Globe className="h-3.5 w-3.5" /> Timezone</p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">{electionForm.timezone || DEFAULT_ELECTION_TIMEZONE}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500">Description</p>
                        <p className="mt-1 text-sm font-medium text-slate-500">{electionForm.description || '—'}</p>
                      </div>
                      <button type="button" onClick={() => setIsElectionDetailsEditing(true)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                        <Edit className="h-4 w-4" /> Edit Details
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-slate-900" />
                        <h4 className="text-sm font-semibold text-slate-950">Candidate Register</h4>
                      </div>
                      <p className="mt-1 text-xs font-semibold text-slate-600">{electionCandidates.filter(candidate => candidateGroups.some(group => group.category === candidate.category)).length} candidates loaded</p>
                    </div>
                    <button type="button" onClick={openNewCandidateModal} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B07A12] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#94640f]">
                      <PlusCircle className="h-4 w-4" /> Add Candidate
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ...candidateGroups.map(group => ({ label: group.label, items: electionCandidates.filter(candidate => candidate.category === group.category), icon: group.icon }))
                    ].map(group => {
                      const GroupIcon = group.icon;
                      return (
                        <div key={group.label} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GroupIcon className="h-4 w-4 text-slate-800" />
                              <p className="text-xs font-semibold text-slate-900">{group.label}</p>
                            </div>
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{group.items.length}</span>
                          </div>
                          <div className="min-h-24 space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
                            {group.items.length === 0 ? (
                              <p className="flex h-16 items-center justify-center text-center text-xs font-medium text-slate-400">No candidates yet.</p>
                            ) : group.items.map(candidate => (
                              <div key={candidate.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-950">{candidate.fullName}</p>
                                  <p className="truncate text-[11px] font-medium text-slate-500">{candidate.position || candidate.organization || 'Candidate'}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <button type="button" onClick={() => editElectionCandidate(candidate)} className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50" aria-label={`Edit ${candidate.fullName}`}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </button>
                                  <button type="button" onClick={() => deleteElectionCandidate(candidate.id)} className="rounded-md border border-red-100 p-1.5 text-red-500 hover:bg-red-50" aria-label={`Delete ${candidate.fullName}`}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-[#B07A12]" />
                    <h4 className="text-sm font-semibold text-slate-950">Eligible Voters</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={downloadElectionVoterTemplate} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                      <Download className="h-4 w-4" /> Download Template
                    </button>
                    <button type="button" onClick={() => setSubTab('voting-members')} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
                      <List className="h-4 w-4" /> View Full Register
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B07A12] text-white">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#6F4B0A]">Bulk Upload Only</p>
                    <p className="text-xs font-medium text-slate-600">No manual voter entry. Upload the Excel/CSV register so eligible voters can sign in with their identifiers.</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-700">
                        <CloudUpload className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-950">Import Voter File</p>
                        <p className="mt-1 text-xs font-medium text-slate-500">Upload an Excel or CSV file with eligible voters.</p>
                        <label className="mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-800">
                          <Upload className="h-4 w-4" /> {uploading ? 'Importing...' : 'Import Voter File'}
                          <input type="file" accept=".xlsx,.csv" onChange={handleElectionVoterBulkUpload} disabled={uploading} className="hidden" />
                        </label>
                        <p className="mt-2 text-[11px] font-medium text-slate-400">Supported formats: .xlsx, .csv</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4" aria-live="polite">
                    <div className="mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-slate-800" />
                      <h5 className="text-sm font-semibold text-slate-950">Upload Status</h5>
                    </div>
                    {uploading ? (
                      <p className="text-xs font-semibold text-slate-600">Importing voter rows...</p>
                    ) : voterImportSummary ? (
                      <div className="space-y-2 text-xs font-medium text-slate-600">
                        <p className={`font-bold ${voterImportSummary.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {voterImportSummary.status === 'success' ? 'Import complete' : voterImportSummary.status === 'partial' ? 'Partially imported' : 'Import failed'}
                        </p>
                        <p>{voterImportSummary.total} rows read · <span className="font-bold text-slate-950">{voterImportSummary.added} new voters added</span> · {voterImportSummary.updated} existing voters updated</p>
                        {voterImportSummary.created > 0 && <p>{voterImportSummary.created} member profiles created</p>}
                        {voterImportSummary.error && <p className="font-semibold text-red-700" role="alert">{voterImportSummary.error}</p>}
                        {voterImportSummary.issues.length > 0 && (
                          <div className="text-red-700">
                            <p className="font-bold">{voterImportSummary.issues.length} row errors:</p>
                            <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-y-auto pl-4">
                              {voterImportSummary.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-white">—</span>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">No file imported yet.</p>
                          <p className="mt-1 text-xs font-medium text-slate-500">Upload an Excel/CSV file to add eligible voters.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={() => void saveElection()} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                      <Save className="h-4 w-4" /> {election ? 'Save Configuration' : 'Save Draft'}
                    </button>
                    <button type="button" onClick={() => window.open('/', '_blank', 'noopener,noreferrer')} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                      <Eye className="h-4 w-4" /> Preview Ballot
                    </button>
                    <button type="button" onClick={publishElection} className="inline-flex items-center justify-center gap-2 rounded-md bg-[#B07A12] px-5 py-2 text-xs font-medium text-white shadow-sm hover:bg-[#94640f]">
                      <Send className="h-4 w-4" /> {publishElectionLabel}
                    </button>
                    {election?.scheduleMode === 'daily' && <button type="button" onClick={() => void updateElectionStatus('open')} className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                      <Play className="h-4 w-4" /> Open Now (manual)
                    </button>}
                    <button type="button" onClick={closeElectionWithConfirmation} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-5 py-2 text-xs font-medium text-red-600 shadow-sm hover:bg-red-100">
                      <Square className="h-4 w-4" /> {electionForm.scheduleMode === 'daily' ? 'Close Now (manual)' : 'Close Election'}
                    </button>
              </div>
              {electionForm.scheduleMode === 'daily' && <p className="text-right text-xs text-slate-500">Manual opening or closing stays in effect until you run the automatic schedule again.</p>}

              {isCandidateModalOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10 backdrop-blur-sm">
                  <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-2xl">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-base font-semibold text-slate-950">{candidateForm.id ? 'Edit Candidate' : 'Add Candidate'}</h4>
                      <button type="button" onClick={() => { setIsCandidateModalOpen(false); resetCandidateForm(); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close candidate form">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800">Candidate Details</div>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Position</span>
                        <select
                          value={candidateForm.category}
                          onChange={(event) => setCandidateForm({ ...candidateForm, category: event.target.value as ElectionCandidateCategory })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none"
                        >
                          <option value="employee_representative">Employee Representative</option>
                          <option value="employer_cifoz">Employer Representative (CIFOZ)</option>
                          <option value="employer_zbca">Employer Representative (ZBCA)</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Candidate full name</span>
                        <input value={candidateForm.fullName} onChange={(event) => setCandidateForm({ ...candidateForm, fullName: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none" placeholder="Enter candidate full name" />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Organization</span>
                          <input value={candidateForm.organization} onChange={(event) => setCandidateForm({ ...candidateForm, organization: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none" placeholder="Enter organization" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Current position</span>
                          <input value={candidateForm.position} onChange={(event) => setCandidateForm({ ...candidateForm, position: event.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none" placeholder="Enter current position" />
                        </label>
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-semibold text-slate-600">Upload photo</p>
                        <label className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 transition hover:border-[#B07A12] hover:bg-amber-50/40 ${uploading ? 'pointer-events-none opacity-70' : ''}`}>
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 text-slate-700">
                            {candidateForm.photoUrl ? <img src={candidateForm.photoUrl} alt="Candidate preview" className="h-full w-full object-cover" /> : <UserIcon className="h-6 w-6" />}
                          </div>
                          <div>
                            <span className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                              <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading...' : 'Choose photo'}
                            </span>
                            <p className="mt-1 text-[11px] font-medium text-slate-500">JPG, PNG, GIF or WEBP up to 6MB.</p>
                          </div>
                          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleCandidatePhotoUpload} disabled={uploading} className="hidden" />
                        </label>
                      </div>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-600">Profile / full manifesto</span>
                        <textarea value={candidateForm.bio} onChange={(event) => setCandidateForm({ ...candidateForm, bio: event.target.value })} rows={8} className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-900 focus:border-[#B8922A] focus:outline-none" placeholder="Enter the candidate's full profile or manifesto" />
                        <span className="mt-1 block text-right text-[11px] font-semibold text-slate-400">{candidateForm.bio.length} characters</span>
                      </label>
                      <div className="grid gap-2 pt-1 sm:grid-cols-2">
                        <button type="button" onClick={() => { setIsCandidateModalOpen(false); resetCandidateForm(); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50">Cancel</button>
                        <button type="button" onClick={saveElectionCandidate} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#B07A12] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#94640f]">
                          <Save className="h-4 w-4" /> Save Candidate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
        )}

        {subTab === 'voting-members' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
                <div className="border-b border-slate-200 bg-gradient-to-br from-white via-violet-50 to-amber-50 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => setSubTab('voting')}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50"
                        aria-label="Back to voting setup"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8B6914]">Voting Register</p>
                        <h3 className="mt-1 text-lg font-black text-gray-950">Approved Voting Members</h3>
                        <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-gray-500">
                          Full list of members who can vote in {election?.title || 'the active election'}.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:min-w-[430px]">
                      <div className="rounded-xl border border-violet-100 bg-white/85 p-3 text-center shadow-sm">
                        <p className="text-[9px] font-black uppercase text-violet-700">Approved</p>
                        <p className="mt-1 text-sm font-black text-gray-950">{electionVoters.length}</p>
                      </div>
                      <div className="rounded-xl border border-emerald-100 bg-white/85 p-3 text-center shadow-sm">
                        <p className="text-[9px] font-black uppercase text-emerald-700">Submitted</p>
                        <p className="mt-1 text-sm font-black text-gray-950">{electionSubmittedCount}</p>
                      </div>
                      <div className="rounded-xl border border-amber-100 bg-white/85 p-3 text-center shadow-sm">
                        <p className="text-[9px] font-black uppercase text-[#8B6914]">Pending</p>
                        <p className="mt-1 text-sm font-black text-gray-950">{Math.max(electionVoters.length - electionSubmittedCount, 0)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="relative w-full xl:max-w-xl">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={votingMemberSearch}
                        onChange={(event) => setVotingMemberSearch(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-3 text-xs font-semibold text-gray-700 shadow-sm focus:border-[#B8922A] focus:outline-none focus:ring-4 focus:ring-amber-100"
                        placeholder="Search by name, identifier, company or status"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      <button type="button" onClick={() => setIsAddMemberModalOpen(true)} disabled={!election}
                        title={!election ? 'Create and save an election first' : undefined}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#B07A12] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-[#94640f] disabled:cursor-not-allowed disabled:opacity-50">
                        <UserPlus className="h-4 w-4" /> Add Member
                      </button>
                      {selectedVotingMemberIds.length > 0 && (
                        <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-1.5">
                          <span className="px-2 text-[10px] font-black uppercase tracking-widest text-red-700">
                            {selectedVotingMemberIds.length} selected
                          </span>
                          <button
                            type="button"
                            onClick={() => void bulkDeleteVotingMembers()}
                            disabled={isDeletingVotingMembers}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" /> Delete
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void refreshVotingRegister()}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-600 shadow-sm hover:bg-gray-50"
                      >
                        <RefreshCcw className="h-4 w-4" /> Refresh
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubTab('voting')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-sm hover:bg-black"
                      >
                        <Vote className="h-4 w-4" /> Voting setup
                      </button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="hidden grid-cols-[44px_1.1fr_0.85fr_0.9fr_1fr_1.2fr_96px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500 lg:grid">
                      <label className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={allVisibleVotingMembersSelected}
                          disabled={filteredVotingMemberIds.length === 0}
                          onChange={(event) => {
                            setSelectedVotingMemberIds(current => {
                              const next = new Set(current);
                              if (event.target.checked) {
                                filteredVotingMemberIds.forEach(id => next.add(id));
                              } else {
                                filteredVotingMemberIds.forEach(id => next.delete(id));
                              }
                              return Array.from(next);
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-[#B8922A] focus:ring-[#B8922A]"
                          aria-label="Select all visible voting members"
                        />
                      </label>
                      <span>Member / Employer Name</span>
                      <span>Identifier</span>
                      <span>Catetory Category</span>
                      <span>Employer / Employee Association</span>
                      <span>Eligibility to vote for</span>
                      <span>Actions</span>
                    </div>

                    {filteredElectionVoters.length === 0 ? (
                      <div className="p-8 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                          <Users className="h-5 w-5" />
                        </div>
                        <p className="mt-3 text-sm font-black text-gray-950">No voting members found</p>
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          {votingMemberSearch ? 'Try a different search term.' : 'Add members from the Voting setup page or import them from Excel.'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {filteredElectionVoters.map(voter => {
                          const member = voter.user;
                          const fullMember = eligibleUserById[voter.userId];
                          const canBulkDelete = fullMember?.role === 'member';
                          const memberName = `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Unknown member';
                          return (
                              <div key={voter.id} className="grid gap-3 px-4 py-4 text-xs lg:grid-cols-[44px_1.1fr_0.85fr_0.9fr_1fr_1.2fr_96px] lg:items-center">
                                <label className="flex items-center lg:justify-center">
                                  <input
                                    type="checkbox"
                                    checked={selectedVotingMemberIds.includes(voter.userId)}
                                    disabled={!canBulkDelete || isDeletingVotingMembers}
                                    onChange={(event) => {
                                      setSelectedVotingMemberIds(current => event.target.checked
                                        ? Array.from(new Set([...current, voter.userId]))
                                        : current.filter(id => id !== voter.userId)
                                      );
                                    }}
                                    className="h-4 w-4 rounded border-gray-300 text-[#B8922A] focus:ring-[#B8922A] disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={`Select ${memberName}`}
                                  />
                                </label>
                                <div className="min-w-0">
                                  <p className="mb-1 text-[10px] font-bold uppercase text-gray-400 lg:hidden">Member / Employer Name</p>
                                  <p className="truncate text-sm font-black text-gray-950">{memberName}</p>
                                </div>
                                <div className="min-w-0 font-semibold text-gray-600">
                                  <p className="mb-1 text-[10px] font-bold uppercase text-gray-400 lg:hidden">Identifier</p>
                                  <span className="truncate">{voter.identifier || 'Not assigned'}</span>
                                </div>
                                <div className="min-w-0 font-semibold text-gray-600">
                                  <p className="mb-1 text-[10px] font-bold uppercase text-gray-400 lg:hidden">Catetory Category</p>
                                  <span>{voter.memberCategory || 'Not listed'}</span>
                                </div>
                                <div className="min-w-0 font-semibold text-gray-600">
                                  <p className="mb-1 text-[10px] font-bold uppercase text-gray-400 lg:hidden">Employer / Employee Association</p>
                                  <span>{member?.organization || 'Not listed'}</span>
                                </div>
                                <div className="min-w-0 font-semibold text-gray-600">
                                  <p className="mb-1 text-[10px] font-bold uppercase text-gray-400 lg:hidden">Eligibility to vote for</p>
                                  <span>{voter.eligibleCategory === 'employee_representative' ? 'Board Member Employee Representative only' : voter.eligibleCategory === 'employer_cifoz' ? 'Board Member Employer Representative (CIFOZ) only' : voter.eligibleCategory === 'employer_zbca' ? 'Board Member Employer Representative (ZBCA) only' : 'Not assigned'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openVotingMemberEdit(voter)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-violet-100 text-violet-600 hover:bg-violet-50"
                                    aria-label={`Edit ${memberName}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteElectionVoter(voter.userId)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50"
                                    aria-label={`Remove ${memberName}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        )}

        {/* 1. USERS MODULE */}
        {subTab === 'users' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleUserSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4 h-fit lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <UserPlus className="h-4 w-4" /> Preload Attendee
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email address <span className="text-gray-400 font-normal"></span>
                    </label>
                    <input
                        type="email"
                        value={userForm.email}
                        onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="Optional - attendee can add during check-in"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">First Name</label>
                      <input
                          type="text"
                          required
                          value={userForm.firstName}
                          onChange={(e) => setUserForm({...userForm, firstName: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Last Name</label>
                      <input
                          type="text"
                          required
                          value={userForm.lastName}
                          onChange={(e) => setUserForm({...userForm, lastName: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Organization
                    </label>
                    <input
                        type="text"
                        value={userForm.organization}
                        onChange={(e) => setUserForm({...userForm, organization: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Security Role</label>
                    <select
                        value={userForm.role}
                        onChange={(e) => setUserForm({...userForm, role: e.target.value as any})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    >
                      <option value="attendee">Attendee (Event access)</option>
                      <option value="member">Member (Voting only)</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        disabled={isSavingUser}
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2.5 shadow transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                    >
                      <Save className="h-3.5 w-3.5" /> {isSavingUser ? 'Saving Attendee...' : 'Save Attendee Profile'}
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                    <Users className="h-4 w-4" /> Registered Attendees ({usersTotal})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                        onClick={downloadAttendeeQRCodes}
                        className="flex items-center gap-2 rounded-lg bg-[#B07A12] hover:bg-[#94640f] text-white font-black text-xs px-4 py-2 shadow transition-all uppercase tracking-widest"
                    >
                      <QrCode className="h-4 w-4" /> Download QR Codes
                    </button>
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2 shadow transition-all uppercase tracking-widest"
                    >
                      <FileDown className="h-4 w-4" /> Export to Excel
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                      type="text"
                      value={userSearchInput}
                      onChange={(e) => setUserSearchInput(e.target.value)}
                      placeholder="Search name, email, org, role..."
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                  />
                  <select
                      value={userFilters.status || 'all'}
                      onChange={(e) => setUserFilters(current => ({ ...current, status: e.target.value as any, page: 1 }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active only</option>
                    <option value="disabled">Disabled only</option>
                  </select>
                  <select
                      value={userFilters.checkedIn || 'all'}
                      onChange={(e) => setUserFilters(current => ({ ...current, checkedIn: e.target.value as any, page: 1 }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                  >
                    <option value="all">All check-in states</option>
                    <option value="true">Checked in</option>
                    <option value="false">Pending check-in</option>
                  </select>
                  <select
                      value={userFilters.role || 'all'}
                      onChange={(e) => setUserFilters(current => ({ ...current, role: e.target.value as any, page: 1 }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                  >
                    <option value="attendee">Attendees</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-700">
                      <thead className="bg-gray-100 font-bold uppercase tracking-wider text-[9px] border-b border-gray-200 text-gray-500">
                      <tr>
                        <th className="p-3">Attendee Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-6">Organization</th>
                        <th className="p-6">Activity</th>
                        <th className="p-2">Checked In</th>
                        <th className="p-2">Role</th>
                        <th className="p-2 text-center">Settings</th>
                      </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 font-medium">
                      {users.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-3">
                              <p className="font-extrabold text-gray-900">{item.firstName} {item.lastName}</p>
                            </td>
                            <td className="p-3">
                              <p className="text-[10px] text-blue-600 font-semibold">
                                {item.email || <span className="text-gray-400">Not provided</span>}
                              </p>
                            </td>
                            <td className="p-3">
                              <p className="text-gray-900">{item.organization || 'N/A'}</p>
                            </td>
                            <td className="p-3">
                              {item.checkedIn && item.selectedActivity ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5  text-amber-700 font-bold text-[10px]">
                                    {getActivityIcon(item.selectedActivity)}
                                    {getActivityDisplay(item.selectedActivity)}
                                  </span>
                              ) : (
                                  <span className="text-gray-400 text-[10px]">Not selected</span>
                              )}
                            </td>
                            <td className="p-3">
                              {item.checkedIn ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                                    Confirmed
                                  </span>
                              ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold text-[10px]">
                                    Pending
                                  </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider items-center gap-1 ${
                                  item.role === 'admin'
                                      ? 'bg-amber-100 text-[#8B6914] border border-amber-300'
                                      : item.role === 'member'
                                        ? 'bg-violet-100 text-violet-700'
                                        : 'bg-emerald-100 text-[#1a6b1a]'
                              }`}>
                                {item.role === 'admin' ? <Shield className="h-2.5 w-2.5" /> : <UserCheck className="h-2.5 w-2.5" />}
                                {item.role}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {item.role === 'admin' ? <span className="text-[10px] font-semibold text-slate-500">Managed by super admin</span> : <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => {
                                      setUserForm({
                                        id: item.id,
                                        email: item.email || '',
                                        firstName: item.firstName,
                                        lastName: item.lastName,
                                        role: item.role,
                                        organization: item.organization || '',
                                        position: item.position || '',
                                        accommodationProvided: item.accommodationProvided || false,
                                        roomNumber: item.roomNumber || '',
                                        transportProvided: item.transportProvided || false,
                                        class: item.class || 'A'
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all duration-200"
                                    title="Edit Details"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                {item.role === 'attendee' && <button type="button" onClick={() => setPasswordResetUser(item)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-[#8B6914]">Reset password</button>}
                                <button
                                    onClick={() => handleUserToggle(item.id)}
                                    className="p-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 transition-all duration-200"
                                    title={item.status === 'active' ? 'Disable attendee' : 'Enable attendee'}
                                >
                                  {item.status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                                </button>
                                <button
                                    onClick={() => handleUserDelete(item.id)}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all duration-200"
                                    title="Delete attendee"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>}
                            </td>
                          </tr>
                      ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-400">
                    Showing {users.length === 0 ? 0 : (usersPage - 1) * usersPageSize + 1}-{Math.min(usersPage * usersPageSize, usersTotal)} of {usersTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                        onClick={() => setUserFilters(current => ({ ...current, page: Math.max(1, (current.page || 1) - 1) }))}
                        disabled={usersPage === 1}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-[11px] font-bold text-gray-500">Page {usersPage}</span>
                    <button
                        onClick={() => setUserFilters(current => ({ ...current, page: (current.page || 1) + 1 }))}
                        disabled={!usersHasMore}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-[11px] font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
        )}

        {subTab === 'session-questions' && <SessionQuestionsAdmin />}

        {/* 2. SPEAKERS MODULE */}
        {subTab === 'speakers' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleSpeakerSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 h-fit col-span-1">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" /> Configure Faculty
                </h3>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Speaker Full Name</label>
                    <input
                        type="text"
                        required
                        value={speakerForm.name}
                        onChange={(e) => setSpeakerForm({...speakerForm, name: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Professional Organization</label>
                    <input
                        type="text"
                        required
                        value={speakerForm.organization}
                        onChange={(e) => setSpeakerForm({...speakerForm, organization: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Position / Office</label>
                    <input
                        type="text"
                        required
                        value={speakerForm.position}
                        onChange={(e) => setSpeakerForm({...speakerForm, position: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Assigned Speaking Topic</label>
                    <input
                        type="text"
                        required
                        value={speakerForm.topic}
                        onChange={(e) => setSpeakerForm({...speakerForm, topic: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Speaking duration details
                    </label>
                    <input
                        type="text"
                        required
                        value={speakerForm.speakingTime}
                        onChange={(e) => setSpeakerForm({...speakerForm, speakingTime: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. Day 2 · 11:00 - 12:00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Biography description</label>
                    <textarea
                        required
                        value={speakerForm.bio}
                        onChange={(e) => setSpeakerForm({...speakerForm, bio: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none h-20 resize-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Camera className="h-3 w-3" /> Speaker Photo
                    </label>

                    {speakerForm.photoUrl && !speakerForm.photoUrl.startsWith('/uploads') && (
                        <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200 text-center">
                          <div className="h-12 w-12 rounded-full bg-[#1A1A1A] text-[#FFD700] flex items-center justify-center mx-auto text-lg font-bold">
                            {speakerForm.photoUrl}
                          </div>
                          <p className="text-[9px] text-gray-400 mt-1">Current: Initials fallback</p>
                        </div>
                    )}

                    {speakerForm.photoUrl && speakerForm.photoUrl.startsWith('/uploads') && (
                        <div className="mb-2 flex justify-center">
                          <img src={speakerForm.photoUrl} alt="Speaker" className="h-20 w-20 rounded-full object-cover border-2 border-[#B8922A] p-1" />
                        </div>
                    )}

                    <label className="block cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-[#B8922A] transition-colors">
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleSpeakerPhotoUpload}
                            disabled={uploading}
                            className="hidden"
                        />
                        {uploading ? (
                            <div className="text-xs text-gray-500 flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#B8922A] border-t-transparent"></div>
                              Uploading...
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500">
                              <Upload className="h-4 w-4 mx-auto mb-1" />
                              Click to upload photo
                              <br />
                              <span className="text-[9px]">PNG, JPG, GIF up to 2MB</span>
                            </div>
                        )}
                      </div>
                    </label>

                    <div className="mt-2">
                      <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                        Initials Fallback (optional)
                      </label>
                      <input
                          type="text"
                          maxLength={3}
                          value={speakerForm.photoUrl?.startsWith('/uploads') ? '' : speakerForm.photoUrl}
                          onChange={(e) => setSpeakerForm({...speakerForm, photoUrl: e.target.value.toUpperCase()})}
                          placeholder="e.g., PB, KG, SJ (shown if no photo)"
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2"
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2 shadow uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Faculty Profile
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <UserCheck className="h-4 w-4" /> Scheduled Speakers ({speakers.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {speakers.map(spk => (
                      <div key={spk.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <div className="flex gap-2">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#1A1A1A] to-[#333] text-[#FFD700] flex items-center justify-center font-bold text-sm overflow-hidden">
                                {spk.photoUrl?.startsWith('/uploads') ? (
                                    <img src={spk.photoUrl} alt={spk.name} className="h-full w-full rounded-full object-cover" />
                                ) : (
                                    <span>{spk.photoUrl || spk.name.charAt(0)}</span>
                                )}
                              </div>
                              <div>
                                <p className="font-extrabold text-gray-900 text-xs">{spk.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold">{spk.position} &bull; <span className="text-gray-400 font-semibold">{spk.organization}</span></p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setSpeakerForm({ ...spk })} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-all">
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleSpeakerDelete(spk.id)} className="p-1 text-red-500 hover:bg-red-50 rounded transition-all">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-[#8B6914] italic font-semibold border-t border-gray-100 pt-1.5 leading-snug">
                            "{spk.topic}"
                          </p>
                        </div>
                        <p className="text-[8.5px] text-gray-400 font-bold mt-2 uppercase tracking-wider text-right flex items-center justify-end gap-1">
                          <Clock className="h-2.5 w-2.5" /> {spk.speakingTime}
                        </p>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 3. PROGRAMME MODULE */}
        {subTab === 'programme' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleSessionSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 h-fit col-span-1">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" /> Schedule Session Timeline
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Academic Category Cohort</label>
                    <select
                        value={sessionForm.category}
                        onChange={(e) => setSessionForm({...sessionForm, category: e.target.value as any})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    >
                      <option value="Class B">Class B - Annual CPD (Chartered)</option>
                      <option value="Class A">Class A - Marketing Practitioners</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Day Tag (1 to 4)</label>
                      <input
                          type="number"
                          min="1"
                          max="4"
                          required
                          value={sessionForm.day}
                          onChange={(e) => {
                            const d = Number(e.target.value);
                            let lbl = 'Day 1 · Monday 19 October 2026';
                            if (d === 2) lbl = 'Day 2 · Tuesday 20 October 2026';
                            else if (d === 3) lbl = 'Day 3 · Wednesday 21 October 2026';
                            else if (d === 4) lbl = 'Day 4 · Thursday 22 October 2026';
                            setSessionForm({...sessionForm, day: d, dayLabel: lbl});
                          }}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Session Type</label>
                      <select
                          value={sessionForm.type}
                          onChange={(e) => setSessionForm({...sessionForm, type: e.target.value as any})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      >
                        <option value="session">Conference Session</option>
                        <option value="social">Networking Event</option>
                        <option value="break">Recess / Dining Break</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Time Range
                    </label>
                    <input
                        type="text"
                        required
                        value={sessionForm.time}
                        onChange={(e) => setSessionForm({...sessionForm, time: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. 14:00 - 16:00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Session Topic Title</label>
                    <input
                        type="text"
                        required
                        value={sessionForm.topic}
                        onChange={(e) => setSessionForm({...sessionForm, topic: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> Facilitator / Host Name
                    </label>
                    <input
                        type="text"
                        value={sessionForm.facilitator}
                        onChange={(e) => setSessionForm({...sessionForm, facilitator: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Venue Location Room
                    </label>
                    <input
                        type="text"
                        required
                        value={sessionForm.venue}
                        onChange={(e) => setSessionForm({...sessionForm, venue: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. Main Conference Room"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2 shadow uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Schedule Session
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <LayoutList className="h-4 w-4" /> Scheduled Timelines ({sessions.length})
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-h-[500px] overflow-y-auto divide-y divide-gray-150">
                  {sessions.map(s => (
                      <div key={s.id} className="p-3.5 flex items-start justify-between gap-4 hover:bg-gray-50/50 transition-colors">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="rounded bg-gray-100 border border-gray-200 text-[8.5px] text-gray-600 font-extrabold px-1.5 py-0.5">
                        {s.category}
                      </span>
                            <span className="text-[9.5px] font-bold text-gray-400 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> {s.time} &bull; <MapPin className="h-2.5 w-2.5" /> {s.venue}
                      </span>
                          </div>
                          <p className="font-extrabold text-gray-800 text-xs mt-1 leading-tight">{s.topic}</p>
                          {s.facilitator && <p className="text-[10px] text-[#8B6914] mt-0.5 flex items-center gap-1"><UserIcon className="h-2.5 w-2.5" /> Facilitator: {s.facilitator}</p>}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => setSessionForm({ ...s })} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-all">
                            <Edit className="h-4.5 w-4.5" />
                          </button>
                          <button onClick={() => handleSessionDelete(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-all">
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 4. SPONSORS */}
        {subTab === 'sponsors' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleSponsorSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 h-fit col-span-1">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <Award className="h-4 w-4" /> Register Sponsor
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sponsor Corporate Name</label>
                    <input
                        type="text"
                        required
                        value={sponsorForm.name}
                        onChange={(e) => setSponsorForm({...sponsorForm, name: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Image className="h-3 w-3" /> Sponsor Logo
                    </label>

                    {sponsorForm.logoUrl && !sponsorForm.logoUrl.startsWith('/uploads') && (
                        <div className="mb-2 p-2 bg-gray-50 rounded border border-gray-200 text-center">
                          <span className="text-2xl">{sponsorForm.logoUrl}</span>
                          <p className="text-[9px] text-gray-400 mt-1">Current: Emoji fallback</p>
                        </div>
                    )}

                    {sponsorForm.logoUrl && sponsorForm.logoUrl.startsWith('/uploads') && (
                        <div className="mb-2 flex justify-center">
                          <img src={sponsorForm.logoUrl} alt="Sponsor logo" className="h-16 w-16 object-contain border rounded-lg p-2 bg-white" />
                        </div>
                    )}

                    <label className="block cursor-pointer">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center hover:border-[#B8922A] transition-colors">
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleSponsorLogoUpload}
                            disabled={uploading}
                            className="hidden"
                        />
                        {uploading ? (
                            <div className="text-xs text-gray-500 flex items-center justify-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#B8922A] border-t-transparent"></div>
                              Uploading...
                            </div>
                        ) : (
                            <div className="text-xs text-gray-500">
                              <Upload className="h-4 w-4 mx-auto mb-1" />
                              Click to upload logo
                              <br />
                              <span className="text-[9px]">PNG, JPG, GIF up to 2MB</span>
                            </div>
                        )}
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Globe className="h-3 w-3" /> Corporate Sponsor Website
                    </label>
                    <input
                        type="text"
                        required
                        value={sponsorForm.website}
                        onChange={(e) => setSponsorForm({...sponsorForm, website: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Sponsorship Title details</label>
                    <input
                        type="text"
                        required
                        value={sponsorForm.durationLabel}
                        onChange={(e) => setSponsorForm({...sponsorForm, durationLabel: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. 2021 – Present · Winter Wear Sponsor"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Star className="h-3 w-3" /> Sponsor Category
                    </label>
                    <select
                        value={sponsorForm.tier}
                        onChange={(e) => setSponsorForm({...sponsorForm, tier: e.target.value as any})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    >
                      <option value="Dinner">Dinner</option>
                      <option value="Giveaways">Giveaways</option>
                      <option value="Session">Session</option>
                      <option value="Exhibitor">Exhibitor</option>
                      <option value="Technology Partner">Technology Partner</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Action Description</label>
                    <textarea
                        required
                        value={sponsorForm.description}
                        onChange={(e) => setSponsorForm({...sponsorForm, description: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none h-16 resize-none"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2 shadow uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Sponsor Profile
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <Award className="h-4 w-4" /> Loyal Sponsors ({sponsors.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {sponsors.map(sp => (
                      <div key={sp.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-start gap-3 hover:shadow-md transition-shadow">
                        <div className="h-12 w-12 shrink-0 flex items-center justify-center rounded-lg text-white text-xl font-bold shadow-sm overflow-hidden bg-gradient-to-br from-[#806110] to-[#FFD700]">
                          {sp.logoUrl?.startsWith('/uploads') ? (
                              <img src={sp.logoUrl} alt={sp.name} className="h-full w-full object-cover" />
                          ) : (
                              <span>{sp.logoUrl || '🏢'}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-extrabold text-xs text-gray-900 truncate">{sp.name}</p>
                            {getSponsorCategoryIcon(sp.tier)}
                          </div>
                          <p className="text-[9px] font-extrabold text-[#8B6914] uppercase tracking-wider">{sp.durationLabel}</p>
                          <p className="text-[10px] text-gray-500 line-clamp-2 mt-1 font-semibold">{sp.description}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button onClick={() => setSponsorForm({ ...sp })} className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-all" title="Edit sponsor">
                            <Edit className="h-3 w-3" />
                          </button>
                          <button onClick={() => handleSponsorDelete(sp.id)} className="p-1 text-red-500 hover:bg-red-50 rounded transition-all" title="Delete sponsor">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 5. TESTIMONIALS */}
        {subTab === 'testimonials' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleTestimonialSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 h-fit col-span-1">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <Quote className="h-4 w-4" /> Configure Testimonial
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Alumni Full Name</label>
                    <input
                        type="text"
                        required
                        value={testimonialForm.name}
                        onChange={(e) => setTestimonialForm({...testimonialForm, name: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Organization Company</label>
                      <input
                          type="text"
                          required
                          value={testimonialForm.company}
                          onChange={(e) => setTestimonialForm({...testimonialForm, company: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Professional Title</label>
                      <input
                          type="text"
                          required
                          value={testimonialForm.position}
                          onChange={(e) => setTestimonialForm({...testimonialForm, position: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Testimonial Quote</label>
                    <textarea
                        required
                        value={testimonialForm.text}
                        onChange={(e) => setTestimonialForm({...testimonialForm, text: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none h-24 resize-none leading-relaxed"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Avatar Initials</label>
                    <input
                        type="text"
                        required
                        maxLength={2}
                        value={testimonialForm.photoUrl}
                        onChange={(e) => setTestimonialForm({...testimonialForm, photoUrl: e.target.value.toUpperCase()})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. CT, LM, TS"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2 shadow uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Testimonial
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <Heart className="h-4 w-4" /> Alumni Quotes ({testimonials.length})
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {testimonials.map(t => (
                      <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex gap-3">
                            <div className="h-10 w-10 text-sm font-black shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-300 text-amber-700">
                              {t.photoUrl}
                            </div>
                            <div>
                              <p className="font-extrabold text-xs text-gray-900">{t.name}</p>
                              <p className="text-[10px] text-gray-500 font-bold">{t.position} &bull; <span className="text-[#8B6914]">{t.company}</span></p>
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => setTestimonialForm({ ...t })} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-blue-100">
                              <Edit className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleTestimonialDelete(t.id)} className="p-1.5 bg-red-50 text-red-500 rounded-lg text-[10px] font-bold uppercase transition-all hover:bg-red-100">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] leading-relaxed font-semibold mt-3 italic text-gray-600 border-l-2 border-[#B8922A] pl-3">
                          "{t.text}"
                        </p>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 6. GALLERY */}
        {subTab === 'gallery' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <div className="space-y-6 h-fit col-span-1 lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider flex items-center gap-2">
                    <FolderOpen className="h-4 w-4" /> Live Photo Gallery Folder Link
                  </h3>
                  <p className="text-[10px] text-gray-500 font-semibold leading-relaxed">
                    Connect the live event photo gallery! Paste a Google Drive shared folder URL below.
                  </p>
                  <div className="space-y-2">
                    <input
                        type="text"
                        value={driveLink}
                        onChange={(e) => setDriveLink(e.target.value)}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none bg-[#FAF9F6]"
                        placeholder="https://drive.google.com/..."
                    />
                    <button
                        onClick={handleDriveLinkSave}
                        className="w-full rounded-lg bg-[#1A1A1A] text-[#FFD700] hover:bg-neutral-800 font-black text-xs py-2 shadow transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Folder Link
                    </button>
                  </div>
                </div>

                <form onSubmit={handleGallerySave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider flex items-center gap-2">
                    <Image className="h-4 w-4" /> Add Slideshow Showcase Image
                  </h3>
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                        Option 1: Image URL
                      </label>
                      <input
                          type="text"
                          value={galleryForm.url}
                          onChange={(e) => setGalleryForm({...galleryForm, url: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                          placeholder="https://images.unsplash.com/..."
                      />
                    </div>

                    <div className="relative flex items-center">
                      <div className="flex-grow border-t border-gray-200"></div>
                      <span className="flex-shrink mx-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">OR</span>
                      <div className="flex-grow border-t border-gray-200"></div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                        Option 2: Upload from Local Machine
                      </label>
                      <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={handleGalleryFileSelect}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1a1111] file:text-amber-400 hover:file:bg-neutral-800"
                      />

                      {uploadPreview && (
                          <div className="mt-3 relative">
                            <div className="relative inline-block">
                              <img
                                  src={uploadPreview}
                                  alt="Preview"
                                  className="h-24 w-24 object-cover rounded-lg border border-gray-200"
                              />
                              <button
                                  type="button"
                                  onClick={clearPreview}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                            {selectedFile && (
                                <p className="text-[10px] text-green-600 mt-1 font-semibold">
                                  ✓ {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                                </p>
                            )}
                          </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Descriptive Caption</label>
                      <input
                          type="text"
                          required
                          value={galleryForm.caption}
                          onChange={(e) => setGalleryForm({...galleryForm, caption: e.target.value})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                          placeholder="e.g. Graduation Day: SADC Certificates Handed Out"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Slide Description</label>
                      <textarea
                          value={galleryForm.description}
                          onChange={(e) => setGalleryForm({...galleryForm, description: e.target.value})}
                          className="min-h-20 w-full resize-none rounded-lg border border-gray-300 p-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                          placeholder="e.g. Highlights from the Strategic Marketing & Business Growth Indaba in Victoria Falls."
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gallery Category</label>
                      <select
                          value={galleryForm.category}
                          onChange={(e) => setGalleryForm({...galleryForm, category: e.target.value as any})}
                          className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                      >
                        <option value={CURRENT_MARKETERS_CONVENTION_GALLERY_CATEGORY}>18th Annual Marketers Convention 2026 Victoria Falls</option>
                        <option value={MARKETERS_CONVENTION_GALLERY_CATEGORY}>17th Annual Marketers Convention 2025 Bulawayo</option>
                        <option value="2024">2024 Cohort</option>
                        <option value="2025">2025 Cohort</option>
                      </select>
                    </div>

                    <div className="pt-2">
                      <button
                          type="submit"
                          disabled={uploading}
                          className="w-full rounded-lg bg-[#1a1111] text-amber-400 hover:bg-neutral-800 font-bold text-xs py-2.5 shadow uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {uploading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-400 border-t-transparent"></div>
                              Uploading...
                            </>
                        ) : (
                            <>
                              <Upload className="h-3.5 w-3.5" /> Upload Image
                            </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              <div className="lg:col-span-2 space-y-3 animate-fadeIn">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <Camera className="h-4 w-4" /> Showcase Gallery Images ({gallery.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {gallery.map(img => (
                      <div key={img.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                        <div>
                          <img src={img.url} alt={img.caption} className="w-full h-32 object-cover" referrerPolicy="no-referrer" />
                          <div className="p-3">
                            <div className="flex items-center gap-1.5">
                        <span className="rounded bg-amber-100 border border-amber-200 text-[#8B6914] font-black text-[8px] px-1.5 py-0.5">
                          {img.category} EDITION
                        </span>
                            </div>
                            <p className="text-[10px] text-gray-600 mt-1 font-semibold leading-relaxed">{img.caption}</p>
                          </div>
                        </div>
                        <div className="p-3 border-t border-gray-100 flex justify-end">
                          <button
                              onClick={() => handleGalleryDelete(img.id)}
                              className="flex items-center gap-1 rounded bg-red-50 text-red-500 hover:bg-red-100 font-extrabold px-3 py-1.5 text-[10px] uppercase tracking-wider transition-all"
                          >
                            <Trash2 className="h-3 w-3" /> Delete Image
                          </button>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 7. ACTIVITIES */}
        {subTab === 'adventures' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <div className="space-y-6 h-fit col-span-1">
                <form onSubmit={handleAdventureSave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider flex items-center gap-2">
                    <Compass className="h-4 w-4" /> Create Activity
                  </h3>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Activity Title</label>
                    <input
                        type="text"
                        required
                        value={adventureForm.title}
                        onChange={(e) => setAdventureForm({...adventureForm, title: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. Victoria Falls Guided Tour"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description</label>
                    <textarea
                        required
                        value={adventureForm.description}
                        onChange={(e) => setAdventureForm({...adventureForm, description: e.target.value})}
                        className="min-h-24 w-full resize-none rounded-lg border border-gray-300 p-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        placeholder="Describe what attendees will experience."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Image URL</label>
                    <input
                        type="url"
                        value={adventureForm.imageUrl}
                        onChange={(e) => setAdventureForm({...adventureForm, imageUrl: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="https://..."
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Upload Image</label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-xs font-bold text-gray-500 hover:border-[#B8922A] hover:bg-amber-50">
                      <Upload className="h-4 w-4" />
                      <span>{adventureForm.imageFile ? adventureForm.imageFile.name : 'Choose JPG, PNG, GIF or WEBP'}</span>
                      <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAdventureFileSelect} className="hidden" />
                    </label>
                    {(uploadPreview && adventureForm.imageFile) && (
                        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                          <img src={uploadPreview} alt="Activity preview" className="h-32 w-full object-cover" />
                          <button type="button" onClick={clearAdventurePreview} className="w-full bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-500">
                            Remove Upload
                          </button>
                        </div>
                    )}
                  </div>

                  <button
                      type="submit"
                      disabled={uploading}
                      className="w-full rounded-lg bg-[#1a1111] text-amber-400 hover:bg-neutral-800 font-bold text-xs py-2.5 shadow uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" /> {adventureForm.id ? 'Update Activity' : 'Save Activity'}
                  </button>
                </form>
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2 mb-4">
                  <Compass className="h-4 w-4" /> Activities ({adventures.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adventures.map((activity) => (
                      <div key={activity.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                        <div className="h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
                          {activity.imageUrl ? (
                              <img src={activity.imageUrl} alt={activity.title} className="h-full w-full object-cover" />
                          ) : (
                              <Compass className="h-8 w-8 text-[#B8922A]" />
                          )}
                        </div>
                        <div className="p-3 space-y-1">
                          <h4 className="text-xs font-black text-gray-900">{activity.title}</h4>
                          <p className="text-[11px] font-semibold leading-relaxed text-gray-500 line-clamp-3">{activity.description}</p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-gray-100 p-3">
                          <button
                              onClick={() => {
                                setAdventureForm({ id: activity.id, title: activity.title, description: activity.description, imageUrl: activity.imageUrl || '', imageFile: null });
                                setSelectedFile(null);
                                setUploadPreview(null);
                              }}
                              className="flex items-center gap-1 rounded bg-blue-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-600 hover:bg-blue-100"
                          >
                            <Edit className="h-3 w-3" /> Edit
                          </button>
                          <button
                              onClick={() => handleAdventureDelete(activity.id)}
                              className="flex items-center gap-1 rounded bg-red-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-red-500 hover:bg-red-100"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* 7. DAYS MODULE */}
        {subTab === 'days' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
              <form onSubmit={handleDaySave} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3 h-fit col-span-1">
                <h3 className="text-xs font-black uppercase text-[#8B6914] tracking-wider mb-2 flex items-center gap-2">
                  <Folder className="h-4 w-4" /> Event Photo Album
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Day Name</label>
                    <input
                        type="text"
                        required
                        value={dayForm.day}
                        onChange={(e) => setDayForm({...dayForm, day: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="e.g. Monday, Tuesday or Day 1"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Drive Folder Link</label>
                    <input
                        type="url"
                        required
                        value={dayForm.driveLink}
                        onChange={(e) => setDayForm({...dayForm, driveLink: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="https://drive.google.com/drive/folders/..."
                    />
                    <p className="mt-2 text-xs text-gray-500">Each saved album appears in Gallery for signed-in users with the name entered above.</p>
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2 shadow uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Save className="h-3.5 w-3.5" /> Add Day
                    </button>
                  </div>
                </div>
              </form>

              <div className="lg:col-span-2 space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <Folder className="h-4 w-4" /> Existing Days ({days.length})
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-700">
                      <thead className="bg-gray-100 font-bold uppercase tracking-wider text-[9px] border-b border-gray-200 text-gray-500">
                      <tr>
                        <th className="p-3">Day</th>
                        <th className="p-3">Drive Link</th>
                        <th className="p-3 text-center">Actions</th>
                      </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-150 font-medium">
                      {days.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-3">
                              <p className="font-extrabold text-gray-900">{item.day}</p>
                            </td>
                            <td className="p-3">
                              <a
                                  href={item.driveLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-[10px] truncate block max-w-xs"
                              >
                                {item.driveLink}
                              </a>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                    onClick={() => {
                                      setDayForm({
                                        id: item.id,
                                        day: item.day,
                                        driveLink: item.driveLink
                                      });
                                    }}
                                    className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all duration-200"
                                    title="Edit Day"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => handleDayDelete(item.id)}
                                    className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-all duration-200"
                                    title="Delete Day"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                      ))}
                      {days.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-6 text-center text-gray-400 font-semibold">
                              No days added yet. Add your first day above!
                            </td>
                          </tr>
                      )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 font-semibold">
                  Showing {days.length} day{days.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
        )}

        {/* 8. REPORTS */}
        {subTab === 'reports' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8B6914] mb-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> Collected Reviews
                  </p>
                  <h4 className="text-2xl font-black text-[#1A1A1A]">{feedback.length}</h4>
                  <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">Active chatbot submissions filed</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8B6914] mb-1 flex items-center gap-1">
                    <Star className="h-3 w-3" /> Average Program Score
                  </p>
                  <h4 className="text-2xl font-black text-[#1A1A1A]">
                    {feedback.length > 0 ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : 'N/A'}
                    <span className="text-xs text-amber-500">★</span>
                  </h4>
                  <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">Overall experience rate</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#8B6914] mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Re-Attendance Ratio
                  </p>
                  <h4 className="text-2xl font-black text-[#1A1A1A]">
                    {feedback.length > 0 ? ((feedback.filter(e => e.attendAgain).length / feedback.length) * 100).toFixed(0) : '0'}%
                  </h4>
                  <p className="text-[9px] text-gray-400 mt-0.5 font-semibold">Respondents booking next year</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-150 p-4 shadow-sm flex flex-col justify-center gap-1.5">
                  <button onClick={exportToCSV} className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase py-2 shadow tracking-wider flex items-center justify-center gap-1.5 transition-all">
                    <Download className="h-3.5 w-3.5" /> Download CSV
                  </button>
                  <button onClick={exportToJSON} className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] uppercase py-2 shadow tracking-wider flex items-center justify-center gap-1.5 transition-all">
                    <Download className="h-3.5 w-3.5" /> Download JSON
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Submitted Event Appraisals
                </h3>
                <div className="grid grid-cols-1 gap-4">
                  {feedback.map(item => (
                      <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                          <div>
                            <p className="font-extrabold text-gray-900 text-xs">{item.userName}</p>
                            <p className="text-[10px] text-gray-500 font-bold">{item.userEmail}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 border border-amber-200 text-xs font-bold text-amber-700">
                              {item.rating} Stars <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                            </div>
                            <span className="text-[9.5px] font-bold text-gray-400">{new Date(item.submittedAt).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                          <div>
                            <p className="text-[9.5px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">Most Valuable Session</p>
                            <p className="text-[#1A1A1A] italic leading-snug">"{item.bestSession}"</p>
                          </div>
                          <div>
                            <p className="text-[9.5px] font-extrabold text-[#8B6914] uppercase tracking-widest mb-1">Standout Speaker</p>
                            <p className="text-gray-800">{item.bestFacilitator}</p>
                          </div>
                          <div className="col-span-1 sm:col-span-2 border-t border-gray-100 pt-3">
                            <p className="text-[9.5px] font-extrabold text-gray-400 uppercase tracking-widest mb-1">Improvements</p>
                            <p className="text-gray-600 bg-gray-50 p-2.5 rounded leading-relaxed">{item.improvements || 'No specific improvements registered.'}</p>
                          </div>
                        </div>

                        <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                          <span>Attend in Future: <span className={`font-extrabold ${item.attendAgain ? 'text-emerald-600' : 'text-red-500'}`}>{item.attendAgain ? 'YES' : 'NO'}</span></span>
                          <span className="text-emerald-500 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Secure Audit Verified</span>
                        </div>
                      </div>
                  ))}

                  {feedback.length === 0 && (
                      <div className="text-center bg-white border border-[#B8922A]/10 p-12 rounded-xl text-gray-400 font-semibold text-xs leading-relaxed">
                        <HelpCircle className="h-10 w-10 text-gray-300 mx-auto mb-3 animate-pulse" />
                        No evaluations have been submitted yet. Ask attendees to provide appraisal reviews under the Feedback tab!
                      </div>
                  )}
                </div>
              </div>
            </div>
        )}

        {/* 9. STUDY MATERIALS MODULE */}
        {subTab === 'study-materials' && (
            <div className="-mx-1 grid grid-cols-1 gap-4 animate-fadeIn sm:mx-0 sm:gap-6 lg:grid-cols-3">
              {/* Upload Form */}
              <div className="h-fit rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5 lg:col-span-1">
                <h3 className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-[#8B6914] sm:text-xs">
                  <Upload className="h-4 w-4" /> Upload Study Material
                </h3>

                <form onSubmit={handleStudyMaterialUpload} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400 sm:text-[10px]">
                      Title <span className="text-gray-300 font-normal">(Optional - uses filename if empty)</span>
                    </label>
                    <input
                        type="text"
                        value={studyMaterialForm.title}
                        onChange={(e) => setStudyMaterialForm({...studyMaterialForm, title: e.target.value})}
                        className="w-full rounded-lg border border-gray-300 p-2 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        placeholder="Leave blank to use filename as title"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400 sm:text-[10px]">
                      Description (Optional)
                    </label>
                    <input
                        type="text"
                        value={studyMaterialForm.description}
                        onChange={(e) => setStudyMaterialForm({...studyMaterialForm, description: e.target.value})}
                        className="w-full text-xs font-semibold rounded-lg border border-gray-300 p-2 focus:border-[#B8922A] focus:outline-none"
                        placeholder="Brief description of the material"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-gray-400 sm:text-[10px]">
                      File * (PDF, PPTX, DOCX, XLSX, ZIP)
                    </label>
                    <input
                        type="file"
                        required
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const ext = file.name.split('.').pop()?.toLowerCase() || '';
                            const allowedExts = ['pdf', 'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls', 'zip'];

                            if (!allowedExts.includes(ext)) {
                              alert('Invalid file type. Only PDF, PPTX, DOCX, XLSX, and ZIP files are allowed.');
                              e.target.value = '';
                              return;
                            }

                            if (file.size > STUDY_MATERIAL_MAX_SIZE_BYTES) {
                              alert(`File too large! Maximum size is ${STUDY_MATERIAL_MAX_SIZE_MB} MB.`);
                              e.target.value = '';
                              return;
                            }

                            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                            setStudyMaterialForm(prev => ({
                              ...prev,
                              file,
                              title: prev.title || fileNameWithoutExt
                            }));
                          }
                        }}
                        className="w-full rounded-lg border border-gray-300 p-2 text-[11px] font-semibold focus:border-[#B8922A] focus:outline-none file:mr-2 file:rounded-lg file:border-0 file:bg-[#1a1111] file:px-3 file:py-2 file:text-[10px] file:font-semibold file:text-amber-400 hover:file:bg-neutral-800 sm:text-xs sm:file:mr-4 sm:file:px-4 sm:file:text-xs"
                    />
                    {studyMaterialForm.file && (
                        <p className="text-[10px] text-green-600 mt-1 font-semibold flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {studyMaterialForm.file.name} ({(studyMaterialForm.file.size / 1024).toFixed(1)} KB)
                        </p>
                    )}
                    <p className="mt-1 text-[10px] font-semibold text-gray-500">Maximum file size: {STUDY_MATERIAL_MAX_SIZE_MB} MB.</p>
                  </div>

                  <div className="pt-2">
                    <button
                        type="submit"
                        disabled={uploading}
                        className="w-full rounded-lg bg-[#1A1A1A] hover:bg-neutral-800 text-[#FFD700] font-black text-xs py-2.5 shadow uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {uploading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#FFD700] border-t-transparent"></div>
                            Uploading...
                          </>
                      ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" /> Upload File
                          </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Materials List */}
              <div className="space-y-3 lg:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex min-w-0 items-center gap-2 text-[11px] font-black uppercase tracking-wider text-gray-900 sm:text-xs">
                    <BookOpen className="h-4 w-4" /> Study Materials ({studyMaterials.length})
                  </h3>
                  <button
                      onClick={() => {
                        loadedTabsRef.current['study-materials'] = false;
                        loadStudyMaterials();
                      }}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 transition hover:bg-gray-200 sm:px-3"
                  >
                    <RefreshCcw className="h-3 w-3" /> Refresh
                  </button>
                </div>

                <div className="space-y-3">
                  {studyMaterials.length === 0 ? (
                      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                        <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-sm font-semibold text-gray-400">No study materials uploaded yet.</p>
                        <p className="text-xs text-gray-400 mt-1">Upload files using the form on the left.</p>
                      </div>
                  ) : (
                      studyMaterials.map((material) => {
                        const getFileIcon = (fileName: string) => {
                          const ext = fileName.split('.').pop()?.toLowerCase() || '';
                          if (['pdf'].includes(ext)) return <FileText className="h-5 w-5 text-red-500" />;
                          if (['pptx', 'ppt'].includes(ext)) return <FileText className="h-5 w-5 text-orange-500" />;
                          if (['docx', 'doc'].includes(ext)) return <FileText className="h-5 w-5 text-blue-500" />;
                          if (['xlsx', 'xls'].includes(ext)) return <FileText className="h-5 w-5 text-green-500" />;
                          if (['zip'].includes(ext)) return <FileText className="h-5 w-5 text-purple-500" />;
                          return <FileText className="h-5 w-5 text-[#B8922A]" />;
                        };

                        return (
                            <div
                                key={material.id}
                                className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md sm:p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A]/5 sm:h-10 sm:w-10">
                                    {getFileIcon(material.fileName)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="break-words text-sm font-extrabold leading-snug text-gray-900 sm:truncate">
                                      {material.title || material.fileName}
                                    </h4>
                                    {material.description && (
                                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 sm:line-clamp-1">
                                          {material.description}
                                        </p>
                                    )}
                                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-gray-400">
                                      <span className="max-w-full break-all sm:break-normal">{material.fileName}</span>
                                      <span className="hidden sm:inline">•</span>
                                      <span>{formatFileSize(material.fileSize)}</span>
                                      <span>•</span>
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {new Date(material.uploadDate).toLocaleDateString()}
                                      </span>
                                      <span>•</span>
                                      <span>{material.downloads} downloads</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center justify-end gap-1.5 sm:justify-start">
                                  <button
                                      onClick={() => {
                                        window.open(material.fileUrl, '_blank');
                                      }}
                                      className="rounded-lg bg-[#B8922A]/10 px-3 py-1.5 text-[10px] font-bold text-[#B8922A] hover:bg-[#B8922A]/20 transition flex items-center gap-1"
                                  >
                                    <Download className="h-3 w-3" /> View
                                  </button>
                                  <button
                                      onClick={() => handleStudyMaterialDelete(material.id)}
                                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition"
                                      title="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
        )}

        {passwordResetUser && createPortal(<ResetPasswordModal user={passwordResetUser} onClose={() => setPasswordResetUser(null)} onReopened={updated => {
          setEditingVotingMember(null);
          setEligibleAttendees(current => current.map(account => account.id === updated.id ? updated : account));
          if (subTab === 'users') void loadUsers(userFilters);
          else void refreshVotingRegister();
        }} />, document.body)}

        {isAddMemberModalOpen && election && createPortal(
          <AddVotingMemberModal electionId={election.id} existingProfiles={eligibleAttendees}
            onAdded={async () => { await refreshVotingRegister(); setVotingMemberSearch(''); }}
            onClose={() => setIsAddMemberModalOpen(false)} />,
          document.body
        )}

        {editingVotingMember && createPortal((
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 p-4">
              <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gradient-to-br from-white via-amber-50 to-yellow-50 p-5">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#8B6914]">Edit Voting Member</p>
                    <h3 className="mt-1 text-lg font-black text-gray-950">
                      {editingVotingMember.firstName} {editingVotingMember.lastName}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-gray-500">
                      Update the details used in the voting register.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingVotingMember(null)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                    aria-label="Close member editor"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={saveVotingMemberEdit} className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">First name</span>
                      <input
                        value={editingVotingMember.firstName}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, firstName: event.target.value } : current)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        required
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Last name</span>
                      <input
                        value={editingVotingMember.lastName}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, lastName: event.target.value } : current)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Email address</span>
                    <input
                      type="email"
                      value={editingVotingMember.email}
                      onChange={(event) => setEditingVotingMember(current => current ? { ...current, email: event.target.value } : current)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                      placeholder="member@example.com"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Company</span>
                      <input
                        value={editingVotingMember.organization}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, organization: event.target.value } : current)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Position</span>
                      <input
                        value={editingVotingMember.position}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, position: event.target.value } : current)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                        placeholder="Optional"
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Voting access</span>
                      <select
                        value={editingVotingMember.status}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, status: event.target.value as User['status'] } : current)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-500">Event access</span>
                      <select
                        value={editingVotingMember.role}
                        onChange={(event) => setEditingVotingMember(current => current ? { ...current, role: event.target.value as User['role'] } : current)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-xs font-semibold focus:border-[#B8922A] focus:outline-none"
                      >
                        <option value="member">Voting only</option>
                        <option value="attendee">Attendee and voting</option>
                        {editingVotingMember.role === 'admin' && <option value="admin">Administrator</option>}
                      </select>
                      <p className="mt-2 text-xs text-gray-500">Attendee access opens the event pages and session questions. The existing login and ballot are kept.</p>
                    </label>
                  </div>

                  <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
                    {editingVotingMember.role === 'attendee' && <button type="button" disabled={isSavingUser} onClick={() => {
                      const account = eligibleAttendees.find(member => member.id === editingVotingMember.id);
                      setPasswordResetUser(account || editingVotingMember);
                    }} className="rounded-xl border border-[#B8922A] px-5 py-3 text-xs font-bold text-[#8B6914]">Reset password</button>}
                    <button
                      type="button"
                      onClick={() => setEditingVotingMember(null)}
                      className="rounded-xl border border-gray-200 px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUser}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                      <Save className="h-4 w-4" /> {isSavingUser ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        ), document.body)}

      </div>
  );
}
