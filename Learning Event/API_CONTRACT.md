# API Contract — Learning Event Registration

This is what the frontend (`public/index.html` and `public/login.html`)
expects from the backend. Whoever builds the real backend just needs to
match these request/response shapes — the frontend doesn't care what
database or language sits behind it.

A working reference implementation (Node/Express + SQLite) is included in
this folder (`server.js`) so you can run it as-is, replace it piece by
piece, or use it purely as a spec while you build your own in whatever
stack you prefer.

## Auth

All `/api/staff/*` routes except login require:
```
Authorization: Bearer <token>
```
Any request without a valid token should return `401` with
`{ "error": "Unauthorized staff access" }` — the frontend watches for
401s specifically and redirects to the login page when it sees one.

### POST /api/staff/login
Request:
```json
{ "password": "the-shared-staff-password" }
```
Success (200):
```json
{ "token": "opaque-or-jwt-string" }
```
Failure (401):
```json
{ "error": "Incorrect password" }
```

There's no per-user account system here — one shared password for
whoever's working the booth, matching the simplicity of the event. If you
want individual staff logins later, that's an additive change; the
frontend only cares that it gets a token back.

## Event settings

### GET /api/staff/meta
```json
{ "name": "Learning Event 2026", "date": "Thursday 15 October 2026", "capacity": 140 }
```

### PUT /api/staff/meta
Request body: any subset of `{ name, date, capacity }`. Returns the full
updated object in the same shape as GET.

## Attendees

Attendee shape used everywhere (flat — no nested objects):
```json
{
  "id": "a_xxxxx",
  "name": "Amaka Obi",
  "phone": "0803 123 4567",
  "email": "amaka@company.com",
  "organization": "Finance Team",
  "checkedIn": false,
  "addedAt": "2026-09-15T07:38:16.045Z"
}
```

### GET /api/staff/attendees?search=&checkedIn=
Query params (all optional):
- `search` — matches name, phone, email, or organization (case-insensitive)
- `checkedIn` — `"true"` or `"false"`

Response:
```json
{
  "items": [ /* attendee objects */ ],
  "total": 42,
  "stats": {
    "totalAttendees": 42,
    "checkedInCount": 10,
    "notCheckedInCount": 32
  }
}
```

### POST /api/staff/attendees
Request:
```json
{ "name": "Amaka Obi", "phone": "0803 123 4567", "email": "...", "organization": "..." }
```
`name` and `phone` are required. Server must:
- Reject with `409` if a record with the same phone number (digits only)
  already exists: `{ "error": "Someone with this phone number is already on the list." }`
- Reject with `409` if capacity is already reached:
  `{ "error": "Capacity reached (140/140)." }`

Success (201): the created attendee object.

### PATCH /api/staff/attendees/:id
Request body: any subset of `{ name, phone, email, organization, checkedIn }`.
Used both for editing details and for the "Check in" button
(`{ "checkedIn": true }`). Returns the updated attendee object.

### DELETE /api/staff/attendees/:id
Returns `{ "ok": true }`, or `404` if not found.

### POST /api/staff/attendees/import
Request:
```json
{ "rows": [ { "name": "...", "phone": "...", "email": "...", "organization": "..." }, ... ] }
```
Server should, per row:
- Skip (count as `invalid`) if name or phone is missing
- Skip (count as `duplicates`) if the phone number already exists
- Skip (count as `overCapacity`) once the cap is hit
- Otherwise insert it and count as `added`

Response:
```json
{ "added": 12, "duplicates": 2, "overCapacity": 0, "invalid": 1 }
```

### POST /api/staff/attendees/bulk-delete (optional, not currently called by the UI, but present in the reference server)
```json
{ "ids": ["a_xxx", "a_yyy"] }
```
Returns `{ "deleted": 2 }`.

## What was intentionally left out (vs. TMF's real system)

- No delegate/exhibitor/volunteer/media categories — flat list, one form.
- No self-service public registration form — attendees only enter the
  system via Add Attendee or Import.
- No signature capture or bank-account verification (that was for TMF's
  per-day stipend payouts — not relevant here).
- No multi-day event schedule / Day 1 vs Day 2 split.
- No per-staff-member accounts — one shared password.

If any of these turn out to be needed after all, they're additive and
won't require changing what's already built.
