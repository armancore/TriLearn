# TriLearn Frontend

The frontend is the React web app for TriLearn's administrative, coordinator, instructor, gatekeeper, and student workflows. It is built with React 19, Vite, React Router, Tailwind CSS, Axios, Framer Motion, and Vitest.

## Local Setup

Install dependencies from this directory:

```bash
npm ci
```

Create a local environment file from the example:

```bash
cp .env.example .env
```

Set `VITE_API_URL` to the backend API base URL. For local development this is usually:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

Start the development server:

```bash
npm run dev
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server. |
| `npm run lint` | Run ESLint across the frontend source and tests. |
| `npm test` | Run the Vitest test suite once. |
| `npm run build` | Create a production build. |
| `npm run preview` | Preview the production build locally. |

## Project Layout

```text
frontend/
├── public/              Static browser assets
├── src/
│   ├── components/      Shared UI components
│   ├── constants/       Role and app constants
│   ├── context/         Auth, theme, and reference data providers
│   ├── hooks/           Shared React hooks
│   ├── layouts/         Role-specific layout shells
│   ├── pages/           Route-level screens
│   ├── styles/          Shared styling assets
│   ├── test/            Source-level test helpers
│   └── utils/           API, auth, logging, and utility code
├── test/                Vitest and Testing Library tests
├── index.html
├── vite.config.js
└── package.json
```

## Testing

Tests live in `frontend/test` and use Vitest with the `jsdom` environment plus Testing Library helpers. Add or update tests when changing authentication, route protection, API client behavior, dashboard rendering, attendance, marks, or role-specific workflows.

Run the same checks as CI before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

## Routing And Access

Routes are declared in `src/App.jsx` and protected with `ProtectedRoute`. Role names come from `src/constants/roles`. When adding a new page, wire it through the route table and check that unauthorized roles are redirected or blocked consistently.

## API Integration

Frontend API calls should go through the shared API utilities instead of constructing ad hoc clients. Keep request and response assumptions aligned with the backend `/api/v1` contract, and avoid storing access tokens outside the existing auth context.
