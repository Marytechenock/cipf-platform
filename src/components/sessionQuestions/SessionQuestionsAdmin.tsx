import { useEffect, useState, type FormEvent } from 'react';
import { sessionQuestionsApi } from '../../lib/sessionQuestions';
import type { QuestionSetup } from '../../types/sessionQuestions';
import SessionQuestionQueue from './SessionQuestionQueue';
import { getInitialSpeakerSessionIds, getProgrammeSpeakerSessionIds } from '../../lib/speakerSessions';

export default function SessionQuestionsAdmin() {
  const [setup, setSetup] = useState<QuestionSetup | null>(null);
  const [speakerId, setSpeakerId] = useState('');
  const [userId, setUserId] = useState('');
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [queueSessionId, setQueueSessionId] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    sessionQuestionsApi.setup().then(data => { if (active) setSetup(data); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const chooseSpeaker = (id: string) => {
    setSpeakerId(id); setSearch(''); setNotice('');
    const assignment = setup?.assignments.find(item => item.speakerId === id);
    const speaker = setup?.speakers.find(item => item.id === id);
    setUserId(assignment?.userId || '');
    setAssignedIds(speaker && setup ? getInitialSpeakerSessionIds(speaker, setup.sessions, assignment) : []);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !speakerId) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await sessionQuestionsApi.assign({ speakerId, userId: userId || null, sessionIds: assignedIds });
      setSetup(await sessionQuestionsApi.setup());
      setNotice('Speaker access saved. Their existing login, attendee access, and QR code are unchanged.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save assignment.'); }
    finally { setSaving(false); }
  };
  const selectStyle = 'mt-2 block w-full rounded-lg border border-gray-300 bg-white p-3 text-sm font-normal';
  const selectedSpeaker = setup?.speakers.find(item => item.id === speakerId);
  const programmeSessionIds = selectedSpeaker && setup ? getProgrammeSpeakerSessionIds(selectedSpeaker, setup.sessions) : [];
  const selectedAssignment = setup?.assignments.find(item => item.speakerId === speakerId);
  const alreadyConfigured = selectedAssignment?.configured ?? Boolean(selectedAssignment?.userId || selectedAssignment?.sessionIds.length);
  return <section className="space-y-6">
    <header><h2 className="text-xl font-bold">Session Questions</h2><p className="mt-2 text-sm text-gray-600">Link speaker accounts to their sessions, then review questions before sharing them with speakers or the venue screen.</p></header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!setup ? !error && <p role="status">Loading setup…</p> : <div className="grid items-start gap-6 xl:grid-cols-[minmax(280px,1fr)_2fr]">
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="font-bold text-[#8B6914]">Speaker access</h3>
        <label className="block text-sm font-semibold">Speaker profile<select required value={speakerId} disabled={saving} onChange={event => chooseSpeaker(event.target.value)} className={selectStyle}><option value="">Select a speaker</option>{setup.speakers.map(speaker => <option key={speaker.id} value={speaker.id}>{speaker.name}</option>)}</select></label>
        {speakerId && <fieldset disabled={saving} className="space-y-4">
          <label className="block text-sm font-semibold">Find an existing account<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search name or email" className={selectStyle} /></label>
          <label className="block text-sm font-semibold">Linked login account<select value={userId} onChange={event => setUserId(event.target.value)} className={selectStyle}><option value="">No linked account</option>{setup.accounts.filter(account => account.id === userId || `${account.firstName} ${account.lastName} ${account.email || ''}`.toLowerCase().includes(search.toLowerCase())).map(account => <option key={account.id} value={account.id}>{account.firstName} {account.lastName} — {account.email || 'No email / check-in not completed'}</option>)}</select></label>
          <div><p className="text-sm font-semibold">Assigned sessions</p><p className="mt-1 text-xs text-gray-500">{alreadyConfigured ? 'Your saved session assignments are selected.' : programmeSessionIds.length ? 'Existing Programme sessions are preselected for this speaker.' : 'No clear Programme match was found. Select the sessions for this speaker.'} You can untick sessions or add others. Review and save to apply presenter access.</p>
            <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-gray-200 p-3">{setup.sessions.filter(session => !session.type || session.type === 'session').map(session => <label key={session.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={assignedIds.includes(session.id)} onChange={event => setAssignedIds(current => event.target.checked ? [...current, session.id] : current.filter(id => id !== session.id))} className="mt-1" /><span>{session.topic}{programmeSessionIds.includes(session.id) && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#8B6914]">From Programme</span>}<span className="block text-xs text-gray-500">Day {session.day} · {session.time} · {session.category}</span></span></label>)}</div>
          </div>
          <button className="min-h-11 rounded-lg bg-[#8B6914] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save speaker access'}</button>
        </fieldset>}
        {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      </form>
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
        <label className="block text-sm font-bold">Moderate a session<select value={queueSessionId} onChange={event => setQueueSessionId(event.target.value)} className={selectStyle}><option value="">Select a session</option>{setup.sessions.filter(session => !session.type || session.type === 'session').map(session => <option key={session.id} value={session.id}>Day {session.day} · {session.time} · {session.topic} ({session.category})</option>)}</select></label>
        <div key={queueSessionId}><SessionQuestionQueue sessionId={queueSessionId} moderator /></div>
      </div>
    </div>}
  </section>;
}
