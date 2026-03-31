# EduNexus

EduNexus is a full-stack college management system with role-based dashboards for admin, gatekeeper, instructor, and student users.

It includes subject and department management, student auto-enrollment by semester, class routine management, attendance tracking, assignment submission, marks, notices, and study materials.

## Tech Stack

- Frontend: React, Vite, React Router, Axios
- Backend: Node.js, Express
- Database: PostgreSQL
- ORM: Prisma
- Auth: JWT
- File Uploads: Multer
- QR Support: `qrcode`

## Roles

- `ADMIN`
  Creates departments, users, subjects, routines, and manages the overall system.
- `GATEKEEPER`
  Generates the fixed gate QR for student self-attendance during the allowed arrival window.
- `INSTRUCTOR`
  Manages attendance, assignments, marks, materials, and sees assigned subjects.
- `STUDENT`
  Sees enrolled subjects, scans the gate QR, submits assignments, views marks, notices, routine, and materials.

## Main Features

- Department management
- Subject management with instructor assignment
- Automatic student enrollment into semester-matching subjects
- Manual attendance by instructors
- Gate QR attendance for students
- Time-limited gate scan window based on the first class of the day
- Assignment question PDF upload and student answer PDF submission
- PDF preview for assignments and study materials
- Study material upload or external file link support
- Marks entry and viewing
- Notices
- Weekly routine management

## Attendance Flow

EduNexus currently supports two attendance flows:

1. Gate QR attendance
   A `GATEKEEPER` account generates the daily gate QR.
   Students scan it from their phones or laptops.
   Attendance is marked for the student's enrolled subjects that appear in that day's routine.
   Scanning is allowed only until 30 minutes after the first class start time for that day.

2. Instructor attendance
   Instructors can still mark attendance manually by subject and date.
   This is the fallback after the gate scan window closes, or for corrections.

## Project Structure

```text
EduNexus/
├─ backend/
│  ├─ prisma/
│  ├─ src/
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  ├─ routes/
│  │  └─ utils/
│  └─ uploads/
├─ frontend/
│  └─ src/
│     ├─ context/
│     ├─ layouts/
│     ├─ pages/
│     └─ utils/
└─ README.md
```

## Backend Setup

From [backend](/C:/Users/arman/EduNexus/backend):

```bash
npm install
```

Create a `.env` file with at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/edunexus
JWT_SECRET=your_secret_here
PORT=5000
```

Generate Prisma client:

```bash
npm run prisma:generate
```

Apply migrations:

```bash
npx prisma migrate deploy
```

Start the backend:

```bash
npm run dev
```

The backend runs by default at `http://localhost:5000`.

## Frontend Setup

From [frontend](/C:/Users/arman/EduNexus/frontend):

```bash
npm install
npm run dev
```

The frontend runs by default at `http://localhost:5173`.

## Local Development Flow

1. Start PostgreSQL.
2. Start the backend.
3. Start the frontend.
4. Open the frontend in the browser.
5. Create departments first.
6. Create instructors, gatekeeper accounts, and students.
7. Create subjects and routines.
8. Test gate QR attendance, instructor attendance, assignments, and materials.

## Recommended First-Time Data Setup

1. Create departments in Admin > Departments.
2. Create instructors and students in Admin > Users.
3. Create one gate account in Admin > Users.
4. Create subjects in Admin > Subjects.
5. Assign instructors to subjects.
6. Review subject enrollments if needed.
7. Create routines for the current weekday.

## Student Auto-Enrollment

When a student is created or updated, EduNexus automatically enrolls them into subjects that match:

- the student's semester
- and either the same department or a general subject with no department

This keeps subject lists, routine visibility, and attendance aligned.

## File Uploads

Uploaded PDFs are stored under `backend/uploads/`.

This folder is ignored by Git, so uploaded files do not get committed to GitHub.

## Important Routes

Frontend role panels:

- `/admin`
- `/gate`
- `/instructor`
- `/student`
- `/student/scan`

Backend API groups:

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

## Gate QR Testing Locally

To test the gate attendance flow locally:

1. Make sure today's weekday has at least one routine.
2. Create and log in with a `GATEKEEPER` account.
3. Open `/gate` and generate the daily QR.
4. Log in as a student in another browser or device.
5. Open `/student/scan`.
6. Scan the QR before the cutoff time.

If live camera scanning is not supported in the browser, the student scan page includes a manual QR text fallback.

## Current Limitations

- Browser-based QR scanning depends on camera permission and browser support.
- A native mobile app is not included yet.
- Some flows are optimized for local development and may need additional hardening for production deployment.

## Future Improvements

- React Native or Expo mobile app
- Push notifications
- Better analytics dashboards
- More robust production QR scanning fallback
- Role-specific audit logs

## Notes

- Public registration is restricted to student accounts.
- Gate QR generation is restricted to `GATEKEEPER` accounts.
- After the gate scan cutoff, attendance should be handled manually by instructors.
