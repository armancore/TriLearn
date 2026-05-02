# Contributing

## Frontend Scripts

All frontend dependencies should be bundled through the Vite build. If a future
change adds a third-party `<script src="...">` tag to `frontend/index.html`, the
tag must include `integrity` and `crossorigin="anonymous"` attributes.
