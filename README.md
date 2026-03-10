# PolyInsight

AI-powered prediction market analysis platform. Submit a Polymarket event URL, get a structured risk assessment report with probability analysis, rule audit, and actionable recommendations.

**Live:** [polyinsight.online](https://polyinsight.online)

[English](#what-it-does) | [中文](#项目简介)

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
| Deployment | Nginx reverse proxy (frontend + API + n8n) |

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

---

<a id="项目简介"></a>

# PolyInsight（中文）

基于 AI 的预测市场分析平台。提交 Polymarket 事件链接，获取包含概率分析、规则审计和操作建议的结构化风控报告。

**在线体验：** [polyinsight.online](https://polyinsight.online)

---

## 核心功能

1. 用户提交 Polymarket 事件链接
2. 后端触发 n8n AI 工作流（4 步流水线）
3. 前端逐步展示各阶段分析结果
4. 最终报告包含：AI 与市场概率对比、风险评级、详细分析

### 分析流水线

| 步骤 | 模型 | 用途 |
|------|------|------|
| 事件信息提取 | DeepSeek V3.2 | 解析 Polymarket API 数据 |
| 概率分析 | GPT-5.2 + 联网搜索 | 独立概率估算 |
| 风控审计 | GPT-5.2 + 联网搜索 | 规则陷阱检测、结算风险 |
| 报告撰写 | DeepSeek Reasoner | 结构化 JSON + Markdown 报告 |

### 报告输出

- **决策卡片** — 事件名称、截止日期、各选项的 AI vs 市场概率、风险标签（安全/注意/危险/拒绝）、操作建议
- **详细分析** — 可展开的 Markdown，包含分析师推理、风控审计要点、注意事项

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 认证 | Privy（邮箱、Google、钱包） |
| 数据库 | Supabase (Postgres) |
| 后端 API | Express + tsx (Node.js) |
| AI 工作流 | n8n（自托管） |
| 状态管理 | Zustand（持久化到 localStorage） |
| 国际化 | react-i18next（中文 / 英文） |
| 部署 | Nginx 反向代理（前端 + API + n8n） |

---

## 主要特性

- **多会话分析** — 可并行运行多个分析任务，各自独立追踪进度
- **会话持久化** — 刷新页面后分析任务自动恢复（Zustand persist + 轮询恢复）
- **渐进式渲染** — n8n 每完成一步，前端即时展示该步结果
- **中英双语** — 完整国际化，语言切换按钮，独立的中文 n8n 工作流
- **积分系统** — 注册赠送、按次扣费、推荐返佣（10%）
- **四级风险评级** — 安全 / 注意 / 危险 / 拒绝，颜色编码标签
- **历史记录管理** — 查看历史分析、删除记录

---

## 快速开始

### 前置条件

- Node.js 18+
- Supabase 项目
- Privy 应用
- n8n 实例（含分析工作流）

### 环境变量

**前端** (`.env`):
```
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_N8N_WEBHOOK_URL=<n8n_webhook_url>
```

**后端** (`server/.env`):
```
SUPABASE_URL=<supabase_url>
SUPABASE_SERVICE_KEY=<service_role_key>
PRIVY_APP_ID=<privy_app_id>
PRIVY_APP_SECRET=<privy_app_secret>
N8N_WEBHOOK_URL=<英文工作流 webhook>
N8N_WEBHOOK_URL_ZH=<中文工作流 webhook>
```

### 运行

```bash
# 前端
npm install && npm run dev

# 后端
cd server && npm install && npx tsx src/index.ts
```

---

## 许可证

MIT
