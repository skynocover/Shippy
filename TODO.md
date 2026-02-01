# VibeShip - 專案規劃文件

> 幫助 Vibe coding 小白一鍵上線的服務平台

## 專案概念

### 目標用戶
- 使用 Vibe coding（如 Cursor、Bolt.new、v0.dev）產出程式碼的小白
- 會寫程式但不懂部署、DNS、環境變數設定的人
- 想要「一鍵上線，給朋友看」的人

### 核心價值
- Vibe coding 能寫出「程式碼」，但無法幫用戶「操作」和「設定」
- 我們解決的是 Vibe coding 解決不了的最後一哩路

### 我們不做的事
- 登入註冊、權限管理等 Vibe coding 可以解決的功能
- 與 Vercel/Netlify 正面競爭

---

## 技術架構

### 部署環境
- **平台**：Cloudflare Workers
- **框架**：HonoX（前端 + 後端）

### Cloudflare 服務使用

| 服務 | 用途 |
|------|------|
| D1 | SQLite 資料庫（用戶資料、專案狀態、加密後的 Token） |
| KV | Session、快取 |
| R2 | 暫存用戶上傳的程式碼 |
| Queues | 背景任務（部署流程） |
| Cron Triggers | 定時任務（監控檢查） |

### 架構圖

```
┌────────────────────────────────────────────┐
│            Cloudflare Workers              │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │             HonoX App                │  │
│  │  ┌─────────────┐ ┌─────────────────┐ │  │
│  │  │  Frontend   │ │  API Routes     │ │  │
│  │  │  (SSR)      │ │  /api/*         │ │  │
│  │  └─────────────┘ └─────────────────┘ │  │
│  └──────────────────────────────────────┘  │
│         │              │          │        │
│         ▼              ▼          ▼        │
│  ┌──────────┐   ┌──────────┐  ┌───────┐   │
│  │    D1    │   │  Queues  │  │  R2   │   │
│  │   (DB)   │   │  (Task)  │  │(Files)│   │
│  └──────────┘   └──────────┘  └───────┘   │
└────────────────────────────────────────────┘
```

---

## 功能規劃

### P0 - MVP 核心（沒這個就不能用）

#### 1. GitHub 連結與程式碼上傳
- [ ] GitHub OAuth 授權（只要 `repo` scope）
- [ ] Repo 建在用戶自己帳號下
- [ ] 支援三種上傳方式：
  - [ ] 拖曳資料夾（主要方式，使用 `webkitGetAsEntry`）
  - [ ] 上傳 ZIP 檔（備用方式）
  - [ ] 貼 GitHub URL（已會 Git 的用戶）
- [ ] 前端過濾不需要的檔案（node_modules、.git、.env 等）
- [ ] 使用 GitHub Trees API 一次推送所有檔案

**程式碼上傳過濾規則：**
```typescript
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  '.env',
  '.env.local',
  '.DS_Store',
  'thumbs.db',
]
```

#### 2. 一鍵部署
- [ ] Vercel OAuth 授權
- [ ] 自動連結 GitHub repo 到 Vercel
- [ ] 偵測專案類型（Next.js、Vite、靜態網站等）
- [ ] 自動設定 Build 指令
- [ ] 部署狀態追蹤（透過 Queue 非同步處理）

#### 3. Domain 管理
- [ ] 提供免費 subdomain（如 `xxx.vibeship.dev`）
- [ ] 自動設定 SSL

---

### P1 - 體驗升級

#### 4. Domain 管理與自動設定（Cloudflare OAuth）

**完整流程：**
```
用戶連結 Cloudflare（OAuth）
        ↓
取得用戶帳號下所有 Domain 列表
        ↓
用戶選擇要使用的 Domain
        ↓
用戶輸入想要的子網域（如 app.example.com）或使用根網域
        ↓
部署到 Vercel 完成後
        ↓
自動在 Cloudflare 設定 DNS（CNAME 指向 Vercel）
        ↓
自動在 Vercel 設定 Custom Domain
        ↓
等待 SSL 憑證生效
        ↓
完成！
```

**功能細項：**
- [ ] Cloudflare OAuth 授權
  - Scope: `zone:read`（讀取 domain 列表）
  - Scope: `dns:edit`（編輯 DNS 記錄）
- [ ] 取得用戶 Domain 列表（Cloudflare Zones API）
- [ ] Domain 選擇介面
  - 顯示用戶所有 domain
  - 讓用戶選擇根網域或輸入子網域
- [ ] 自動設定 DNS 記錄
  - 根網域：A record 或 CNAME flattening
  - 子網域：CNAME → `cname.vercel-dns.com`
- [ ] 自動在 Vercel 新增 Custom Domain
- [ ] SSL 狀態檢查與顯示
- [ ] DNS 傳播狀態檢查

**Cloudflare DNS 設定邏輯：**
```typescript
// 子網域（如 app.example.com）
await cloudflare.dns.records.create({
  zone_id: zoneId,
  type: 'CNAME',
  name: 'app',                        // 子網域名稱
  content: 'cname.vercel-dns.com',    // Vercel CNAME
  proxied: false,                     // Vercel 需要 DNS-only
  ttl: 1,                             // Auto
})

// 根網域（example.com）- Cloudflare 支援 CNAME flattening
await cloudflare.dns.records.create({
  zone_id: zoneId,
  type: 'CNAME',
  name: '@',                          // 根網域
  content: 'cname.vercel-dns.com',
  proxied: false,
  ttl: 1,
})
```

**Vercel Custom Domain 設定：**
```typescript
await vercel.projects.addDomain({
  projectId: projectId,
  domain: 'app.example.com',
})
```

#### 5. 環境變數管理
- [ ] 統一管理面板
- [ ] 從 `.env.example` 自動偵測需要的變數
- [ ] 同步到 Vercel 環境變數

#### 6. 資料庫自動建立
- [ ] 掃描 `package.json` 偵測使用的 ORM/DB
  - Prisma + PostgreSQL → 推薦 Neon/Supabase
  - Drizzle + Postgres → 推薦 Neon/Supabase
  - @supabase/supabase-js → Supabase
  - mongoose → MongoDB Atlas
- [ ] Supabase OAuth 或 Neon OAuth
- [ ] 自動建立 DB 專案
- [ ] 自動注入 DATABASE_URL 到環境變數
- [ ] 自動執行 migration（`prisma migrate deploy` 或 `drizzle-kit push`）

#### 7. 部署狀態與通知
- [ ] Dashboard 顯示部署狀態
- [ ] 部署完成/失敗通知
- [ ] 支援 Discord Webhook
- [ ] 支援 LINE Notify

#### 8. 一鍵回滾
- [ ] 顯示部署歷史
- [ ] 一鍵回到上一版

---

### P2 - 商業化功能

#### 9. 監控功能
- [ ] Uptime 監控（Cron Trigger 定期 ping）
- [ ] 網站掛掉時發通知
- [ ] Sentry OAuth 串接（錯誤追蹤）

#### 10. 其他第三方服務串接
- [ ] Resend（郵件發送）
- [ ] Stripe Connect（金流）
- [ ] Uploadthing / R2（檔案儲存）

#### 11. 多專案管理
- [ ] 專案列表 Dashboard
- [ ] 每個專案獨立的服務連線狀態

---

## 第三方服務串接規劃

### 必串（MVP）

| 服務 | 串接方式 | 用途 |
|------|----------|------|
| GitHub | OAuth | 程式碼託管 |
| Vercel | OAuth | 部署 |
| Cloudflare | OAuth | Domain 管理、DNS 自動設定 |

### 第二波

| 服務 | 串接方式 | 用途 |
|------|----------|------|
| Supabase | OAuth / Management API | 資料庫 |
| Neon | OAuth / API | 資料庫 |
| Sentry | OAuth | 錯誤追蹤 |
| Discord | Webhook URL | 通知 |
| LINE Notify | OAuth | 通知 |

### 第三波

| 服務 | 串接方式 | 用途 |
|------|----------|------|
| Resend | API Key | 郵件 |
| Stripe | OAuth Connect | 金流 |
| Railway | OAuth | 後端部署 |

---

## 安全性考量

### Token 加密儲存
D1 是明文存儲，必須自行加密敏感資料：

```typescript
// 存入前加密
const encrypted = await encrypt(token, env.ENCRYPTION_KEY)
await db.insert(tokens).values({ encrypted })

// 讀取時解密
const decrypted = await decrypt(row.encrypted, env.ENCRYPTION_KEY)
```

需要加密的資料：
- GitHub Access Token
- Vercel Access Token
- Cloudflare API Token
- Supabase Service Key
- 用戶的 DATABASE_URL

---

## OAuth 設定說明

### GitHub OAuth

```
申請位置：GitHub Settings → Developer settings → OAuth Apps

Scopes 需要：
- repo（讀寫 repository）

Callback URL：
https://vibeship.dev/api/auth/github/callback
```

### Vercel OAuth

```
申請位置：Vercel Dashboard → Settings → OAuth Apps

Scopes 需要：
- 預設 scope 即可（project 管理權限）

Callback URL：
https://vibeship.dev/api/auth/vercel/callback
```

### Cloudflare OAuth

```
申請位置：Cloudflare Dashboard → Manage Account → API Tokens → OAuth Apps

Scopes 需要：
- zone:read    → 讀取用戶的 domain 列表
- dns:edit     → 編輯 DNS 記錄

Callback URL：
https://vibeship.dev/api/auth/cloudflare/callback

注意事項：
- Cloudflare OAuth 需要申請，不是所有帳號都有
- 備用方案：引導用戶建立 API Token（限定權限）
```

### Cloudflare API Token 備用方案

如果 Cloudflare OAuth 申請困難，可以引導用戶自行建立 API Token：

```
引導用戶步驟：
1. 前往 Cloudflare Dashboard
2. My Profile → API Tokens → Create Token
3. 使用「Edit zone DNS」模板
4. 選擇要授權的 Domain
5. 複製 Token 貼到我們的平台

Token 權限設定：
- Zone:Zone:Read
- Zone:DNS:Edit
- Zone Resources: 選擇特定 zone 或 All zones
```

---

## 專案結構

```
/src
├── routes/
│   ├── index.tsx           # Landing page
│   ├── dashboard/
│   │   ├── index.tsx       # 專案列表
│   │   ├── [projectId].tsx # 單一專案管理
│   │   └── domains.tsx     # Domain 管理頁面
│   └── api/
│       ├── auth/
│       │   ├── github/callback.ts
│       │   ├── vercel/callback.ts
│       │   └── cloudflare/callback.ts
│       ├── projects/
│       │   ├── index.ts    # CRUD
│       │   ├── upload.ts   # 接收程式碼上傳
│       │   └── deploy.ts   # 觸發部署
│       ├── domains/
│       │   ├── list.ts     # 取得用戶 Cloudflare domains
│       │   ├── setup.ts    # 設定 domain 到專案
│       │   └── status.ts   # 檢查 DNS/SSL 狀態
│       └── webhooks/
│           ├── github.ts   # Push events
│           └── vercel.ts   # Deployment events
│
├── services/
│   ├── github.ts           # GitHub API 操作
│   ├── vercel.ts           # Vercel API 操作
│   ├── cloudflare.ts       # Cloudflare API 操作
│   ├── domain.ts           # Domain 設定邏輯（組合 CF + Vercel）
│   ├── supabase.ts         # Supabase Management API
│   └── neon.ts             # Neon API
│
├── queue/
│   ├── consumer.ts         # Queue handler（部署流程）
│   └── jobs/
│       ├── deploy.ts       # 部署任務
│       └── domain-setup.ts # Domain 設定任務
│
├── lib/
│   ├── crypto.ts           # Token 加解密
│   └── detect.ts           # 專案類型偵測
│
└── db/
    └── schema.ts           # D1 schema（Drizzle）
```

---

## Wrangler 設定

```toml
# wrangler.toml

name = "vibeship"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "vibeship-db"
database_id = "xxx"

[[kv_namespaces]]
binding = "SESSION"
id = "xxx"

[[r2_buckets]]
binding = "FILES"
bucket_name = "vibeship-uploads"

[[queues.producers]]
binding = "DEPLOY_QUEUE"
queue = "deploy-tasks"

[[queues.consumers]]
queue = "deploy-tasks"
max_batch_size = 10
max_batch_timeout = 30

[triggers]
crons = ["*/5 * * * *"]  # 每 5 分鐘檢查監控
```

---

## 部署流程設計（非同步）

由於 Workers 有執行時間限制，部署流程必須拆成多步驟：

### 基本部署流程

```
1. 用戶點擊「部署」
       ↓
2. API 寫入 Queue，立即回傳「部署中」
       ↓
3. Queue Consumer 處理：
   - 呼叫 GitHub API 建立/更新 repo
   - 呼叫 Vercel API 建立專案
   - 設定環境變數
   - 觸發部署
       ↓
4. 更新 D1 中的部署狀態
       ↓
5. 前端 polling 取得最新狀態
```

### 完整部署 + Domain 設定流程

```
用戶上傳程式碼
       ↓
選擇部署設定：
├── 使用免費 subdomain（xxx.vibeship.dev）
└── 使用自訂 Domain（需先連結 Cloudflare）
       ↓
┌─────────────────────────────────────────────┐
│  Queue Job: deploy                          │
│                                             │
│  Step 1: GitHub                             │
│  ├── 建立 repo（如果不存在）                  │
│  └── Push 程式碼                             │
│                                             │
│  Step 2: Vercel                             │
│  ├── 建立專案（連結 GitHub repo）            │
│  ├── 設定環境變數                            │
│  └── 觸發部署                                │
│                                             │
│  Step 3: 等待 Vercel 部署完成                │
│  └── Polling Vercel API 或等待 Webhook       │
│                                             │
│  Step 4: Domain 設定（如果選擇自訂 Domain）   │
│  ├── Cloudflare: 建立 DNS CNAME 記錄         │
│  ├── Vercel: 新增 Custom Domain              │
│  └── 等待 SSL 憑證生效                       │
│                                             │
│  Step 5: 更新狀態                            │
│  └── 寫入 D1，標記部署完成                   │
└─────────────────────────────────────────────┘
       ↓
前端顯示：
├── 部署成功 ✅
├── 網址：https://app.example.com
└── SSL：已啟用 🔒
```

### Domain 設定詳細流程

```typescript
// services/domain.ts

async function setupCustomDomain(
  projectId: string,
  vercelProjectId: string,
  zoneId: string,
  subdomain: string,      // 'app' 或 '@' 代表根網域
  rootDomain: string,     // 'example.com'
) {
  const fullDomain = subdomain === '@' 
    ? rootDomain 
    : `${subdomain}.${rootDomain}`

  // Step 1: 在 Cloudflare 建立 DNS 記錄
  const dnsRecord = await cloudflare.dns.records.create({
    zone_id: zoneId,
    type: 'CNAME',
    name: subdomain,
    content: 'cname.vercel-dns.com',
    proxied: false,  // 重要：Vercel 需要 DNS-only 模式
    ttl: 1,
  })

  // Step 2: 在 Vercel 新增 Custom Domain
  const vercelDomain = await vercel.projects.addDomain(vercelProjectId, {
    name: fullDomain,
  })

  // Step 3: 等待 SSL 憑證（Vercel 自動處理）
  // 可以 polling vercel.projects.getDomain() 檢查狀態

  // Step 4: 儲存設定到 DB
  await db.insert(domainConfigs).values({
    id: generateId(),
    projectId,
    fullDomain,
    dnsRecordId: dnsRecord.id,
    vercelDomainId: vercelDomain.id,
    sslStatus: 'pending',
  })

  return { fullDomain, dnsRecordId: dnsRecord.id }
}
```

### Queue 任務結構

```typescript
// queue/consumer.ts

interface DeployJob {
  type: 'deploy'
  projectId: string
  userId: string
  steps: {
    github: {
      repoName: string
      files: Array<{ path: string; content: string }>
    }
    vercel: {
      framework: 'nextjs' | 'vite' | 'static'
      envVars?: Record<string, string>
    }
    domain?: {
      type: 'subdomain' | 'custom'
      // subdomain 時
      subdomain?: string  // xxx.vibeship.dev
      // custom 時
      zoneId?: string
      rootDomain?: string
      subdomainPrefix?: string  // 'app' | '@'
    }
  }
}

export default {
  async queue(batch: MessageBatch<DeployJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processDeployJob(msg.body, env)
        msg.ack()
      } catch (error) {
        msg.retry()
      }
    }
  }
}
```

---

## 資料庫 Schema（D1 + Drizzle）

```typescript
// db/schema.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: text('github_id').unique(),
  githubToken: text('github_token'),         // 加密儲存
  vercelToken: text('vercel_token'),         // 加密儲存
  cloudflareToken: text('cloudflare_token'), // 加密儲存
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  name: text('name'),
  githubRepo: text('github_repo'),
  vercelProjectId: text('vercel_project_id'),
  subdomain: text('subdomain').unique(),     // 免費 subdomain（xxx.vibeship.dev）
  customDomain: text('custom_domain'),       // 用戶自訂 domain
  domainStatus: text('domain_status'),       // 'pending' | 'active' | 'error'
  status: text('status'),                    // 'pending' | 'deployed' | 'failed'
  lastDeployedAt: integer('last_deployed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const deployments = sqliteTable('deployments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  status: text('status'),
  vercelDeploymentId: text('vercel_deployment_id'),
  url: text('url'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

export const connectedServices = sqliteTable('connected_services', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  service: text('service'),                  // 'github' | 'vercel' | 'cloudflare' | 'supabase'
  accessToken: text('access_token'),         // 加密儲存
  refreshToken: text('refresh_token'),       // 加密儲存
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }), // 額外資訊（如 Cloudflare account_id）
  createdAt: integer('created_at', { mode: 'timestamp' }),
})

// 用戶在 Cloudflare 的 Domain 列表（快取）
export const userDomains = sqliteTable('user_domains', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id),
  zoneId: text('zone_id'),                   // Cloudflare Zone ID
  domain: text('domain'),                    // example.com
  status: text('status'),                    // Cloudflare zone status
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
})

// Domain 設定記錄
export const domainConfigs = sqliteTable('domain_configs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id),
  userDomainId: text('user_domain_id').references(() => userDomains.id),
  fullDomain: text('full_domain'),           // app.example.com
  dnsRecordId: text('dns_record_id'),        // Cloudflare DNS record ID（方便之後刪除/更新）
  vercelDomainId: text('vercel_domain_id'),  // Vercel domain config ID
  sslStatus: text('ssl_status'),             // 'pending' | 'active' | 'error'
  createdAt: integer('created_at', { mode: 'timestamp' }),
})
```

---

## 開發順序建議

### Week 1-2：基礎建設
- [ ] 初始化 HonoX 專案
- [ ] 設定 D1 + Drizzle
- [ ] 設定 KV（Session）
- [ ] 實作 GitHub OAuth
- [ ] Landing page

### Week 3-4：核心功能
- [ ] 程式碼上傳功能（拖曳資料夾）
- [ ] GitHub repo 建立與推送
- [ ] Vercel OAuth
- [ ] 一鍵部署流程（Queue）
- [ ] 免費 Subdomain 配置（xxx.vibeship.dev）

### Week 5-6：Domain 管理
- [ ] Cloudflare OAuth 整合
- [ ] 取得用戶 Domain 列表
- [ ] Domain 選擇介面
- [ ] 自動 DNS 設定（CNAME → Vercel）
- [ ] 自動 Vercel Custom Domain 設定
- [ ] SSL 狀態檢查

### Week 7-8：完善 MVP
- [ ] Dashboard 專案列表
- [ ] 部署狀態即時顯示
- [ ] Domain 狀態顯示（DNS 傳播、SSL）
- [ ] 錯誤處理與重試機制
- [ ] 基本 UI 美化

### Week 9+：迭代優化
- [ ] 環境變數管理面板
- [ ] 資料庫自動建立（Supabase/Neon）
- [ ] 監控與通知（Discord/LINE）
- [ ] 一鍵回滾
- [ ] 多專案管理優化

---

## 命名建議

| 名稱 | Tagline |
|------|---------|
| **VibeShip** | 「Vibe it. Ship it.」 |
| **ShipKit** | 「From code to cloud in one click」 |
| **JustShip** | 「Stop configuring. Start shipping.」 |

---

## 注意事項

### Workers 限制
- 免費版 CPU 時間 10ms，付費版 30 秒
- Request body 免費版 100MB
- 所有長時間任務必須走 Queue

### 錯誤處理
- 每個第三方 API call 都要 try-catch + retry
- 失敗要寫 log
- Queue 任務失敗要能重試

### 前端考量
- 如果 Dashboard 變得很複雜，考慮前後分離
- 前端 → Cloudflare Pages（React + Vite）
- API → Cloudflare Workers（Hono）

## TODO
- 注意github的Vercel App
- 確認有哪些常見但是vercel不支援的 丟給AI決定
- 買Domain
- 流程優化
- i18n
- ~~登出功能~~
- ~~gallery~~

## Gallery功能

1. 最上方新增Gallery連結 會跳轉到Gallery頁面
2. 專案部署後 預設為Public 會放到Gallery
3. 設定頁面 新增描述功能 讓用戶可以在這邊打描述 然後顯示在Gallery

---

## 程式碼優化計畫

> 以下為全面 code review 後整理出的優化項目，依優先順序排列。

### 優先度 1：刪除 Dead Code

3 個 island 檔案從未被任何 route 引用，功能都已 inline 到 `project-detail.tsx`，屬於無用程式碼：

| 檔案 | 行數 | 說明 |
|------|------|------|
| `app/islands/domain-setup.tsx` | 273 | 網域設定已 inline 在 project-detail |
| `app/islands/deploy-status.tsx` | 123 | 部署狀態 polling 已 inline 在 project-detail |
| `app/islands/cloudflare-connect.tsx` | 137 | Cloudflare 連結已 inline 在 project-detail |

- [x] 刪除上述 3 個檔案（共 533 行）

### 優先度 2：消除重複程式碼（DRY）

#### 2-1. `timeAgo` 函式重複 3 處
- [x] 提取到 `app/lib/time.ts`，三處改為 import

#### 2-2. `readFileAsBase64` + `traverseEntry` 重複 3 處
- [x] 兩個 island 改為從 `app/lib/file-reader.ts` import 函式

#### 2-3. Status config（狀態標籤/顏色）重複 3 處
- [x] 提取到 `app/lib/status.ts`

#### 2-4. API routes 重複的「查詢專案 + 權限檢查」模式
- [x] 提取到 `app/lib/project-helpers.ts`（含 `getProjectByIdAndUser`、`getUserWithTokens`、`decryptUserToken`）

### 優先度 3：程式碼規範修正

#### 3-1. 消除 `any` 類型（違反 CLAUDE.md 規則）
- [x] `app/islands/deploy-wizard.tsx`：`(file as any)` → `(file as unknown as { webkitRelativePath: string })`
- [x] `app/routes/api/projects/[id]/status.ts`：`newStatus as any` → 正確的 union type assertion
- [x] `app/routes/api/projects/[id]/domain.ts`：`({}) as any` → 正確的型別

#### 3-2. `function` 宣告改為 arrow function（違反 CLAUDE.md 規則）
- [x] `app/lib/constants.ts`：`shouldIgnore`
- [x] `app/lib/file-reader.ts`：`readFileAsBase64`、`traverseEntry`
- [x] `app/lib/session.ts`：`sessionMiddleware`
- [x] `app/lib/auth-guard.ts`：`requireAuth`
- [x] `app/lib/id.ts`：`generateId`、`generateSubdomain`
- [x] `app/lib/detect.ts`：`detectFramework`
- [x] `app/db/index.ts`：`getDb`

### 優先度 4：安全性改善

#### 4-1. Session KV 儲存了明文 Token
- `app/routes/api/auth/github/callback.ts:85`：`session.githubToken = accessToken`
- `app/routes/api/auth/vercel/callback.ts:54`：`session.vercelToken = tokenData.access_token`

DB 中 token 有加密儲存（正確），但 session KV 卻存了明文（有風險）。所有 API route 都是從 DB decrypt token，session 中的 token 實際上未被使用。
- [x] 移除 session 中的 `githubToken` 和 `vercelToken`，僅保留 `userId`
- [x] 清理 `SessionData` interface

### 優先度 5：效能改善

#### 5-1. Gallery 頁面 OG image 在每次請求時 fetch
`app/routes/gallery.tsx:69-81` 會在每次頁面載入時對沒有 cache 的專案發起外部請求抓取 OG image。
- [ ] 考慮改為背景任務或只在部署完成時抓取一次

### 最後：格式化
- [ ] 所有修改完成後，執行 `npx prettier --write "app/**/*.{ts,tsx}"` 確保格式一致