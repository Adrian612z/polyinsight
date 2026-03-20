# PolyInsight

PolyInsight 是一个面向 Polymarket 的 AI 分析平台。用户提交事件链接后，系统会生成结构化报告，包括事件规则梳理、概率判断、风险审计，以及可执行的交易方向建议。

在线地址：
- [polyinsight.online](https://polyinsight.online)
- [admin.polyinsight.online](https://admin.polyinsight.online)

## 项目定位

这个项目解决的不是“把市场价格再说一遍”，而是做一套独立于市场价格的分析流程：

1. 识别事件结构、结算规则和时间边界
2. 用外部信息建立独立概率判断
3. 审计规则陷阱、时点风险和执行路径风险
4. 生成最终 JSON + Markdown 报告，供前端渐进展示

当前主执行路径是后端 `code` 引擎，`n8n` 保留为回退路径。

## 核心特性

- 支持中英文双语分析
- 支持渐进式结果展示，前端可按步骤刷新
- 支持分析队列、重试、失败退款和 worker lease
- 支持积分体系、推荐返佣和订阅
- 支持历史记录、重试、取消、删除
- 提供独立管理后台
- 分析链路默认使用 OpenAI 兼容 `Responses API`
- 对 `Responses API` 的 JSON 返回和 SSE 事件流返回都已兼容

## 当前分析链路

| 步骤 | 默认模型 | 作用 |
|------|----------|------|
| Step 2 | `gpt-5.2-chat-latest` | 重述市场结构、规则和结算机制 |
| Step 3 | `gpt-5.4` + `web_search` | 做独立概率分析 |
| Step 4 | `gpt-5.4` + `web_search` | 做风控与规则审计 |
| Step 5 | `gpt-5.2-chat-latest` | 输出最终报告 |

运行时默认能力：
- 使用 `analysis_jobs` 队列表驱动分析
- 概率分析与风控审计阶段可调用内置 `web_search`
- 分步结果写回数据库，前端轮询恢复展示
- 可切换 `ANALYSIS_ENGINE=code` 或 `ANALYSIS_ENGINE=n8n`

## 技术栈

| 层级 | 技术 |
|------|------|
| 用户前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 管理后台 | React + Vite |
| 鉴权 | Privy |
| 数据库 | Supabase Postgres |
| 后端 API | Express |
| 分析运行时 | TypeScript worker |
| 队列 | `analysis_jobs` |
| 状态管理 | Zustand |
| 国际化 | react-i18next |
| 部署 | Nginx 反向代理 |

## 目录结构

```text
src/                              # 用户前端
admin/src/                        # 管理后台前端
server/src/                       # 后端 API + 分析 worker
server/src/analysis-runtime/      # code 分析引擎
server/src/routes/                # API 路由
server/src/services/              # 队列、账单、积分、分析调度
server/src/jobs/                  # 定时任务
supabase/migrations/              # 数据库迁移
docs/                             # 交接文档
```

分析链路里最关键的文件：

- `server/src/routes/analysis.ts`
- `server/src/services/analysisJobs.ts`
- `server/src/services/analysisWorker.ts`
- `server/src/analysis-runtime/codeWorkflow.ts`
- `server/src/analysis-runtime/parity.ts`
- `server/src/analysis-runtime/workflowPrompts.ts`
- `src/store/analysisStore.ts`
- `src/components/ProgressiveResult.tsx`

## 请求链路

1. 前端调用 `POST /api/analysis`
2. 后端创建 `analysis_records`
3. 扣减积分并写入 `analysis_jobs`
4. Worker 领取队列任务
5. 默认进入 `code` 分析引擎
6. 每一步结果写回 `analysis_records.analysis_result`
7. 前端轮询 `GET /api/analysis/:id/poll`
8. 用户在页面看到渐进式结果
9. 任务结束后状态切换为 `completed` / `failed` / `cancelled`

当前使用的 step marker：

- `<!--STEP:info-->`
- `<!--STEP:probability-->`
- `<!--STEP:risk-->`

## 环境要求

- Node.js 18+
- 一个 Supabase 项目
- 一个 Privy 应用
- 一个 OpenAI 兼容模型接口
- 可选：n8n，用于回退或对照模式

## 环境变量

前端 `.env` 示例：

```bash
VITE_SUPABASE_URL=<supabase_url>
VITE_SUPABASE_ANON_KEY=<supabase_anon_key>
VITE_PRIVY_APP_ID=<privy_app_id>
VITE_WALLETCONNECT_PROJECT_ID=<walletconnect_project_id>
```

后端 `server/.env` 至少需要：

```bash
PORT=3001
SUPABASE_URL=<supabase_url>
SUPABASE_SERVICE_KEY=<service_role_key>
PRIVY_APP_ID=<privy_app_id>
PRIVY_APP_SECRET=<privy_app_secret>
ADMIN_PASSWORD=<admin_password>
ADMIN_JWT_SECRET=<admin_jwt_secret>
ALLOWED_ORIGINS=https://polyinsight.online,https://www.polyinsight.online,https://admin.polyinsight.online,http://localhost:5173,http://127.0.0.1:5173
ANALYSIS_ENGINE=code
ANALYSIS_CODE_API_KEY=<provider_api_key>
ANALYSIS_CODE_BASE_URL=<openai_compatible_base_url>
ANALYSIS_CODE_MODEL=gpt-5.4
```

推荐附加配置：

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

如果要保留 n8n 回退路径，可再配置：

```bash
N8N_WEBHOOK_URL=<english_webhook>
N8N_WEBHOOK_URL_ZH=<chinese_webhook>
```

## 本地运行

安装依赖：

```bash
npm install
cd admin && npm install
cd ../server && npm install
```

开发模式：

```bash
# 用户前端
npm run dev

# 管理后台
cd admin
npm run dev

# 后端 API + worker 单进程
cd server
npm run dev
```

如果要拆成独立进程：

```bash
cd server
npm run dev:api

cd server
npm run dev:worker
```

## 常用命令

```bash
# 构建用户前端
npm run build

# 构建管理后台
cd admin && npm run build

# 构建后端
cd server && npm run build

# TypeScript 检查
npm run check

# 运行前端测试
npm run test:run

# 直接跑 code 分析链路
cd server && npm run test:code-analysis -- <polymarket-url> [en|zh]

# 直接跑 n8n 路径
cd server && npm run test:n8n-analysis -- <polymarket-url> [en|zh]
```

## 部署说明

当前线上部署方式是：

- `polyinsight.online` 读取根目录 `dist/`
- `polyinsight.online/admin/` 读取 `admin/dist/`
- `/api/` 反代到本机 `3001`
- 后端运行进程为 `server/dist/index.js`
- Nginx 负责 HTTPS 与静态资源分发

重新部署时通常需要：

```bash
npm run build
cd admin && npm run build
cd ../server && npm run build
```

然后重启后端进程。

## 数据库说明

### `analysis_records`

用户可见的分析状态与最终结果表。

### `analysis_jobs`

分析 worker 使用的任务队列表。

关键字段：
- `engine`：`code` 或 `n8n`
- `status`：`queued` / `running` / `completed` / `failed` / `cancelled`
- `payload`：任务 URL、slug、语言、record ID 等
- `attempts` / `max_attempts`：重试控制
- `locked_by` / `locked_at`：worker lease 信息

### `credit_transactions`

积分流水表，记录注册赠送、分析消费、返佣、订阅和管理员发放。

## 最近更新

### 2026-03-20

- 线上环境已切到 `project-hardening-20260320` 分支部署
- `code` 引擎已经接通并实测跑通真实分析链路
- 修复了 OpenAI 兼容代理在 `Responses API` 下偶发返回 SSE 事件流时的解析问题
- `codeWorkflow.ts` 和 `pipeline.ts` 现在会显式请求非流式响应，并兼容 JSON / SSE 两种响应体

### 2026-03-17

- 默认分析路径从直连 n8n 切换为后端 `code` 引擎
- 引入 `analysis_jobs` 队列，支持重试、心跳、失败回收和分步结果持久化
- 后端补齐中英文 prompt 路径
- 新增 API / worker 拆分启动方式
- 默认并发配置更新为：
  - 系统总活跃分析并发：`50`
  - 单用户活跃分析上限：`3`
  - 模型请求并发闸门：`12`

## 待确认项

- 如果要可靠支持多 worker 横向扩容，需要在 Supabase 执行 `supabase/migrations/20260317020000_analysis_jobs_claim_rpc.sql`
- 在该 SQL 函数未落库前，系统会回退到旧的非 RPC claim 逻辑

## 交接文档

- `docs/payment-credit-handover.md`

## 许可证

MIT
