import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '../../types';
import { sessionQuestionsApi } from '../../lib/sessionQuestions';
import { useQuestionQueue } from './useQuestionQueue';

export default function AskSessionQuestion({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-lg border border-[#B8922A] px-4 py-2 text-xs font-bold text-[#8B6914] hover:bg-amber-50">Ask a Question</button>
    {open && <QuestionDialog session={session} onClose={() => setOpen(false)} />}
  </>;
}

function QuestionDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const queue = useQuestionQueue(session.id, 'own');
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await sessionQuestionsApi.submit(session.id, text, anonymous);
      setText(''); setNotice('Your question has been sent and will appear automatically for the speaker and on the venue screen.'); queue.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send your question.'); }
    finally { setSaving(false); }
  };
  return <dialog ref={ref} aria-labelledby="ask-session-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} style={{ width: 'calc(100% - 2rem)' }} className="m-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4"><div><h2 id="ask-session-title" className="text-lg font-bold">Ask a Question</h2><p className="mt-1 text-sm text-gray-600">{session.topic}</p></div><button type="button" aria-label="Close question form" onClick={onClose} disabled={saving} className="min-h-11 px-3">✕</button></div>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold">Your question<textarea required minLength={10} maxLength={1000} rows={4} value={text} onChange={event => setText(event.target.value)} disabled={saving} className="mt-2 block w-full rounded-lg border border-gray-300 p-3 font-normal" /></label>
      <p className="text-xs text-gray-500">10–1,000 characters. Questions appear automatically for the speaker and on the venue screen.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)} disabled={saving} />Hide my name and company from the speaker and screen</label>
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {(error || queue.error) && <p role="alert" className="text-sm text-red-700">{error || queue.error}</p>}
      <button disabled={saving || text.trim().length < 10} className="min-h-11 rounded-lg bg-[#8B6914] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send question'}</button>
    </form>
    <h3 className="mt-6 text-sm font-bold">Your questions</h3>
    <ul className="mt-2 space-y-2">{queue.data?.questions.map(question => <li key={question.id} className="rounded-lg border border-gray-200 p-3 text-sm">{question.number != null && <p className="mb-1 text-xs font-bold text-[#8B6914]">Question {question.number}</p>}<p className="whitespace-pre-wrap break-words">{question.text}</p><span className="mt-2 block text-xs capitalize text-gray-500">{question.status === 'hidden' ? 'Not selected for discussion' : ['pending', 'approved'].includes(question.status) ? 'Live' : question.status}</span></li>)}</ul>
  </dialog>;
}
