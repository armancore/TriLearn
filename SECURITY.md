# Security Policy

## Supported Versions

TriLearn currently receives security fixes on the `main` branch.

| Version / Branch | Supported |
| --- | --- |
| `main` | Yes |
| Older commits, forks, or archived branches | No |

## Reporting a Vulnerability

Please do not open a public GitHub issue for security vulnerabilities.

Report security issues privately to the repository owner or maintainers. Include
as much detail as you can safely share:

- A clear description of the vulnerability
- Steps to reproduce or proof-of-concept details
- Affected area, such as backend, frontend, authentication, file uploads, CI, or deployment
- Expected impact and any known prerequisites
- Suggested remediation, if you have one

Maintainers should acknowledge valid reports as soon as practical, investigate
the issue, and prioritize fixes based on severity and exploitability.

## Disclosure

Please allow the maintainers time to investigate and release a fix before
publicly disclosing details. If a report is accepted, the fix should be
developed privately when possible and released with an appropriate security
note. If a report is declined, maintainers should explain why it is not
considered a vulnerability or why it is outside the supported scope.

## Security Expectations

TriLearn handles authentication, student records, attendance data, uploaded
files, and academic workflows. Security-sensitive changes should preserve:

- Authentication and authorization checks
- CSRF and CORS protections
- Rate limiting on public and authenticated routes
- Secure password hashing and token handling
- Upload validation and safe file serving
- Secret scanning and dependency vulnerability checks in CI

## Accepted Residual Risks

The backend intentionally allows CORS requests with a missing `Origin` header so
programmatic clients such as curl, Postman, and native mobile apps can call the
API. Browser opaque origins that send the literal `Origin: null` remain rejected.

This means CORS is not expected to block a third-party server-side SSRF from
reaching the API. Sensitive routes must continue to rely on authentication, CSRF
protection, and route-level authorization rather than CORS alone.

Access-token JTI revocation uses Redis as the authoritative shared store, with a
short process-local cache used only to avoid repeated Redis reads for recently
seen revoked JTIs. In multi-process or multi-replica deployments, that local
cache is not shared between workers. A revoked token can therefore remain
accepted by a worker that has not yet checked Redis, bounded by the normal Redis
lookup path and the access-token lifetime. Production deployments should keep
Redis highly available and keep access-token lifetimes short.

The production refresh-token cookie intentionally uses `SameSite=None` when the
frontend and API are on different sites. This cross-site cookie design depends
on the backend CSRF middleware rejecting unsafe browser requests whose
`Origin`/`Referer` is not a configured trusted frontend origin. Any change to
refresh-token cookie scope, trusted origins, CORS, or CSRF handling should be
reviewed as an authentication change.
