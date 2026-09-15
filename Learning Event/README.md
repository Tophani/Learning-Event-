# Learning Event Registration (v2 — mirrors TMF's staff dashboard)

Attendee import & check-in tool for the in-house learning event.
Structured after TMF's real staff dashboard (card-style attendee rows,
staff password login, orange/red brand palette) but stripped down to what
this event actually needs: **import a list, search it, check people in.**
No self-registration, no delegate/exhibitor/media categories, no
signature or bank-account verification.

## What's inside

- `server.js` — reference Node.js/Express backend (SQLite, JWT login).
  Fully working — you can run this as your real backend or replace it.
- `public/login.html` — staff password login screen.
- `public/index.html` — the main dashboard.
- `API_CONTRACT.md` — **read this first if you're building your own
  backend.** It documents every endpoint the frontend expects, with exact
  request/response shapes, independent of whether you use this reference
  server or write your own.

## Running it locally

```bash
npm install
STAFF_PASSWORD=your-chosen-password npm start
```

Open http://localhost:3000 — it'll redirect you to the login page first.

Environment variables:
- `STAFF_PASSWORD` — the shared password for the check-in desk (defaults
  to `changeme` if unset — **do not deploy with the default**).
- `JWT_SECRET` — secret used to sign login tokens (defaults to a
  placeholder — **set a real one before deploying**).
- `PORT` — defaults to 3000.
- `DB_PATH` — where the SQLite file lives (defaults to `./data.db`).

## Deploying

Same shape as before: copy the folder to your server, `npm install
--production`, run it under a process manager (pm2 / systemd), and put it
behind Nginx or point a subdomain at it. Back up `data.db` regularly —
it's the only copy of the attendee list.

Example Nginx snippet:
```nginx
location /staff {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Frontend features

- **Staff login** — shared password, JWT stored in `localStorage`,
  auto-redirects to login on any `401`.
- **Import List** — either upload a `.xlsx`/`.csv` file (parsed in the
  browser via SheetJS, no backend file-handling needed) or paste rows
  directly. Both feed the same `/api/staff/attendees/import` endpoint.
  Duplicate phone numbers are skipped automatically.
- **Export** — one click, downloads the current list as `.xlsx`.
- **Search & filter** — by name, phone, or email; filter by checked-in
  status.
- **Capacity bar** — editable cap (defaults to 140), enforced both in the
  UI and server-side on add/import.
- **Card-style attendee rows** — mirrors the visual structure of TMF's
  real dashboard.

## Things to decide before go-live

- **Change `STAFF_PASSWORD` and `JWT_SECRET`** away from the defaults.
- **No audit log** — the database doesn't record who made each change,
  only current state.
- **One shared password**, not per-staff accounts. Fine for a single
  booth; say the word if you want individual logins instead.
