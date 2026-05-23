# Backlog

## Performance

- `frontend/src/pages/instructor/StudentStats.jsx` currently loads instructor students by fetching `/subjects` and then one `/marks/subject/:id/students` request per subject. This is acceptable for typical subject counts, but it scales linearly with assigned subjects. Add a single `GET /instructor/students` endpoint that returns all enrolled students across the instructor's subjects in one backend query, then update the page to consume that endpoint.
