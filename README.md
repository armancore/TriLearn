# EduNexus

EduNexus is a full-stack campus management system for semester-based colleges. It combines admissions intake, student onboarding, role-based academic operations, attendance tracking, study resources, notices, marks, in-app notifications, and profile/session management in one platform.

## Highlights

- Role-based workspaces for `ADMIN`, `COORDINATOR`, `INSTRUCTOR`, `GATEKEEPER`, and `STUDENT`
- Public student intake form before account creation
- Student onboarding with first-login password change and welcome email
- Password reset email flow via SMTP
- Department, subject, routine, assignment, material, notice, and marks management
- Instructor QR attendance, Student QR attendance windows, and student ID-card QR scanning
- Absence tickets with review workflow
- In-app notification center with unread polling
- Device token registration and notification persistence, with FCM delivery still scaffolded
- Student marks summary chart
- Dark mode with manual toggle and system-aware theming
- Recent account activity and active-session tracking on the profile page
- Attendance exports in PDF and Excel

## Tech Stack

- Frontend: React, Vite, React Router, Axios, Tailwind CSS
- Backend: Node.js, Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT access token + refresh token cookie sessions
- Email: Nodemailer over Resend SMTP
- Validation: Zod
- Logging: Winston
- Security: Helmet, rate limiting, signed QR payloads, upload signature validation
- Testing: Node test runner, Supertest
- CI: GitHub Actions

## Core Modules

### Admissions and onboarding

- Public `student-intake` flow for collecting student identity and guardian details
- Admin/coordinator review flow for student applications
- Student account creation from reviewed applications
- Strong temporary student passwords with forced password change

### Authentication and account security

- JWT access tokens with refresh-token rotation
- Forgot/reset password flow when SMTP is configured
- Account activity timeline in profile
- Active session list with sign-out-all-devices action
- Helmet security headers
- Optional Redis-backed distributed rate limiting via `REDIS_URL`

### Attendance

- Instructor subject QR generation and scanning
- Manual attendance marking
- Gatekeeper Student QR attendance windows
- Student ID card QR scanning by staff
- Holiday-aware attendance behavior
- Automatic absence creation after valid windows close
- Absence ticket submission and review

### Academic features

- Department-aware subjects and routines
- Assignments and study materials
- Marks entry and marks publication
- Notices with in-app notifications
- Attendance reporting and exports

## Roles

### `ADMIN`

- Full system management
- Creates and manages users, departments, subjects, routines, notices, and attendance settings
- Reviews student applications and converts them into accounts
- Only role that can create coordinator and gatekeeper accounts

### `COORDINATOR`

- Department-scoped academic operations
- Reviews applications and creates student accounts
- Manages routines, subjects, notices, attendance windows, and academic reports for their department
- Can create student accounts, but not coordinator or gatekeeper accounts

### `INSTRUCTOR`

- Manages assigned subjects
- Marks attendance manually or with QR flows
- Uploads assignments and materials
- Enters and publishes marks

### `GATEKEEPER`

- Runs the Student QR page during attendance windows
- Scans student ID QR cards for gate attendance
- Uses the base authenticated user record directly because there is no separate gatekeeper profile model yet

### `STUDENT`

- Completes profile after first login
- Views subjects, routine, attendance, assignments, materials, notices, tickets, and marks
- Uses Student QR attendance and ID card QR features

## Important Routes

### Public

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/student-intake`

### Protected examples

- `/admin`
- `/coordinator`
- `/instructor`
- `/student`
- `/student/profile`
- `/student/id-card`
- `/gatekeeper`

## Key API Groups

- `/api/auth`
- `/api/v1/auth`
- `/api/v1/admin`
- `/api/v1/departments`
- `/api/v1/subjects`
- `/api/v1/routines`
- `/api/v1/attendance`
- `/api/v1/assignments`
- `/api/v1/materials`
- `/api/v1/marks`
- `/api/v1/notices`
- `/api/v1/notifications`

## Local Setup

### Prerequisites

- Node.js 22 recommended
- PostgreSQL
- npm

### 1. Install dependencies

```bash
git clone <your-repo-url>
cd EduNexus

cd backend
npm install

cd ../frontend
npm install
```

### 2. Configure environment

Create `backend/.env` from [`.env.example`](.env.example).

Important backend values:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/edunexus?connection_limit=10&pool_timeout=20
JWT_SECRET=change_this_to_a_long_random_string
JWT_REFRESH_SECRET=change_this_to_a_different_long_random_string
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
QR_SIGNING_SECRET=change_this_to_a_long_random_string
BCRYPT_SALT_ROUNDS=12
REDIS_URL=
DEFAULT_STUDENT_PASSWORD=
RESEND_SMTP_HOST=smtp.resend.com
RESEND_SMTP_PORT=465
RESEND_SMTP_USER=resend
RESEND_SMTP_PASS=
MAIL_FROM=EduNexus <onboarding@resend.dev>
ENABLE_PASSWORD_RESET=true
UPLOAD_DIR=backend/uploads
UPLOAD_PUBLIC_PATH=/uploads
UPLOAD_BASE_URL=
```

Notes:

- Leave `DEFAULT_STUDENT_PASSWORD` blank to auto-generate a strong temporary password.
- Set `REDIS_URL` in production to enable shared rate limiting across instances.
- `MAIL_FROM=EduNexus <onboarding@resend.dev>` works for Resend testing. Use a verified domain for real delivery.

Create `frontend/.env` from [`frontend/.env.example`](frontend/.env.example):

```env
VITE_API_URL=http://localhost:5000/api/v1
```

Frontend auth bootstrap note:

- `AuthProvider` restores sessions with `POST /api/v1/auth/refresh` on protected app routes.
- Public auth pages like `/login`, `/forgot-password`, `/reset-password`, and `/student-intake` now skip that silent refresh call so a missing refresh cookie does not spam expected `401` requests in the browser console.

### 3. Run database migrations

From `backend`:

```bash
npx prisma migrate deploy
npx prisma generate
```

For active development:

```bash
npx prisma migrate dev
```

### 4. Start the app

Backend:

```bash
cd backend
npm run dev
```

Frontend:

```bash
cd frontend
npm run dev
```

Default local URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:5000/api/v1`
- Health: `http://localhost:5000/health`

## Scripts

### Backend

- `npm run dev`
- `npm run start`
- `npm run lint`
- `npm test`
- `npm run test:db`
- `npm run prisma:generate`
- `npm run prisma:migrate:dev`
- `npm run prisma:migrate:deploy`

### Frontend

- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run preview`

## Testing and CI

Backend coverage now includes:

- controller behavior tests
- utility unit tests for token, enrollment, and sanitization helpers
- Supertest integration smoke tests for HTTP responses
- optional real-database integration tests against a migrated PostgreSQL test database

To run the real-database backend suite:

1. Create a dedicated PostgreSQL test database.
2. Set `TEST_DATABASE_URL` to that database connection string.
3. Run Prisma migrations against that test database.

PowerShell example from `backend`:

```powershell
$env:TEST_DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/edunexus_test?connection_limit=10&pool_timeout=20"
$env:DATABASE_URL=$env:TEST_DATABASE_URL
npx prisma migrate dev --skip-generate
npm run test:db
```

Migration note:

- `20260402183000_add_absence_tickets_and_cleanup` creates the absence ticket status column before `20260402234500_fix_absence_ticket_status_enum` converts it to the enum type. Keep migration order intact when bootstrapping older databases.

GitHub Actions runs:

- backend lint
- backend tests
- frontend lint
- frontend build

Workflow file: [.github/workflows/ci.yml](/C:/Users/arman/EduNexus/.github/workflows/ci.yml)

## Security Notes

- Helmet is enabled for standard HTTP security headers.
- JSON request bodies are size-limited.
- Uploads validate actual file signatures, not only extensions.
- Access tokens are type-checked in auth middleware.
- Auth middleware expects the access token in the `Authorization: Bearer <token>` header (JWTs live in frontend memory, so there is no cookie-based access token).
- QR payload signing reads secrets at runtime and fails safely if secrets are missing.
- Refresh tokens track session metadata for profile visibility.
- User deletion is still a hard delete today, so related attendance, marks, and submission records cascade with the user.
- Protected requests now hydrate role profile context from the main auth lookup to avoid a second profile query per request.

## Current Product Status

Well covered for local development, demos, and iterative product work:

- authentication and onboarding
- attendance flows
- notices, assignments, materials, and marks
- in-app notifications
- dark mode
- recent activity and active sessions
- backend linting, tests, and CI

Still reasonable future work:

- deeper end-to-end integration tests with isolated test database seeding
- mobile push notifications
- cloud object storage
- advanced analytics/reporting
- soft-delete or archival workflows for student record retention instead of hard-delete cascades

## Why This Fits A Nepal College Workflow

- semester and section-based academic structure
- coordinator as department-level academic operator
- gate-style attendance flow
- institution-issued roll numbers
- phone-first student experience
- exportable attendance reports for academic administration
