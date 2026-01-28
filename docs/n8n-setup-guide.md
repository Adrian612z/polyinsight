# n8n 工作流配置指南

本文档说明如何配置 n8n 工作流，使其与 PolyInsight 网站配合工作。

## 架构说明

### 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         PolyInsight 网站                         │
├─────────────────────────────────────────────────────────────────┤
│  1. 用户提交 URL                                                 │
│  2. 创建 Supabase 记录 (status: pending)                         │
│  3. 触发 n8n Webhook (不等待响应)                                │
│  4. 轮询 Supabase 等待结果                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         n8n 工作流                               │
├─────────────────────────────────────────────────────────────────┤
│  1. Webhook 接收请求 (包含 record_id)                            │
│  2. 获取 Polymarket 数据                                         │
│  3. AI 分析 (Step2 → Step3 → Step4 → Step5)                     │
│  4. 更新 Supabase 记录 (status: completed, analysis_result)      │
│  5. (可选) 发送到飞书                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase 数据库                          │
├─────────────────────────────────────────────────────────────────┤
│  analysis_records 表                                             │
│  - id (UUID)                                                     │
│  - status: pending → completed / failed                          │
│  - analysis_result: 分析报告内容                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 关键点

- **网站不等待 n8n 响应**：触发后立即返回，通过轮询获取结果
- **n8n 直接写入 Supabase**：分析完成后更新数据库记录
- **通过 record_id 关联**：网站创建记录时生成 ID，传给 n8n

---

## 第一步：获取 Supabase 凭证

### 1.1 获取 Supabase URL

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **Settings → API**
4. 复制 **Project URL**（格式：`https://xxx.supabase.co`）

### 1.2 获取 Service Role Key

在同一页面：
1. 找到 **Project API keys** 部分
2. 复制 **service_role** key（不是 anon key）

> ⚠️ **重要**：使用 service_role key 是因为需要绕过 Row Level Security (RLS)。请妥善保管此密钥。

---

## 第二步：配置 n8n 凭证

### 方法 A：使用 Supabase 节点（推荐）

1. 在 n8n 中，进入 **Settings → Credentials**
2. 点击 **Add Credential**
3. 搜索并选择 **Supabase**
4. 填入：
   - **Host**: 你的 Supabase URL
   - **Service Role Secret**: 你的 service_role key
5. 保存

### 方法 B：使用 HTTP Request（备选）

如果没有 Supabase 节点，可以直接用 HTTP Request，凭证在请求头中传递。

---

## 第三步：修改工作流

### 3.1 Webhook 节点配置

确保 Webhook 节点配置如下：

```
HTTP Method: POST
Path: polymarket-analysis
Response Mode: Response Node (或 Last Node)
```

网站会发送以下数据：

```json
{
  "url": "https://polymarket.com/event/...",
  "user_id": "用户ID",
  "record_id": "数据库记录ID"  // 关键！用于更新结果
}
```

### 3.2 添加 Supabase 更新节点

在 `Step5:报告撰写` 节点之后，添加一个新节点来更新数据库。

#### 使用 Supabase 节点

1. 添加 **Supabase** 节点
2. 配置：
   - **Credential**: 选择刚才创建的凭证
   - **Operation**: Update
   - **Table Name**: analysis_records
3. 添加过滤条件（Filter）：
   - **Column**: id
   - **Operator**: equals
   - **Value**: `{{ $('Webhook').item.json.body.record_id }}`
4. 添加要更新的字段（Fields）：
   - **status**: completed
   - **analysis_result**: `{{ $json.output }}`

#### 使用 HTTP Request 节点

1. 添加 **HTTP Request** 节点
2. 配置：

```
Method: PATCH

URL: https://你的项目.supabase.co/rest/v1/analysis_records?id=eq.{{ $('Webhook').item.json.body.record_id }}

Headers:
┌─────────────────┬──────────────────────────────────┐
│ apikey          │ 你的 service_role key            │
│ Authorization   │ Bearer 你的 service_role key     │
│ Content-Type    │ application/json                 │
│ Prefer          │ return=minimal                   │
└─────────────────┴──────────────────────────────────┘

Body (JSON):
{
  "status": "completed",
  "analysis_result": {{ JSON.stringify($json.output) }}
}
```

### 3.3 连接节点

修改后的流程：

```
Webhook
    ↓
Code (提取 slug)
    ↓
HTTP Request (Polymarket API)
    ↓
Step2: 事件信息提取
    ↓
Step3: 事件概率分析
    ↓
Step4: 风控专员
    ↓
Step5: 报告撰写
    ↓
┌─────────────────────────────┐
│  Supabase 更新 (新增节点)   │  ← 关键！
└─────────────────────────────┘
    ↓
Respond to Webhook (可选保留)
    ↓
飞书机器人 (可选)
```

---

## 第四步：错误处理（可选但推荐）

### 4.1 添加错误处理节点

在工作流中添加 **Error Trigger** 节点，当任何步骤失败时更新数据库状态为 failed：

```
Error Trigger
    ↓
HTTP Request (或 Supabase 节点)
    - URL: .../analysis_records?id=eq.{{ $json.execution.customData.record_id }}
    - Body: { "status": "failed" }
```

### 4.2 在 Webhook 后保存 record_id

为了在错误处理中获取 record_id，需要在流程开始时保存：

1. 在 Webhook 后添加 **Set** 节点
2. 保存 record_id 到工作流变量

---

## 第五步：测试

### 5.1 手动测试 Supabase 更新

1. 在 Supabase 中创建一条测试记录：
   ```sql
   INSERT INTO analysis_records (event_url, status, user_id)
   VALUES ('https://test.com', 'pending', '00000000-0000-0000-0000-000000000000')
   RETURNING id;
   ```

2. 复制返回的 ID

3. 在 n8n 中单独测试 Supabase 更新节点，使用该 ID

4. 检查 Supabase 中记录是否更新

### 5.2 端到端测试

1. 在网站上提交一个 Polymarket URL
2. 观察：
   - 网站显示"分析中..."
   - n8n 开始执行
   - n8n 完成后，网站自动显示结果

---

## 常见问题

### Q: 网站一直显示"分析中"，结果不出来？

检查：
1. n8n 工作流是否执行成功
2. Supabase 中记录的 status 是否更新为 completed
3. analysis_result 字段是否有内容

### Q: n8n 更新 Supabase 失败？

检查：
1. 使用的是 service_role key（不是 anon key）
2. record_id 是否正确传递
3. 表名和字段名是否正确

### Q: 如何查看 n8n 执行日志？

在 n8n 中：
1. 点击工作流
2. 查看 **Executions** 标签
3. 点击具体执行查看每个节点的输入输出

---

## 环境变量对照

| 位置 | 变量 | 说明 |
|------|------|------|
| 网站 .env | VITE_SUPABASE_URL | Supabase 项目 URL |
| 网站 .env | VITE_SUPABASE_ANON_KEY | Supabase anon key |
| 网站 .env | VITE_N8N_WEBHOOK_URL | n8n Webhook URL |
| n8n | Supabase Host | 同 VITE_SUPABASE_URL |
| n8n | Supabase Service Role Key | Supabase service_role key |

---

## 更新日志

- 2024-01-28: 初始版本，支持异步模式
