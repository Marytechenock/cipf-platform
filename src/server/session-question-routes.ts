import type { Express, Request, Response } from 'express';
import type { AppDatabase } from '../../server';
import type { StoredUser } from '../types';
import type { AudienceQuestionAction } from '../types/sessionQuestions';

export function registerSessionQuestionRoutes(app: Express, db: AppDatabase, getAuthUser: (req: Request) => Promise<StoredUser | null>) {
  const route = (admin: boolean, handler: (req: Request, res: Response, user: StoredUser) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = await getAuthUser(req);
      if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
      if (admin ? user.role !== 'admin' : !['attendee', 'admin'].includes(user.role)) return res.status(403).json({ error: 'You do not have access to session questions.' });
      if (!db.sessionQuestions) return res.status(503).json({ error: 'Session questions are temporarily unavailable.' });
      return await handler(req, res, user);
    } catch (error: any) {
      if (error.code === '23505') return res.status(409).json({ error: 'This login account is already linked to another speaker.' });
      res.locals.auditCause = error instanceof Error ? error.message : String(error);
      console.error('Session questions request failed:', error);
      res.status(500).json({ error: 'Could not complete the session questions request. Please try again.' });
    }
  };
  const session = async (id: string) => (await db.getSessions()).find(item => item.id === id);

  app.get('/api/admin/session-question-setup', route(true, async (_req, res) => {
    const [speakers, sessions, users, assignments] = await Promise.all([
      db.getSpeakers(), db.getSessions(), db.exportAdminUsers({ status: 'active', sort: 'name_asc' }), db.sessionQuestions!.assignments()
    ]);
    res.json({ speakers, sessions, assignments, accounts: users.filter(user => user.role === 'attendee' || user.role === 'admin')
      .map(({ id, firstName, lastName, email }) => ({ id, firstName, lastName, email })) });
  }));

  app.put('/api/admin/session-question-setup/:speakerId', route(true, async (req, res) => {
    const { userId, sessionIds } = req.body;
    if (!(userId === null || typeof userId === 'string' && userId.length > 0) || !Array.isArray(sessionIds) || sessionIds.length > 100 || sessionIds.some(id => typeof id !== 'string')) {
      return res.status(400).json({ error: 'Select a login account (or no account) and valid sessions.' });
    }
    const [speakers, sessions, account] = await Promise.all([db.getSpeakers(), db.getSessions(), userId ? db.getUserById(userId) : null]);
    if (!speakers.some(speaker => speaker.id === req.params.speakerId)) return res.status(404).json({ error: 'Speaker not found.' });
    if (userId && (!account || account.status !== 'active' || !['attendee', 'admin'].includes(account.role))) return res.status(400).json({ error: 'Choose an active attendee or administrator account.' });
    if (sessionIds.some(id => !sessions.some(item => item.id === id && (!item.type || item.type === 'session')))) return res.status(400).json({ error: 'Choose valid conference sessions.' });
    await db.sessionQuestions!.assign(req.params.speakerId, userId, [...new Set(sessionIds)] as string[]);
    res.json({ success: true });
  }));

  app.get('/api/session-questions/my-sessions', route(false, async (_req, res, user) => {
    const ids = await db.sessionQuestions!.presenterSessionIds(user.id);
    res.json({ sessions: (await db.getSessions()).filter(item => ids.includes(item.id)) });
  }));

  app.get('/api/session-questions/:sessionId', route(false, async (req, res, user) => {
    const selected = await session(req.params.sessionId);
    if (!selected) return res.status(404).json({ error: 'Session not found.' });
    const mode = req.query.mode || 'own';
    if (!['own', 'presenter', 'admin', 'display'].includes(String(mode))) return res.status(400).json({ error: 'Invalid question view.' });
    if ((mode === 'admin' || mode === 'display') && user.role !== 'admin') return res.status(403).json({ error: 'Only moderators can access this view.' });
    if (mode === 'presenter' && user.role !== 'admin' && !(await db.sessionQuestions!.presenterSessionIds(user.id)).includes(selected.id)) {
      return res.status(403).json({ error: 'You are not assigned to this session.' });
    }
    res.json({ session: selected, questions: await db.sessionQuestions!.list(selected.id, mode as 'own' | 'presenter' | 'admin' | 'display', user.id) });
  }));

  app.post('/api/session-questions/:sessionId', route(false, async (req, res, user) => {
    if (user.role !== 'attendee') return res.status(403).json({ error: 'Only attendees can submit audience questions.' });
    const selected = await session(req.params.sessionId);
    if (!selected || selected.type && selected.type !== 'session') return res.status(404).json({ error: 'Conference session not found.' });
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (text.length < 10 || text.length > 1000 || typeof req.body.anonymous !== 'boolean') return res.status(400).json({ error: 'Enter a question between 10 and 1000 characters and choose whether to show your name.' });
    const question = await db.sessionQuestions!.submit(selected.id, user.id, text, req.body.anonymous);
    if (!question) return res.status(429).json({ error: 'Please wait a minute before sending more questions.' });
    res.status(201).json({ success: true, question });
  }));

  app.post('/api/admin/session-questions/:sessionId/:questionId', route(true, async (req, res) => {
    const actions: AudienceQuestionAction[] = ['approve', 'hide', 'answer', 'display', 'clear'];
    if (!actions.includes(req.body.action)) return res.status(400).json({ error: 'Invalid moderation action.' });
    const changed = await db.sessionQuestions!.moderate(req.params.sessionId, req.params.questionId, req.body.action);
    if (!changed) return res.status(409).json({ error: 'The question changed or is unavailable. Try again after the queue updates.' });
    res.json({ success: true });
  }));
}
