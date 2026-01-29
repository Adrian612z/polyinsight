# PolyInsight 🔮

<div align="center">

**智能预测市场分析平台**

利用 AI 技术深度分析 Polymarket 事件，为您提供专业的市场洞察报告

[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-2.93-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)

</div>

---

## ✨ 功能特性

### 🎯 核心功能
- **事件分析** - 提交 Polymarket 事件 URL，通过 n8n webhook 工作流自动分析
- **Markdown 报告** - 返回格式化的 Markdown 分析报告，专业易读
- **历史记录** - 查看过往分析记录，支持分页浏览
- **实时状态** - 分析状态追踪（待处理/已完成/失败）

### 🎨 UI/UX 体验
- **深色模式** - 一键切换深色/浅色主题，自动持久化
- **动态背景** - 鼠标跟随的动画光晕效果
- **玻璃拟态** - 现代化的 Glass-morphism 卡片设计
- **Toast 通知** - 友好的操作反馈提示
- **骨架屏加载** - 优雅的加载状态展示

### 🛡️ 错误处理
- 全局 ErrorBoundary 捕获渲染错误
- 自动重试机制（最多 3 次，指数退避）
- 用户友好的错误消息提示
- 失败分析自动更新数据库状态

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | React 18 + TypeScript (严格模式) |
| **构建工具** | Vite 6 |
| **样式** | Tailwind CSS 3 |
| **状态管理** | Zustand 5 |
| **数据库** | Supabase |
| **工作流** | n8n Webhook |
| **路由** | React Router 7 |
| **测试** | Vitest + Testing Library |
| **部署** | Vercel |

---

## 📁 项目结构

```
src/
├── pages/                  # 路由页面组件
│   ├── Analyze.tsx         # URL 提交与分析
│   ├── History.tsx         # 历史记录（含分页）
│   └── Login.tsx           # 登录页面
├── components/
│   ├── Layout.tsx          # 应用外壳（导航栏、主题切换）
│   ├── AnimatedBackground.tsx  # 动态背景组件
│   ├── Toast.tsx           # Toast 通知组件
│   ├── ErrorBoundary.tsx   # 全局错误边界
│   └── Skeleton.tsx        # 加载骨架屏
├── store/
│   ├── authStore.ts        # 认证状态（localStorage 持久化）
│   └── analysisStore.ts    # 分析状态管理
├── hooks/
│   └── useTheme.ts         # 深色模式 Hook
├── lib/
│   ├── supabase.ts         # Supabase 客户端
│   ├── api.ts              # fetchWithRetry, parseErrorMessage
│   └── utils.ts            # cn() 类名合并工具
└── App.tsx                 # 路由 + 全局 Provider
```

---

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 配置环境变量

创建 `.env` 文件并配置以下变量：

```env
VITE_SUPABASE_URL=<your_supabase_project_url>
VITE_SUPABASE_ANON_KEY=<your_supabase_anon_key>
VITE_N8N_WEBHOOK_URL=<your_n8n_webhook_endpoint>
```

### 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

---

## 📜 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | TypeScript 编译 + Vite 打包 |
| `npm run preview` | 预览生产构建 |
| `npm run check` | 仅类型检查（不输出） |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 运行 Vitest（监听模式） |
| `npm run test:run` | 运行 Vitest（单次） |

---

## 🗺️ 路由说明

| 路由 | 组件 | 需要认证 |
|------|------|----------|
| `/login` | Login | 否 |
| `/analyze` | Analyze | 是 |
| `/history` | History | 是 |
| `/` | 重定向到 `/analyze` | - |

> 受保护的路由在未认证时会自动重定向到 `/login`

---

## 🗄️ 数据库结构

**表：`analysis_records`**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `user_id` | UUID | 用户 ID |
| `event_url` | TEXT | Polymarket 事件 URL |
| `analysis_result` | TEXT | 分析结果（Markdown） |
| `status` | ENUM | 状态：pending / completed / failed |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

> 已启用 RLS（行级安全）：用户只能访问自己的记录

---

## 🔄 数据流程

```
1. 用户登录 → 会话存储到 authStore
2. 用户提交 Polymarket URL → analysisStore.startAnalysis()
3. 在 Supabase 创建记录（状态：pending）
4. 发送 POST 请求到 n8n Webhook（含重试机制）
5. 分析结果保存到 Supabase（状态：completed/failed）
6. Toast 显示成功/错误，页面展示结果
```

---

## 🎨 设计规范

- **主题色**：Indigo/Purple 渐变 (`from-indigo-600 to-purple-600`)
- **卡片效果**：玻璃拟态 (`bg-white/70 dark:bg-gray-800/70 backdrop-blur-md`)
- **动画**：fade-in-up, shake, float (定义在 `src/index.css`)
- **深色模式**：所有颜色类使用 `dark:` 前缀

---

## 📋 TODO / 未来计划

- [ ] 真实认证（使用 Supabase Auth 替代模拟登录）
- [ ] 用户注册流程
- [ ] 个人资料管理页面
- [ ] 分析完成后历史页面自动刷新
- [ ] 更全面的测试覆盖

---

## 📄 许可证

© 2026 PolyInsight. All rights reserved.
