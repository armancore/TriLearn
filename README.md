# TriLearn

TriLearn is a full-stack college management system designed for semester-based institutions. It centralises every academic operation — student intake, enrollment, attendance, marks, assignments, study materials, timetables, and real-time notifications — into a single platform, accessible to all five roles that run a college: administrators, coordinators, instructors, gatekeepers, and students.

The name represents the three core pillars of any institution: **student**, **teacher**, and **institution** — all connected in one system.

---

## Overview

| | |
|--|--|
| **Backend** | Node.js · Express 5 · PostgreSQL · Prisma ORM |
| **Frontend** | React 19 · Vite · Tailwind CSS v4 |
| **Real-time** | Socket.IO |
| **Auth** | JWT access tokens + rotating refresh tokens |
| **API endpoints** | 107 |
| **Database models** | 23 |
| **Migrations** | 32 |
| **Test coverage** | 14 test files · 3,400+ lines |

---

## What TriLearn replaces

Colleges typically manage academic operations through a combination of spreadsheets, paper records, and expensive third-party software that charges per-student licensing fees, stores institutional data on external servers, and offers little to no customisation for local academic structures.

TriLearn is a self-hostable alternative. The institution owns the server, owns the database, and controls every piece of student data. There are no recurring licensing fees, no vendor lock-in, and no dependency on external availability.

---

## Roles

TriLearn has five distinct roles. Each role sees only what it needs and can act only within its scope.

**Admin** — Full system access. Creates and manages departments, subjects, and all staff accounts. Has visibility across the entire institution.

**Coordinator** — Department-scoped management. Reviews and approves student intake applications, converts them to accounts, publishes exam results, and generates attendance and marks reports for their department.

**Instructor** — Subject-level operations. Generates attendance QR codes, marks attendance manually, creates and grades assignments, enters exam marks, and uploads study materials for their assigned subjects.

**Gatekeeper** — Entrance-level attendance. Generates daily gate QR codes and scans student ID cards at the college entrance to record arrival-based attendance.

**Student** — Personal academic view. Sees their own timetable, attendance record, marks, assignments, and notices. Submits assignments, raises absence requests, and downloads their marksheet.

---

## Features

### Student intake and onboarding

Prospective students submit an online intake form with personal, guardian, and academic details. No account is created at this stage. A coordinator reviews the application, sets the department and semester, and converts it to a live student account with a single action. The student receives a welcome email with a temporary password and is automatically enrolled in all matching subjects for their semester and department.

For bulk onboarding, administrators can import hundreds of students at once from a CSV or XLSX spreadsheet. The system validates each row, reports any failures with row numbers, and sends welcome emails to all successfully created accounts.

### Attendance

Three mechanisms cover every attendance scenario a college encounters.

**Subject QR attendance** — The instructor generates a time-limited QR code for a specific class. Students open the scanner in the app and scan it to mark themselves present. Each QR is cryptographically signed with HMAC-SHA256 and expires after a configurable window. A used or expired code is rejected; the same code cannot mark a student present twice.

**Gate QR attendance** — The gatekeeper generates a daily rotating QR code at the college entrance. Students scan it on arrival. The system checks the student's semester against the configured time windows for that day and automatically marks them present across all scheduled classes falling within that window. Holiday dates are excluded from calculations.

**Manual attendance** — Instructors enter attendance by hand against any date, for makeup classes, off-campus sessions, or corrections to existing records.

Students see their per-subject attendance percentage in real time. When a student misses a class, they can submit an absence ticket with a written reason. The relevant instructor or coordinator reviews the ticket and approves or rejects it. The student receives an instant notification on the outcome.

### Marks and examinations

Instructors enter marks per subject for five exam types: Internal, Midterm, Final, Pre-board, and Practical. Entered marks are not visible to students until a coordinator explicitly publishes them — preventing accidental early disclosure and allowing coordinators to review results before release.

Once published, students see a full subject-wise breakdown with obtained marks, total marks, percentage, letter grade, and grade point. Overall GPA is calculated across all subjects. Students can download a formatted marksheet PDF at any time. A cohort ranking shows each student's rank and percentile within their semester and department without exposing any other student's name or score.

### Assignments

Instructors create assignments with a title, description, optional question PDF, due date, and total marks. Students submit their answer PDFs through the platform before the deadline. Instructors review each submission individually and record a marks and written feedback. Completed grade sheets export to XLSX.

### Study materials

Instructors upload PDF study materials against their assigned subjects. Students can only see and download materials for subjects they are enrolled in. Access is enforced at the file-serving layer — a direct URL to an upload file returns a 403 unless the requester has a valid session and the correct enrollment record.

### Class routine

A weekly timetable system with built-in conflict detection. Creating a routine entry that would double-book the same instructor or the same room in an overlapping time slot is rejected before it is saved. Combined groups allow a single timetable entry to appear across multiple sections, which is common for shared electives and language courses.

### Notice board

Staff post notices with a type (General, Exam, Holiday, Event, Urgent) and an audience scope (All, Students only, Instructors only). Notices can be narrowed further to a specific department and semester. Every posted notice triggers an instant in-app notification for all users it targets.

### Real-time notifications

All significant events deliver instant notifications to the affected user via Socket.IO without requiring a page refresh — marks published, new assignment posted, absence ticket reviewed, notice published. The notification centre shows unread count and a full history. A device token model is already in the database for future FCM mobile push notifications.

### Departments

A managed department registry used as a reference across students, instructors, subjects, coordinators, and routines. Departments enforce consistent filtering and scoping throughout the system — a coordinator with access to the BIT department cannot see or modify records belonging to BCA.

### Audit log

Every significant action is recorded to an append-only audit log: logins, user creation, marks changes, attendance records, file uploads, notice posts. The log stores actor ID, role, action type, target entity, and metadata. Users can review their own session history and active devices. Admins have full access to the log across all users.

---

## Technical architecture

### Request lifecycle

Every API request passes through a consistent middleware chain before reaching a controller:

```
Request
  → CORS validation
  → Helmet security headers
  → Rate limiter (Redis-backed)
  → CSRF origin check
  → protect()         — JWT verification + database user lookup
  → allowRoles()      — role gate for the specific endpoint
  → attachActorProfiles() — attaches req.student / req.instructor / req.coordinator
  → validate()        — Zod schema validation of body and query
  → Controller
  → Prisma ORM
  → PostgreSQL
```

### File handling

Uploaded files go through a three-stage pipeline before being stored:

1. **MIME filter** — Multer rejects files that do not match the expected type at the field level
2. **Magic-byte validation** — the first bytes of the saved file are read and compared against known file signatures, catching extension spoofing regardless of what the client declares
3. **Image re-encoding** — Sharp re-processes every uploaded image through a clean encode, stripping all metadata and neutralising any embedded payload

Files are served through an authenticated controller that performs a database lookup and a role-based access check before streaming any file. No upload directory is publicly accessible.

### Authentication

Access tokens are short-lived JWTs (15 minutes by default) kept in memory on the frontend — never in localStorage. Refresh tokens are longer-lived JWTs stored as SHA-256 hashes in the database. On every refresh, the old token is revoked and a new one is issued. A leaked refresh token database does not expose usable tokens. The frontend Axios client handles token refresh automatically and transparently on 401 responses.

### Real-time

Socket.IO runs on the same Node.js server. Connections are authenticated via JWT on handshake. Each user joins a private room keyed to their user ID. All notification events are emitted directly to the relevant user's room.

---

## Stack reference

### Backend

| Package | Purpose |
|---------|---------|
| Express 5 | HTTP server and routing |
| Prisma 7 + PostgreSQL | ORM and database |
| jsonwebtoken | JWT signing and verification |
| bcryptjs | Password hashing |
| Socket.IO 4 | Real-time WebSocket server |
| Multer 2 | Multipart file upload handling |
| Sharp | Image processing and re-encoding |
| PDFKit | Server-side PDF generation |
| ExcelJS | XLSX export |
| Nodemailer | Email delivery via Resend SMTP |
| Zod 4 | Request validation schemas |
| express-rate-limit + Redis | Rate limiting with shared Redis store |
| Helmet | HTTP security headers |
| Winston | Structured logging |
| qrcode | QR code image generation |

### Frontend

| Package | Purpose |
|---------|---------|
| React 19 | UI framework |
| Vite 8 | Build tool and dev server |
| Tailwind CSS v4 | Utility-first styling |
| React Router v7 | Client-side routing |
| Axios | HTTP client with interceptors |
| Socket.IO Client | Real-time connection |
| Framer Motion | Animations and transitions |
| jsQR | In-browser QR code scanning |
| Lucide React | Icon library |

---

## Project structure

```
TriLearn/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── attendance/         # QR, manual, tickets, settings, export
│   │   │   ├── admin.controller.js
│   │   │   ├── auth.controller.js
│   │   │   ├── assignment.controller.js
│   │   │   ├── marks.controller.js
│   │   │   ├── notice.controller.js
│   │   │   ├── routine.controller.js
│   │   │   ├── studyMaterial.controller.js
│   │   │   ├── subject.controller.js
│   │   │   ├── upload.controller.js
│   │   │   └── ...
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   ├── csrf.middleware.js
│   │   │   ├── rateLimit.middleware.js
│   │   │   ├── upload.middleware.js
│   │   │   └── validate.middleware.js
│   │   ├── routes/                 # One router per domain
│   │   ├── utils/                  # Prisma, logger, mailer, tokens, realtime
│   │   ├── validators/             # Zod schemas for every endpoint
│   │   └── jobs/                   # Background token cleanup
│   ├── prisma/
│   │   ├── schema.prisma           # 23 models
│   │   └── migrations/             # 32 migrations
│   ├── test/                       # 14 test files, 3,400+ lines
│   └── Dockerfile
└── frontend/
    └── src/
        ├── pages/
        │   ├── admin/              # 8 pages
        │   ├── coordinator/        # 1 page
        │   ├── instructor/         # 9 pages
        │   ├── student/            # 11 pages
        │   ├── gate/               # 1 page
        │   ├── auth/               # 5 pages
        │   └── shared/             # 3 pages
        ├── components/             # Modal, Toast, LoadingSkeleton, Pagination, etc.
        ├── hooks/                  # useApi (abort-safe), useForm
        ├── context/                # AuthContext, SocketContext, ReferenceDataContext
        └── utils/                  # API client, file helpers, QR scanner
```

---

## Getting started

### Prerequisites

- Node.js 22
- PostgreSQL 15 or later
- Redis (optional in development, required in production)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Arman-techiee/TriLearn.git
cd TriLearn

# 2. Install backend dependencies
cd backend && npm install

# 3. Install frontend dependencies
cd ../frontend && npm install
```

### Configuration

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### Database setup

```bash
cd backend
npx prisma migrate dev --name init
npx prisma generate
```

### Running locally

```bash
# Backend  →  http://localhost:5000
cd backend && npm run dev

# Frontend  →  http://localhost:5173
cd frontend && npm run dev
```

---

## Environment variables

```env
# ── Core (required) ───────────────────────────────────────
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/trilearn
JWT_SECRET=<random string, 32+ characters>
JWT_REFRESH_SECRET=<random string, 32+ characters>
QR_SIGNING_SECRET=<random string, 32+ characters>
FRONTEND_URL=http://localhost:5173

# ── Redis ─────────────────────────────────────────────────
# Optional in development. Required in production — startup aborts without it.
REDIS_URL=redis://localhost:6379

# ── Email (Resend SMTP) ───────────────────────────────────
MAIL_FROM=noreply@yourdomain.com
RESEND_SMTP_HOST=smtp.resend.com
RESEND_SMTP_PORT=587
RESEND_SMTP_USER=resend
RESEND_SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx

# ── Feature flags ─────────────────────────────────────────
OPEN_REGISTRATION=false       # Allow public self-registration (disabled by default)
ENABLE_PASSWORD_RESET=true    # Requires email to be configured

# ── File storage ──────────────────────────────────────────
UPLOAD_DIR=/app/uploads
UPLOAD_PUBLIC_PATH=/uploads
UPLOAD_BASE_URL=              # Leave blank for local disk; set to CDN origin for cloud

# ── Optional ──────────────────────────────────────────────
PORT=5000
ATTENDANCE_TIMEZONE=Asia/Kathmandu
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
```

---

## Deployment

### Docker

```bash
# Build
docker build -t trilearn-backend ./backend

# Run
docker run \
  --env-file backend/.env \
  -p 5000:5000 \
  -v /data/uploads:/app/uploads \
  trilearn-backend
```

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] Unique random values for `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `QR_SIGNING_SECRET` (32+ characters each)
- [ ] `REDIS_URL` configured — the server refuses to start in production without it
- [ ] `FRONTEND_URL` set to the exact origin of the deployed frontend
- [ ] `npx prisma migrate deploy` executed before starting the server
- [ ] Persistent volume or cloud storage configured for uploads
- [ ] TLS termination via a reverse proxy (nginx or Caddy) in front of the Node process

### Recommended stack for a pilot deployment

| Component | Provider |
|-----------|----------|
| Backend | Railway or Render |
| Database | Neon or Supabase (PostgreSQL) |
| Redis | Upstash |
| Frontend | Vercel or Cloudflare Pages |
| File storage | Cloudflare R2 (10 GB free tier) |

### Cloud storage migration

Local disk uploads do not survive ephemeral deployments. Before going to production on Railway, Render, or any stateless platform, migrate to cloud storage. The change is contained to three files: `upload.middleware.js`, `fileStorage.js`, and `upload.controller.js`. No other part of the codebase needs to change.

Recommended providers: Cloudflare R2 (S3-compatible, zero egress fees), Supabase Storage, or Amazon S3.

---

## Continuous integration

A GitHub Actions workflow runs on every push and pull request. It installs dependencies, runs ESLint, and executes the full test suite for both backend and frontend.

```
.github/workflows/ci.yml
```

---

## Roadmap

- [ ] React Native + Expo mobile app — architecture document and full file structure defined, backend mobile auth mode already implemented
- [ ] FCM push notifications — device token model and dispatch scaffold already in the codebase
- [ ] Cloud storage integration (Cloudflare R2)

---

## Author

**Arman Khan**
BIT Student · Texas College of Management & IT, Kathmandu, Nepal

I am a solo full-stack developer who is building TriLearn entirely independently alongside with my undergraduate coursework. The project started with a straightforward motivation: My own college uses an expensive third-party management system, and I wanted to build something better. That followed as a production-grade platform covering the full academic lifecycle of an institution, with real security, real-time features, and a mobile app in progress — written by me and learning for my career.

My focus is on building practical software that solves real problems in Nepal's education and technology sectors.

- Portfolio — [armankhan.com.np](https://www.armankhan.com.np)
- LinkedIn — [linkedin.com/in/arman-techiee](https://www.linkedin.com/in/arman-khan-943b29400)
- GitHub — [github.com/Arman-techiee](https://github.com/Arman-techiee)

---

## License

Copyright © 2026 Arman Khan. All rights reserved.

This software and its source code are the exclusive property of Arman Khan. Access to this repository is provided for review and evaluation purposes only.

**You may not** copy, modify, distribute, sublicense, use in production, or create derivative works from this software without explicit written permission from the author.

For licensing inquiries, deployment permissions, or institutional use, contact via LinkedIn or the portfolio above.