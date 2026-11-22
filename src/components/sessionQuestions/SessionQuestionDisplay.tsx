import { useEffect, useRef, useState } from 'react';
import { useQuestionQueue } from './useQuestionQueue';

export default function SessionQuestionDisplay({ sessionId }: { sessionId: string }) {
  const { data, error } = useQuestionQueue(sessionId, 'display');
  const [fullscreenError, setFullscreenError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setFullscreenError('');
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const questions = !error ? data?.questions || [] : [];
  const followLatest = useRef(true);
  const latest = useRef<HTMLDivElement>(null);
  const arrivalIds = questions.map(question => question.id).join(',');
  useEffect(() => {
    const onScroll = () => {
      followLatest.current = (latest.current?.getBoundingClientRect().bottom ?? 0) <= window.innerHeight + 150;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (arrivalIds && followLatest.current) latest.current?.scrollIntoView({ block: 'end' });
  }, [arrivalIds]);
  return <main className="flex flex-1 flex-col bg-[#faf9f6] text-gray-950">
    <div className="flex w-full flex-1 flex-col p-4 py-8 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-gray-200 pb-6"><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#8B6914]">Audience Questions</p><h1 className="mt-2 break-words text-2xl font-bold">{data?.session.topic || 'Session questions'}</h1>{data?.session.facilitator && <p className="mt-2 text-sm text-gray-600">Presenter: <span className="font-semibold text-[#8B6914]">{data.session.facilitator}</span></p>}</div>{!isFullscreen && <button type="button" onClick={() => { document.documentElement.requestFullscreen().catch(() => setFullscreenError('Use your browser’s full-screen option.')); }} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50">Full screen</button>}</header>
    {fullscreenError && <p role="status" className="mt-2 text-xs text-[#8B6914]">{fullscreenError}</p>}
    <div className="flex flex-1 flex-col gap-4 py-6" aria-live="polite" aria-relevant="additions">
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error} Reconnecting…</p> : questions.length ? questions.map(question => <article key={question.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        {question.number != null && <p className="mb-1 text-xs font-bold text-[#8B6914]">Question {question.number}</p>}
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-gray-950">{question.text}</p>
        <p className="mt-1 text-xs text-gray-500">{question.authorName || 'Anonymous attendee'}{question.authorName && question.authorCompany && <> · {question.authorCompany}</>}</p>
      </article>) : <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Questions will appear here automatically as attendees send them.</p>}
      <div ref={latest} />
    </div>
    </div>
  </main>;
}
