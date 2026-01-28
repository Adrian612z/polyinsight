# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PolyInsight is a Polymarket event analysis platform. Users submit Polymarket event URLs, which are analyzed via n8n webhook workflows, returning markdown-formatted analysis reports. The app uses mock authentication (admin/admin) with Zustand state persistence.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # TypeScript compile + Vite bundle to dist/
npm run preview      # Preview production build
npm run check        # Type-check only (no emit)
npm run lint         # Run ESLint
npm run test         # Run Vitest in watch mode
npm run test:run     # Run Vitest once
```

## Architecture

**Stack:** React 18 + TypeScript (strict mode) + Vite + Tailwind CSS + Supabase + n8n

```
src/
├── pages/              # Route components
│   ├── Analyze.tsx     # URL submission and analysis (uses analysisStore)
│   ├── History.tsx     # Past analysis records (with pagination)
│   └── Login.tsx       # Auth page (left-right split layout)
├── components/
│   ├── Layout.tsx      # App shell with nav, theme toggle
│   ├── AnimatedBackground.tsx  # Mouse-following dynamic background
│   ├── Toast.tsx       # Toast notifications (success/error/info/warning)
│   ├── ErrorBoundary.tsx       # Global error catching
│   └── Skeleton.tsx    # Loading skeleton components
├── store/
│   ├── authStore.ts    # Auth state with localStorage persist
│   └── analysisStore.ts # Analysis state (url, loading, result, error)
├── hooks/
│   └── useTheme.ts     # Dark mode toggle (saves to localStorage)
├── lib/
│   ├── supabase.ts     # Supabase client
│   ├── api.ts          # fetchWithRetry, parseErrorMessage
│   └── utils.ts        # cn() class merge helper
├── test/
│   └── setup.ts        # Vitest setup
└── App.tsx             # Router + providers (ErrorBoundary, ToastProvider)
```

## State Management

Uses Zustand with localStorage persistence:

**authStore.ts** - Authentication state
- `session`: Current user session
- `login()` / `logout()` actions

**analysisStore.ts** - Analysis workflow state
- `url`: Input URL (persisted)
- `loading`: Analysis in progress
- `result`: Analysis result (persisted)
- `error`: Error message
- `startAnalysis()`: Creates Supabase record, calls n8n webhook, updates result
- State persists across page navigation (switching between Analyze/History)

## Key Features

**UI/UX:**
- Dark mode support (toggle in navbar, persisted)
- Animated background with mouse-following glow effect
- Glass-morphism card styling (backdrop-blur)
- Toast notifications for user feedback
- Loading skeletons and animations

**Error Handling:**
- Global ErrorBoundary catches render errors
- `fetchWithRetry` auto-retries failed requests (3 times, exponential backoff)
- User-friendly error messages via `parseErrorMessage`
- Failed analyses update database status to 'failed'

**Data Flow:**
1. User logs in (mock: admin/admin) → session stored in authStore
2. User submits Polymarket URL → analysisStore.startAnalysis()
3. Record created in Supabase (status: pending)
4. Webhook POST to n8n with retry
5. Result saved to Supabase (status: completed/failed)
6. Toast shows success/error, result displayed on page

## Testing

Tests located alongside source files (`*.test.ts`):
- `src/store/authStore.test.ts` - Auth store tests
- `src/lib/utils.test.ts` - cn() utility tests
- `src/lib/api.test.ts` - fetchWithRetry, parseErrorMessage tests

Run: `npm run test:run`

## Database Schema

**Table: `analysis_records`**
- `id` (UUID), `user_id` (UUID), `event_url` (TEXT)
- `analysis_result` (TEXT), `status` (pending|completed|failed)
- `created_at`, `updated_at` (TIMESTAMPTZ)
- RLS enabled: users can only access their own records

Migrations in `supabase/migrations/`.

## Environment Variables

```
VITE_SUPABASE_URL=<supabase_project_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_N8N_WEBHOOK_URL=<n8n_webhook_endpoint>
```

## Routing

| Route | Component | Auth Required |
|-------|-----------|---------------|
| `/login` | Login | No |
| `/analyze` | Analyze | Yes |
| `/history` | History | Yes |
| `/` | Redirects to `/analyze` | - |

Protected routes redirect to `/login` if not authenticated.

## Deployment

- **Platform:** Vercel
- **Repo:** https://github.com/Adrian612z/polyinsight_latest
- **Config:** `vercel.json` (SPA routing: all paths → index.html)

Push to `main` branch triggers auto-deploy.

## Style Guide

- Colors: Indigo/Purple gradient theme (`from-indigo-600 to-purple-600`)
- Cards: Glass effect (`bg-white/70 dark:bg-gray-800/70 backdrop-blur-md`)
- Animations: CSS in `src/index.css` (fade-in-up, shake, float animations)
- Dark mode: Use `dark:` prefix for all color classes

## TODO / Future Improvements

- [ ] Real authentication (replace mock login with Supabase Auth)
- [ ] User registration flow
- [ ] Profile management page
- [ ] History page auto-refresh when analysis completes
- [ ] More comprehensive test coverage
