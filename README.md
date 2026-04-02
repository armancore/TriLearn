# EduNexus

EduNexus is a full-stack campus management system built around a Nepal college workflow. It includes role-based dashboards, admissions intake, account onboarding, scoped academic routines, student and staff attendance tools, study materials, assignments, notices, marks, and profile management.

The project is currently strong for local development, demos, and iterative product building. Core flows are implemented across frontend and backend, while some production-facing concerns such as email delivery and cloud storage are still future work.

## What The System Does

- Role-based access for `ADMIN`, `COORDINATOR`, `INSTRUCTOR`, `GATEKEEPER`, and `STUDENT`
- Public student intake form before account creation
- Admin/coordinator review flow for student applications
- Student account creation with first-login password change
- Profile completion and ongoing profile editing
- Department, subject, routine, notice, assignment, material, and marks management
- Attendance through:
  - instructor subject QR
  - instructor manual attendance
  - gatekeeper Student QR time windows
  - staff scanning of student ID card QR
- Absence auto-marking and student ticket submission
- Student ID card with QR-based identity details
- Exportable attendance reports in PDF and Excel

## Tech Stack

- Frontend: React, Vite, React Router, Axios, Tailwind CSS
- Backend: Node.js, Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT access token + refresh token cookies
- Validation: Zod
- Logging: Winston
- QR Generation: `qrcode`
- Export: PDFKit, ExcelJS

## Roles

### `ADMIN`

- full system control
- manages departments, subjects, routines, notices, and academic setup
- manages users including instructors, coordinators, gatekeepers, and students
- reviews student applications and converts them into accounts
- manages Student QR settings and attendance holidays

### `COORDINATOR`

- academic operations and department-level support
- uses a dedicated coordinator navigation shell that combines academic setup and attendance oversight tools
- reviews applications and creates student accounts from them
- manages Student QR windows and holidays
- reviews attendance by semester and section
- can use attendance pages and staff QR attendance flow

### `INSTRUCTOR`

- manages assigned subject attendance
- can generate subject attendance QR
- can mark attendance manually
- can scan student ID QR to mark a selected subject attendance
- uploads assignments and materials
- enters marks

### `GATEKEEPER`

- opens the live Student QR page
- shows the rotating Student QR for the active time window
- can scan student ID QR cards directly to mark gate attendance when a valid window is active

### `STUDENT`

- logs in with personal email
- changes password on first login
- completes profile
- views subjects, routine, notices, materials, assignments, attendance, tickets, and marks
- scans the live Student QR during eligible windows
- has a digital ID card with a scannable QR

## Core Flows

### 1. Admissions And Onboarding

- public route: `/student-intake`
- collects student identity and guardian details before account creation
- admin/coordinator reviews applications
- student account is created manually from approved application
- student logs in with personal email and institution-issued student ID

### 2. Authentication

- login with personal email + password
- refresh-token session flow
- first-login password change for new students
- profile completion gate for student onboarding
- forgot-password structure exists, but email delivery is not fully integrated yet

### 3. Routine Management

Routines are now explicitly scoped by:

- department
- semester
- optional section
- day
- time
- room
- subject
- instructor

That means:

- admin/coordinator creates routine entries against a specific department-semester-section combination
- student routine view only shows routines matching the student’s own department, semester, and section
- instructor routine view shows assigned routine entries clearly with department/semester/section context

### 4. Attendance

EduNexus now supports several attendance paths.

#### A. Subject Attendance By Instructor

- instructor generates a subject QR for a selected subject
- eligible students scan it for that subject
- instructor can also mark attendance manually from the subject roster

#### B. Gate Student QR Attendance

- admin/coordinator creates Student QR windows by:
  - day of week
  - start time
  - end time
  - allowed semesters
- gatekeeper sees a simple `Student QR` page
- the Student QR rotates every 60 seconds
- only students whose semester is allowed in the active time window can use it
- attendance is marked only for the student’s scheduled routine subjects that overlap that active window

#### C. Student ID Card QR Attendance

- every student has a digital ID card on the profile page
- the ID card includes a signed QR containing identity details
- gatekeeper can scan the student ID QR to mark gate attendance during an active Student QR window
- instructor can scan the student ID QR to mark attendance for a selected subject/date
- coordinator can use the same staff scan path

#### D. Holiday And Auto-Absence Logic

- admin/coordinator can declare attendance holidays
- on holidays:
  - Student QR attendance is disabled
  - attendance percentages are not deducted
- on normal days:
  - if a student does not scan within the valid time slot
  - and there is no instructor/staff attendance record
  - the student is marked absent automatically for the applicable routine entries

#### E. Absence Tickets

- absent students can see pending absence records
- students submit a reason through the tickets page
- staff can review the ticket status

### 5. Student Profile And ID Card

Student profile includes:

- personal contact information
- guardian information
- addresses
- section
- date of birth
- blood group

Student profile page also now includes a professional digital ID card with:

- student name
- roll number
- contact number
- location/address
- department
- semester
- section
- signed QR code with student identity details

### 6. Academic Modules

- subjects
- study materials
- assignments
- marks
- notices
- departments

## Important Pages

### Public

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/student-intake`

### Admin / Coordinator

- `/admin`
- `/admin/users`
- `/admin/applications`
- `/admin/departments`
- `/admin/subjects`
- `/admin/routine`
- `/admin/student-qr`
- `/admin/notices`

- `/coordinator`
- `/coordinator/users`
- `/coordinator/applications`
- `/coordinator/subjects`
- `/coordinator/routine`
- `/coordinator/student-qr`
- `/coordinator/attendance`

### Instructor

- `/instructor`
- `/instructor/subjects`
- `/instructor/attendance`
- `/instructor/assignments`
- `/instructor/materials`
- `/instructor/marks`
- `/instructor/routine`

### Gatekeeper

- `/gate`
- `/gatekeeper`

### Student

- `/student`
- `/student/subjects`
- `/student/attendance`
- `/student/tickets`
- `/student/assignments`
- `/student/materials`
- `/student/marks`
- `/student/routine`
- `/student/profile`

## Important API Groups

- `/api/auth`
- `/api/admin`
- `/api/departments`
- `/api/subjects`
- `/api/routines`
- `/api/attendance`
- `/api/assignments`
- `/api/materials`
- `/api/marks`
- `/api/notices`

## Local Setup

### Prerequisites

- Node.js 18+
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

### 2. Environment

Create backend `.env` from [`.env.example`](C:/Users/arman/EduNexus/.env.example).

Typical values:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/edunexus?connection_limit=10&pool_timeout=20
JWT_SECRET=change_this_to_a_long_random_string
JWT_REFRESH_SECRET=change_this_to_a_different_long_random_string
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DEFAULT_STUDENT_PASSWORD=password
QR_SIGNING_SECRET=change_this_to_a_long_random_string
PGPOOL_MAX=10
PGPOOL_MIN=0
PGPOOL_IDLE_TIMEOUT_MS=10000
PGPOOL_CONNECTION_TIMEOUT_MS=10000
PGPOOL_MAX_USES=0
UPLOAD_DIR=backend/uploads
UPLOAD_PUBLIC_PATH=/uploads
UPLOAD_BASE_URL=
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

### 3. Database

From [backend](C:/Users/arman/EduNexus/backend):

```bash
npx prisma migrate deploy
npx prisma generate
```

For active development:

```bash
npx prisma migrate dev
```

### 4. Run the app

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
- Backend API: `http://localhost:5000/api`
- Health: `http://localhost:5000/health`

## Scripts

### Backend

- `npm run dev`
- `npm run start`
- `npm run prisma:generate`
- `npm run prisma:migrate:dev`
- `npm run prisma:migrate:deploy`

### Frontend

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`

## Current Product Status

Implemented well enough for local use and demos:

- role-based dashboards
- admissions and student onboarding
- profile completion
- Student QR attendance windows
- student ID card QR
- instructor/coordinator/gatekeeper staff QR attendance tools
- scoped routines by department, semester, and section
- notices, assignments, materials, marks
- attendance exports
- absence tickets

Still future work or incomplete for production:

- password reset email delivery
- cloud file storage
- parent portal
- stronger analytics/reporting
- final production hardening

## Notes

### Student QR Settings

Student QR settings are managed from:

- `/admin/student-qr`
- `/coordinator/student-qr`

These define:

- active day/time windows
- allowed semesters
- holidays

### Default Student Password

Student account creation still uses `DEFAULT_STUDENT_PASSWORD` on the backend, but it is no longer exposed back to the frontend response. Students are forced to change it on first login.

### Prisma

Whenever schema changes are made:

1. run `npx prisma generate`
2. apply migrations
3. restart the backend dev server if it is already running

This is especially important after adding new Prisma models or fields.

### PostgreSQL Pooling

The backend Prisma setup uses the Prisma PostgreSQL adapter with a shared `pg.Pool`.

- `PGPOOL_MAX_USES=0` means connections are reused indefinitely
- that is acceptable for local development
- for production, prefer a finite `PGPOOL_MAX_USES` so long-running processes recycle connections periodically and are less likely to hold stale connections forever

## Why This Fits A Nepal College Workflow

- personal email login for students
- institution-issued roll numbers
- coordinator as academic sub-admin
- semester and section-based academic structure
- gate-style attendance workflow
- printable/exportable attendance records
- phone-first student interactions
