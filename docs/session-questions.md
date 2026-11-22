# Session questions

Deploy the frontend and backend together, then restart the backend. Startup creates the speaker-account links, session-speaker links, and audience-question tables in PostgreSQL. Existing attendee credentials, roles, check-in details, QR codes, voting records, and organizer-led Q&A stay unchanged.

## Administrator setup

1. Ensure the speaker has an existing active attendee account and a profile under Speakers. A name or an organization value of “Speaker” does not grant access.
2. Open **Admin → Session Questions → Speaker access**.
3. Select the speaker profile and their login account. On first setup, existing Programme sessions with clear full-name matches are preselected, including panel sessions. An exact topic can suggest a session with no named facilitator. Review the ticks, add other sessions or untick unwanted ones, and save. Each profile links to one account; multiple speakers can be assigned to the same session. Suggestions never grant access until saved. Previously saved selections take priority, including intentionally cleared assignments.
4. Speakers sign in with their usual account. **More → My Sessions · Questions** appears for accounts with assignments. Mobile navigation has the same link. Discovery refreshes every 30 seconds; the presenter page can also be opened at `/session-questions/presenter`.

## During the event

- Attendees open Programme and use **Ask a Question** on a conference session. Named questions show the attendee’s company from their account. They can hide both their name and company from the speaker and screen. New questions are approved automatically, with a limit of five submissions per minute per account.
- Each session numbers questions in arrival order. The number stays the same in the attendee’s list, moderator queue, speaker view, and projector, even when earlier questions are hidden or answered. Existing questions receive numbers on backend startup.
- The administrator selects the session in **Session Questions** and can choose **Hide / duplicate**, **Restore to screen**, or **Mark answered**. No approval or individual screen selection is needed.
- Pending, approved, and answered questions appear in the assigned speaker’s view and the projector as they arrive. Hidden questions are excluded from both. Existing pending questions also appear automatically. Speaker cards have no status labels.
- **Open projector display** opens `/session-questions/display/<session-id>` in a new tab. Use a computer signed in as an administrator and connect it to the venue screen. The display is not a public link. Use **Full screen** for projection.
- The projector shows the full numbered list in arrival order, with name and company on one line. Answered questions stay in the list; **Hide / duplicate** removes a question and **Restore to screen** brings it back. It follows new arrivals when at the bottom; scrolling up lets the operator read earlier questions without being pulled back down. Moderator, presenter, and projector queues refresh every three seconds; this requires a working connection.
- Removing the account link or a session assignment revokes presenter access on the next request. Presenter permissions never allow moderation or access to other sessions.

## Verification

Run `npm run lint`, `npm run test:unit`, and `npm run build`.

To additionally test the PostgreSQL repository against session-local temporary tables on a local database:

```powershell
$env:TEST_SESSION_QUESTIONS_POSTGRES = '1'
npm run test:unit
```

The PostgreSQL test refuses non-local database hosts and does not modify application tables.
