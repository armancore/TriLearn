# ADR 0001: Auth Token Transport

## Status

Accepted

## Context

TriLearn serves browser clients and native mobile clients. Browser refresh tokens need protection from JavaScript access, while mobile clients use bearer tokens and signed client headers for the CSRF exemption path.

The API can be deployed behind a reverse proxy, and production browser traffic may be cross-origin from the frontend origin to the API origin.

The current production deployment model can place the frontend and backend on different registrable domains, for example a Vercel frontend and a Render API. In that topology, browser refresh requests are cross-site even though both origins are trusted application components.

## Decision

Use short-lived JWT access tokens in the `Authorization` header for API calls.

Use HTTP-only refresh-token cookies for browser refresh sessions. The refresh cookie is scoped to `/api/v1/auth`. When the request is secure, the cookie intentionally uses `SameSite=None` and `Secure` so cross-site browser refresh can work for split-host deployments. For local or private-network development over non-secure connections, it falls back to `SameSite=Lax`.

This is an accepted CSRF tradeoff, not an accidental weakening. `SameSite=None` allows the browser to attach the refresh cookie to cross-site requests, so unsafe browser requests must continue to be protected by the CSRF middleware's trusted `Origin` and `Referer` checks. The refresh cookie is also `HttpOnly`, `Secure`, and path-scoped to `/api/v1/auth`.

Native mobile requests do not rely on browser cookies for normal API authorization. Mobile requests that need the CSRF exemption include signed client identity headers.

## Consequences

The production reverse proxy must preserve secure-request detection. It should forward `X-Forwarded-Proto: https` to the backend, or terminate TLS in a way that sets `req.secure`.

If the proxy omits `X-Forwarded-Proto: https`, refresh-cookie behavior can be misclassified. Depending on host detection, this can either break cross-origin refresh or apply development-oriented cookie settings to a production-like path.

For split-host deployments such as a Vercel frontend and Render API on different eTLD+1 domains, the browser refresh cookie must remain `SameSite=None; Secure` for cross-origin refresh. The stricter `__Host-` cookie prefix is not used because the current refresh cookie is intentionally scoped to `/api/v1/auth`; this cross-domain cookie tradeoff is accepted for the deployment.

Access tokens remain easy for clients to attach to API requests, but frontend code must continue to avoid storing refresh tokens in JavaScript-accessible storage.

If TriLearn moves to a same-site deployment, such as serving the frontend and API under sibling subdomains of the same registrable domain or behind one domain, revisit this ADR and prefer `SameSite=Strict` or at least `SameSite=Lax` for the refresh cookie. That deployment would reduce CSRF exposure by letting the browser withhold refresh cookies from truly cross-site requests.
