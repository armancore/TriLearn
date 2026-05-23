# ADR 0001: Auth Token Transport

## Status

Accepted

## Context

TriLearn serves browser clients and native mobile clients. Browser refresh tokens need protection from JavaScript access, while mobile clients use bearer tokens and signed client headers for the CSRF exemption path.

The API can be deployed behind a reverse proxy, and production browser traffic may be cross-origin from the frontend origin to the API origin.

## Decision

Use short-lived JWT access tokens in the `Authorization` header for API calls.

Use HTTP-only refresh-token cookies for browser refresh sessions. The refresh cookie is scoped to `/api/v1/auth`. When the request is secure, the cookie uses `SameSite=None` and `Secure` so cross-origin browser refresh can work. For local or private-network development over non-secure connections, it falls back to `SameSite=Lax`.

Native mobile requests do not rely on browser cookies for normal API authorization. Mobile requests that need the CSRF exemption include signed client identity headers.

## Consequences

The production reverse proxy must preserve secure-request detection. It should forward `X-Forwarded-Proto: https` to the backend, or terminate TLS in a way that sets `req.secure`.

If the proxy omits `X-Forwarded-Proto: https`, refresh-cookie behavior can be misclassified. Depending on host detection, this can either break cross-origin refresh or apply development-oriented cookie settings to a production-like path.

For split-host deployments such as a Vercel frontend and Render API on different eTLD+1 domains, the browser refresh cookie must remain `SameSite=None; Secure` for cross-origin refresh. The stricter `__Host-` cookie prefix is not used because the current refresh cookie is intentionally scoped to `/api/v1/auth`; this cross-domain cookie tradeoff is accepted for the deployment.

Access tokens remain easy for clients to attach to API requests, but frontend code must continue to avoid storing refresh tokens in JavaScript-accessible storage.
