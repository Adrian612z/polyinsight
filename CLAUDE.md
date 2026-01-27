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
```

No test framework is currently configured.

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS + Supabase + n8n

```
src/
├── pages/           # Route components (Analyze, History, Login, Home)
├── components/      # Shared components (Layout)
├── store/           # Zustand stores (authStore with localStorage persist)
├── hooks/           # Custom hooks (useTheme for dark mode)
├── lib/             # Utilities (supabase client, cn() helper)
└── App.tsx          # Router setup with protected routes
```

**Data Flow:**
1. User logs in (mock: admin/admin) → session stored in Zustand + localStorage
2. User submits Polymarket URL → record created in Supabase with 'pending' status
3. Webhook POST to n8n for analysis → result saved back to Supabase
4. Analysis history fetched from Supabase and displayed

**Key Integration Points:**
- Supabase: `src/lib/supabase.ts` - database operations for `analysis_records` table
- n8n Webhook: POST with `{url, user_id, record_id}`, expects `{result|output|markdown}` response
- Auth Store: `src/store/authStore.ts` - Zustand with localStorage persistence key `auth-storage`

## Database Schema

**Table: `analysis_records`**
- `id` (UUID), `user_id` (UUID), `event_url` (TEXT)
- `analysis_result` (TEXT), `status` (pending|completed|failed)
- `created_at`, `updated_at` (TIMESTAMPTZ)
- RLS enabled: users can only access their own records

Migrations are in `supabase/migrations/`.

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

Deployed on Vercel. `vercel.json` configures SPA routing (all paths → index.html).
