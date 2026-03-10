# PolyInsight

AI-powered prediction market analysis platform. Submit a Polymarket event URL, get a structured risk assessment report with probability analysis, rule audit, and actionable recommendations.

**Live:** [polyinsight.online](https://polyinsight.online)

---

## What it does

1. User submits a Polymarket event URL
2. Backend triggers an n8n AI workflow (4-step pipeline)
3. Frontend shows progressive results as each step completes
4. Final report includes: probability comparison (AI vs market), risk rating, and detailed analysis

### Analysis Pipeline

| Step | Model | Purpose |
|------|-------|---------|
| Event Info Extraction | DeepSeek V3.2 | Parse Polymarket API data |
| Probability Analysis | GPT-5.2 + Web Search | Independent probability estimate |
| Risk Control Audit | GPT-5.2 + Web Search | Rule trap detection, settlement risk |
| Report Writer | DeepSeek Reasoner | Structured JSON + markdown report |

### Report Output

- **Decision Card** — event name, deadline, AI vs market probability for each option, risk badge (safe/caution/danger/reject), direction recommendation
- **Detailed Analysis** — expandable markdown with analyst reasoning, risk audit findings, caveats

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Auth | Privy (email, Google, wallet) |
| Database | Supabase (Postgres) |
| Backend API | Express + tsx (Node.js) |
| AI Workflow | n8n (self-hosted) |
| State | Zustand (persisted to localStorage) |
| i18n | react-i18next (English / Chinese) |
| Deployment | Vercel (frontend) + Nginx reverse proxy (API + n8n) |

---

## Project Structure

```
src/                          # Frontend (React)
├── pages/
│   ├── Discovery.tsx         # Landing page with trending events
│   ├── Analyze.tsx           # URL input + progressive analysis sessions
│   ├── History.tsx           # Past analysis records with delete
│   └── Profile.tsx           # User profile, credits, referrals
├── components/
│   ├── Layout.tsx            # App shell, nav, language toggle
│   ├── DecisionCard.tsx      # Structured report card (JSON + markdown)
│   ├── ProgressiveResult.tsx # Step-by-step rendering with markers
│   └── ErrorBoundary.tsx     # Global error catching
├── store/
│   ├── authStore.ts          # Privy auth state
│   └── analysisStore.ts      # Multi-session analysis with polling
├── i18n/                     # Translation files (en.json, zh.json)
└── lib/
    ├── supabase.ts           # Supabase client
    └── backend.ts            # API client (auth, analysis, credits)

server/                       # Backend API (Express)
├── src/
│   ├── routes/
│   │   ├── analysis.ts       # POST /api/analysis — create + trigger n8n
│   │   ├── auth.ts           # Privy token verification
│   │   └── admin.ts          # Admin endpoints
│   ├── services/
│   │   ├── supabase.ts       # Supabase service-role client
│   │   └── credit.ts         # Credit deduction + referral commission
│   └── config.ts             # Environment config

admin/                        # Admin panel (separate Vite app)
```

---

## Setup

### Prerequisites

- Node.js 18+
- Supabase project
- Privy app
- n8n instance with analysis workflow

### Environment Variables

**Frontend** (`.env`):
```
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_N8N_WEBHOOK_URL=<n8n_webhook_url>
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

### Run

```bash
# Frontend
npm install && npm run dev

# Backend
cd server && npm install && npx tsx src/index.ts
```

---

## Key Features

- **Multi-session analysis** — run multiple analyses in parallel, each with independent progress tracking
- **Session persistence** — analyses survive page refresh (Zustand persist + polling resume)
- **Progressive rendering** — results appear step-by-step as n8n completes each stage
- **Chinese/English** — full i18n with language toggle, separate Chinese n8n workflow
- **Credit system** — signup bonus, per-analysis deduction, referral commission (10%)
- **4-tier risk rating** — safe / caution / danger / reject with color-coded badges
- **History management** — view past analyses, delete records

---

## Database

### `analysis_records`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | TEXT | Privy DID |
| event_url | TEXT | Polymarket URL |
| analysis_result | TEXT | Markdown result (built progressively) |
| status | TEXT | pending / completed / failed / cancelled |
| credits_charged | INT | Credits deducted |
| created_at | TIMESTAMPTZ | Timestamp |

### `credit_transactions`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | TEXT | Privy DID |
| amount | INT | Centicredits (+/-) |
| type | TEXT | signup_bonus / analysis_spend / referral_commission / admin_grant / topup |
| description | TEXT | Human-readable note |

---

## License

MIT
