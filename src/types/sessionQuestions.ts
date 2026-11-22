import type { Session, Speaker } from '../types';

export type AudienceQuestionStatus = 'pending' | 'approved' | 'hidden' | 'answered';
export type AudienceQuestionAction = 'approve' | 'hide' | 'answer' | 'display' | 'clear';
export interface AudienceQuestion {
  id: string;
  number?: number;
  sessionId: string;
  text: string;
  authorName: string | null;
  authorCompany?: string | null;
  status: AudienceQuestionStatus;
  isDisplayed: boolean;
  createdAt: string;
}
export interface SpeakerAssignment {
  speakerId: string;
  userId: string | null;
  sessionIds: string[];
  configured?: boolean;
}
export interface QuestionSetup {
  speakers: Speaker[];
  sessions: Session[];
  accounts: { id: string; firstName: string; lastName: string; email?: string }[];
  assignments: SpeakerAssignment[];
}
