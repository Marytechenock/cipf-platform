import { useEffect, useState } from 'react';
import type { Session } from '../../types';
import { sessionQuestionsApi } from '../../lib/sessionQuestions';
import SessionQuestionQueue from './SessionQuestionQueue';

export default function PresenterQuestions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    sessionQuestionsApi.mySessions(controller.signal).then(data => {
      if (!controller.signal.aborted) { setSessions(data.sessions); setSelected(data.sessions[0]?.id || ''); }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const session = sessions.find(item => item.id === selected);
  return <section className="mx-auto max-w-4xl space-y-6 p-4 py-8 sm:p-8">
    <h1 className="text-2xl font-bold">My Sessions · Audience Questions</h1>
    <p className="text-sm text-gray-600">Audience questions for your assigned sessions appear here and on the venue screen automatically. Hidden questions are excluded.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Loading your sessions…</p> : sessions.length ? <>
      <label className="block text-sm font-semibold">Your session<select value={selected} onChange={event => setSelected(event.target.value)} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white p-3">{sessions.map(item => <option key={item.id} value={item.id}>{item.topic} · Day {item.day} · {item.time}</option>)}</select></label>
      {session && <p className="text-sm text-[#8B6914]">Day {session.day} · {session.time} · {session.venue}</p>}
      <div key={selected}><SessionQuestionQueue sessionId={selected} /></div>
    </> : !error && <p className="rounded-xl border border-gray-200 p-6 text-sm">No sessions are assigned to this account. Ask the event administrator to link your speaker profile and sessions.</p>}
  </section>;
}
