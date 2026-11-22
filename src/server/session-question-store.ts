import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AudienceQuestion, AudienceQuestionAction, SpeakerAssignment } from '../types/sessionQuestions';

export interface SessionQuestionRepository {
  assignments(): Promise<SpeakerAssignment[]>;
  assign(speakerId: string, userId: string | null, sessionIds: string[]): Promise<void>;
  presenterSessionIds(userId: string): Promise<string[]>;
  list(sessionId: string, scope: 'admin' | 'presenter' | 'own' | 'display', userId: string): Promise<AudienceQuestion[]>;
  submit(sessionId: string, userId: string, text: string, anonymous: boolean): Promise<AudienceQuestion | null>;
  moderate(sessionId: string, questionId: string, action: AudienceQuestionAction): Promise<boolean>;
}

function mapQuestion(row: any): AudienceQuestion {
  return { id: row.id, number: row.question_number == null ? undefined : Number(row.question_number), sessionId: row.session_id, text: row.question_text, authorName: row.author_name || null,
    authorCompany: row.author_name ? row.author_company || null : null,
    status: row.status, isDisplayed: row.is_displayed, createdAt: new Date(row.created_at).toISOString() };
}

export class SessionQuestionStore implements SessionQuestionRepository {
  constructor(private pool: Pool) {}

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS speaker_login_links (
        speaker_id VARCHAR(50) PRIMARY KEY REFERENCES speakers(id) ON DELETE CASCADE,
        user_id VARCHAR(50) UNIQUE REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS session_speaker_links (
        session_id VARCHAR(50) REFERENCES sessions(id) ON DELETE CASCADE,
        speaker_id VARCHAR(50) REFERENCES speakers(id) ON DELETE CASCADE,
        PRIMARY KEY (session_id, speaker_id)
      );
      CREATE TABLE IF NOT EXISTS audience_questions (
        id VARCHAR(50) PRIMARY KEY,
        session_id VARCHAR(50) NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        author_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        question_text TEXT NOT NULL CHECK (length(question_text) BETWEEN 10 AND 1000),
        author_name TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','hidden','answered')),
        is_displayed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (NOT is_displayed OR status = 'approved')
      );
      CREATE UNIQUE INDEX IF NOT EXISTS audience_questions_one_display ON audience_questions(session_id) WHERE is_displayed;
      ALTER TABLE audience_questions ALTER COLUMN status SET DEFAULT 'approved';
      ALTER TABLE audience_questions ADD COLUMN IF NOT EXISTS question_number INTEGER;
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, id)::integer AS number FROM audience_questions
      ) UPDATE audience_questions q SET question_number = numbered.number FROM numbered WHERE q.id = numbered.id AND q.question_number IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS audience_questions_session_number ON audience_questions(session_id, question_number);
      CREATE INDEX IF NOT EXISTS audience_questions_queue ON audience_questions(session_id, created_at);
      CREATE INDEX IF NOT EXISTS audience_questions_author ON audience_questions(author_id, created_at);
    `);
  }

  async assignments(): Promise<SpeakerAssignment[]> {
    const result = await this.pool.query(`SELECT s.id AS "speakerId", l.user_id AS "userId", (l.speaker_id IS NOT NULL) AS configured,
      COALESCE(array_agg(sl.session_id) FILTER (WHERE sl.session_id IS NOT NULL), '{}') AS "sessionIds"
      FROM speakers s LEFT JOIN speaker_login_links l ON l.speaker_id = s.id
      LEFT JOIN session_speaker_links sl ON sl.speaker_id = s.id GROUP BY s.id, l.user_id, l.speaker_id`);
    return result.rows;
  }

  async assign(speakerId: string, userId: string | null, sessionIds: string[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM speakers WHERE id = $1 FOR UPDATE', [speakerId]);
      await client.query(`INSERT INTO speaker_login_links (speaker_id, user_id) VALUES ($1,$2)
        ON CONFLICT (speaker_id) DO UPDATE SET user_id = EXCLUDED.user_id`, [speakerId, userId]);
      await client.query('DELETE FROM session_speaker_links WHERE speaker_id = $1', [speakerId]);
      for (const sessionId of sessionIds) {
        await client.query('INSERT INTO session_speaker_links (session_id, speaker_id) VALUES ($1,$2)', [sessionId, speakerId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async presenterSessionIds(userId: string): Promise<string[]> {
    const result = await this.pool.query(`SELECT sl.session_id FROM session_speaker_links sl
      JOIN speaker_login_links l ON l.speaker_id = sl.speaker_id WHERE l.user_id = $1`, [userId]);
    return result.rows.map(row => row.session_id);
  }

  async list(sessionId: string, scope: 'admin' | 'presenter' | 'own' | 'display', userId: string) {
    const filters = { admin: '', presenter: "AND q.status IN ('pending','approved','answered')", own: 'AND q.author_id = $2', display: "AND q.status IN ('pending','approved','answered')" };
    const result = await this.pool.query(`SELECT q.*, CASE WHEN q.author_name IS NOT NULL THEN u.organization ELSE NULL END AS author_company
      FROM audience_questions q LEFT JOIN users u ON u.id = q.author_id
      WHERE q.session_id = $1 ${filters[scope]} ORDER BY q.question_number, q.created_at, q.id`, scope === 'own' ? [sessionId, userId] : [sessionId]);
    return result.rows.map(mapQuestion);
  }

  async submit(sessionId: string, userId: string, text: string, anonymous: boolean) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Allocate arrival numbers under a session lock, including simultaneous submissions.
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
      const user = await client.query('SELECT first_name, last_name, organization FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const recent = await client.query(`SELECT count(*) FROM audience_questions WHERE author_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`, [userId]);
      if (Number(recent.rows[0].count) >= 5) { await client.query('ROLLBACK'); return null; }
      const authorName = anonymous ? null : `${user.rows[0].first_name} ${user.rows[0].last_name}`;
      const next = await client.query('SELECT COALESCE(MAX(question_number), 0) + 1 AS number FROM audience_questions WHERE session_id = $1', [sessionId]);
      const result = await client.query(`INSERT INTO audience_questions (id,session_id,author_id,question_text,author_name,question_number,status)
        VALUES ($1,$2,$3,$4,$5,$6,'approved') RETURNING *`, [`aq_${randomUUID()}`, sessionId, userId, text, authorName, next.rows[0].number]);
      await client.query('COMMIT');
      return mapQuestion({ ...result.rows[0], author_company: anonymous ? null : user.rows[0].organization });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async moderate(sessionId: string, questionId: string, action: AudienceQuestionAction) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize updates for this session so two moderators cannot beam two questions.
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
      const result = await client.query('SELECT * FROM audience_questions WHERE id = $1 AND session_id = $2 FOR UPDATE', [questionId, sessionId]);
      const question = result.rows[0];
      if (!question || action === 'display' && question.status !== 'approved'
        || action === 'answer' && !['pending', 'approved'].includes(question.status)
        || action === 'approve' && !['pending', 'hidden'].includes(question.status)) {
        await client.query('ROLLBACK'); return false;
      }
      if (action === 'display') {
        await client.query('UPDATE audience_questions SET is_displayed = FALSE, updated_at = NOW() WHERE session_id = $1 AND is_displayed', [sessionId]);
        await client.query('UPDATE audience_questions SET is_displayed = TRUE, updated_at = NOW() WHERE id = $1', [questionId]);
      } else if (action === 'clear') {
        await client.query('UPDATE audience_questions SET is_displayed = FALSE, updated_at = NOW() WHERE id = $1', [questionId]);
      } else {
        const status = { approve: 'approved', hide: 'hidden', answer: 'answered' }[action];
        await client.query('UPDATE audience_questions SET status = $2, is_displayed = FALSE, updated_at = NOW() WHERE id = $1', [questionId, status]);
      }
      await client.query('COMMIT'); return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
