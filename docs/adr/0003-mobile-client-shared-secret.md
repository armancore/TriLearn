# ADR 0003: Mobile client metadata and authentication

Status: Superseded (2026-09-18)

The earlier shared HMAC client secret is no longer used. A secret compiled into a mobile app does not establish trusted client identity.

Mobile headers identify the client and version only. Access and refresh JWTs authenticate users; server-side role and resource checks authorize operations. The native logout endpoint revokes supplied native tokens. Browser logout retains CSRF protection, and the native endpoint cannot use browser cookies as authentication credentials.

Mobile access tokens are held in memory and refresh tokens in secure device storage. Logout clears session queries, notifications and sockets, and guards against late refresh responses restoring the old session. Socket connections use /api/v1/socket.io and require a currently valid, unrevoked token.
