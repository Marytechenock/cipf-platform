-- ============ USERS TABLE ============
-- DROP the existing table if you want to recreate (WARNING: This will delete all data!)
-- DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
                                     id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE,  -- Removed NOT NULL - now optional
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'attendee',
    organization VARCHAR(255),
    position VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    class VARCHAR(2) DEFAULT 'A',  -- NEW: Class A or B
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_time ON api_audit_logs(time DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_status ON api_audit_logs(status_code, time DESC);

-- Note: PostgreSQL allows multiple NULLs in UNIQUE constraints
-- So email can be NULL for multiple users

-- ============ SESSIONS TABLE ============
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

-- ============ ATTENDANCE RECORDS TABLE ============
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

-- ============ Q&A TABLES ============
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

CREATE INDEX IF NOT EXISTS idx_qa_questions_session ON qa_questions(session_id, status, display_order);
CREATE INDEX IF NOT EXISTS idx_qa_responses_question ON qa_responses(question_id, submitted_at DESC);

-- ============ VOTING / ELECTION TABLES ============
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

CREATE TABLE IF NOT EXISTS election_voters (
    id VARCHAR(50) PRIMARY KEY,
    election_id VARCHAR(50) REFERENCES elections(id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    identifier VARCHAR(100),
    member_category VARCHAR(100),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    eligible_category VARCHAR(30),
    UNIQUE(election_id, user_id)
);

CREATE TABLE IF NOT EXISTS election_votes (
    id VARCHAR(50) PRIMARY KEY,
    election_id VARCHAR(50) REFERENCES elections(id) ON DELETE CASCADE,
    voter_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    candidate_id VARCHAR(50) REFERENCES election_candidates(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(election_id, voter_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_election_candidates_election ON election_candidates(election_id, category, display_order);
CREATE INDEX IF NOT EXISTS idx_election_voters_election ON election_voters(election_id);
CREATE INDEX IF NOT EXISTS idx_election_votes_election ON election_votes(election_id, category);

-- ============ NOTES TABLE ============
CREATE TABLE IF NOT EXISTS notes (
                                     id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(50) REFERENCES sessions(id) ON DELETE CASCADE,
    content TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, session_id)
    );

-- ============ SPEAKERS TABLE ============
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

-- ============ SPONSORS TABLE ============
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

-- ============ TESTIMONIALS TABLE ============
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

-- ============ GALLERY TABLE ============
CREATE TABLE IF NOT EXISTS gallery (
                                       id VARCHAR(50) PRIMARY KEY,
    url TEXT NOT NULL,
    caption TEXT NOT NULL,
    description TEXT,
    category VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

CREATE TABLE IF NOT EXISTS day_links (
                                         id VARCHAR(50) PRIMARY KEY,
    day VARCHAR(50) NOT NULL,
    drive_link TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- ============ VENUE TABLE ============
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

-- ============ ADVENTURES TABLE ============
CREATE TABLE IF NOT EXISTS adventures (
                                          id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- ============ FEEDBACK TABLE ============
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

-- ============ GOOGLE DRIVE LINK TABLE ============
CREATE TABLE IF NOT EXISTS google_drive (
                                            id VARCHAR(50) PRIMARY KEY DEFAULT 'drive_1',
    link TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
