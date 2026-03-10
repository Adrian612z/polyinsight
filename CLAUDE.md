# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PolyInsight is an AI-powered Polymarket event analysis platform. Users submit Polymarket event URLs, which are analyzed via n8n webhook workflows (4-step pipeline), returning structured risk assessment reports. Auth via Privy (email, Google, wallet). Full Chinese/English i18n support with separate n8n workflows per language.

## Development Commands

```bash
npm install          # Install frontend dependencies
npm run dev          # Start frontend dev server (http://localhost:5173)
npm run build        # TypeScript compile + Vite bundle to dist/
npm run preview      # Preview production build
npm run check        # Type-check only (no emit)
npm run lint         # Run ESLint
npm run test         # Run Vitest in watch mode
npm run test:run     # Run Vitest once

# Backend
cd server && npm install && npx tsx src/index.ts   # Start backend (port 3001)
```

## Architecture

**Stack:** React 18 + TypeScript (strict mode) + Vite + Tailwind CSS + Privy + Supabase + n8n

```
src/
├── pages/
│   ├── Discovery.tsx     # Landing page with trending events (public)
│   ├── Analyze.tsx       # URL submission + multi-session progressive analysis
│   ├── History.tsx       # Past analysis records with delete
│   ├── Profile.tsx       # User profile, credits, referral link
│   └── admin/
│       ├── AdminLayout.tsx
│       ├── Dashboard.tsx
│       ├── Users.tsx
│       └── Analyses.tsx
├── components/
│   ├── Layout.tsx            # App shell, nav, language toggle
│   ├── DecisionCard.tsx      # Structured report card (JSON decision + markdown)
│   ├── ProgressiveResult.tsx # Step-by-step rendering with <!--STEP:xxx--> markers
│   ├── AnimatedBackground.tsx
│   ├── ErrorBoundary.tsx
│   ├── Toast.tsx
│   ├── Skeleton.tsx
│   ├── Empty.tsx
│   └── Logo.tsx
├── store/
│   ├── authStore.ts      # Privy auth state (userId, credits, referral, role)
│   └── analysisStore.ts  # Multi-session analysis with polling, timeout, staleness
├── i18n/
│   ├── index.ts          # i18next init (reads from localStorage 'polyinsight-lang')
│   ├── en.json           # English translations
│   └── zh.json           # Chinese translations
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── backend.ts        # API client (auth, analysis, credits, admin)
│   ├── api.ts            # fetchWithRetry, parseErrorMessage
│   └── utils.ts          # cn() class merge helper
├── test/
│   └── setup.ts          # Vitest setup
└── App.tsx               # Router + Privy provider + ErrorBoundary + Toast

server/                   # Backend API (Express)
├── src/
│   ├── routes/
│   │   ├── analysis.ts   # POST /api/analysis — create + trigger n8n (language-aware)
│   │   ├── auth.ts       # Privy token verification, user registration
│   │   └── admin.ts      # Admin endpoints (users, analyses, grant credits)
│   ├── services/
│   │   ├── supabase.ts   # Supabase service-role client
│   │   └── credit.ts     # Credit deduction + referral commission (10%)
│   └── config.ts         # Environment config (dual webhook URLs)
```

## State Management

Uses Zustand with localStorage persistence:

**authStore.ts** — Privy authentication
- `privyUserId`, `displayName`, `creditBalance`, `referralCode`, `role`
- `setPrivyUser()` / `setCreditBalance()` / `setUserInfo()` / `signOut()`

**analysisStore.ts** — Multi-session analysis
- `inputUrl`: Current input URL
- `sessions`: Record of `AnalysisSession` objects (polling/completed/failed/cancelled)
- `activeSessionId`: Currently viewed session
- `startAnalysis()`: Creates backend record, starts polling
- `cancelAnalysis()` / `retrySession()` / `removeSession()`
- Polling: 3s interval, 5min timeout, 90s staleness detection
- Sessions persist across page refresh (Zustand persist + polling resume on rehydrate)

## Key Features

- **Multi-session analysis** — run multiple analyses in parallel, each with independent progress
- **Progressive rendering** — results appear step-by-step via `<!--STEP:xxx-->` markers
- **Chinese/English i18n** — full UI translation, separate Chinese n8n workflow
- **Credit system** — signup bonus, per-analysis deduction, referral commission (10%)
- **4-tier risk rating** — safe / caution / danger / reject with color-coded badges
- **DecisionCard** — parses JSON decision block from report for structured display
- **Privy auth** — email, Google, wallet login

## Routing

| Route | Component | Auth Required |
|-------|-----------|---------------|
| `/` | Discovery | No |
| `/analyze` | Analyze | Yes |
| `/history` | History | Yes |
| `/profile` | Profile | Yes |
| `/admin` | AdminLayout | Yes (admin role) |

Protected routes redirect to `/` (Discovery) if not authenticated.

## Testing

Tests alongside source files:
- `src/store/authStore.test.ts`
- `src/lib/utils.test.ts`
- `src/lib/api.test.ts`

Run: `npm run test:run`

## Database Schema

**Table: `analysis_records`**
- `id` (UUID), `user_id` (TEXT — Privy DID), `event_url` (TEXT)
- `analysis_result` (TEXT), `status` (pending|completed|failed|cancelled)
- `credits_charged` (INT), `created_at` (TIMESTAMPTZ)

**Table: `credit_transactions`**
- `id` (UUID), `user_id` (TEXT), `amount` (INT — centicredits)
- `type` (signup_bonus|analysis_spend|referral_commission|admin_grant|topup)
- `description` (TEXT)

## Environment Variables

**Frontend** (`.env`):
```
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
```

**Backend** (`server/.env`):
```
SUPABASE_URL=<supabase_url>
SUPABASE_SERVICE_KEY=<service_role_key>
PRIVY_APP_ID=<privy_app_id>
PRIVY_APP_SECRET=<privy_app_secret>
N8N_WEBHOOK_URL=<english_webhook>
N8N_WEBHOOK_URL_ZH=<chinese_webhook>
```

## Deployment

- **Repo:** https://github.com/Adrian612z/polyinsight
- **Hosting:** Self-hosted on VPS with Nginx reverse proxy
- **Domain:** polyinsight.online (Let's Encrypt SSL)
- **Nginx:** proxies `/webhook/` to n8n, `/api/` to Express backend, serves frontend static files

## Style Guide

- Colors: Indigo/Purple gradient theme (`from-indigo-600 to-purple-600`)
- Cards: Glass effect (`bg-white/70 dark:bg-gray-800/70 backdrop-blur-md`)
- Animations: CSS in `src/index.css` (fade-in-up, shake, float)
- Dark mode: Use `dark:` prefix for all color classes
