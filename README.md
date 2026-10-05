<div align="center">

<img src="https://img.shields.io/badge/JitDrive-智能云盘-E64C3D?style=flat-square" alt="JitDrive" />

# JitDrive · 智能云盘

**会读文件的自托管云盘** · The self-hosted cloud drive that reads your files · ファイルを「読める」セルフホスト型クラウドドライブ

[![Next.js](https://img.shields.io/badge/Next.js-14%20App%20Router-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5-SQLite-2D3748?style=flat-square&logo=prisma)](https://prisma.io/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#-license--开源协议)

**中文** · [English](#english) · [日本語](#日本語)

</div>

---

> 📁 **Repo**：https://github.com/jitOffice/JitDrive
> 一个开箱即改的全栈智能云盘 starter — clone、`npm i`、`npm run dev`，三步跑起来。你的数据、你的服务器、你的规则。

**存得下，读得懂，守得住。** JitDrive 用 Next.js 14 + TypeScript + Prisma/SQLite 把「传统网盘只做存储」升级为「会读文件的助手」：多级目录、全类型在线预览、`.docx` 高保真协同编辑、AI 智能标签 / 重复检测 / 敏感扫描 / 智能推荐，以及四种分享链接（公开 / 加密 / 白名单 / 协作）。零外部数据库依赖，完全自托管、隐私可控。

---

## ✨ 为什么选 JitDrive · Highlights

<table>
<tr>
<td width="50%">

### 🧠 AI 智能层（零 LLM 依赖）
- **智能标签建议** — 扩展名 + 关键词 + 目录上下文，三档置信度
- **重复文件检测** — 上传即算 `sha256`，索引级去重、可释放空间一目了然
- **敏感内容扫描** — 身份证 / 银行卡 / 私钥 / AKIA / 明文密码，regex + Luhn + 熵值启发式
- **智能推荐** — recency × frequency × edit 加权排序，首页「你可能想找」
- 🚩 产品红线：**AI 只提示、不动手** — 不自动删除、不自动外发、不自动改文档

</td>
<td width="50%">

### 📂 真正的云盘体验
- **多级文件夹** — `Folder` 树 + 面包屑 + 移动到 + 级联软删 + 循环检测
- **全类型在线预览** — `docx/xlsx/pptx/pdf/ofd/txt/md/html` + 图片/音视频/压缩包
- **高保真协同编辑** — `.docx` 浏览器端 `importDocx` 解析，服务端零负担
- **四种分享链接** — 公开 / 加密口令 / 白名单 / 邀请协作，含二维码
- **回收站生命周期** — 软删可还原，彻底删除物理文件进系统废纸篓（绝不 `unlink`）
- **真实账号体系** — 邮箱密码（scrypt）+ 邀请码注册 + 签名会话 Cookie，多用户数据隔离

</td>
</tr>
</table>

---

## 🚀 快速开始 · Quick Start

```bash
# ① 克隆
git clone https://github.com/jitOffice/JitDrive.git
cd JitDrive

# ② 装依赖（postinstall 自动 prisma generate）
npm install

# ③ 配置密钥（见下方环境变量，仓库已预置 demo 值）
cp .env.example .env.local   # 若存在模板；否则按第 3 节手写 .env.local

# ④ 建库（SQLite 文件落在 data/jitdrive.db）
npm run db:push

# ⑤ 起服务（默认 3000 端口）
npm run dev
```

打开 http://localhost:3000 会先看到**官网营销页**；云盘 App 挂在 **`/drive`**（未登录自动跳登录）。

**演示账号**（统一密码 `demo1234`，登录页有「一键填入」）：

| 账号 | 姓名 |
| --- | --- |
| `alice@jitdrive.dev` | 徐晓溪 |
| `bob@jitdrive.dev` | 李四 |
| `carol@jitdrive.dev` | 王五 |
| `dave@jitdrive.dev` | 赵六 |

**注册新账号**：主邀请码 `JITDRIVE-DEMO`（不限次、不消耗）；登录后头像菜单可生成一次性邀请码。

```bash
npm run typecheck   # tsc --noEmit
npm run build       # 生产构建
npm start           # 生产启动
```

---

## ⚙️ 环境变量 · Environment（`.env.local`）

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `JITWORD_API_BASE` | ✓ | JitWord 服务端 API，通常 `https://inner.jitword.com/api/v1` |
| `JITWORD_EDITOR_URL` | ✓ | 编辑器地址，通常 `https://inner.jitword.com/px-editor` |
| `JITWORD_TENANT_KEY` | ✓ | 后台 tenantKey（demo 为 `demo`） |
| `JITWORD_PROVIDER_KEY` | ✓ | 应用标识（demo 为 `jitword-sdk-demo`） |
| `JITWORD_CLIENT_SECRET` | ✓ | **服务到服务密钥**，只在 `lib/jitword.ts` 出现；泄漏必须重置 |
| `DATABASE_URL` | ✓ | SQLite 连接串 `file:../data/jitdrive.db`；迁 Postgres 换连接串 + `provider` |
| `SESSION_SECRET` | ✓ | 签名会话 Cookie 的 HMAC 密钥（长随机串），换掉即所有登录失效 |
| `DEMO_PUBLIC_ORIGIN` | 反代下必填 | 显式回传给 JitWord 的 origin，避免 `origin mismatch` |
| `DEMO_INVITE_CODE` | 可选 | 主邀请码，默认 `JITDRIVE-DEMO` |
| `DEMO_USER_PASSWORD` | 可选 | 演示账号统一初始密码，默认 `demo1234` |
| `STORAGE_QUOTA_BYTES` | 可选 | 每人配额（字节），默认 `1 GB`；为付费档位预留 |
| `CRON_SECRET` | 可选 | 回收站到期清理钩子 `POST /api/internal/reap` 的 Bearer 令牌；未配置返回 503 |
| `TRASH_RETENTION_DAYS` | 可选 | 回收站保留天数，默认 `30` |

> 🔐 `JITWORD_CLIENT_SECRET`、`SESSION_SECRET` **绝不**进浏览器包；凡是 `NEXT_PUBLIC_*` 都会泄漏，本项目不将密钥暴露到客户端。

---

## 🏗️ 架构与技术栈 · Architecture

```
Next.js 14 (App Router) ── server components + route handlers 同仓同进程
        │
        ├─ Prisma 5 + SQLite  ── seam 层（lib/store.ts）可对上 Postgres，一行配置切换
        ├─ JitWord iframe SDK ── .docx 协同编辑 + 浏览器端 document.importDocx 解析
        ├─ JitWord Preview SDK ── office/pdf 等只读渲染（脚本加载失败自动降级下载卡）
        └─ lib/smart/*         ── AI 智能层：hash / sensitive / tags / recommend / store
```

**关键设计**：

- **存储 seam**：`lib/store.ts` 对上层保持 `FileRecord` DTO 与 `list*/getFile/putFile` 签名不变，换存储只动这一个文件；时间戳统一 `BigInt`（epoch 毫秒），规避 32 位 `Int` 溢出。
- **类型策略单一来源**：`lib/filetypes.ts` 集中扩展名 / MIME / 大小上限 / kind 派生；库里只存 `extension + mime`，**不存 kind**，白名单一变老数据自动重分类。
- **鉴权分层**：JitDrive 应用层（`ownerId + FileShare`）与 JitWord 服务层（`externalSubject`，落库为 `File.jwSubject`）解耦，互不越权。
- **AI 边界安全**：任何被 `'use client'` 组件引用的模块，其递归依赖闭包**不能有 `node:*` / `fs/promises`**——故 `lib/smart/sensitive` 拆出 client-safe 的 `sensitive-core.ts`。
- **路由 seam**：所有页面 URL 收敛到 `lib/routes.ts`，未来换前缀只改一行；`/api/*`、Cookie `path:'/'`、`/login`·`/register`、`/s/[code]` 分享子树刻意不动。

---

## 🔗 分享能力 · Sharing

一条链接覆盖整棵目录子树（`fileId XOR folderId`，动态可见而非冻结快照）。四种模式一键切换，接收方从 `/s/[code]` **匿名可打开**（挂在鉴权路由组外，全链路 `noindex`）。

- **公开链接**：谁拿到谁能看。
- **加密链接**：短码 + 访问口令（scrypt）+ 进程内滑动窗口限速防爆破（15 分钟 5 次失败锁 15 分钟）。
- **白名单链接**：仅指定用户可见（`ShareLinkUser` 三态门：未登录 401 / 名单外 403 / 命中直放），与口令互斥。
- **邀请协作**：沿用花名册 `FileShare`，非所有者强制只读。

进阶：二维码即时生成 · 过期时间 / 浏览次数上限 / 允许下载开关 · 一键撤销即时生效 · 访问明细统计 · 「我的分享」批量管理台。

---

## 🧭 路线图 · Roadmap

| 版本 | 状态 | 主题 |
| --- | :---: | --- |
| v0.1 – v0.6.1 | ✅ | 集成闭环 → 协同云盘 → 真实账号 → 目录层级 → 多类型预览 → 分享运营化 → 官网迁移 |
| **v0.7** | ✅ | **AI 智能 P0（零 LLM 依赖）**：智能标签 · 重复检测 · 敏感扫描 · 智能推荐 |
| v0.8 | 🚧 规划 | LLM 集成：语义搜索 · 单文档摘要 / 问答 · OCR · `FileInsight` 表 · 用户同意流 |
| v1.0 | 🔭 愿景 | 智能体与自动化：跨文件问答 RAG · 工作流 DSL · 智能归档 · 会议纪要 · 周报 digest |

详细产品/架构决策见 [`docs/PRD.md`](docs/PRD.md)、[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)、[`docs/PLAN-v0.7.md`](docs/PLAN-v0.7.md)。

---

## 📸 截图 · Screenshots

> _（占位）把你的界面截图放到 `docs/images/` 后替换：_ `![drive](docs/images/drive.png)`
> 建议展示：官网首页 · 云盘首页（卡片 / 目录树双视图） · `/drive/smart` AI 智能面板 · 分享弹窗 · 高保真编辑页

---

<a id="english"></a>

## 🌐 English

> **A self-hosted smart cloud drive that actually reads your files.**
> Clone-and-ship full-stack starter: **Next.js 14 · TypeScript · Prisma/SQLite**. It goes beyond storage — nested folders with card/tree views, in-browser preview for docx/xlsx/pptx/pdf/ofd/txt/md/html/images/audio/video/archives, and high-fidelity collaborative `.docx` editing (parsed client-side via `importDocx`, zero server load).

**Why JitDrive**

- 🧠 **Built-in AI layer (no LLM vendor needed)** — smart tag suggestions, `sha256` duplicate detection, sensitive-content scanning (ID numbers, bank cards, private keys, AWS keys, plaintext passwords via regex + Luhn + entropy), and "you might be looking for" recommendations. Hard product rule: **the AI only surfaces insights — it never auto-deletes, auto-shares or auto-edits.**
- 📂 **Real cloud-drive UX** — nested folder tree, breadcrumbs, move-to, cascade soft-delete, cycle detection; trash with restore / purge (physical files go to system Trash, never `unlink`).
- 🔐 **Genuine accounts & isolation** — email + password (scrypt), invite-code registration, HMAC-signed session cookies; every user's files are server-side filtered and isolated.
- 🔗 **Four share modes** — public, password-protected (rate-limited against brute force), allowlist (invite-only), collaborator rosters; each with QR codes, expiry, view limits, download toggles and instant revoke. A single folder link dynamically covers the whole subtree.
- 🏗️ **Migration-friendly architecture** — `lib/store.ts` is a repository seam (swap SQLite→Postgres in one place); `lib/filetypes.ts` is the single source for file kinds; all page URLs live in `lib/routes.ts`.

**Quick start**

```bash
git clone https://github.com/jitOffice/JitDrive.git && cd JitDrive
npm install
npm run db:push        # SQLite at data/jitdrive.db
npm run dev            # http://localhost:3000  → app lives at /drive
```

Demo logins (`demo1234`): `alice@jitdrive.dev` · `bob@jitdrive.dev` · `carol@jitdrive.dev` · `dave@jitdrive.dev`. Main invite code: `JITDRIVE-DEMO`.

Configure `JITWORD_*` keys, `DATABASE_URL` and `SESSION_SECRET` in `.env.local` (see the table above). Secrets stay server-side only — nothing `NEXT_PUBLIC_*` is leaked to the browser.

**Roadmap** — v0.7 (AI P0) shipped ✅ · v0.8: LLM-powered semantic search, per-document summary & Q&A, OCR, `FileInsight` table, user-consent flow · v1.0: cross-file RAG, workflow automation, smart archiving, meeting-minutes agent.

Deep dive: [`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/PLAN-v0.7.md`](docs/PLAN-v0.7.md).

---

<a id="日本語"></a>

## 🗾 日本語

> **ファイルを「読める」セルフホスト型クラウドドライブ。**
> Next.js 14 · TypeScript · Prisma/SQLite で構築した、クローンしてすぐ改良できるフルスタックスターター。単なる保存にとどまらず、多階層フォルダ・全形式のブラウザ内プレビュー・`.docx` の高精度共同編集（クライアント側 `importDocx` で解析、サーバー負荷ゼロ）を提供します。

**特徴**

- 🧠 **AI インテリジェンス層（LLM ベンダー不要）** — 賢いタグ提案、`sha256` 重複ファイル検出、機密コンテンツ走査（身分証・銀行カード・秘密鍵・AWS キー・平文パスワードを regex + Luhn + エントロピーで検出）、「探しているかもしれないファイル」レコメンド。製品上の絶対ルール：**AI は提案のみで、自動削除・自動共有・自動編集はしません。**
- 📂 **本物のクラウドドライブ体験** — 多階層フォルダツリー・パンくず・移動・カスケード論理削除・循環検出。ゴミ箱は復元/完全削除が可能（物理ファイルはシステムのゴミ箱へ、`unlink` は一切使用しません）。
- 🔐 **実アカウントとデータ分離** — メール＋パスワード（scrypt）、招待コード登録、HMAC 署名付きセッション Cookie。全ユーザーのファイルはサーバー側でフィルタリングされ完全に分離されます。
- 🔗 **4 種類の共有リンク** — 公開 / 暗号化（総当たり対策のレート制限付き）/ ホワイトリスト（招待限定）/ 共同編集者。いずれも QR コード・有効期限・閲覧回数上限・ダウンロード可否・即時取り下げに対応。1 つのフォルダリンクがサブツリー全体を動的にカバーします。
- 🏗️ **移行しやすい設計** — `lib/store.ts` はリポジトリシーム（SQLite→Postgres を 1 箇所で切替）、`lib/filetypes.ts` がファイル種の単一定義元、全ページ URL は `lib/routes.ts` に集約。

**クイックスタート**

```bash
git clone https://github.com/jitOffice/JitDrive.git && cd JitDrive
npm install
npm run db:push        # SQLite は data/jitdrive.db
npm run dev            # http://localhost:3000 → アプリは /drive
```

デモアカウント（パスワード `demo1234`）：`alice@jitdrive.dev` · `bob@jitdrive.dev` · `carol@jitdrive.dev` · `dave@jitdrive.dev`。メイン招待コード：`JITDRIVE-DEMO`。

`.env.local` に `JITWORD_*` 鍵・`DATABASE_URL`・`SESSION_SECRET` を設定してください（上の表を参照）。シークレットはサーバー側のみに留まり、ブラウザには一切公開しません。

**ロードマップ** — v0.7（AI P0）提供済み ✅ · v0.8：LLM によるセマンティック検索・文書要約/Q&A・OCR・`FileInsight` テーブル・同意フロー · v1.0：クロスファイル RAG・ワークフロー自動化・スマートアーカイブ・議事録エージェント。

詳細：[`docs/PRD.md`](docs/PRD.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/PLAN-v0.7.md`](docs/PLAN-v0.7.md)。

---

## 🛠️ 排错速查 · Troubleshooting（精选）

| 现象 Symptom | 解法 Fix |
| --- | --- |
| 打开就跳 `/login` 登不进去 | 先 `npm run db:push`；确认 `.env.local` 有 `SESSION_SECRET`；重启 |
| `Value does not fit in an INT column` | 时间戳列必须 `BigInt`；改回后 `npm run db:push` |
| 编辑器一直转圈 `HANDSHAKE_TIMEOUT` | CSP 需放行 `frame-src https://inner.jitword.com`；硬刷 |
| `embed ticket origin mismatch` | 设 `DEMO_PUBLIC_ORIGIN` 为浏览器 `location.origin` 完全一致值 |
| `409 ticket has already been used` | ticket 一次性，别缓存；`getEmbedTicket` 每次直接 fetch |
| 上传后 `contentHash` 为空（AI） | 补 `putFile` upsert 的 `create:{...}` 分支；`db push` 后重启 dev 让 Prisma client 热重载 |
| `UnhandledSchemeError: node:path`（构建） | 被 client 组件引用的模块不能有 `fs/node:*`，纯函数拆 `-core`（见 ARCHITECTURE §4.36） |
| 预览报「预览服务不可达」 | jitword.com CDN 抖动；`lib/preview-sdk.ts` 有 8s 超时降级，点「重新加载 / 下载」 |
| 音视频拖动无效 | 反代透传 `Range` 头：`proxy_set_header Range $http_range;` |

> 完整排错清单见项目内文档；CSP 生产配置需同时放行 `frame-src` / `script-src` / `connect-src` 到 `inner.jitword.com` 与 `jitword.com`。

---

## 🤝 致谢 · Acknowledgments

编辑器与预览能力由 **JitWord** iframe SDK 与 Preview SDK 提供；数据层用 **Prisma**，样式用 **Tailwind CSS**。本项目为集成参考 Demo，密钥为演示用途，请勿用于生产。

## 📄 License · 开源协议

[MIT](#) © JitOffice — 自由使用、修改、分发，保留署名。

<div align="center">

如果这个项目对你有帮助，欢迎点个 **⭐ Star** 支持一下 · If it helps, a ⭐ means a lot · 役立ったなら ⭐ で応援を！

**[⬆ 返回顶部 Back to top](#jitdrive--智能云盘)**

</div>
