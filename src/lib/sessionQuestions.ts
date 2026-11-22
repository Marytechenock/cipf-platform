import type { Session } from '../types';
import type { AudienceQuestion, AudienceQuestionAction, QuestionSetup, SpeakerAssignment } from '../types/sessionQuestions';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Could not load session questions.');
  return body;
}
export const sessionQuestionsApi = {
  setup: () => request<QuestionSetup>('/api/admin/session-question-setup'),
  assign: (assignment: SpeakerAssignment) => request(`/api/admin/session-question-setup/${encodeURIComponent(assignment.speakerId)}`, { method: 'PUT', body: JSON.stringify(assignment) }),
  mySessions: (signal?: AbortSignal) => request<{ sessions: Session[] }>('/api/session-questions/my-sessions', { signal }),
  list: (sessionId: string, mode: 'own' | 'admin' | 'presenter' | 'display', signal?: AbortSignal) => request<{ session: Session; questions: AudienceQuestion[] }>(`/api/session-questions/${encodeURIComponent(sessionId)}?mode=${mode}`, { signal }),
  submit: (sessionId: string, text: string, anonymous: boolean) => request<{ success: boolean; question: AudienceQuestion }>(`/api/session-questions/${encodeURIComponent(sessionId)}`, { method: 'POST', body: JSON.stringify({ text, anonymous }) }),
  moderate: (sessionId: string, questionId: string, action: AudienceQuestionAction) => request(`/api/admin/session-questions/${encodeURIComponent(sessionId)}/${encodeURIComponent(questionId)}`, { method: 'POST', body: JSON.stringify({ action }) })
};
