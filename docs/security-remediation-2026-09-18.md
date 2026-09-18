# Security remediation — 18 September 2026

Scan: `ed923535-0fcb-47be-8c30-58fd9177359c`  
Base revision: `7a482d60061bc4cb2e5933e96d49bfdb7c056e41`

**Outcome: all 11 reported security findings are patched and local verification gates pass.** Backend strict checking is now clean, with `strict` and `checkJs` still enabled. The connected Android debug build passed the scoped smoke test described below. iOS, production deployment, and signed release-device testing remain outside the verified evidence; no workbench finding closure has been performed.

## Follow-up engineering fixes and latest verification

The subsequent overall-review work repaired the Docker startup script packaging and production healthcheck, S3 spreadsheet reading, the absence-ticket response field, retry-safe import cleanup, and the standalone worker launcher. Deployment and mobile-authentication documentation now matches the implementation.

- Dependency audits: backend, frontend and mobile each report **zero known npm advisories** after compatible updates. Mobile retains Expo 55; Metro is pinned to its patched 0.83.8 line. The patched URI decoder's upstream logic is retained in a documented MIT-licensed CommonJS compatibility copy under mobile/vendor/decode-uri-component. Query-parser regression tests and Android Hermes bundling pass.
- Latest regression results: backend Node **340 passed** (one Jest-only placeholder skipped), backend Jest **8 passed**, mobile **104 passed**, plus **2 real-database API tests and 1 live security scenario passed**. The unchanged frontend retained its earlier **40 passing tests**. Total across these checks: **495 passing tests**.
- Disposable PostgreSQL 18: all **48 migrations applied**. The live security scenario verifies single-use concurrent refresh rotation, password-change refresh revocation, rejection of stale authenticated password snapshots, password-cutoff socket rejection, Redis revocation on two separate API processes, and standalone BullMQ worker delivery to both replicas.
- Production builds: frontend build, mobile TypeScript, and Android Hermes export passed. The patched backend image built; its actual start:deploy command completed migrations and file backfill, started the API, and returned status ok from /health against disposable PostgreSQL/Redis. No production services or real user accounts were touched. S3 import tests use controlled storage adapters; no live S3 account was used.
- Lint: backend and frontend passed; mobile passed with two existing Axios import warnings. The added query-parser test uses a lint-compliant import.
- Backend `npm run typecheck`: **passed, zero diagnostics**, down from the 1,053-error checkpoint. Concrete helper contracts, Prisma projections and filters, safe unknown-error handling, and NodeNext module resolution now match the runtime libraries. `strict` and `checkJs` remain enabled; no blanket suppressions were added. Backend lint also passed.
- Physical Android: Redmi/Xiaomi 23090RA98G, Android 16/API 36, arm64. A separate `com.trilearn.review` debug APK built and installed successfully; the existing Expo Go app was preserved. Login and dashboard were observed, cold-start session restoration was repaired and observed, and the user confirmed Attendance, Marks, Work, More, and sign-out. Restart after logout remained on the login screen. Automated tapping was blocked by the phone's security setting, so navigation/sign-out checks were user-assisted. No iOS test was performed.

The device test exposed missing startup refresh-token restoration. `mobile/src/services/restoreSession.ts` now restores the saved session once after hydration, deduplicates simultaneous startup requests, revokes late credentials after a session change, clears rejected sessions, and preserves saved credentials during temporary network failure. Six regression tests cover restoration and shared startup/screen refresh requests; both callers reuse one in-flight token rotation. The last complete mobile run passed 103 tests and exposed an initialization-order bug in the new test mock; after correcting that mock, both affected suites passed all six tests. The backend cleanup also corrected the real XLSX fallback to use `readSheet`, rejected non-scalar route parameters before service execution, and added guarded error handling. A PDF traversal regression caught by the suite was repaired before the final passing run.

Reproduce the live scenario from backend using test:security:live with TEST_DATABASE_URL and TEST_REDIS_URL pointing to disposable localhost services; it intentionally refuses non-local URLs. Install frontend dependencies as well because the scenario uses the web Socket.IO client. The test creates and removes its own user records.

The earlier checkpoint details below are retained for context; this section supersedes their test counts and live-service limitations.

## Changes and evidence

The patch places enforcement at the existing service, session issuance, file-serving, socket-delivery, and mobile session boundaries. It preserves administrators' access, authorized staff workflows, students' own academic data, browser CSRF protection, and explicit native token transport.

| Finding | Boundary repaired | Regression evidence and legitimate control |
| --- | --- | --- |
| Password changes leave refresh sessions valid | Password update and refresh revocation share a serializable transaction. Refresh checks the password cutoff and atomically consumes the previous session. Login issuance rechecks the password hash actually authenticated, blocking a login that crosses a password change. | Tests reject password-cutoff refreshes, already-consumed refreshes, and login issuance using the previous password hash. Valid login/rotation and existing authentication tests pass. |
| Students can overwrite section through profile completion | Completion rejects a supplied different section and never writes section. The field is optional; student forms omit it. | Changed section is rejected before writes; unchanged and omitted section permit personal-profile completion while leaving the assigned section untouched. |
| Coordinator assignment listings and files cross departments | Both list and count use the coordinator department. All five attached academic file kinds resolve the subject department; the generic upload-owner gate cannot bypass this for coordinators. | Foreign subject filters, foreign uploads including coordinator-owned uploads, and missing departments are denied. Same-department files and administrator listings remain accessible. |
| Instructor student profiles expose other subjects' absence tickets | Ticket queries constrain the attendance subject to the instructor's assigned subjects. | A fixture with own and foreign subject tickets returns only the own ticket to the instructor; administrator history remains complete. |
| Mobile cached data crosses accounts | Session boundaries cancel and clear Query caches, clear mutation and notification stores, disconnect sockets, and advance a session version. API responses and pending refreshes cannot restore or clear another account. Late rotated credentials are revoked. | Tests cover explicit logout, automatic clearSession, direct A-to-B switching, late query completion, late refresh success/failure, notifications, and late socket events. Account B can populate and read its own cache. |
| Student subject details expose classmates' personal information | Student responses omit the enrollment roster; staff responses retain it and aggregate counts remain available. | Tests verify absence of the peer roster for students and preserved staff roster/count behavior. |
| Coordinator study-material creation/deletion crosses departments | Create/delete authorize through the parent subject; both list routes also apply department scope. | Foreign writes are denied without mutations, same-department writes succeed, and both lists include the department condition. |
| Import-job polling exposes other users' or unrelated jobs | Only student-import jobs are visible. Coordinators can inspect their own imports; administrators can inspect student imports. Unauthorized requests return the same 404 as missing jobs. | Foreign imports and unrelated notification jobs are denied before state/result access. Own imports and administrator access succeed. |
| Native logout does not revoke refresh credentials | Mobile sends captured bearer/refresh credentials through an isolated client to a version-validated `/auth/logout/mobile` route. Refresh-only restored sessions can also log out. Browser cookie behavior is retained. | Tests verify captured credentials, refresh-only logout, server-side refresh revocation, preserved cookie logout, and rejection of cookie-bearing or untrusted-browser CSRF attempts. |
| Existing sockets outlive authorization | Tokens bind to socket lifetime. Each replica reauthorizes local listeners before sensitive delivery; internal server-side fanout replaces unchecked room broadcasts. Expired sockets disconnect and authorized web/native clients renew and reconnect. | Two simulated replicas stop delivery after revocation, password change, disablement, or Redis outage. Expiry and refreshed expiry timers are tested; web and native reconnection controls pass. |
| Socket authentication ignores password changes | Handshake, auth refresh, and delivery enforce passwordChangedAt and fail closed when configured Redis is unavailable. | Old-token handshakes and auth refresh are rejected; fresh tokens remain usable. |

Password changes now require signing in again. The web password-change page explicitly clears its local session and returns to login.

## Verification

### Syntax, types, build, and diff

- `git diff --check`: passed.
- Backend `npm run lint`: passed.
- Frontend `npm run lint`: passed.
- Frontend `npm run build`: passed; existing large-chunk warning remains.
- Mobile `npm run lint`: passed with the two existing Axios import warnings.
- Mobile `npx --no-install tsc --noEmit`: passed.
- Backend `npm run typecheck`: failed at this historical checkpoint; the latest full run above passes.

### Security triggers and alternate paths

- Backend `node --test test/security-remediation.test.js test/controllers.test.js test/realtime.test.js test/app.integration.test.js`: 178 passed at the focused gate.
- Added service-boundary fixtures exercise the reported requests and alternate paths: missing department, coordinator-owned foreign files, foreign subject filters, unrelated job types, omitted/unchanged section, concurrent session consumption, old authenticated password snapshots, and passive remote socket subscribers.
- Added mobile tests use the real QueryClient for cache clearing and late query completion, and controlled request/socket fixtures for account-switch races and native logout transport.
- Added frontend hook tests verify successful renewal, failed renewal, and unmount during renewal.

### Package regression suites

- Backend `npm test`: **332 passed**, one Jest-only suite skipped by Node's runner.
- Backend `node node_modules/jest/bin/jest.js test/auth.service.test.js --runInBand`: **8 passed**, covering that separately skipped suite.
- Frontend `npm test -- --run`: **40 passed** across 12 files.
- Mobile `npm test -- --runInBand`: **96 passed** across 12 suites; process exited successfully. Existing theme-storage mock warnings remain.
- Total executed passing tests: **476**.

Backend tests used `NODE_ENV=test`, a non-service localhost database URL, and an empty Redis URL. The suite required sandbox escalation to write its existing temporary CSV fixtures. No production database or live account was used.

## Independent review

One read-only prepatch investigation and one read-only candidate review were completed. The candidate review found the concurrent old-password login path, the separate mobile notification store, and the web socket renewal regression. All three were confirmed in source, addressed, and covered by regression tests. No additional review cycle was run.

## Files changed

- Backend services: `auth.account.service.js`, `auth.session.service.js`, `session.service.js`, `auth.profile.service.js`, `assignment.service.js`, `upload.service.js`, `studyMaterial.service.js`, `studentProfile.service.js`, `subject.service.js`, `bulkImport.service.js` under `backend/src/services/`.
- Backend contracts/runtime: `backend/src/validators/schemas.js`, `backend/src/routes/auth.routes.js`, `backend/src/middleware/csrf.middleware.js`, `backend/src/utils/realtime.js`.
- Backend tests: `backend/test/security-remediation.test.js`, `realtime.test.js`, `app.integration.test.js`, `controllers.test.js`, `auth-revocation-failure.test.js`, `bulkImport.integration.test.js`.
- Web: `frontend/src/pages/auth/ChangePassword.jsx`, `frontend/src/pages/shared/ProfilePage.jsx`, `frontend/src/pages/student/ProfileSetup.jsx`, `frontend/src/hooks/useLiveNotifications.js`, `frontend/test/useLiveNotifications.test.jsx`.
- Mobile: `mobile/src/store/auth.store.ts`; `api.ts`, `auth.service.ts`, `socket.service.ts` under `mobile/src/services/`; `useAuth.ts`, `useNotifications.ts`, `useSocket.ts` under `mobile/src/hooks/`; `auth.store.test.ts`, `tokenRefresh.test.ts`, `api.interceptor.test.ts`, `uploadFiles.test.ts`, `logout.test.ts`, `useSocket.test.tsx` under `mobile/src/__tests__/`.

## Remaining verification limits

The original security paths no longer reproduce in the focused service/client tests, and the tested legitimate controls remain functional. These are local regression results, not a live deployment penetration test.

- All local ordered verification gates now pass, including the previously blocking strict backend check. These checks establish remediation of the reported paths, not a guarantee that the entire application has no undiscovered vulnerabilities.
- PostgreSQL concurrency and Redis-adapter transport passed against disposable live services. Physical Android debug smoke checks passed as detailed above; iOS and signed release builds remain untested. QR camera capture, push delivery through live FCM, and live S3 were not exercised on the device.
- Server-side logout revocation still requires successful network delivery. An offline client clears local state and reports revocation failure in its log; it cannot prove server invalidation while disconnected.
- The deployment/import/worker issues and the backend type cleanup are complete. The prior container deployment test is recorded above; no production deployment was performed.

Temporary API/Metro processes, disposable Redis, and disposable PostgreSQL were stopped after testing, and device USB port forwards were removed. The isolated debug test app remains installed and signed out; the temporary package override and generated script changes were removed from tracked configuration.

No deployment, commit, push, or workbench finding closure was performed.
