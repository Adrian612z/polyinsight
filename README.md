# PolyInsight

AI-powered prediction market analysis platform. Submit a Polymarket event URL and get a structured report with probability analysis, rule audit, and actionable recommendations.

**Live:** [polyinsight.online](https://polyinsight.online)

[English](#overview) | [中文](#项目简介)

---

## Overview

1. User submits a Polymarket event URL
2. Backend creates an `analysis_record`, deducts credits, and enqueues an `analysis_job`
3. The analysis worker claims queued jobs and runs the analysis pipeline
4. Frontend polls progressively and renders step-by-step results
5. Final report includes AI-vs-market probabilities, risk rating, and recommendation

### Current Analysis Pipeline

The primary execution path is now the in-code runtime, not direct n8n execution.

| Step | Default Model | Purpose |
|------|---------------|---------|
| Step 2: Event Info Extraction | `gpt-5.2-chat-latest` | Restate market structure and settlement mechanics |
| Step 3: Probability Analysis | `gpt-5.4` + web search | Independent probability estimate |
| Step 4: Risk Control Audit | `gpt-5.4` + web search | Rule trap detection, settlement risk, calibration |
| Step 5: Report Writer | `gpt-5.2-chat-latest` | Final JSON + markdown report |

The runtime supports:
- English and Chinese prompts
- OpenAI-compatible `Responses API`
- built-in `web_search` for analysis and audit steps
- queued execution via `analysis_jobs`
- optional n8n fallback path for parity testing or rollback

### Report Output

- **Decision Card** — event name, deadline, AI vs market probability for each option, risk badge (`safe` / `caution` / `danger` / `reject`), direction recommendation
- **Detailed Analysis** — markdown explanation of probability view, risk audit, and key uncertainties

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Auth | Privy |
| Database | Supabase (Postgres) |
| Backend API | Express + tsx |
| Analysis Runtime | TypeScript worker + OpenAI-compatible models |
| Queue | Supabase-backed `analysis_jobs` table |
| Optional Fallback | self-hosted n8n |
| State | Zustand (persisted to localStorage) |
| i18n | react-i18next (English / Chinese) |
| Deployment | Nginx reverse proxy |

## Handover Notes

- Payment and credit system handover: `docs/payment-credit-handover.md`

## Recent Changes (2026-03-17)

- Analysis execution now defaults to the in-code `code` engine instead of direct n8n execution.
- The backend runtime now mirrors the main Step 2 / 3 / 4 / 5 analysis flow in TypeScript, including dedicated English and Chinese prompt paths.
- Model calls were switched to an OpenAI-compatible `Responses API` shape with message-array input and built-in `web_search` on analysis/audit steps.
- Analysis requests are now queue-backed via `analysis_jobs`, with retries, refunds on terminal failure, partial step persistence, and worker lease heartbeats.
- Worker ownership checks were added so a worker that loses its lease will stop updating job state.
- The backend can now run as a combined API + worker process or as split processes via `dev:api`, `dev:worker`, `start:api`, and `start:worker`.
- Current runtime limits are documented and configured as:
  - total active worker concurrency: `50`
  - per-user active queued/running analyses: `3`
  - outbound model request concurrency gate: `12`
- The landing page hero background was adjusted to remove the visible white horizontal line through the title area.

### Required Database Follow-up

- Execute `supabase/migrations/20260317020000_analysis_jobs_claim_rpc.sql` in Supabase SQL Editor before relying on multi-worker horizontal scaling.
- Until that SQL function exists, the app falls back to a legacy non-RPC claim path for queued jobs.

---

## Project Structure

```text
src/                              # Main user-facing frontend (React)
├── pages/                        # Discovery / Analyze / History / Profile
├── components/                   # Layout, decision card, progressive result UI
├── store/                        # Auth and analysis session state
├── i18n/                         # en / zh translations
└── lib/                          # Backend client, Supabase client, helpers

server/src/                       # Backend API + analysis worker
├── analysis-runtime/             # In-code analysis pipeline
│   ├── codeWorkflow.ts           # Main Step2/3/4/5 runtime
│   ├── parity.ts                 # Market routing, analysis plan, retrieval plan, retrieval pack
│   ├── workflowPrompts.ts        # English + Chinese prompt definitions
│   └── pipeline.ts               # Legacy transitional runtime file
├── routes/                       # API routes
├── services/                     # Queue, worker, billing, credits, Polymarket, n8n fallback
├── jobs/                         # Trending + stale-analysis maintenance jobs
├── middleware/                   # Auth and admin middleware
└── scripts/                      # Local testing scripts

admin/src/                        # Separate admin frontend

supabase/migrations/              # Database schema and migrations
```

### Analysis-Critical Files

- `server/src/routes/analysis.ts`
  Creates records, deducts credits, and enqueues jobs
- `server/src/services/analysisJobs.ts`
  Queue lifecycle for `analysis_jobs`
- `server/src/services/analysisWorker.ts`
  Claims jobs and runs `code` or `n8n`
- `server/src/analysis-runtime/codeWorkflow.ts`
  Main in-code runtime
- `server/src/analysis-runtime/parity.ts`
  Deterministic planning and retrieval assembly
- `server/src/analysis-runtime/workflowPrompts.ts`
  Prompt layer for English and Chinese
- `src/store/analysisStore.ts`
  Frontend polling and session recovery
- `src/components/ProgressiveResult.tsx`
  Step-by-step rendering using `<!--STEP:...-->` markers

---

## Setup

### Prerequisites

- Node.js 18+
- Supabase project
- Privy app
- OpenAI-compatible model endpoint for the code runtime
- Optional: n8n instance if you want fallback/parity mode

### Environment Variables

**Frontend** (`.env`)

```bash
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_PRIVY_APP_ID=<privy_app_id>
VITE_WALLETCONNECT_PROJECT_ID=<walletconnect_project_id>
```

**Backend** (`server/.env`)

Required:

```bash
PORT=3001
SUPABASE_URL=<supabase_url>
SUPABASE_SERVICE_KEY=<service_role_key>
PRIVY_APP_ID=<privy_app_id>
PRIVY_APP_SECRET=<privy_app_secret>
ADMIN_PASSWORD=<admin_password>
ADMIN_JWT_SECRET=<admin_jwt_secret>
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ANALYSIS_ENGINE=code
ANALYSIS_CODE_API_KEY=<provider_api_key>
ANALYSIS_CODE_BASE_URL=<openai_compatible_base_url>
ANALYSIS_CODE_MODEL=gpt-5.4
```

Recommended / optional:

```bash
ANALYSIS_CODE_EXTRACT_MODEL=gpt-5.2-chat-latest
ANALYSIS_CODE_REPORT_MODEL=gpt-5.2-chat-latest
ANALYSIS_CODE_USE_WEB_SEARCH=true
ANALYSIS_CODE_SEARCH_CONTEXT_SIZE=high
ANALYSIS_WORKER_CONCURRENCY=50
ANALYSIS_WORKER_POLL_MS=2000
ANALYSIS_WORKER_HEARTBEAT_MS=15000
ANALYSIS_MAX_ACTIVE_JOBS_PER_USER=3
ANALYSIS_CODE_REQUEST_CONCURRENCY=12
ANALYSIS_CODE_MAX_RETRIES=3
ANALYSIS_CODE_RETRY_DELAY_MS=1000
ANALYSIS_CODE_ANALYSIS_RETRY_DELAY_MS=5000
ANALYSIS_CODE_AUDIT_RETRY_DELAY_MS=8000
```

Optional n8n fallback:

```bash
N8N_WEBHOOK_URL=<english_webhook>
N8N_WEBHOOK_URL_ZH=<chinese_webhook>
```

### Run

```bash
# Frontend
npm install
npm run dev

# Backend API + worker in one process
cd server
npm install
npm run dev

# Or split them for horizontal scaling
cd server
npm run dev:api

cd server
npm run dev:worker
```

### Useful Local Test Commands

```bash
# Build backend
cd server && npm run build

# Run code runtime directly
cd server && npm run test:code-analysis -- <polymarket-url> [en|zh]

# Run n8n parity path directly
cd server && npm run test:n8n-analysis -- <polymarket-url> [en|zh]
```

---

## Runtime Architecture

### Request Flow

1. Frontend calls `POST /api/analysis`
2. Backend inserts into `analysis_records`
3. Credits are deducted unless the user has unlimited access
4. Backend inserts a queued row into `analysis_jobs`
5. Worker claims the job atomically
6. Worker runs `code` engine by default
7. Partial results are written to `analysis_records.analysis_result` with step markers:
   - `<!--STEP:info-->`
   - `<!--STEP:probability-->`
   - `<!--STEP:risk-->`
8. Frontend polls `GET /api/analysis/:id/poll` and renders progressively
9. Final result is written back and status becomes `completed`

### Why This Changed

The project originally depended on direct n8n execution. It has been migrated toward a queue-backed in-code runtime to improve control over:

- concurrency
- retries
- failure recovery
- worker lease heartbeats
- step-level progress persistence
- Chinese and English parity inside the backend

---

## Key Features

- **Multi-session analysis** — multiple analyses can run in parallel with independent progress tracking
- **Session persistence** — analyses survive page refresh via persisted store + polling resume
- **Progressive rendering** — partial results appear step by step from the backend runtime
- **Chinese / English** — dedicated prompt paths for both languages
- **Credit system** — signup bonus, pay-per-analysis deduction, referral commission, subscriptions
- **4-tier risk rating** — `safe` / `caution` / `danger` / `reject`
- **History management** — list, retry, cancel, and delete analysis records
- **Admin panel** — users, analyses, featured content, transactions, settings

---

## Database

### `analysis_records`

Stores user-visible analysis state and final output.

### `analysis_jobs`

Queue table used by the worker runtime.

Key fields:
- `engine` — `code` or `n8n`
- `status` — `queued` / `running` / `completed` / `failed` / `cancelled`
- `payload` — canonical URL, slug, user info, record ID, language
- `attempts` / `max_attempts` — retry control
- `locked_by` / `locked_at` — worker lease tracking

### `credit_transactions`

Ledger for signup bonus, analysis spend, referral commission, admin grants, and top-ups.

---

## License

MIT

---

<a id="项目简介"></a>

# PolyInsight（中文）

基于 AI 的预测市场分析平台。提交 Polymarket 事件链接，系统会生成包含概率分析、规则审计和操作建议的结构化报告。

**在线体验：** [polyinsight.online](https://polyinsight.online)

---

## 项目简介

1. 用户提交 Polymarket 事件链接
2. 后端创建 `analysis_records`、扣积分并写入 `analysis_jobs` 队列
3. 分析 worker 拉取任务并执行分析流水线
4. 前端轮询数据库结果，按步骤渐进展示
5. 最终输出包含 AI 与市场概率对比、风险评级和操作建议

### 当前分析流水线

现在的主路径已经是后端 `code` 引擎，而不是直接调用 n8n。

| 步骤 | 默认模型 | 用途 |
|------|----------|------|
| Step 2：事件信息提取 | `gpt-5.2-chat-latest` | 重述市场结构与结算机制 |
| Step 3：概率分析 | `gpt-5.4` + 联网搜索 | 独立概率估算 |
| Step 4：风控审计 | `gpt-5.4` + 联网搜索 | 识别规则陷阱、结算风险与校准问题 |
| Step 5：报告撰写 | `gpt-5.2-chat-latest` | 输出最终 JSON + Markdown 报告 |

这条运行时链路支持：
- 中英文双语 prompt
- OpenAI 兼容 `Responses API`
- Step 3 / Step 4 内置 `web_search`
- `analysis_jobs` 队列化执行
- 保留 n8n 作为可选 fallback / 对照路径

### 报告输出

- **决策卡片** — 事件名称、截止日期、各选项 AI vs 市场概率、风险标签（`safe` / `caution` / `danger` / `reject`）、方向建议
- **详细分析** — Markdown 形式的概率解释、风控审计和关键不确定性

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 认证 | Privy |
| 数据库 | Supabase (Postgres) |
| 后端 API | Express + tsx |
| 分析运行时 | TypeScript worker + OpenAI 兼容模型 |
| 队列 | Supabase `analysis_jobs` |
| 可选回退 | 自托管 n8n |
| 状态管理 | Zustand（持久化到 localStorage） |
| 国际化 | react-i18next（中文 / 英文） |
| 部署 | Nginx 反向代理 |

## 最近改动记录（2026-03-17）

- 分析主路径已经切到后端 `code` 引擎，不再默认直连 n8n。
- 后端 TypeScript 已补齐主分析链路的 Step 2 / 3 / 4 / 5，并分别接入英文与中文 prompt。
- 模型调用已经改成 OpenAI 兼容的 `Responses API` 请求格式，使用消息数组输入，并在概率分析 / 风控审计步骤启用内置 `web_search`。
- 分析请求现在通过 `analysis_jobs` 队列执行，具备重试、终态失败退款、分步骤结果持久化和 worker heartbeat 续租。
- worker 丢失 lease 后不会继续写任务状态，避免长任务被重复处理后互相覆盖。
- 后端启动方式已支持 API / worker 拆分，脚本包括 `dev:api`、`dev:worker`、`start:api`、`start:worker`。
- 当前运行时限制已经落配置：
  - 系统总活跃分析并发：`50`
  - 单用户活跃分析上限：`3`
  - 模型请求并发闸门：`12`
- 首页 Hero 背景层已调整，去掉了标题区域那条可见的白色横线。

### 还需要执行的数据库步骤

- 如果要放心使用多 worker 横向扩容，需要先在 Supabase SQL Editor 执行 `supabase/migrations/20260317020000_analysis_jobs_claim_rpc.sql`。
- 在这条 SQL 函数真正落库之前，应用会回退到旧的非 RPC claim 逻辑。

---

## 项目结构

```text
src/                              # 用户前端
├── pages/                        # Discovery / Analyze / History / Profile
├── components/                   # 布局、决策卡、渐进式结果组件
├── store/                        # 登录态与分析会话状态
├── i18n/                         # 中英文翻译
└── lib/                          # 后端客户端、Supabase 客户端、工具函数

server/src/                       # 后端 API + 分析 worker
├── analysis-runtime/             # 后端 code 分析引擎
│   ├── codeWorkflow.ts           # Step2 / 3 / 4 / 5 主流程
│   ├── parity.ts                 # 市场路由、analysis plan、retrieval plan、retrieval pack
│   ├── workflowPrompts.ts        # 中英文 prompt
│   └── pipeline.ts               # 过渡期遗留运行时文件
├── routes/                       # API 路由
├── services/                     # 队列、worker、账单、积分、Polymarket、n8n fallback
├── jobs/                         # Trending 与 stale-analysis 定时任务
├── middleware/                   # 鉴权与管理员中间件
└── scripts/                      # 本地测试脚本

admin/src/                        # 管理后台前端

supabase/migrations/              # 数据库 migration
```

### 与分析最相关的文件

- `server/src/routes/analysis.ts`
  创建分析记录、扣积分、入队
- `server/src/services/analysisJobs.ts`
  `analysis_jobs` 队列生命周期管理
- `server/src/services/analysisWorker.ts`
  消费队列并选择执行 `code` 或 `n8n`
- `server/src/analysis-runtime/codeWorkflow.ts`
  主分析引擎
- `server/src/analysis-runtime/parity.ts`
  确定性路由与检索打包
- `server/src/analysis-runtime/workflowPrompts.ts`
  中英文 prompt 层
- `src/store/analysisStore.ts`
  前端轮询与会话恢复
- `src/components/ProgressiveResult.tsx`
  通过 `<!--STEP:...-->` 标记做渐进展示

---

## 快速开始

### 前置条件

- Node.js 18+
- Supabase 项目
- Privy 应用
- 一个 OpenAI 兼容的模型接口
- 可选：如果要保留 fallback / 对照模式，再准备 n8n

### 环境变量

**前端**（`.env`）

```bash
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_PRIVY_APP_ID=<privy_app_id>
VITE_WALLETCONNECT_PROJECT_ID=<walletconnect_project_id>
```

**后端**（`server/.env`）

必需：

```bash
PORT=3001
SUPABASE_URL=<supabase_url>
SUPABASE_SERVICE_KEY=<service_role_key>
PRIVY_APP_ID=<privy_app_id>
PRIVY_APP_SECRET=<privy_app_secret>
ADMIN_PASSWORD=<admin_password>
ADMIN_JWT_SECRET=<admin_jwt_secret>
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ANALYSIS_ENGINE=code
ANALYSIS_CODE_API_KEY=<provider_api_key>
ANALYSIS_CODE_BASE_URL=<openai_compatible_base_url>
ANALYSIS_CODE_MODEL=gpt-5.4
```

推荐 / 可选：

```bash
ANALYSIS_CODE_EXTRACT_MODEL=gpt-5.2-chat-latest
ANALYSIS_CODE_REPORT_MODEL=gpt-5.2-chat-latest
ANALYSIS_CODE_USE_WEB_SEARCH=true
ANALYSIS_CODE_SEARCH_CONTEXT_SIZE=high
ANALYSIS_WORKER_CONCURRENCY=50
ANALYSIS_WORKER_POLL_MS=2000
ANALYSIS_WORKER_HEARTBEAT_MS=15000
ANALYSIS_MAX_ACTIVE_JOBS_PER_USER=3
ANALYSIS_CODE_REQUEST_CONCURRENCY=12
ANALYSIS_CODE_MAX_RETRIES=3
ANALYSIS_CODE_RETRY_DELAY_MS=1000
ANALYSIS_CODE_ANALYSIS_RETRY_DELAY_MS=5000
ANALYSIS_CODE_AUDIT_RETRY_DELAY_MS=8000
```

可选 n8n fallback：

```bash
N8N_WEBHOOK_URL=<英文 webhook>
N8N_WEBHOOK_URL_ZH=<中文 webhook>
```

### 运行

```bash
# 前端
npm install
npm run dev

# 后端 API + worker 单进程运行
cd server
npm install
npm run dev

# 或者拆成独立 API / worker 进程，便于横向扩容
cd server
npm run dev:api

cd server
npm run dev:worker
```

### 常用本地测试命令

```bash
# 构建后端
cd server && npm run build

# 直接跑 code runtime
cd server && npm run test:code-analysis -- <polymarket-url> [en|zh]

# 直接跑 n8n 对照路径
cd server && npm run test:n8n-analysis -- <polymarket-url> [en|zh]
```

---

## 运行时架构

### 请求链路

1. 前端调用 `POST /api/analysis`
2. 后端写入 `analysis_records`
3. 如果用户不是无限订阅，后端扣积分
4. 后端把任务写入 `analysis_jobs`
5. Worker claim 队列任务
6. 默认执行 `code` 引擎
7. 中间结果按下面的 step marker 写回数据库：
   - `<!--STEP:info-->`
   - `<!--STEP:probability-->`
   - `<!--STEP:risk-->`
8. 前端轮询 `GET /api/analysis/:id/poll`
9. 最终结果写回并将状态改为 `completed`

### 为什么做这次迁移

项目最初依赖直接调用 n8n。现在迁到“队列 + worker + code runtime”为主，是为了更好地控制：

- 并发
- 重试
- 卡死任务回收
- 分步骤持久化
- 中英文在后端内部的对齐

---

## 主要特性

- **多会话分析** — 多个分析任务可并行运行，各自独立追踪进度
- **会话持久化** — 刷新页面后可以自动恢复轮询
- **渐进式渲染** — 后端每完成一步，前端即时展示
- **中英双语** — 中英文各自有独立 prompt 路径
- **积分系统** — 注册赠送、按次扣费、推荐返佣、订阅
- **四级风险评级** — `safe` / `caution` / `danger` / `reject`
- **历史记录管理** — 支持查看、重试、取消、删除
- **管理后台** — 用户、分析、精选内容、交易、设置

---

## 数据库

### `analysis_records`

面向用户的分析状态与最终结果表。

### `analysis_jobs`

给 worker 使用的任务队列表。

关键字段：
- `engine` — `code` 或 `n8n`
- `status` — `queued` / `running` / `completed` / `failed` / `cancelled`
- `payload` — URL、slug、用户信息、record ID、语言
- `attempts` / `max_attempts` — 重试控制
- `locked_by` / `locked_at` — worker lease 信息

### `credit_transactions`

记录注册赠送、分析消费、返佣、管理员发放、充值等积分流水。

---

## 许可证

MIT
