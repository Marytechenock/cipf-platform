import { Pool, PoolConfig } from 'pg';
import {
    AdminUserListQuery,
    AdminUserSort,
    ApiAuditEntry,
    ApiMetrics,
    ApiMetricsQuery,
    AdventureActivity,
    AttendanceRecord,
    FeedbackSubmission,
    GalleryImage,
    PaginatedResult,
    PublicAttendeeDirectoryEntry,
    PublicAttendeeListQuery,
    Election,
    ElectionBallot,
    ElectionCandidate,
    ElectionDashboard,
    ElectionVote,
    ElectionVoter,
    QAQuestion,
    QAResponse,
    Session,
    SessionNote,
    Speaker,
    StoredUser as User,
    Sponsor,
    Testimonial,
    VenueInfo,
    DayLink,
    StudyMaterial  // ADD THIS IMPORT
} from '../types';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { findAttendanceSession } from '../config/attendanceSessions';
import { officialProgrammeSessions, sortSessionsInProgrammeOrder } from '../config/programmeSessions';
import { SessionQuestionStore } from './session-question-store';
import { createEmptyApiMetrics } from './api-metrics';
import {
    filterAdminUsers,
    getSearchTokens,
    listAdminUsers as listAdminUsersInUsers,
    listPublicAttendees as listPublicAttendeesInUsers,
    searchAttendees as searchAttendeesInUsers
} from './attendee-search';

dotenv.config();

function normalizeOptionalEmail(email?: string | null): string | null {
    const trimmed = email?.trim();
    return trimmed ? trimmed : null;
}

export class PostgresDatabase {
    readonly sessionQuestions: SessionQuestionStore;
    private pool: Pool;
    private isSeeded: boolean = false;
    private readonly databaseName: string;
    private readonly autoCreateDatabase: boolean;
    private readonly initializationPromise: Promise<void>;

    constructor() {
        this.databaseName = process.env.DB_NAME || 'cip_election';
        this.autoCreateDatabase = process.env.DB_AUTO_CREATE === 'true';
        this.pool = new Pool(this.buildPoolConfig(this.databaseName));
        this.sessionQuestions = new SessionQuestionStore(this.pool);
        this.initializationPromise = this.init();
    }

    private buildPoolConfig(database: string): PoolConfig {
        const sslEnabled = process.env.DB_SSL === 'true';
        const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';

        return {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ...(sslEnabled ? {
                ssl: {
                    rejectUnauthorized: sslRejectUnauthorized
                }
            } : {})
        };
    }

    private validateDatabaseName(database: string) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
            throw new Error(`Unsafe database name "${database}". Use only letters, numbers, and underscores.`);
        }
    }

    private async init() {
        try {
            const client = await this.pool.connect();
            console.log('PostgreSQL connected successfully');
            client.release();

            await this.ensureTables();
            await this.sessionQuestions.ensureSchema();
            await this.ensureIndexes();
            await this.ensureData();

        } catch (err: any) {
            if (err.code === '3D000') {
                if (!this.autoCreateDatabase) {
                    const message = `Configured database "${this.databaseName}" is unavailable. Create it first or set DB_AUTO_CREATE=true for local bootstrap. Original error: ${err.message}`;
                    console.error(message);
                    throw new Error(message);
                }

                console.log('Database does not exist, creating it...');
                await this.createDatabase();
                return;
            }

            console.error('Error connecting to PostgreSQL:', err);
            throw err;
        }
    }

    private async createDatabase() {
        this.validateDatabaseName(this.databaseName);
        const tempPool = new Pool(this.buildPoolConfig('postgres'));

        const client = await tempPool.connect();
        try {
            await client.query(`CREATE DATABASE "${this.databaseName}";`);
            console.log(`Database "${this.databaseName}" created successfully`);
        } catch (err) {
            console.error('Failed to create database:', err);
            throw err;
        } finally {
            client.release();
            await tempPool.end();
        }

        try {
            const client = await this.pool.connect();
            client.release();
            await this.ensureTables();
            await this.sessionQuestions.ensureSchema();
            await this.ensureIndexes();
            await this.ensureData();
        } catch (err) {
            console.error('Error reconnecting:', err);
        }
    }

    async ready(): Promise<void> {
        await this.initializationPromise;
    }

    private async ensureIndexes() {
        const client = await this.pool.connect();
        try {
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
                CREATE INDEX IF NOT EXISTS idx_users_role_checked_in ON users(role, checked_in);
                CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_day_links_order ON day_links("order");
                CREATE INDEX IF NOT EXISTS idx_study_materials_upload_date ON study_materials(upload_date DESC);
            `);
        } catch (err) {
            console.error('Error creating indexes:', err);
        } finally {
            client.release();
        }
    }

    private async ensureTables() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'users'
                );
            `);

            if (!result.rows[0].exists) {
                console.log('Creating tables...');
            } else {
                console.log('Tables already exist');
            }

            // Keep the schema self-healing for newly added tables/columns.
            await this.createTables();
            console.log('Tables verified successfully');
        } catch (err) {
            console.error('Error checking tables:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    private async createTables() {
        const client = await this.pool.connect();
        try {
            // Users table
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(50) PRIMARY KEY,
                    email VARCHAR(255),
                    first_name VARCHAR(100) NOT NULL,
                    last_name VARCHAR(100) NOT NULL,
                    role VARCHAR(20) DEFAULT 'attendee',
                    organization VARCHAR(255),
                    position VARCHAR(255),
                    status VARCHAR(20) DEFAULT 'active',
                    class VARCHAR(2) DEFAULT 'A',
                    accommodation_provided BOOLEAN DEFAULT FALSE,
                    room_number VARCHAR(50),
                    transport_provided BOOLEAN DEFAULT FALSE,
                    checked_in BOOLEAN DEFAULT FALSE,
                    checked_in_at TIMESTAMP,
                    has_set_password BOOLEAN DEFAULT FALSE,
                    password VARCHAR(255),
                    selected_activity VARCHAR(50),
                    qr_token VARCHAR(100) UNIQUE,
                    qr_issued_at TIMESTAMP,
                    qr_email_sent_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_email UNIQUE (email)
                );
            `);

            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_token VARCHAR(100) UNIQUE;`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_issued_at TIMESTAMP;`);
            await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS qr_email_sent_at TIMESTAMP;`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS api_audit_logs (
                    id VARCHAR(60) PRIMARY KEY,
                    time TIMESTAMPTZ NOT NULL,
                    actor_id VARCHAR(50),
                    actor_name VARCHAR(255) NOT NULL,
                    method VARCHAR(10) NOT NULL,
                    path TEXT NOT NULL,
                    status_code INTEGER NOT NULL,
                    duration_ms INTEGER NOT NULL,
                    error_code VARCHAR(100),
                    error_cause TEXT
                );
            `);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_api_audit_logs_time ON api_audit_logs(time DESC);`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_api_audit_logs_status ON api_audit_logs(status_code, time DESC);`);

            // Sessions table
            await client.query(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id VARCHAR(50) PRIMARY KEY,
                    category VARCHAR(20) NOT NULL,
                    day INTEGER NOT NULL,
                    day_label VARCHAR(255) NOT NULL,
                    time VARCHAR(50) NOT NULL,
                    topic TEXT NOT NULL,
                    facilitator VARCHAR(255),
                    venue VARCHAR(255),
                    type VARCHAR(20) DEFAULT 'session',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Notes table
            await client.query(`
                CREATE TABLE IF NOT EXISTS attendance_records (
                    id VARCHAR(50) PRIMARY KEY,
                    attendee_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    session_id VARCHAR(50) NOT NULL,
                    scanned_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
                    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status VARCHAR(20) DEFAULT 'present',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(attendee_id, session_id)
                );
            `);

            await client.query(`ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_session_id_fkey;`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_records(session_id, scanned_at DESC);`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_attendee ON attendance_records(attendee_id);`);

            // Q&A tables
            await client.query(`
                CREATE TABLE IF NOT EXISTS qa_questions (
                    id VARCHAR(50) PRIMARY KEY,
                    session_id VARCHAR(50) NOT NULL,
                    question_title VARCHAR(160) DEFAULT '',
                    question_text TEXT NOT NULL,
                    type VARCHAR(30) NOT NULL,
                    options JSONB DEFAULT '[]'::jsonb,
                    status VARCHAR(20) DEFAULT 'draft',
                    display_order BIGINT DEFAULT 0,
                    created_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    published_at TIMESTAMP NULL,
                    closed_at TIMESTAMP NULL
                );
            `);
            await client.query(`ALTER TABLE qa_questions ADD COLUMN IF NOT EXISTS question_title VARCHAR(160) DEFAULT '';`);
            await client.query(`ALTER TABLE qa_questions ALTER COLUMN display_order TYPE BIGINT USING display_order::bigint;`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS qa_responses (
                    id VARCHAR(50) PRIMARY KEY,
                    question_id VARCHAR(50) REFERENCES qa_questions(id) ON DELETE CASCADE,
                    session_id VARCHAR(50) NOT NULL,
                    attendee_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    answer TEXT NOT NULL,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(question_id, attendee_id)
                );
            `);

            await client.query(`CREATE INDEX IF NOT EXISTS idx_qa_questions_session ON qa_questions(session_id, status, display_order);`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_qa_responses_question ON qa_responses(question_id, submitted_at DESC);`);

            // Voting / election tables
            await client.query(`
                CREATE TABLE IF NOT EXISTS elections (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT DEFAULT '',
                    status VARCHAR(20) DEFAULT 'draft',
                    board_seats INTEGER DEFAULT 1,
                    starts_at TIMESTAMP NULL,
                    ends_at TIMESTAMP NULL,
                    timezone VARCHAR(80) DEFAULT 'Africa/Harare',
                    created_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    opened_at TIMESTAMP NULL,
                    closed_at TIMESTAMP NULL
                );
            `);
            await client.query(`ALTER TABLE elections ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP NULL;`);
            await client.query(`ALTER TABLE elections ADD COLUMN IF NOT EXISTS ends_at TIMESTAMP NULL;`);
            await client.query(`ALTER TABLE elections ADD COLUMN IF NOT EXISTS timezone VARCHAR(80) DEFAULT 'Africa/Harare';`);

            await client.query(`
                CREATE TABLE IF NOT EXISTS election_candidates (
                    id VARCHAR(50) PRIMARY KEY,
                    election_id VARCHAR(50) REFERENCES elections(id) ON DELETE CASCADE,
                    category VARCHAR(30) NOT NULL,
                    full_name VARCHAR(255) NOT NULL,
                    organization VARCHAR(255) DEFAULT '',
                    position VARCHAR(255) DEFAULT '',
                    bio TEXT DEFAULT '',
                    photo_url TEXT DEFAULT '',
                    display_order INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS election_voters (
                    id VARCHAR(50) PRIMARY KEY,
                    election_id VARCHAR(50) REFERENCES elections(id) ON DELETE CASCADE,
                    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(election_id, user_id)
                );
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS election_votes (
                    id VARCHAR(50) PRIMARY KEY,
                    election_id VARCHAR(50) REFERENCES elections(id) ON DELETE CASCADE,
                    voter_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    candidate_id VARCHAR(50) REFERENCES election_candidates(id) ON DELETE CASCADE,
                    category VARCHAR(30) NOT NULL,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(election_id, voter_id, candidate_id)
                );
            `);

            await client.query(`CREATE INDEX IF NOT EXISTS idx_election_candidates_election ON election_candidates(election_id, category, display_order);`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_election_voters_election ON election_voters(election_id);`);
            await client.query(`ALTER TABLE election_voters ADD COLUMN IF NOT EXISTS eligible_category VARCHAR(30);`);
            await client.query(`ALTER TABLE election_voters ADD COLUMN IF NOT EXISTS identifier VARCHAR(100);`);
            await client.query(`ALTER TABLE election_voters ADD COLUMN IF NOT EXISTS member_category VARCHAR(100);`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_election_voter_identifier ON election_voters(election_id, LOWER(identifier)) WHERE identifier IS NOT NULL;`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_election_votes_election ON election_votes(election_id, category);`);

            // Notes table
            await client.query(`
                CREATE TABLE IF NOT EXISTS notes (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    session_id VARCHAR(50) REFERENCES sessions(id) ON DELETE CASCADE,
                    content TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, session_id)
                );
            `);

            // Speakers table
            await client.query(`
                CREATE TABLE IF NOT EXISTS speakers (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    position VARCHAR(255),
                    organization VARCHAR(255),
                    topic TEXT,
                    speaking_time VARCHAR(100),
                    bio TEXT,
                    photo_url VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Sponsors table
            await client.query(`
                CREATE TABLE IF NOT EXISTS sponsors (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    logo_url VARCHAR(255),
                    description TEXT,
                    website VARCHAR(255),
                    duration_label VARCHAR(100),
                    tier VARCHAR(50) DEFAULT 'Dinner',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await client.query(`ALTER TABLE sponsors ALTER COLUMN tier TYPE VARCHAR(50);`);

            // Testimonials table
            await client.query(`
                CREATE TABLE IF NOT EXISTS testimonials (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    company VARCHAR(255),
                    position VARCHAR(255),
                    text TEXT NOT NULL,
                    photo_url VARCHAR(50),
                    accent_char VARCHAR(5),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Gallery table
            await client.query(`
                CREATE TABLE IF NOT EXISTS gallery (
                    id VARCHAR(50) PRIMARY KEY,
                    url TEXT NOT NULL,
                    caption TEXT NOT NULL,
                    description TEXT,
                    category VARCHAR(120) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await client.query(`ALTER TABLE gallery ALTER COLUMN category TYPE VARCHAR(120);`);
            await client.query(`ALTER TABLE gallery ADD COLUMN IF NOT EXISTS description TEXT;`);

            // Venue table
            await client.query(`
                CREATE TABLE IF NOT EXISTS venue (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    overview TEXT,
                    accommodation TEXT,
                    conference TEXT,
                    views TEXT,
                    amenities JSONB,
                    image_url VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Adventures table
            await client.query(`
                CREATE TABLE IF NOT EXISTS adventures (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    image_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await client.query(`ALTER TABLE adventures ADD COLUMN IF NOT EXISTS image_url TEXT;`);

            // Feedback table
            await client.query(`
                CREATE TABLE IF NOT EXISTS feedback (
                    id VARCHAR(50) PRIMARY KEY,
                    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
                    user_email VARCHAR(255) NOT NULL,
                    user_name VARCHAR(255) NOT NULL,
                    rating INTEGER,
                    best_session TEXT,
                    best_facilitator TEXT,
                    improvements TEXT,
                    attend_again BOOLEAN DEFAULT FALSE,
                    chat_transcript JSONB,
                    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Google Drive table
            await client.query(`
                CREATE TABLE IF NOT EXISTS google_drive (
                    id VARCHAR(50) PRIMARY KEY DEFAULT 'drive_1',
                    link TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Day Links table
            await client.query(`
                CREATE TABLE IF NOT EXISTS day_links (
                    id VARCHAR(50) PRIMARY KEY,
                    day VARCHAR(50) NOT NULL,
                    drive_link TEXT NOT NULL,
                    "order" INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // ============ STUDY MATERIALS TABLE - NEW ============
            await client.query(`
                CREATE TABLE IF NOT EXISTS study_materials (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    file_name VARCHAR(255) NOT NULL,
                    file_url TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    uploaded_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
                    downloads INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
            // ============ END STUDY MATERIALS TABLE ============

            console.log('All tables created successfully');
        } catch (err) {
            console.error('Failed to create tables:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    private async ensureData() {
        if (this.isSeeded) return;

        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT COUNT(*) FROM users');
            const count = parseInt(result.rows[0].count);

            if (count === 0) {
                console.log('No data found, seeding database...');
                await this.seedData();
                this.isSeeded = true;
                console.log('Database seeded successfully');
            } else {
                console.log(`Data already exists (${count} users)`);
            }
            await this.ensureOfficialProgrammeSessions(client);
            await this.ensureBootstrapAdmin(client);
            await this.ensureBootstrapSuperAdmin(client);
        } catch (err) {
            console.error('Error checking data:', err);
            if (process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL || process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD) throw err;
        } finally {
            client.release();
        }
    }

    private async ensureBootstrapAdmin(client: any) {
        if (process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL) return;
        const superAdmin = await client.query("SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1");
        if (superAdmin.rows.length > 0) return;
        const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@maz.co.zw').trim().toLowerCase();
        const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin@2026Pass';
        const forceReset = process.env.ADMIN_BOOTSTRAP_FORCE_RESET === 'true';

        if (!email || !password) {
            return;
        }

        if (password.length < 12) {
            throw new Error('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters long.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const now = new Date().toISOString();
        const existing = await client.query(
            'SELECT id, role, has_set_password, password FROM users WHERE LOWER(email) = $1 LIMIT 1',
            [email]
        );

        if (existing.rows.length > 0) {
            const admin = existing.rows[0];
            if (admin.role !== 'admin') {
                console.log(`Bootstrap admin email already belongs to a non-admin user (${email})`);
                return;
            }

            if (admin.has_set_password && admin.password && !forceReset) {
                console.log(`Bootstrap admin already exists (${email})`);
                return;
            }

            await client.query(
                `UPDATE users
                 SET has_set_password = TRUE,
                     password = $1,
                     status = 'active',
                     updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [hashedPassword, admin.id]
            );
            console.log(forceReset
                ? `Bootstrap admin password force-reset (${email})`
                : `Bootstrap admin password initialized (${email})`);
            return;
        }

        await this.saveUserDirect(client, {
            id: `admin_${Date.now()}`,
            email,
            firstName: process.env.ADMIN_BOOTSTRAP_FIRST_NAME || 'System',
            lastName: process.env.ADMIN_BOOTSTRAP_LAST_NAME || 'Administrator',
            role: 'admin',
            organization: process.env.ADMIN_BOOTSTRAP_ORGANIZATION || 'MAZ Business Institute',
            position: process.env.ADMIN_BOOTSTRAP_POSITION || 'Administrator',
            status: 'active',
            accommodationProvided: false,
            roomNumber: '',
            transportProvided: false,
            checkedIn: false,
            checkedInAt: '',
            hasSetPassword: true,
            password: hashedPassword,
            selectedActivity: '',
            class: 'A',
            createdAt: now,
            updatedAt: now
        });

        console.log(`Bootstrap admin created (${email})`);
    }

    private async ensureBootstrapSuperAdmin(client: any) {
        const email = process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
        const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;
        if (!email && !password) return;
        if (!email || !password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
            throw new Error('Set SUPER_ADMIN_BOOTSTRAP_EMAIL and a SUPER_ADMIN_BOOTSTRAP_PASSWORD of 12 to 72 bytes.');
        }
        const existing = await client.query('SELECT id, role FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (existing.rows.length > 0) {
            if (existing.rows[0].role !== 'super_admin') throw new Error('Super admin bootstrap email is already used by another account.');
            return;
        }
        await this.saveUserDirect(client, {
            id: `super_admin_${Date.now()}`,
            email,
            firstName: process.env.SUPER_ADMIN_BOOTSTRAP_FIRST_NAME || 'System',
            lastName: process.env.SUPER_ADMIN_BOOTSTRAP_LAST_NAME || 'Owner',
            role: 'super_admin', organization: '', position: 'Super Administrator', status: 'active',
            accommodationProvided: false, roomNumber: '', transportProvided: false,
            checkedIn: false, checkedInAt: '', hasSetPassword: true,
            password: await bcrypt.hash(password, 12), selectedActivity: '', class: 'A',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        console.log(`Bootstrap super admin created (${email})`);
    }

    private async ensureOfficialProgrammeSessions(client: any) {
        const stats = await client.query(`
            SELECT
                COUNT(*)::int as total,
                COUNT(*) FILTER (
                    WHERE day_label ILIKE '%June%'
                       OR topic ILIKE '%Kariba%'
                       OR venue ILIKE '%Kariba%'
                )::int as legacy_count
            FROM sessions
        `);
        const total = Number(stats.rows[0]?.total || 0);
        const legacyCount = Number(stats.rows[0]?.legacy_count || 0);

        if (legacyCount > 0) {
            await client.query(
                `DELETE FROM sessions
                 WHERE day_label ILIKE '%June%'
                    OR topic ILIKE '%Kariba%'
                    OR venue ILIKE '%Kariba%'`
            );
        }

        if (total === 0 || legacyCount > 0) {
            for (const session of officialProgrammeSessions) {
                const { id, category, day, dayLabel, time, topic, facilitator, venue, type } = session;
                await client.query(
                    `INSERT INTO sessions (id, category, day, day_label, time, topic, facilitator, venue, type, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                     ON CONFLICT (id) DO NOTHING`,
                    [id, category, day, dayLabel, time, topic, facilitator, venue, type]
                );
            }
        }
    }

    private async seedData() {
        const client = await this.pool.connect();
        try {
            const dbPath = path.join(process.cwd(), 'src', 'server', 'db.json');

            if (!fs.existsSync(dbPath)) {
                console.error('db.json not found at:', dbPath);
                return;
            }

            const rawData = fs.readFileSync(dbPath, 'utf8');
            const data = JSON.parse(rawData);

            // Seed Users
            console.log('  Seeding Users...');
            for (const user of data.users || []) {
                if (user.role === 'admin' && process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL) continue;
                try {
                    await this.saveUserDirect(client, user);
                } catch (err) {}
            }

            // Seed Sessions
            console.log('  Seeding Sessions...');
            for (const session of data.sessions || []) {
                try {
                    await this.saveSessionDirect(client, session);
                } catch (err) {}
            }

            // Seed Speakers
            console.log('  Seeding Speakers...');
            for (const speaker of data.speakers || []) {
                try {
                    await this.saveSpeakerDirect(client, speaker);
                } catch (err) {}
            }

            // Seed Sponsors
            console.log('  Seeding Sponsors...');
            for (const sponsor of data.sponsors || []) {
                try {
                    await this.saveSponsorDirect(client, sponsor);
                } catch (err) {}
            }

            // Seed Testimonials
            console.log('  Seeding Testimonials...');
            for (const testimonial of data.testimonials || []) {
                try {
                    await this.saveTestimonialDirect(client, testimonial);
                } catch (err) {}
            }

            // Seed Gallery
            console.log('  Seeding Gallery...');
            for (const image of data.gallery || []) {
                try {
                    await this.saveGalleryImageDirect(client, image);
                } catch (err) {}
            }

            // Seed Venue
            if (data.venue) {
                console.log('  Seeding Venue...');
                try {
                    await this.saveVenueDirect(client, data.venue);
                } catch (err) {}
            }

            // Seed Adventures
            console.log('  Seeding Adventures...');
            for (const adventure of data.adventures || []) {
                try {
                    await this.saveAdventureDirect(client, adventure);
                } catch (err) {}
            }

            // Seed Feedback
            console.log('  Seeding Feedback...');
            for (const feedback of data.feedback || []) {
                try {
                    await this.saveFeedbackDirect(client, feedback);
                } catch (err) {}
            }

            // Seed Google Drive
            if (data.googleDriveLink) {
                console.log('  Seeding Google Drive...');
                try {
                    await this.saveGoogleDriveDirect(client, data.googleDriveLink);
                } catch (err) {}
            }

            // Seed Day Links
            if (data.dayLinks && data.dayLinks.length > 0) {
                console.log('  Seeding Day Links...');
                for (const dayLink of data.dayLinks) {
                    try {
                        await this.saveDayLinkDirect(client, dayLink);
                    } catch (err) {}
                }
            }

            // Seed Study Materials
            if (data.studyMaterials && data.studyMaterials.length > 0) {
                console.log('  Seeding Study Materials...');
                for (const material of data.studyMaterials) {
                    try {
                        await this.saveStudyMaterialDirect(client, material);
                    } catch (err) {}
                }
            }

            console.log('All data seeded successfully');

        } catch (err) {
            console.error('Error seeding data:', err);
        } finally {
            client.release();
        }
    }

    // Direct insert methods for seeding
    private async saveUserDirect(client: any, user: any) {
        const { id, email, firstName, lastName, role, organization, position, status,
            accommodationProvided, roomNumber, transportProvided,
            checkedIn, checkedInAt, hasSetPassword, password, selectedActivity, class: userClass,
            qrToken, qrIssuedAt, qrEmailSentAt } = user;

        const userId = id || `usr_${Date.now()}`;
        const normalizedEmail = normalizeOptionalEmail(email);
        const checkedInAtValue = (checkedInAt && checkedInAt !== '') ? checkedInAt : null;
        const qrIssuedAtValue = (qrIssuedAt && qrIssuedAt !== '') ? qrIssuedAt : null;
        const qrEmailSentAtValue = (qrEmailSentAt && qrEmailSentAt !== '') ? qrEmailSentAt : null;

        await client.query(
            `INSERT INTO users (
                id, email, first_name, last_name, role, organization, position, status, class,
                accommodation_provided, room_number, transport_provided,
                checked_in, checked_in_at, has_set_password, password, selected_activity,
                qr_token, qr_issued_at, qr_email_sent_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (id) DO NOTHING`,
            [
                userId, normalizedEmail, firstName, lastName, role || 'attendee',
                organization || '', position || '', status || 'active',
                userClass || 'A',
                accommodationProvided || false, roomNumber || '', transportProvided || false,
                checkedIn || false, checkedInAtValue,
                hasSetPassword || false, password || '', selectedActivity || '',
                qrToken || null, qrIssuedAtValue, qrEmailSentAtValue
            ]
        );
    }

    private async saveSessionDirect(client: any, session: any) {
        const { id, category, day, dayLabel, time, topic, facilitator, venue, type } = session;
        const sessionId = id || `session_${Date.now()}`;

        await client.query(
            `INSERT INTO sessions (id, category, day, day_label, time, topic, facilitator, venue, type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (id) DO NOTHING`,
            [sessionId, category, day, dayLabel, time, topic, facilitator, venue, type]
        );
    }

    private async saveSpeakerDirect(client: any, speaker: any) {
        const { id, name, position, organization, topic, speakingTime, bio, photoUrl } = speaker;
        const speakerId = id || `spk_${Date.now()}`;

        await client.query(
            `INSERT INTO speakers (id, name, position, organization, topic, speaking_time, bio, photo_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [speakerId, name, position, organization, topic, speakingTime, bio, photoUrl]
        );
    }

    private async saveSponsorDirect(client: any, sponsor: any) {
        const { id, name, logoUrl, description, website, durationLabel, tier } = sponsor;
        const sponsorId = id || `spon_${Date.now()}`;

        await client.query(
            `INSERT INTO sponsors (id, name, logo_url, description, website, duration_label, tier)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [sponsorId, name, logoUrl, description, website, durationLabel, tier]
        );
    }

    private async saveTestimonialDirect(client: any, testimonial: any) {
        const { id, name, company, position, text, photoUrl, accentChar } = testimonial;
        const testimonialId = id || `t_${Date.now()}`;
        const accent = accentChar || name.charAt(0);

        await client.query(
            `INSERT INTO testimonials (id, name, company, position, text, photo_url, accent_char)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [testimonialId, name, company, position, text, photoUrl, accent]
        );
    }

    private async saveGalleryImageDirect(client: any, image: any) {
        const { id, url, caption, description, category } = image;
        const imageId = id || `g_${Date.now()}`;

        await client.query(
            `INSERT INTO gallery (id, url, caption, description, category)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [imageId, url, caption, description || null, category]
        );
    }

    private async saveVenueDirect(client: any, venue: any) {
        const { id, title, overview, accommodation, conference, views, amenities, imageUrl } = venue;
        const venueId = id || 'venue_1';

        await client.query(
            `INSERT INTO venue (id, title, overview, accommodation, conference, views, amenities, image_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
             ON CONFLICT (id) DO NOTHING`,
            [venueId, title, overview, accommodation, conference, views, JSON.stringify(amenities), imageUrl]
        );
    }

    private async saveAdventureDirect(client: any, adventure: any) {
        const { id, title, description, imageUrl } = adventure;
        const adventureId = id || `adv_${Date.now()}`;

        await client.query(
            `INSERT INTO adventures (id, title, description, image_url)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            [adventureId, title, description, imageUrl || null]
        );
    }

    private async saveFeedbackDirect(client: any, feedback: any) {
        const { id, userId, userEmail, userName, rating, bestSession, bestFacilitator, improvements, attendAgain, chatTranscript, submittedAt } = feedback;

        await client.query(
            `INSERT INTO feedback (id, user_id, user_email, user_name, rating, best_session, best_facilitator, improvements, attend_again, chat_transcript, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
             ON CONFLICT (id) DO NOTHING`,
            [id, userId, userEmail, userName, rating, bestSession, bestFacilitator, improvements, attendAgain, JSON.stringify(chatTranscript || null), submittedAt]
        );
    }

    private async saveGoogleDriveDirect(client: any, link: string) {
        await client.query(
            `INSERT INTO google_drive (id, link)
             VALUES ('drive_1', $1)
             ON CONFLICT (id) DO NOTHING`,
            [link]
        );
    }

    private async saveDayLinkDirect(client: any, dayLink: any) {
        const { id, day, driveLink, order } = dayLink;
        const dayLinkId = id || `dl_${Date.now()}`;

        await client.query(
            `INSERT INTO day_links (id, day, drive_link, "order")
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            [dayLinkId, day, driveLink, order || 0]
        );
    }

    // ============ STUDY MATERIALS DIRECT SEED ============
    private async saveStudyMaterialDirect(client: any, material: any) {
        const { id, title, description, fileName, fileUrl, fileSize, uploadedBy, downloads, isActive, uploadDate } = material;
        const materialId = id || `sm_${Date.now()}`;

        await client.query(
            `INSERT INTO study_materials (id, title, description, file_name, file_url, file_size, uploaded_by, downloads, is_active, upload_date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO NOTHING`,
            [materialId, title, description, fileName, fileUrl, fileSize, uploadedBy || null, downloads || 0, isActive !== undefined ? isActive : true, uploadDate || new Date().toISOString()]
        );
    }
    // ============ END STUDY MATERIALS DIRECT SEED ============

    // ============ PUBLIC METHODS ============

    // Users - existing methods...
    async findUserByEmail(email: string): Promise<User | undefined> {
        const normalizedEmail = normalizeOptionalEmail(email);
        if (!normalizedEmail) {
            return undefined;
        }

        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users WHERE LOWER(email) = LOWER($1)`,
            [normalizedEmail]
        );
        return result.rows[0];
    }

    async getUserById(id: string): Promise<User | undefined> {
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users WHERE id = $1`,
            [id]
        );
        return result.rows[0];
    }

    async findUserByQrToken(qrToken: string): Promise<User | undefined> {
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users WHERE qr_token = $1`,
            [qrToken]
        );
        return result.rows[0];
    }

    async getUsers(): Promise<User[]> {
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users ORDER BY created_at DESC`
        );
        return result.rows;
    }

    private buildAdminUserFilterWhere(query: AdminUserListQuery = {}) {
        const clauses: string[] = ["role <> 'super_admin'"];
        const values: Array<string | boolean> = [];

        if (query.status && query.status !== 'all') {
            clauses.push(`status = $${values.length + 1}`);
            values.push(query.status);
        }

        if (query.role && query.role !== 'all') {
            clauses.push(`role = $${values.length + 1}`);
            values.push(query.role);
        }

        if (query.checkedIn === 'true') {
            clauses.push(`checked_in = $${values.length + 1}`);
            values.push(true);
        }

        if (query.checkedIn === 'false') {
            clauses.push(`(checked_in IS NULL OR checked_in = $${values.length + 1})`);
            values.push(false);
        }

        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        return { whereClause, values };
    }

    private buildAttendeeTokenWhere(
        tokens: string[],
        fields: string[],
        startingIndex: number = 1
    ) {
        const clauses: string[] = [];
        const values: string[] = [];

        tokens.forEach((token, tokenIndex) => {
            const fieldClauses = fields.map((field, fieldIndex) => {
                values.push(`%${token}%`);
                return `${field} ILIKE $${startingIndex + tokenIndex * fields.length + fieldIndex}`;
            });
            clauses.push(`(${fieldClauses.join(' OR ')})`);
        });

        return {
            whereClause: clauses.length > 0 ? clauses.join(' AND ') : '',
            values
        };
    }

    private getUserOrderBy(sort: AdminUserSort = 'created_desc') {
        return sort === 'name_asc'
            ? 'ORDER BY last_name ASC, first_name ASC'
            : 'ORDER BY created_at DESC';
    }

    async getCheckedInUsers(): Promise<User[]> {
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users WHERE checked_in = true ORDER BY checked_in_at DESC`
        );
        return result.rows;
    }

    async getPendingCheckInUsers(): Promise<User[]> {
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users WHERE role = 'attendee' AND (checked_in IS NULL OR checked_in = false)`
        );
        return result.rows;
    }

    async searchAttendees(query: string, limit: number = 10): Promise<User[]> {
        const tokens = getSearchTokens(query, true);
        if (tokens.length === 0) {
            return [];
        }

        const tokenWhere = this.buildAttendeeTokenWhere(tokens, [
            'first_name',
            'last_name',
            'email'
        ]);

        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users
             WHERE role = 'attendee' AND status = 'active'
               AND ${tokenWhere.whereClause}
             ORDER BY created_at DESC
             LIMIT $${tokenWhere.values.length + 1}`,
            [...tokenWhere.values, Math.max(limit * 10, 50)]
        );

        return searchAttendeesInUsers(result.rows, query, limit);
    }

    async listPublicAttendees(query: PublicAttendeeListQuery = {}): Promise<PaginatedResult<PublicAttendeeDirectoryEntry>> {
        const page = Math.max(1, query.page || 1);
        const pageSize = Math.min(50, Math.max(1, query.pageSize || 25));

        if (query.q && query.q.trim() !== '') {
            const tokens = getSearchTokens(query.q, true);
            const tokenWhere = this.buildAttendeeTokenWhere(tokens, [
                'first_name',
                'last_name',
                'organization'
            ]);

            const result = await this.pool.query(
                `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                        role, organization, position, status, class,
                        accommodation_provided as "accommodationProvided", 
                        room_number as "roomNumber", 
                        transport_provided as "transportProvided",
                        checked_in as "checkedIn", checked_in_at as "checkedInAt",
                        has_set_password as "hasSetPassword", password,
                        selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
                 FROM users
                 WHERE role = 'attendee' AND status = 'active'
                   AND ${tokenWhere.whereClause}
                 ORDER BY last_name ASC, first_name ASC
                 LIMIT 500`,
                tokenWhere.values
            );

            return listPublicAttendeesInUsers(result.rows, { ...query, page, pageSize });
        }

        const offset = (page - 1) * pageSize;
        const [itemsResult, countResult] = await Promise.all([
            this.pool.query(
                `SELECT id, first_name as "firstName", last_name as "lastName", organization
                 FROM users
                 WHERE role = 'attendee' AND status = 'active'
                 ORDER BY last_name ASC, first_name ASC
                 LIMIT $1 OFFSET $2`,
                [pageSize, offset]
            ),
            this.pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM users
                 WHERE role = 'attendee' AND status = 'active'`
            )
        ]);

        const total = countResult.rows[0]?.total ?? 0;
        return {
            items: itemsResult.rows.map((row: any) => ({
                id: row.id,
                firstName: row.firstName,
                lastName: row.lastName,
                organization: row.organization || 'N/A'
            })),
            page,
            pageSize,
            total,
            hasMore: offset + pageSize < total
        };
    }

    async listAdminUsers(query: AdminUserListQuery = {}): Promise<PaginatedResult<User>> {
        const page = Math.max(1, query.page || 1);
        const pageSize = Math.min(100, Math.max(1, query.pageSize || 25));
        const { whereClause, values } = this.buildAdminUserFilterWhere(query);

        if (query.q && query.q.trim() !== '') {
            const tokens = getSearchTokens(query.q, true);
            const tokenWhere = this.buildAttendeeTokenWhere(tokens, [
                'first_name',
                'last_name',
                'email',
                'organization',
                'position'
            ], values.length + 1);

            const searchClause = tokenWhere.whereClause ? `${whereClause ? `${whereClause} AND` : 'WHERE'} ${tokenWhere.whereClause}` : whereClause;
            const result = await this.pool.query(
                `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                        role, organization, position, status, class,
                        accommodation_provided as "accommodationProvided", 
                        room_number as "roomNumber", 
                        transport_provided as "transportProvided",
                        checked_in as "checkedIn", checked_in_at as "checkedInAt",
                        has_set_password as "hasSetPassword", password,
                        selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
                 FROM users
                 ${searchClause}
                 ${this.getUserOrderBy(query.sort)}
                 LIMIT 1000`,
                [...values, ...tokenWhere.values]
            );

            return listAdminUsersInUsers(result.rows, { ...query, page, pageSize });
        }

        const offset = (page - 1) * pageSize;
        const orderBy = this.getUserOrderBy(query.sort);
        const [itemsResult, countResult] = await Promise.all([
            this.pool.query(
                `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                        role, organization, position, status, class,
                        accommodation_provided as "accommodationProvided", 
                        room_number as "roomNumber", 
                        transport_provided as "transportProvided",
                        checked_in as "checkedIn", checked_in_at as "checkedInAt",
                        has_set_password as "hasSetPassword", password,
                        selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
                 FROM users
                 ${whereClause}
                 ${orderBy}
                 LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
                [...values, pageSize, offset]
            ),
            this.pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM users
                 ${whereClause}`,
                values
            )
        ]);

        const total = countResult.rows[0]?.total ?? 0;
        return {
            items: itemsResult.rows,
            page,
            pageSize,
            total,
            hasMore: offset + pageSize < total
        };
    }

    async exportAdminUsers(query: AdminUserListQuery = {}): Promise<User[]> {
        const { whereClause, values } = this.buildAdminUserFilterWhere(query);
        const result = await this.pool.query(
            `SELECT id, email, first_name as "firstName", last_name as "lastName", 
                    role, organization, position, status, class,
                    accommodation_provided as "accommodationProvided", 
                    room_number as "roomNumber", 
                    transport_provided as "transportProvided",
                    checked_in as "checkedIn", checked_in_at as "checkedInAt",
                    has_set_password as "hasSetPassword", password,
                    selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"
             FROM users
             ${whereClause}
             ${this.getUserOrderBy(query.sort)}`,
            values
        );

        return query.q && query.q.trim() !== ''
            ? filterAdminUsers(result.rows, query)
            : result.rows;
    }

    async saveUser(user: User): Promise<User> {
        const {
            id, email, firstName, lastName, role, organization, position, status, class: userClass,
            accommodationProvided, roomNumber, transportProvided,
            checkedIn, checkedInAt, hasSetPassword, password, selectedActivity,
            qrToken, qrIssuedAt, qrEmailSentAt
        } = user;

        const userId = id || `usr_${Date.now()}`;
        const normalizedEmail = normalizeOptionalEmail(email);
        const checkedInAtValue = (checkedInAt && checkedInAt !== '') ? checkedInAt : null;
        const qrIssuedAtValue = (qrIssuedAt && qrIssuedAt !== '') ? qrIssuedAt : null;
        const qrEmailSentAtValue = (qrEmailSentAt && qrEmailSentAt !== '') ? qrEmailSentAt : null;

        const result = await this.pool.query(
            `INSERT INTO users (
                id, email, first_name, last_name, role, organization, position, status, class,
                accommodation_provided, room_number, transport_provided,
                checked_in, checked_in_at, has_set_password, password, selected_activity,
                qr_token, qr_issued_at, qr_email_sent_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                email = EXCLUDED.email,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                role = EXCLUDED.role,
                organization = EXCLUDED.organization,
                position = EXCLUDED.position,
                status = EXCLUDED.status,
                class = EXCLUDED.class,
                accommodation_provided = EXCLUDED.accommodation_provided,
                room_number = EXCLUDED.room_number,
                transport_provided = EXCLUDED.transport_provided,
                checked_in = EXCLUDED.checked_in,
                checked_in_at = EXCLUDED.checked_in_at,
                has_set_password = EXCLUDED.has_set_password,
                password = EXCLUDED.password,
                selected_activity = EXCLUDED.selected_activity,
                qr_token = COALESCE(EXCLUDED.qr_token, users.qr_token),
                qr_issued_at = COALESCE(EXCLUDED.qr_issued_at, users.qr_issued_at),
                qr_email_sent_at = COALESCE(EXCLUDED.qr_email_sent_at, users.qr_email_sent_at),
                updated_at = CURRENT_TIMESTAMP
            RETURNING 
                id, email, first_name as "firstName", last_name as "lastName", 
                role, organization, position, status, class,
                accommodation_provided as "accommodationProvided", 
                room_number as "roomNumber", 
                transport_provided as "transportProvided",
                checked_in as "checkedIn", checked_in_at as "checkedInAt",
                has_set_password as "hasSetPassword", password,
                selected_activity as "selectedActivity",
                qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"`,
            [
                userId, normalizedEmail, firstName, lastName, role || 'attendee',
                organization || '', position || '', status || 'active',
                userClass || 'A',
                accommodationProvided || false, roomNumber || '', transportProvided || false,
                checkedIn || false, checkedInAtValue,
                hasSetPassword || false, password || '', selectedActivity || '',
                qrToken || null, qrIssuedAtValue, qrEmailSentAtValue
            ]
        );
        return result.rows[0];
    }

    async updateUserCheckin(userId: string, updates: Partial<User>): Promise<User> {
        const {
            selectedActivity, checkedIn, checkedInAt, hasSetPassword, password, email
        } = updates;

        const checkedInAtValue = (checkedInAt && checkedInAt !== '') ? checkedInAt : null;

        let query = `
            UPDATE users SET
                selected_activity = COALESCE($1, selected_activity),
                checked_in = COALESCE($2, checked_in),
                checked_in_at = COALESCE($3, checked_in_at),
                has_set_password = COALESCE($4, has_set_password),
                password = COALESCE($5, password),
                updated_at = CURRENT_TIMESTAMP
        `;

        const values: any[] = [selectedActivity, checkedIn, checkedInAtValue, hasSetPassword, password];
        let paramIndex = 6;

        if (email) {
            query += `, email = $${paramIndex}`;
            values.push(email);
            paramIndex++;
        }

        query += ` WHERE id = $${paramIndex} RETURNING 
                id, email, first_name as "firstName", last_name as "lastName", 
                role, organization, position, status, class,
                accommodation_provided as "accommodationProvided", 
                room_number as "roomNumber", 
                transport_provided as "transportProvided",
                checked_in as "checkedIn", checked_in_at as "checkedInAt",
                has_set_password as "hasSetPassword", password,
                selected_activity as "selectedActivity",
                    qr_token as "qrToken", qr_issued_at as "qrIssuedAt", qr_email_sent_at as "qrEmailSentAt"`;

        values.push(userId);

        const result = await this.pool.query(query, values);
        return result.rows[0];
    }

    async deleteUser(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Sessions
    async getSessions(): Promise<Session[]> {
        const result = await this.pool.query(
            `SELECT id, category, day, day_label as "dayLabel", time, topic, 
                    facilitator, venue, type
             FROM sessions`
        );
        return sortSessionsInProgrammeOrder(result.rows);
    }

    async saveSession(session: Session): Promise<Session> {
        const { id, category, day, dayLabel, time, topic, facilitator, venue, type } = session;
        const sessionId = id || `${category === 'Class A' ? 'sa' : 'sb'}_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO sessions (id, category, day, day_label, time, topic, facilitator, venue, type, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                category = EXCLUDED.category,
                day = EXCLUDED.day,
                day_label = EXCLUDED.day_label,
                time = EXCLUDED.time,
                topic = EXCLUDED.topic,
                facilitator = EXCLUDED.facilitator,
                venue = EXCLUDED.venue,
                type = EXCLUDED.type,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, category, day, day_label as "dayLabel", time, topic, facilitator, venue, type`,
            [sessionId, category, day, dayLabel, time, topic, facilitator, venue, type]
        );
        return result.rows[0];
    }

    async deleteSession(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM sessions WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Notes
    async getNotes(userId: string): Promise<SessionNote[]> {
        const result = await this.pool.query(
            `SELECT id, user_id as "userId", session_id as "sessionId", content, updated_at as "updatedAt"
             FROM notes WHERE user_id = $1`,
            [userId]
        );
        return result.rows;
    }

    async saveNote(note: Partial<SessionNote> & { userId: string; sessionId: string }): Promise<SessionNote> {
        const { id, userId, sessionId, content } = note;
        const noteId = id || `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

        const result = await this.pool.query(
            `INSERT INTO notes (id, user_id, session_id, content, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (user_id, session_id) DO UPDATE SET
                content = EXCLUDED.content,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, user_id as "userId", session_id as "sessionId", content, updated_at as "updatedAt"`,
            [noteId, userId, sessionId, content || '']
        );
        return result.rows[0];
    }

    async deleteNote(userId: string, sessionId: string): Promise<boolean> {
        const result = await this.pool.query(
            'DELETE FROM notes WHERE user_id = $1 AND session_id = $2',
            [userId, sessionId]
        );
        return (result.rowCount || 0) > 0;
    }

    // Speakers
    async getSpeakers(): Promise<Speaker[]> {
        const result = await this.pool.query(
            `SELECT id, name, position, organization, topic, 
                    speaking_time as "speakingTime", bio, photo_url as "photoUrl"
             FROM speakers ORDER BY name`
        );
        return result.rows;
    }

    async saveSpeaker(speaker: Speaker): Promise<Speaker> {
        const { id, name, position, organization, topic, speakingTime, bio, photoUrl } = speaker;
        const speakerId = id || `spk_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO speakers (id, name, position, organization, topic, speaking_time, bio, photo_url, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                position = EXCLUDED.position,
                organization = EXCLUDED.organization,
                topic = EXCLUDED.topic,
                speaking_time = EXCLUDED.speaking_time,
                bio = EXCLUDED.bio,
                photo_url = EXCLUDED.photo_url,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, name, position, organization, topic, speaking_time as "speakingTime", bio, photo_url as "photoUrl"`,
            [speakerId, name, position, organization, topic, speakingTime, bio, photoUrl]
        );
        return result.rows[0];
    }

    async deleteSpeaker(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM speakers WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Sponsors
    async getSponsors(): Promise<Sponsor[]> {
        const result = await this.pool.query(
            `SELECT id, name, logo_url as "logoUrl", description, website, 
                    duration_label as "durationLabel", tier
             FROM sponsors ORDER BY tier DESC, name`
        );
        return result.rows;
    }

    async saveSponsor(sponsor: Sponsor): Promise<Sponsor> {
        const { id, name, logoUrl, description, website, durationLabel, tier } = sponsor;
        const sponsorId = id || `spon_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO sponsors (id, name, logo_url, description, website, duration_label, tier, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                logo_url = EXCLUDED.logo_url,
                description = EXCLUDED.description,
                website = EXCLUDED.website,
                duration_label = EXCLUDED.duration_label,
                tier = EXCLUDED.tier,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, name, logo_url as "logoUrl", description, website, duration_label as "durationLabel", tier`,
            [sponsorId, name, logoUrl, description, website, durationLabel, tier]
        );
        return result.rows[0];
    }

    async deleteSponsor(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM sponsors WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Testimonials
    async getTestimonials(): Promise<Testimonial[]> {
        const result = await this.pool.query(
            `SELECT id, name, company, position, text, photo_url as "photoUrl", accent_char as "accentChar"
             FROM testimonials ORDER BY created_at DESC`
        );
        return result.rows;
    }

    async saveTestimonial(t: Testimonial): Promise<Testimonial> {
        const { id, name, company, position, text, photoUrl, accentChar } = t;
        const testimonialId = id || `t_${Date.now()}`;
        const accent = accentChar || name.charAt(0);

        const result = await this.pool.query(
            `INSERT INTO testimonials (id, name, company, position, text, photo_url, accent_char, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                company = EXCLUDED.company,
                position = EXCLUDED.position,
                text = EXCLUDED.text,
                photo_url = EXCLUDED.photo_url,
                accent_char = EXCLUDED.accent_char,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, name, company, position, text, photo_url as "photoUrl", accent_char as "accentChar"`,
            [testimonialId, name, company, position, text, photoUrl, accent]
        );
        return result.rows[0];
    }

    async deleteTestimonial(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM testimonials WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Gallery
    async getGallery(): Promise<GalleryImage[]> {
        const result = await this.pool.query(
            `SELECT id, url, caption, description, category FROM gallery ORDER BY created_at DESC`
        );
        return result.rows;
    }

    async saveGalleryImage(img: GalleryImage): Promise<GalleryImage> {
        const { id, url, caption, description, category } = img;
        const imageId = id || `g_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO gallery (id, url, caption, description, category, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                url = EXCLUDED.url,
                caption = EXCLUDED.caption,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, url, caption, description, category`,
            [imageId, url, caption, description || null, category]
        );
        return result.rows[0];
    }

    async deleteGalleryImage(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM gallery WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Venue
    async getVenue(): Promise<VenueInfo> {
        const result = await this.pool.query(
            `SELECT id, title, overview, accommodation, conference, views, amenities, image_url as "imageUrl"
             FROM venue LIMIT 1`
        );
        if (result.rows.length === 0) {
            return {
                id: 'venue_1',
                title: 'Tamarind Resort, Kariba',
                overview: '',
                accommodation: '',
                conference: '',
                views: '',
                amenities: [],
                imageUrl: ''
            };
        }
        return {
            ...result.rows[0],
            amenities: result.rows[0].amenities || []
        };
    }

    async saveVenue(venue: VenueInfo): Promise<VenueInfo> {
        const { id, title, overview, accommodation, conference, views, amenities, imageUrl } = venue;
        const venueId = id || 'venue_1';

        const result = await this.pool.query(
            `INSERT INTO venue (id, title, overview, accommodation, conference, views, amenities, image_url, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                overview = EXCLUDED.overview,
                accommodation = EXCLUDED.accommodation,
                conference = EXCLUDED.conference,
                views = EXCLUDED.views,
                amenities = EXCLUDED.amenities,
                image_url = EXCLUDED.image_url,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, title, overview, accommodation, conference, views, amenities, image_url as "imageUrl"`,
            [venueId, title, overview, accommodation, conference, views, JSON.stringify(amenities), imageUrl]
        );
        return {
            ...result.rows[0],
            amenities: result.rows[0].amenities || []
        };
    }

    // Adventures
    async getAdventures(): Promise<AdventureActivity[]> {
        const result = await this.pool.query(
            `SELECT id, title, description, image_url as "imageUrl" FROM adventures ORDER BY created_at`
        );
        return result.rows;
    }

    async saveAdventure(adventure: AdventureActivity): Promise<AdventureActivity> {
        const { id, title, description, imageUrl } = adventure;
        const adventureId = id || `adv_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO adventures (id, title, description, image_url, updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                image_url = EXCLUDED.image_url,
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, title, description, image_url as "imageUrl"`,
            [adventureId, title, description, imageUrl || null]
        );
        return result.rows[0];
    }

    async deleteAdventure(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM adventures WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // Feedback
    async getFeedback(): Promise<FeedbackSubmission[]> {
        const result = await this.pool.query(
            `SELECT id, user_id as "userId", user_email as "userEmail", user_name as "userName",
                    rating, best_session as "bestSession", best_facilitator as "bestFacilitator",
                    improvements, attend_again as "attendAgain", chat_transcript as "chatTranscript",
                    submitted_at as "submittedAt"
             FROM feedback ORDER BY submitted_at DESC`
        );
        return result.rows;
    }

    async saveFeedback(fb: FeedbackSubmission): Promise<FeedbackSubmission> {
        const { id, userId, userEmail, userName, rating, bestSession, bestFacilitator, improvements, attendAgain, chatTranscript, submittedAt } = fb;

        const result = await this.pool.query(
            `INSERT INTO feedback (id, user_id, user_email, user_name, rating, best_session, best_facilitator, improvements, attend_again, chat_transcript, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
             RETURNING id, user_id as "userId", user_email as "userEmail", user_name as "userName",
                    rating, best_session as "bestSession", best_facilitator as "bestFacilitator",
                    improvements, attend_again as "attendAgain", chat_transcript as "chatTranscript",
                    submitted_at as "submittedAt"`,
            [id, userId, userEmail, userName, rating, bestSession, bestFacilitator, improvements, attendAgain, JSON.stringify(chatTranscript || null), submittedAt]
        );
        return result.rows[0];
    }

    // Google Drive
    async getGoogleDriveLink(): Promise<string> {
        const result = await this.pool.query('SELECT link FROM google_drive LIMIT 1');
        if (result.rows.length === 0) {
            return 'https://drive.google.com/drive/folders/18K9p_0S79z77X-maz-kariba-winter-school-gallery-2026';
        }
        return result.rows[0].link;
    }

    async saveGoogleDriveLink(link: string): Promise<string> {
        const result = await this.pool.query(
            `INSERT INTO google_drive (id, link, updated_at)
             VALUES ('drive_1', $1, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                link = EXCLUDED.link,
                updated_at = CURRENT_TIMESTAMP
             RETURNING link`,
            [link]
        );
        return result.rows[0].link;
    }

    // ============ DAY LINKS METHODS ============

    async getDayLinks(): Promise<DayLink[]> {
        const result = await this.pool.query(
            `SELECT id, day, drive_link as "driveLink", "order", created_at as "createdAt", updated_at as "updatedAt"
             FROM day_links
             ORDER BY "order" ASC, created_at ASC`
        );
        return result.rows;
    }

    async saveDayLink(dayLink: DayLink): Promise<DayLink> {
        const { id, day, driveLink, order } = dayLink;
        const dayLinkId = id || `dl_${Date.now()}`;
        const orderValue = order || 0;

        const result = await this.pool.query(
            `INSERT INTO day_links (id, day, drive_link, "order", updated_at)
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
                day = EXCLUDED.day,
                drive_link = EXCLUDED.drive_link,
                "order" = EXCLUDED."order",
                updated_at = CURRENT_TIMESTAMP
             RETURNING id, day, drive_link as "driveLink", "order", created_at as "createdAt", updated_at as "updatedAt"`,
            [dayLinkId, day, driveLink, orderValue]
        );
        return result.rows[0];
    }

    async deleteDayLink(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM day_links WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    // ============ STUDY MATERIALS METHODS - NEW ============

    async getStudyMaterials(): Promise<StudyMaterial[]> {
        const result = await this.pool.query(
            `SELECT id, title, description, file_name as "fileName", file_url as "fileUrl",
                    file_size as "fileSize", uploaded_by as "uploadedBy", downloads,
                    is_active as "isActive", upload_date as "uploadDate",
                    created_at as "createdAt", updated_at as "updatedAt"
             FROM study_materials
             WHERE is_active = true
             ORDER BY upload_date DESC`
        );
        return result.rows;
    }

    async saveStudyMaterial(material: StudyMaterial): Promise<StudyMaterial> {
        const { id, title, description, fileName, fileUrl, fileSize, uploadedBy, downloads, isActive, uploadDate } = material;
        const materialId = id || `sm_${Date.now()}`;

        const result = await this.pool.query(
            `INSERT INTO study_materials (
                id, title, description, file_name, file_url, file_size, 
                uploaded_by, downloads, is_active, upload_date, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                file_name = EXCLUDED.file_name,
                file_url = EXCLUDED.file_url,
                file_size = EXCLUDED.file_size,
                uploaded_by = EXCLUDED.uploaded_by,
                downloads = EXCLUDED.downloads,
                is_active = EXCLUDED.is_active,
                upload_date = EXCLUDED.upload_date,
                updated_at = CURRENT_TIMESTAMP
            RETURNING 
                id, title, description, file_name as "fileName", file_url as "fileUrl",
                file_size as "fileSize", uploaded_by as "uploadedBy", downloads,
                is_active as "isActive", upload_date as "uploadDate",
                created_at as "createdAt", updated_at as "updatedAt"`,
            [materialId, title, description, fileName, fileUrl, fileSize, uploadedBy || null, downloads || 0, isActive !== undefined ? isActive : true, uploadDate || new Date().toISOString()]
        );
        return result.rows[0];
    }

    async deleteStudyMaterial(id: string): Promise<boolean> {
        // Soft delete - just mark as inactive
        const result = await this.pool.query(
            `UPDATE study_materials SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
        return (result.rowCount || 0) > 0;
    }

    async incrementStudyMaterialDownloads(id: string): Promise<boolean> {
        const result = await this.pool.query(
            `UPDATE study_materials SET downloads = downloads + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
        return (result.rowCount || 0) > 0;
    }

    // ============ END STUDY MATERIALS METHODS ============

    private mapAttendanceRecord(row: any): AttendanceRecord {
        const attendanceSession = findAttendanceSession(row.sessionId);

        return {
            id: row.id,
            attendeeId: row.attendeeId,
            sessionId: row.sessionId,
            scannedBy: row.scannedBy,
            scannedAt: row.scannedAt,
            status: row.status || 'present',
            attendee: {
                id: row.attendeeId,
                firstName: row.attendeeFirstName,
                lastName: row.attendeeLastName,
                email: row.attendeeEmail || undefined,
                organization: row.attendeeOrganization || undefined,
                position: row.attendeePosition || undefined,
                class: row.attendeeClass || undefined
            },
            session: attendanceSession,
            scannedByUser: row.scannedByFirstName ? {
                id: row.scannedBy,
                firstName: row.scannedByFirstName,
                lastName: row.scannedByLastName
            } : undefined
        };
    }

    private attendanceSelectSql() {
        return `
            SELECT ar.id, ar.attendee_id as "attendeeId", ar.session_id as "sessionId",
                   ar.scanned_by as "scannedBy", ar.scanned_at as "scannedAt", ar.status,
                   attendee.first_name as "attendeeFirstName", attendee.last_name as "attendeeLastName",
                   attendee.email as "attendeeEmail", attendee.organization as "attendeeOrganization",
                   attendee.position as "attendeePosition", attendee.class as "attendeeClass",
                   scanner.first_name as "scannedByFirstName", scanner.last_name as "scannedByLastName"
            FROM attendance_records ar
            JOIN users attendee ON attendee.id = ar.attendee_id
            LEFT JOIN users scanner ON scanner.id = ar.scanned_by
        `;
    }

    async getAttendanceRecord(attendeeId: string, sessionId: string): Promise<AttendanceRecord | undefined> {
        const result = await this.pool.query(
            `${this.attendanceSelectSql()} WHERE ar.attendee_id = $1 AND ar.session_id = $2`,
            [attendeeId, sessionId]
        );
        return result.rows[0] ? this.mapAttendanceRecord(result.rows[0]) : undefined;
    }

    async saveAttendanceRecord(record: AttendanceRecord): Promise<AttendanceRecord> {
        const result = await this.pool.query(
            `INSERT INTO attendance_records (id, attendee_id, session_id, scanned_by, scanned_at, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (attendee_id, session_id) DO NOTHING
             RETURNING id`,
            [record.id, record.attendeeId, record.sessionId, record.scannedBy, record.scannedAt, record.status]
        );

        const saved = result.rows[0]
            ? await this.getAttendanceRecord(record.attendeeId, record.sessionId)
            : await this.getAttendanceRecord(record.attendeeId, record.sessionId);

        if (!saved) {
            throw new Error('Attendance record could not be saved.');
        }
        return saved;
    }

    async listAttendanceRecords(sessionId: string): Promise<AttendanceRecord[]> {
        const result = await this.pool.query(
            `${this.attendanceSelectSql()} WHERE ar.session_id = $1 ORDER BY ar.scanned_at DESC`,
            [sessionId]
        );
        return result.rows.map((row: any) => this.mapAttendanceRecord(row));
    }

    private mapQAQuestion(row: any): QAQuestion {
        return {
            id: row.id,
            sessionId: row.sessionId,
            questionTitle: row.questionTitle || '',
            questionText: row.questionText,
            type: row.type,
            options: Array.isArray(row.options) ? row.options : [],
            status: row.status,
            order: row.order,
            createdBy: row.createdBy,
            createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
            updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
            publishedAt: row.publishedAt ? (row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt) : undefined,
            closedAt: row.closedAt ? (row.closedAt instanceof Date ? row.closedAt.toISOString() : row.closedAt) : undefined,
            responseCount: Number(row.responseCount || 0),
            session: row.sessionTopic ? {
                id: row.sessionId,
                day: row.sessionDay,
                dayLabel: row.sessionDayLabel,
                time: row.sessionTime,
                topic: row.sessionTopic,
                category: row.sessionCategory,
                venue: row.sessionVenue
            } : undefined
        };
    }

    private qaQuestionSelectSql() {
        return `
            SELECT q.id, q.session_id as "sessionId", q.question_title as "questionTitle", q.question_text as "questionText",
                   q.type, q.options, q.status, q.display_order as "order",
                   q.created_by as "createdBy", q.created_at as "createdAt",
                   q.updated_at as "updatedAt", q.published_at as "publishedAt", q.closed_at as "closedAt",
                   COUNT(r.id)::int as "responseCount",
                   s.day as "sessionDay", s.day_label as "sessionDayLabel", s.time as "sessionTime",
                   s.topic as "sessionTopic", s.category as "sessionCategory", s.venue as "sessionVenue"
            FROM qa_questions q
            LEFT JOIN qa_responses r ON r.question_id = q.id
            LEFT JOIN sessions s ON s.id = q.session_id
        `;
    }

    async listQAQuestions(sessionId?: string): Promise<QAQuestion[]> {
        const where = sessionId ? 'WHERE q.session_id = $1' : '';
        const result = await this.pool.query(
            `${this.qaQuestionSelectSql()}
             ${where}
             GROUP BY q.id, s.id
             ORDER BY q.display_order ASC, q.created_at ASC`,
            sessionId ? [sessionId] : []
        );
        return result.rows.map((row: any) => this.mapQAQuestion(row));
    }

    async getQAQuestion(id: string): Promise<QAQuestion | undefined> {
        const result = await this.pool.query(
            `${this.qaQuestionSelectSql()}
             WHERE q.id = $1
             GROUP BY q.id, s.id`,
            [id]
        );
        return result.rows[0] ? this.mapQAQuestion(result.rows[0]) : undefined;
    }

    async getLiveQAQuestion(sessionId?: string): Promise<QAQuestion | undefined> {
        const result = await this.pool.query(
            `${this.qaQuestionSelectSql()}
             WHERE q.status = 'live' ${sessionId ? 'AND q.session_id = $1' : ''}
             GROUP BY q.id, s.id
             ORDER BY q.published_at DESC
             LIMIT 1`,
            sessionId ? [sessionId] : []
        );
        return result.rows[0] ? this.mapQAQuestion(result.rows[0]) : undefined;
    }

    async saveQAQuestion(question: QAQuestion): Promise<QAQuestion> {
        const result = await this.pool.query(
            `INSERT INTO qa_questions (id, session_id, question_title, question_text, type, options, status, display_order, created_by, created_at, updated_at, published_at, closed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (id) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                question_title = EXCLUDED.question_title,
                question_text = EXCLUDED.question_text,
                type = EXCLUDED.type,
                options = EXCLUDED.options,
                status = EXCLUDED.status,
                display_order = EXCLUDED.display_order,
                updated_at = EXCLUDED.updated_at,
                published_at = EXCLUDED.published_at,
                closed_at = EXCLUDED.closed_at
             RETURNING id`,
            [
                question.id,
                question.sessionId,
                question.questionTitle || '',
                question.questionText,
                question.type,
                JSON.stringify(question.options || []),
                question.status,
                question.order,
                question.createdBy,
                question.createdAt,
                question.updatedAt,
                question.publishedAt || null,
                question.closedAt || null
            ]
        );
        return (await this.getQAQuestion(result.rows[0].id)) as QAQuestion;
    }

    async updateQAQuestionStatus(id: string, status: QAQuestion['status']): Promise<QAQuestion | undefined> {
        const question = await this.getQAQuestion(id);
        if (!question) return undefined;

        const now = new Date().toISOString();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            if (status === 'live') {
                await client.query(
                    `UPDATE qa_questions
                     SET status = 'closed', closed_at = COALESCE(closed_at, $2::timestamp), updated_at = $2::timestamp
                     WHERE id <> $1 AND status = 'live'`,
                    [id, now]
                );
            }
            await client.query(
                `UPDATE qa_questions
                 SET status = $2::varchar,
                     updated_at = $3::timestamp,
                     published_at = CASE WHEN $2::varchar = 'live' THEN $3::timestamp ELSE published_at END,
                     closed_at = CASE WHEN $2::varchar = 'closed' THEN $3::timestamp ELSE closed_at END
                 WHERE id = $1`,
                [id, status, now]
            );
            await client.query('COMMIT');
            return await this.getQAQuestion(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteQAQuestion(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM qa_questions WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    private mapQAResponse(row: any): QAResponse {
        return {
            id: row.id,
            questionId: row.questionId,
            sessionId: row.sessionId,
            attendeeId: row.attendeeId,
            answer: row.answer,
            submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt,
            attendee: row.attendeeFirstName ? {
                id: row.attendeeId,
                firstName: row.attendeeFirstName,
                lastName: row.attendeeLastName,
                email: row.attendeeEmail || undefined,
                organization: row.attendeeOrganization || undefined,
                position: row.attendeePosition || undefined,
                class: row.attendeeClass || undefined
            } : undefined
        };
    }

    private qaResponseSelectSql() {
        return `
            SELECT r.id, r.question_id as "questionId", r.session_id as "sessionId",
                   r.attendee_id as "attendeeId", r.answer, r.submitted_at as "submittedAt",
                   attendee.first_name as "attendeeFirstName", attendee.last_name as "attendeeLastName",
                   attendee.email as "attendeeEmail", attendee.organization as "attendeeOrganization",
                   attendee.position as "attendeePosition", attendee.class as "attendeeClass"
            FROM qa_responses r
            LEFT JOIN users attendee ON attendee.id = r.attendee_id
        `;
    }

    async listQAResponses(questionId: string): Promise<QAResponse[]> {
        const result = await this.pool.query(
            `${this.qaResponseSelectSql()} WHERE r.question_id = $1 ORDER BY r.submitted_at DESC`,
            [questionId]
        );
        return result.rows.map((row: any) => this.mapQAResponse(row));
    }

    async getQAResponse(questionId: string, attendeeId: string): Promise<QAResponse | undefined> {
        const result = await this.pool.query(
            `${this.qaResponseSelectSql()} WHERE r.question_id = $1 AND r.attendee_id = $2`,
            [questionId, attendeeId]
        );
        return result.rows[0] ? this.mapQAResponse(result.rows[0]) : undefined;
    }

    async saveQAResponse(response: QAResponse): Promise<QAResponse> {
        const result = await this.pool.query(
            `INSERT INTO qa_responses (id, question_id, session_id, attendee_id, answer, submitted_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (question_id, attendee_id) DO NOTHING
             RETURNING id`,
            [response.id, response.questionId, response.sessionId, response.attendeeId, response.answer, response.submittedAt]
        );

        const saved = result.rows[0]
            ? await this.getQAResponse(response.questionId, response.attendeeId)
            : await this.getQAResponse(response.questionId, response.attendeeId);

        if (!saved) {
            throw new Error('Q&A response could not be saved.');
        }
        return saved;
    }

    private mapElection(row: any): Election {
        const rawStatus = row.status as Election['status'];
        const startsAt = row.startsAt ? (row.startsAt instanceof Date ? row.startsAt.toISOString() : row.startsAt) : undefined;
        const endsAt = row.endsAt ? (row.endsAt instanceof Date ? row.endsAt.toISOString() : row.endsAt) : undefined;
        const status = this.getEffectiveElectionStatus({ status: rawStatus, startsAt, endsAt } as Election);
        return {
            id: row.id,
            title: row.title,
            description: row.description || '',
            status,
            boardSeats: Number(row.boardSeats ?? row.board_seats ?? 1),
            startsAt,
            endsAt,
            timezone: row.timezone || 'Africa/Harare',
            createdBy: row.createdBy || row.created_by || '',
            createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
            updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
            openedAt: row.openedAt ? (row.openedAt instanceof Date ? row.openedAt.toISOString() : row.openedAt) : undefined,
            closedAt: row.closedAt ? (row.closedAt instanceof Date ? row.closedAt.toISOString() : row.closedAt) : undefined
        };
    }

    private getEffectiveElectionStatus(election: Election): Election['status'] {
        if (election.status === 'closed') return 'closed';
        if (election.status === 'draft') return 'draft';
        const now = this.getZonedNowParts(election.timezone || 'Africa/Harare');
        if (election.endsAt && now >= this.getWallClockComparable(election.endsAt)) return 'closed';
        if (election.startsAt && now < this.getWallClockComparable(election.startsAt)) return 'scheduled';
        return 'open';
    }

    private getZonedNowParts(timezone: string) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
    }

    private getWallClockComparable(value: string) {
        return value.replace(' ', 'T').slice(0, 19);
    }

    async getActiveElection(): Promise<Election | undefined> {
        const result = await this.pool.query(`
            SELECT id, title, description, status, board_seats as "boardSeats",
                   to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI:SS') as "startsAt",
                   to_char(ends_at, 'YYYY-MM-DD"T"HH24:MI:SS') as "endsAt",
                   timezone,
                   created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt",
                   opened_at as "openedAt", closed_at as "closedAt"
            FROM elections
            ORDER BY CASE WHEN status = 'open' THEN 0 WHEN status = 'scheduled' THEN 1 WHEN status = 'draft' THEN 2 ELSE 3 END, created_at DESC
            LIMIT 1
        `);
        return result.rows[0] ? this.mapElection(result.rows[0]) : undefined;
    }

    async getElection(id: string): Promise<Election | undefined> {
        const result = await this.pool.query(`
            SELECT id, title, description, status, board_seats as "boardSeats",
                   to_char(starts_at, 'YYYY-MM-DD"T"HH24:MI:SS') as "startsAt",
                   to_char(ends_at, 'YYYY-MM-DD"T"HH24:MI:SS') as "endsAt",
                   timezone,
                   created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt",
                   opened_at as "openedAt", closed_at as "closedAt"
            FROM elections
            WHERE id = $1
        `, [id]);
        return result.rows[0] ? this.mapElection(result.rows[0]) : undefined;
    }

    async saveElection(election: Election): Promise<Election> {
        const result = await this.pool.query(`
            INSERT INTO elections (id, title, description, status, board_seats, starts_at, ends_at, timezone, created_by, created_at, updated_at, opened_at, closed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                description = EXCLUDED.description,
                status = EXCLUDED.status,
                board_seats = EXCLUDED.board_seats,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                timezone = EXCLUDED.timezone,
                updated_at = EXCLUDED.updated_at,
                opened_at = EXCLUDED.opened_at,
                closed_at = EXCLUDED.closed_at
            RETURNING id
        `, [
            election.id,
            election.title,
            election.description,
            election.status,
            election.boardSeats,
            election.startsAt || null,
            election.endsAt || null,
            election.timezone || 'Africa/Harare',
            election.createdBy,
            election.createdAt,
            election.updatedAt,
            election.openedAt || null,
            election.closedAt || null
        ]);
        return (await this.getElection(result.rows[0].id)) as Election;
    }

    async updateElectionStatus(id: string, status: Election['status']): Promise<Election | undefined> {
        const election = await this.getElection(id);
        if (!election) return undefined;
        const now = new Date().toISOString();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            if (status === 'open') {
                await client.query(
                    `UPDATE elections SET status = 'closed', closed_at = COALESCE(closed_at, $1::timestamp), updated_at = $1::timestamp WHERE status = 'open'`,
                    [now]
                );
            }
            await client.query(
                `UPDATE elections
                 SET status = $2::varchar,
                     updated_at = $3::timestamp,
                     opened_at = CASE WHEN $2::varchar = 'open' THEN $3::timestamp ELSE opened_at END,
                     closed_at = CASE WHEN $2::varchar = 'closed' THEN $3::timestamp ELSE closed_at END
                 WHERE id = $1`,
                [id, status, now]
            );
            await client.query('COMMIT');
            return await this.getElection(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private mapElectionCandidate(row: any): ElectionCandidate {
        return {
            id: row.id,
            electionId: row.electionId,
            category: row.category,
            fullName: row.fullName,
            organization: row.organization || '',
            position: row.position || '',
            bio: row.bio || '',
            photoUrl: row.photoUrl || '',
            displayOrder: Number(row.displayOrder || 0),
            createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
            updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
            voteCount: Number(row.voteCount || 0)
        };
    }

    async listElectionCandidates(electionId: string): Promise<ElectionCandidate[]> {
        const result = await this.pool.query(`
            SELECT c.id, c.election_id as "electionId", c.category, c.full_name as "fullName",
                   c.organization, c.position, c.bio, c.photo_url as "photoUrl",
                   c.display_order as "displayOrder", c.created_at as "createdAt", c.updated_at as "updatedAt",
                   COUNT(v.id)::int as "voteCount"
            FROM election_candidates c
            LEFT JOIN election_votes v ON v.candidate_id = c.id
            WHERE c.election_id = $1
            GROUP BY c.id
            ORDER BY c.category ASC, c.display_order ASC, c.full_name ASC
        `, [electionId]);
        return result.rows.map((row: any) => this.mapElectionCandidate(row));
    }

    async saveElectionCandidate(candidate: ElectionCandidate): Promise<ElectionCandidate> {
        const result = await this.pool.query(`
            INSERT INTO election_candidates (id, election_id, category, full_name, organization, position, bio, photo_url, display_order, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                category = EXCLUDED.category,
                full_name = EXCLUDED.full_name,
                organization = EXCLUDED.organization,
                position = EXCLUDED.position,
                bio = EXCLUDED.bio,
                photo_url = EXCLUDED.photo_url,
                display_order = EXCLUDED.display_order,
                updated_at = EXCLUDED.updated_at
            RETURNING election_id
        `, [
            candidate.id,
            candidate.electionId,
            candidate.category,
            candidate.fullName,
            candidate.organization,
            candidate.position,
            candidate.bio,
            candidate.photoUrl,
            candidate.displayOrder,
            candidate.createdAt,
            candidate.updatedAt
        ]);
        const candidates = await this.listElectionCandidates(result.rows[0].election_id);
        return candidates.find(item => item.id === candidate.id) as ElectionCandidate;
    }

    async deleteElectionCandidate(id: string): Promise<boolean> {
        const result = await this.pool.query('DELETE FROM election_candidates WHERE id = $1', [id]);
        return (result.rowCount || 0) > 0;
    }

    private mapElectionVoter(row: any): ElectionVoter {
        return {
            id: row.id,
            electionId: row.electionId,
            userId: row.userId,
            identifier: row.identifier || undefined,
            memberCategory: row.memberCategory || undefined,
            eligibleCategory: row.eligibleCategory || undefined,
            addedAt: row.addedAt instanceof Date ? row.addedAt.toISOString() : row.addedAt,
            hasVoted: Boolean(row.hasVoted),
            votedAt: row.votedAt ? (row.votedAt instanceof Date ? row.votedAt.toISOString() : row.votedAt) : undefined,
            user: row.firstName ? {
                id: row.userId,
                firstName: row.firstName,
                lastName: row.lastName,
                email: row.email || undefined,
                organization: row.organization || undefined,
                position: row.position || undefined,
                class: row.class || undefined
            } : undefined
        };
    }

    async listElectionVoters(electionId: string): Promise<ElectionVoter[]> {
        const result = await this.pool.query(`
            SELECT ev.id, ev.election_id as "electionId", ev.user_id as "userId", ev.identifier, ev.member_category as "memberCategory", ev.added_at as "addedAt", ev.eligible_category as "eligibleCategory",
                   EXISTS(SELECT 1 FROM election_votes vote WHERE vote.election_id = ev.election_id AND vote.voter_id = ev.user_id) as "hasVoted",
                   (SELECT MIN(vote.submitted_at) FROM election_votes vote WHERE vote.election_id = ev.election_id AND vote.voter_id = ev.user_id) as "votedAt",
                   u.first_name as "firstName", u.last_name as "lastName", u.email, u.organization, u.position, u.class
            FROM election_voters ev
            JOIN users u ON u.id = ev.user_id
            WHERE ev.election_id = $1
            ORDER BY u.last_name ASC, u.first_name ASC
        `, [electionId]);
        return result.rows.map((row: any) => this.mapElectionVoter(row));
    }

    async saveElectionVoter(voter: ElectionVoter): Promise<ElectionVoter> {
        await this.pool.query(`
            INSERT INTO election_voters (id, election_id, user_id, added_at, eligible_category, identifier, member_category)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (election_id, user_id) DO UPDATE SET eligible_category = COALESCE(EXCLUDED.eligible_category, election_voters.eligible_category), identifier = COALESCE(EXCLUDED.identifier, election_voters.identifier), member_category = COALESCE(EXCLUDED.member_category, election_voters.member_category)
        `, [voter.id, voter.electionId, voter.userId, voter.addedAt, voter.eligibleCategory || null, voter.identifier || null, voter.memberCategory || null]);
        return (await this.getElectionVoter(voter.electionId, voter.userId)) as ElectionVoter;
    }

    async deleteElectionVoter(electionId: string, userId: string): Promise<boolean> {
        await this.pool.query('DELETE FROM election_votes WHERE election_id = $1 AND voter_id = $2', [electionId, userId]);
        const result = await this.pool.query('DELETE FROM election_voters WHERE election_id = $1 AND user_id = $2', [electionId, userId]);
        return (result.rowCount || 0) > 0;
    }

    async getElectionVoter(electionId: string, userId: string): Promise<ElectionVoter | undefined> {
        const voters = await this.listElectionVoters(electionId);
        return voters.find(voter => voter.userId === userId);
    }

    private mapElectionVote(row: any): ElectionVote {
        return {
            id: row.id,
            electionId: row.electionId,
            voterId: row.voterId,
            candidateId: row.candidateId,
            category: row.category,
            submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt
        };
    }

    async listElectionVotes(electionId: string, voterId?: string): Promise<ElectionVote[]> {
        const result = await this.pool.query(`
            SELECT id, election_id as "electionId", voter_id as "voterId", candidate_id as "candidateId", category, submitted_at as "submittedAt"
            FROM election_votes
            WHERE election_id = $1 ${voterId ? 'AND voter_id = $2' : ''}
            ORDER BY submitted_at ASC
        `, voterId ? [electionId, voterId] : [electionId]);
        return result.rows.map((row: any) => this.mapElectionVote(row));
    }

    async saveElectionVotes(electionId: string, voterId: string, votes: ElectionVote[]): Promise<ElectionVote[]> {
        const existing = await this.listElectionVotes(electionId, voterId);
        if (existing.length > 0) return existing;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const vote of votes) {
                await client.query(`
                    INSERT INTO election_votes (id, election_id, voter_id, candidate_id, category, submitted_at)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (election_id, voter_id, candidate_id) DO NOTHING
                `, [vote.id, vote.electionId, vote.voterId, vote.candidateId, vote.category, vote.submittedAt]);
            }
            await client.query('COMMIT');
            return await this.listElectionVotes(electionId, voterId);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async getElectionDashboard(electionId?: string): Promise<ElectionDashboard> {
        const election = electionId ? await this.getElection(electionId) : await this.getActiveElection();
        if (!election) {
            return { election: null, candidates: [], voters: [], votes: [] };
        }
        const [candidates, voters, votes] = await Promise.all([
            this.listElectionCandidates(election.id),
            this.listElectionVoters(election.id),
            this.listElectionVotes(election.id)
        ]);
        return { election, candidates, voters, votes };
    }

    async getElectionBallot(userId: string): Promise<ElectionBallot> {
        const election = await this.getActiveElection();
        if (!election) {
            return { election: null, candidates: [], voter: null, votes: [] };
        }
        const [candidates, voter, votes] = await Promise.all([
            this.listElectionCandidates(election.id),
            this.getElectionVoter(election.id, userId),
            this.listElectionVotes(election.id, userId)
        ]);
        return { election, candidates, voter: voter || null, votes };
    }

    async get(): Promise<any> {
        const users = await this.getUsers();
        const sessions = await this.getSessions();
        const notes = await this.pool.query('SELECT * FROM notes');
        const speakers = await this.getSpeakers();
        const sponsors = await this.getSponsors();
        const testimonials = await this.getTestimonials();
        const gallery = await this.getGallery();
        const venue = await this.getVenue();
        const adventures = await this.getAdventures();
        const feedback = await this.getFeedback();
        const googleDriveLink = await this.getGoogleDriveLink();
        const dayLinks = await this.getDayLinks();
        const studyMaterials = await this.getStudyMaterials();

        return {
            users,
            sessions,
            notes: notes.rows,
            speakers,
            sponsors,
            testimonials,
            gallery,
            venue,
            adventures,
            feedback,
            googleDriveLink,
            dayLinks,
            studyMaterials
        };
    }

    async saveApiAuditLog(entry: ApiAuditEntry): Promise<void> {
        await this.pool.query(`
            INSERT INTO api_audit_logs (id, time, actor_id, actor_name, method, path, status_code, duration_ms, error_code, error_cause)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        `, [entry.id, entry.time, entry.actorId || null, entry.actorName, entry.method, entry.path,
            entry.statusCode, entry.durationMs, entry.errorCode || null, entry.errorCause || null]);
    }

    async listApiAuditLogs(query: { page: number; pageSize: number; errorsOnly: boolean; search: string }): Promise<{ items: ApiAuditEntry[]; total: number }> {
        const conditions = [query.errorsOnly ? 'status_code >= 400' : 'TRUE'];
        const values: unknown[] = [];
        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(actor_name ILIKE $${values.length} OR path ILIKE $${values.length} OR id ILIKE $${values.length} OR error_code ILIKE $${values.length})`);
        }
        const where = conditions.join(' AND ');
        const totalResult = await this.pool.query(`SELECT COUNT(*)::int AS total FROM api_audit_logs WHERE ${where}`, values);
        const rows = await this.pool.query(`
            SELECT id, time, actor_id AS "actorId", actor_name AS "actorName", method, path,
                   status_code AS "statusCode", duration_ms AS "durationMs",
                   error_code AS "errorCode", error_cause AS "errorCause"
            FROM api_audit_logs WHERE ${where}
            ORDER BY time DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}
        `, [...values, query.pageSize, (query.page - 1) * query.pageSize]);
        return {
            items: rows.rows.map(row => ({ ...row, time: row.time instanceof Date ? row.time.toISOString() : row.time })),
            total: totalResult.rows[0].total
        };
    }

    async getApiMetrics(query: ApiMetricsQuery): Promise<ApiMetrics> {
        const metrics = createEmptyApiMetrics(query);
        const values = [query.from, query.to, query.method, query.path, query.statusCode];
        const where = `time >= $1::timestamptz AND time < $2::timestamptz
            AND ($3::text = '' OR method = $3) AND ($4::text = '' OR path = $4)
            AND ($5::integer IS NULL OR status_code = $5)`;
        const [statuses, endpoints, options, statusOptions] = await Promise.all([
            this.pool.query(`SELECT FLOOR((EXTRACT(EPOCH FROM time) * 1000 - $6::double precision)
                / $7::double precision)::int AS bucket_index,
                status_code, COUNT(*)::int AS count, SUM(duration_ms)::bigint AS duration_sum
                FROM api_audit_logs WHERE ${where}
                GROUP BY bucket_index, status_code ORDER BY bucket_index`,
                [...values, Date.parse(query.from), query.bucketMs]),
            this.pool.query(`SELECT path, COUNT(*)::int AS count FROM api_audit_logs
                WHERE ${where} GROUP BY path ORDER BY count DESC, path LIMIT 5`, values),
            this.pool.query(`SELECT path FROM api_audit_logs
                WHERE time >= $1::timestamptz AND time < $2::timestamptz
                GROUP BY path ORDER BY COUNT(*) DESC, path LIMIT 100`, [query.from, query.to]),
            this.pool.query(`SELECT DISTINCT status_code FROM api_audit_logs
                WHERE time >= $1::timestamptz AND time < $2::timestamptz
                ORDER BY status_code`, [query.from, query.to])
        ]);
        const statusCounts = new Map<number, number>();
        let durationSum = 0;
        for (const row of statuses.rows) {
            const bucket = metrics.buckets[row.bucket_index];
            if (!bucket) continue;
            bucket.counts[row.status_code] = row.count;
            metrics.totalRequests += row.count;
            if (row.status_code >= 400) metrics.errorRequests += row.count;
            durationSum += Number(row.duration_sum);
            statusCounts.set(row.status_code, (statusCounts.get(row.status_code) || 0) + row.count);
        }
        metrics.averageDurationMs = metrics.totalRequests ? Math.round(durationSum / metrics.totalRequests) : 0;
        metrics.statusCounts = [...statusCounts].map(([statusCode, count]) => ({ statusCode, count }))
            .sort((a, b) => b.count - a.count || a.statusCode - b.statusCode);
        metrics.topEndpoints = endpoints.rows;
        metrics.endpointOptions = options.rows.map(row => row.path);
        metrics.statusCodeOptions = statusOptions.rows.map(row => row.status_code);
        return metrics;
    }

    async closePool(): Promise<void> {
        await this.pool.end();
    }
}

let sharedDatabase: PostgresDatabase | null = null;

export function getDb(): PostgresDatabase {
    if (!sharedDatabase) {
        sharedDatabase = new PostgresDatabase();
    }
    return sharedDatabase;
}




