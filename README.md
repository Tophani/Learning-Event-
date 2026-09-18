# Learning Event Registration

An internal attendee management and check-in system for in-house learning events.

The application allows  staff to securely access a check-in dashboard, manage attendee records, import existing registration lists, search for attendees, and record attendance.


## Features

* **Staff Login** — Secure staff access using a shared password and JWT authentication.
* **Add Attendees** — Manually add an attendee if they are not already on the imported list.
* **Import Attendee Lists** — Import attendees from `.xlsx` or `.csv` files, or paste attendee data directly.
* **Search & Filter** — Search attendees by name, phone number, or email and filter by check-in status.
* **Check-In** — Mark attendees as checked in directly from the dashboard.
* **Export Attendee List** — Download the current attendee list as an `.xlsx` file.
* **Capacity Management** — Set an attendee capacity limit, enforced both on the frontend and backend.
* **Duplicate Prevention** — Duplicate phone numbers are automatically skipped during imports.



## Project Structure

```
.
├── server.js              # Node.js/Express backend
├── public/
│   ├── login.html         # Staff login page
│   └── index.html         # Main staff dashboard
├── API_CONTRACT.md        # API specification for frontend/backend integration
└── package.json
```

### `server.js`



### `public/login.html`

The staff login page used to authenticate users before accessing the check-in dashboard.

### `public/index.html`

The main dashboard where staff can:

* View attendees
* Search and filter the attendee list
* Add attendees
* Import attendee lists
* Check attendees in
* Export the current list

### `API_CONTRACT.md`

Documents the API endpoints expected by the frontend, including the required request and response formats.

Read this file first if you intend to build or replace the backend.

---

## Running Locally

### 1. Install dependencies

```bash
npm install
```

### 2. Start the application

For testing, the default staff password is:

```text
test1234
```

You can also specify your own password:

```bash
STAFF_PASSWORD=your-chosen-password npm start
```

### 3. Open the application

Once the server is running, open:

```text
http://localhost:3000
```

You will be redirected to the staff login page.

### Test Credentials

For local testing:

```text
Password: test1234
```

> **Security:** `test1234` is a test password only. Change it before deploying the application to a live environment.

---

## Environment Variables

The application supports the following environment variables:

Variable         Description                               Default           

 `STAFF_PASSWORD`  Shared password used by event staff        `changeme`        
 `JWT_SECRET`      Secret used to sign authentication tokens  Placeholder value 
 `PORT`            Port on which the server runs              `3000`           
 `DB_PATH`         Location of the SQLite database            `./data.db`       

### Production Configuration

Before deploying, make sure to set secure values for:

```bash
STAFF_PASSWORD=your-secure-password
JWT_SECRET=your-long-random-secret
PORT=3000
DB_PATH=./data.db
```

**Do not deploy the application using the default `STAFF_PASSWORD` or placeholder `JWT_SECRET`.**

---

## Attendee Import

Attendee lists can be imported in two ways:

### Excel or CSV Upload

The dashboard supports:

```text
.xlsx
.csv
```

Files are parsed directly in the browser using **SheetJS**, so the backend does not need to handle uploaded files.

### Paste Data

Attendee rows can also be pasted directly into the dashboard.

Both methods use the same backend import endpoint:

```text
/api/staff/attendees/import
```

Duplicate phone numbers are automatically skipped during import.

---

## Capacity Management

The application includes an attendee capacity limit.

The default capacity is:

```text
140 attendees
```

The capacity can be edited from the dashboard.

Capacity restrictions are enforced at both levels:

* Frontend/UI
* Backend/server

This prevents attendees from being added or imported after the configured capacity has been reached.

---

## Search & Filtering

Staff can search the attendee list using:

* Name
* Phone number
* Email address

The list can also be filtered by check-in status.

This allows staff to quickly identify attendees who have or have not checked in.

---

## Exporting Attendees

The current attendee list can be exported from the dashboard with a single click.

The exported file is provided in:

```text
.xlsx
```

format.

---

