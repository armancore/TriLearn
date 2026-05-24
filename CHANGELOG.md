# Changelog

All notable changes to TriLearn will be documented in this file.

The format follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning for release entries.

## [Unreleased]

### Added

- Expanded backend integration coverage for marks, manual attendance, assignment grading, QR attendance, bulk import, and app route flows.

### Changed

- Enabled strict backend JavaScript type checking in `tsconfig.json` to surface nullability and implicit type gaps during migration.
- Documented critical backend service signatures for auth sessions, password reset, QR attendance, assignment submission/grading, and user status changes.

### Security

- Removed spoofable client-side shared-secret checks from mobile request handling.
- Restricted mobile push notification routes to the authenticated mobile client surface.
- Tightened the CSRF mobile-auth exemption so spoofed mobile headers from untrusted browser origins no longer bypass origin validation.

## [1.0.0] - 2026-05-08

### Added

- Initial self-hosted college management platform for semester-based institutions.
- Role-based web workflows for admins, coordinators, instructors, gatekeepers, and students.
- Express API with OpenAPI documentation, request validation, role-based authorization, audit logging, health checks, and production-oriented security middleware.
- PostgreSQL data model managed through Prisma for users, departments, batches, semesters, sections, subjects, attendance, marks, assignments, submissions, notices, notifications, files, and audit records.
- React admin and staff web application for operational workflows across admissions, academic setup, attendance, marks, assignments, notices, files, and users.
- Expo student mobile application for student-facing academic records, notifications, assignment access, digital ID, and scan-focused workflows.
- Student intake and approval flow with bulk student import from CSV and XLSX files.
- Automatic account provisioning for approved or imported students, including generated temporary passwords and first-login password change support.
- QR attendance for subject sessions with signed payload validation and server-side attendance creation.
- Gate attendance workflow for gatekeeper scans using signed digital student ID QR codes.
- Manual attendance entry and correction paths for authorized academic staff.
- Absence ticket workflow for students and staff to review explainable or disputed absences.
- Marks entry, review, publish flow, and server-generated marksheet PDFs.
- Assignment creation and PDF submission workflows with authenticated file access.
- Study material uploads with enrollment-gated file serving.
- Class routine management with conflict detection.
- Notice board with scoped audiences for institution, department, batch, semester, section, and role-based communication.
- Real-time notification delivery through Socket.IO, with Redis adapter support for scaled deployments.
- Background notification job support through BullMQ when Redis is configured.
- Firebase Cloud Messaging integration path for mobile push notifications.
- Local disk uploads for development and S3/R2-compatible object storage support for production.
- Rate limiting for authentication, API requests, and socket events, with Redis-backed shared limits available for production.
- Docker Compose setup for local and production-oriented deployment paths.
- CI, linting, tests, Husky, and lint-staged configuration for contributor workflows.

### Security

- JWT access tokens and rotating refresh token support.
- Refresh-token cleanup and revocation-oriented authentication infrastructure.
- Helmet, CORS controls, upload validation, signed QR payloads, BCrypt password hashing, and Zod-backed request validation.
- Audit records for sensitive administrative and academic actions.

### Documentation

- Added project README covering product scope, architecture, setup, environment variables, testing, deployment, and role descriptions.
- Added development, deployment, contribution, security, and license documentation.

[Unreleased]: https://github.com/armancore/TriLearn/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/armancore/TriLearn/releases/tag/v1.0.0
