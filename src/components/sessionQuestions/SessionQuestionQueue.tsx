import { useState } from 'react';
import type { AudienceQuestionAction } from '../../types/sessionQuestions';
import { sessionQuestionsApi } from '../../lib/sessionQuestions';
import { useQuestionQueue } from './useQuestionQueue';

export default function SessionQuestionQueue({ sessionId, moderator = false }: { sessionId: string; moderator?: boolean }) {
  const { data, error, refresh } = useQuestionQueue(sessionId, moderator ? 'admin' : 'presenter');
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const act = async (id: string, action: AudienceQuestionAction) => {
    if (saving) return;
    setSaving(true); setActionError('');
    try { await sessionQuestionsApi.moderate(sessionId, id, action); refresh(); }
    catch (err) { setActionError(err instanceof Error ? err.message : 'Could not update question.'); }
    finally { setSaving(false); }
  };
  if (!sessionId) return <p className="text-sm text-gray-500">Choose a session to view its questions.</p>;
  return <div className="space-y-4">
    {moderator && <div className="flex justify-end"><a href={`/session-questions/display/${encodeURIComponent(sessionId)}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#B8922A] px-4 py-3 text-sm font-bold text-[#8B6914]">Open projector display ↗</a></div>}
    {(error || actionError) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{actionError || error}</p>}
    {!data && !error && <p role="status">Loading questions…</p>}
    {data && !data.questions.length && <p className="rounded-xl border border-gray-200 p-6 text-sm text-gray-500">No audience questions for this session yet.</p>}
    {data?.questions.map(question => <article key={question.id} className="rounded-xl border border-gray-200 bg-white p-5">
      {question.number != null && <p className="mb-2 text-xs font-bold text-[#8B6914]">Question {question.number}</p>}
      {moderator && <p className="mb-2 text-xs font-bold uppercase text-[#8B6914]">{['pending', 'approved'].includes(question.status) ? 'Live' : question.status}</p>}
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-gray-950">{question.text}</p>
      <p className="mt-3 text-xs text-gray-500">{question.authorName || 'Anonymous attendee'}{question.authorName && question.authorCompany && <> · {question.authorCompany}</>}</p>
      {moderator && <div className="mt-4 flex flex-wrap gap-2">
        {question.status === 'hidden' && <Action label="Restore to screen" disabled={saving} onClick={() => act(question.id, 'approve')} />}
        {['pending', 'approved'].includes(question.status) && <Action label="Mark answered" disabled={saving} onClick={() => act(question.id, 'answer')} />}
        {question.status !== 'hidden' && <Action label="Hide / duplicate" disabled={saving} onClick={() => act(question.id, 'hide')} />}
      </div>}
    </article>)}
  </div>;
}
function Action({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{label}</button>;
}
