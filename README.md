# MAZ Kariba Winter School 2026 – Event Management System

An offline-first-optimized, full-stack Continuous Professional Development (CPD) Event Management System built specifically for the **Marketing Association of Zimbabwe (MAZ) Kariba Winter School 2026**.

Developed in alliance with **IMM Graduate School of South Africa**, this application delivers real-time schedule filtering, persistent attendee study journals ("My Notes" per session), dynamic presentation visualizers, secure administrative dashboards, and a smart, conversational conversational feedback evaluation chatbot integrated server-side with the Gemini Pro LLM platform.

---

## Technical Architecture Overview

The system utilizes a modern, highly responsive architecture decoupling frontend interface states from high-performance backend micro-services:

```
                  ┌──────────────────────────────────────────────┐
                  │                 USER BROWSER                 │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         │ HTTP Rest Calls & Auth Bearer
                                         ▼
                  ┌──────────────────────────────────────────────┐
                  │            EXPRESS API CONTROLLER            │
                  │                 (server.ts)                  │
                  └──────┬───────────────┬───────────────────────┘
                         │               │
                         │ Internal DB   │ Gemini Pro Chat Model
                         ▼               ▼
                  ┌──────────────┐┌──────────────────────────────┐
                  │ FILE-BASED   ││       GEMINI SDK CALLS       │
                  │  JSON ENGINE ││ (aistudio-build user agent) │
                  │  (db.json)   │└──────────────────────────────┘
                  └──────────────┘
```

### 1. Unified State & Database Schema (`src/types.ts`)
*   **User / Attendee**: Secure email authentication, organizational roles (`admin` vs `attendee`), position details, status toggle filters.
*   **Conference Session**: Hourly slots, classification grouping (`Class A: Practitioners` vs `Class B: CPD Senior`), physical room venue listings, speaker identifiers, row type labels (`session`, `social`, `break`).
*   **Attendee Session Note**: Persistent written takeaways mapped uniquely per user per session.
*   **Feedback Submission**: Formal chatbot interviews evaluating stars ratings, standout speakers, takeaways, suggestions, and auto-archived chats logs.
*   **Sponsor Profile**: Corporate tier categories mapped to site redirects.
*   **Showcase Image**: Slideshow item URLs synchronized directly with admin panels.

### 2. File-Based Persistence Database (`src/server/db.ts`)
*   Acts as a super fast, self-contained JSON-backed storage layer (`db.json`) persisting written notes and ratings instantly.
*   Automatically pre-seeds on cold-starts with high-fidelity event details taken from the official MAZ Kariba Booklet (including 15 conference schedule sessions, 5 standout facilitators, sponsors, and resort showcase headers).

### 3. REST API Routes (`/server.ts`)
*   `POST /api/auth/login`: Handles email matching, returns simulated mock tokens, validates administrator vs attendee logins.
*   `GET /api/sessions`, `POST /api/sessions`: Manage agenda grids.
*   `GET /api/notes/:sessionId`, `POST /api/notes/:sessionId`: Retrieve and write participant takeaways securely.
*   `POST /api/feedback/chat`: Streams conversation nodes to Gemini with a private 5-question directive. Translates final messages into dynamic JSON elements before packing database entries.

---

## Complete API Documentation

###  Authentication Routes

#### 1. Participant Sign In
*   **Endpoint**: `POST /api/auth/login`
*   **Payload**:
    ```json
    {
      "email": "marytechenocks@gmail.com",
      "password": "kariba2026"
    }
    ```
*   **Success Response (200 OK)**:
    ```json
    {
      "token": "usr_902183_auth",
      "user": {
        "id": "usr_1",
        "email": "marytechenocks@gmail.com",
        "firstName": "Mary",
        "lastName": "Enoch",
        "role": "attendee",
        "organization": "Marytechenock Solutions",
        "position": "Lead Developer",
        "status": "active"
      }
    }
    ```

#### 2. Password Hint Recovery
*   **Endpoint**: `POST /api/auth/forgot-password`
*   **Payload**:
    ```json
    {
      "email": "marytechenocks@gmail.com"
    }
    ```
*   **Response**: Returns password hints or recovery statuses.

---

### 📝 Attendee Note Routes

#### 1. Retrieve Private Session Takeaway
*   **Endpoint**: `GET /api/notes/:sessionId`
*   **Headers**: `Authorization: Bearer <userId>`
*   **Response (200 OK)**:
    ```json
    {
      "note": "Great slide on brand resilience in FMCG markets!"
    }
    ```

#### 2. Log Session Takeaway
*   **Endpoint**: `POST /api/notes/:sessionId`
*   **Headers**: `Authorization: Bearer <userId>`
*   **Payload**:
    ```json
    {
      "note": "Dissected POTRAZ 2025 coverage metrics."
    }
    ```
*   **Response (200 OK)**: `{"status": "saved"}`

---

### 💬 Chatbot & Feedback Routes

#### 1. Conversational Evaluation Stream
*   **Endpoint**: `POST /api/feedback/chat`
*   **Headers**: `Authorization: Bearer <userId>`
*   **Payload**: Pass standard list of historical messages to preserve conversation state model.
    ```json
    {
      "messages": [
        { "sender": "bot", "text": "Can you rate the overall event 1-5?" },
        { "sender": "user", "text": "I rate it a 5!" }
      ]
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "reply": "Thank you! What session stood out the most to you?"
    }
    ```
    *Note: The final bot interaction contains an embedded `json` Markdown codeblock compiled via Gemini that is parsed client-side to automatically record and complete the database feedback form.*

---

## Installation Manual (Run Locally)

### Prerequisites
*   **Node.js**: `v18.0.0` or higher
*   **npm**: `v9.0.0` or higher

### Steps to Run
1.  **Clone the directory** contents to your workspace folder.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure local credentials**:
    Duplicate the `.env.example` file to create a live `.env` file:
    ```bash
    cp .env.example .env
    ```
    Populate the `GEMINI_API_KEY` with your secure access token from Google AI Studio.
    For a managed database such as DigitalOcean, point `DB_NAME` at the existing database, set `DB_SSL=true`, and leave `DB_AUTO_CREATE=false`.
4.  **Run in Development Mode**:
    This registers hot compilation via the configured Express wrapper:
    ```bash
    npm run dev
    ```
    Open your browser to `http://localhost:3000`.

---

## Deployment Manual

## Docker Deployment

The project includes a production `Dockerfile` and a `docker-compose.yml` stack with PostgreSQL and persistent upload storage. The Compose project is named `cipf-platform` and is separate from the existing MAZ stack.

### Run With Docker Compose

1. Copy `deploy.env.example` to `deploy.env` on the server. Set `CIPF_PUBLIC_APP_URL` to a **new HTTPS hostname**, such as a voting subdomain. Set a unique `AUTH_TOKEN_SECRET`, `DB_PASSWORD`, and super admin credentials. Keep `CIPF_COOKIE_SECURE=true` for HTTPS.
2. Check that `CIPF_HOST_PORT` is unused on the server. It defaults to `3001`; the container still listens on port `3000`. The host binding defaults to `127.0.0.1` so your reverse proxy can forward the new hostname to `127.0.0.1:3001`.
3. Check and start only this stack:

   ```bash
   docker compose --env-file deploy.env config --quiet
   docker compose --env-file deploy.env up -d --build
   curl -f http://127.0.0.1:3001/api/health
   ```

The stack uses its own Compose network, `cipf_postgres_data` and `cipf_uploads` volumes, database `cip_election`, and `cipf_auth` login cookie. It does not mount or migrate the existing MAZ database or upload volume. If this CIPF stack already holds production data under older volume names, back up and migrate that data before switching to these names.

### Production Notes

Before running in production, provide these values in the untracked `deploy.env` file:

```text
AUTH_TOKEN_SECRET
SUPER_ADMIN_BOOTSTRAP_EMAIL
SUPER_ADMIN_BOOTSTRAP_PASSWORD
DB_PASSWORD
CIPF_PUBLIC_APP_URL
CIPF_HOST_PORT
SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM
GROQ_API_KEY
```

Compose uses `CIPF_PUBLIC_APP_URL` for both the public URL and allowed browser origin. The local `.env` is for development; its localhost URL and `COOKIE_SECURE=false` are not used by the Compose stack. Uploaded files are stored through `UPLOAD_DIR=/app/uploads`, mounted to the `cipf_uploads` Docker volume.

Creating an admin account sends a welcome email with the administrator's name, login email, temporary password, password change instructions, and a link to `CIPF_PUBLIC_APP_URL`. Configure SMTP before creating admins. The SMTP server must support TLS; set `SMTP_SECURE=true` for implicit TLS (usually port 465), or use port 587 with STARTTLS. If the SMTP server rejects the message, creation fails and the new account is removed so it can be retried. SMTP acceptance does not guarantee final inbox delivery; check the recipient's mailbox and mail server logs if needed.

The application now uses server-side revocable sessions: the default absolute lifetime is 8 hours and the idle limit is 15 minutes. Browser polling does not renew idle time. Set `AUTH_TOKEN_TTL` and `AUTH_IDLE_TIMEOUT` in `deploy.env` if a different policy is needed. `CIPF_TRUST_PROXY_HOPS=1` assumes one reverse proxy that **overwrites** client-supplied `X-Forwarded-For`; set it to `0` if the app is reached directly. The reverse proxy must forward `Origin`, `Referer`, and `Sec-Fetch-Site` headers for write-request origin checks. Keep `AUTH_TOKEN_SECRET` stable: changing it invalidates sessions.

On the first start after this security update, previously issued cookies are invalid. Admins and super admins sign in with their email and password. Registered voters sign in using only their identifier from the election register. Sensitive admin actions require a sign-in from the last 10 minutes.

Compose requires super admin bootstrap credentials. Its super admin creates and manages admin accounts, so Compose does not pass the legacy admin bootstrap or force reset settings from the local `.env`.

Set `SUPER_ADMIN_BOOTSTRAP_EMAIL` and a unique password of at least 12 characters and at most 72 bytes to create the first super admin. Sign in and open `/super-admin` to view API metrics, manage administrator accounts, and review API audit logs. Metrics are calculated from stored audit entries and can be filtered by time range, HTTP method, endpoint, and response code. Once a super admin exists, the legacy admin bootstrap no longer recreates deleted admin accounts. The super admin password is never reset automatically on restart.

### Building the Bundles
We utilize high-speed **Vite** for optimized client-side SPA asset pipelines, and **esbuild** to compile `server.ts` into a fully bundled, standalone CommonJS module to bypass runtime import lag in containers:

```bash
npm run build
```
This produces optimized code outputs directly.

### Running in Standalone Container Mode
To boot up the built production package:
```bash
npm run start
```
This binds safety listeners to host `0.0.0.0` on port `3000`, matching Google Cloud Run ingress routing mandates.

### Admin Password Recovery
If the production admin login needs to be restored, run the maintenance script with a temporary password:
```bash
ADMIN_BOOTSTRAP_PASSWORD='replace-with-temp-password' npm run admin:reset-password -- --email admin@maz.co.zw
```
After access is restored, rotate the temporary password immediately.

---

### 🛡️ Authorized Brand Disclosures
*   This software features official branding with the MAZ logo and is **Powered by Marytechenock Solutions** (*Technology Advisor to MAZ*).
*   All user credentials represent pre-certified registrations imported beforehand. Self-registration forms are blocked by design.
