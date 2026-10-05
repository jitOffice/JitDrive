# JitDrive · 极简云文档产品需求文档（PRD）

**版本**：v0.5.2  · **作者**：产品（JitWord PM 视角） · **状态**：v0.1 / v0.2 / v0.3 / v0.3.1 / v0.4 / v0.4.1 / v0.5 / v0.5.1 已交付 · v0.5.2「**目录分享**（ShareLink 泛化 fileId XOR folderId + 匿名子路由 `/s/[code]/d/[folderId]` + `/s/[code]/f/[fileId]`） + 卡片 / 目录树切换按钮左对齐」本次落地
**关联项目**：jitword-sdk-demo · **技术栈基线**：Next.js 14 全栈 + JitWord iframe SDK + JitWord-Preview SDK + Prisma / SQLite
**评审目标**：把云盘的分享能力从"只能指定花名册用户共享"升级为"三种分享场景一键切换 + 完全匿名可访问"：**公开链接**（任何拿到 URL 的人可预览，无密码）、**加密链接**（短码 + 访问密码，HMAC 签名解锁 Cookie + 失败次数限速防爆破）、**邀请协作**（沿用 v0.2 花名册 FileShare 只读名单，用户可见"共享给我"）。三种模式共享同一 `<ShareDialog>` 组件（`FileList` 溢出菜单 / `FileHeader` / `ViewHeader` 三处入口），生成后立即给出**可复制的分享链接 + 二维码**；接收方在完全匿名场景下访问 `/s/[code]`（独立于 `(drive)` 路由组，避开 Sidebar 鉴权门），页面按 kind 分派 JitWord iframe 只读预览（docx）或 JitWord-Preview SDK / 原生 `<img> / <audio> / <video>`；过期、访问次数上限、是否允许下载都在链接维度控制，owner 可以随时撤销。docx 编辑闭环、多类型预览、目录层级完全保留、不受影响

---

## 1. 一句话定位

JitDrive 是一个 **文档协同 SaaS 的最小可用云盘**：把本地 .docx 上传到浏览器，一键进入 JitWord 在线预览与协同编辑，编辑结果可导出回 .docx。核心不为「做一个新云盘」，而是为 JitWord iframe SDK 提供一个可信、可演示、可复用的客户集成模板。

## 2. 目标用户与使用场景

主要面向三类角色，覆盖从售前演示到集成落地的完整语境。

**售前 / 客户成功** 需要一个能立刻演示「本地 Word → 云文档」的载体，用它把 iframe SDK 的接入复杂度、鉴权模型、协同能力具象化，把「能不能做」变成「这样就能跑」。**外部开发者 / 集成工程师** 需要一份「抄过去就能改」的样板代码：清晰的服务端 / 前端边界、密钥只出现在服务端、一次性 ticket 的正确用法、`getEmbedTicket` 的刷新语义。**内部 PM / 设计** 需要一个可迭代的功能沙盘，验证 UI 概念（WPS 风格云盘首页 + 文件卡片 + 编辑预览二态）。

## 3. 关键用户故事

**US-1 · 上传即开编辑。** 作为业务用户，我把一个本地 .docx 拖到首页，云盘自动解析、在 JitWord 建对应文档、跳转到编辑页；首次进入时原文自动落到 JitWord 画布上，我立即可以在里面改。验收：从 drop 到编辑器可见 ≤ 5s；原文段落、加粗、列表基本还原；导入完成后刷新页面不会重复导入。

**US-2 · 只想快速看一眼。** 作为业务用户，我在文件卡片点「预览」，用轻量方式打开文档只读视图，不希望启动协同 websocket、不希望占用编辑权限。验收：URL 带 `?mode=preview`；ticket 的 scopes 只到 `document:read`；iframe 走 `/embed/preview/:docId` 静态渲染路径。

**US-3 · 拉同事一起改。** 作为文档所有者，我复制当前编辑页 URL 给同事，他在自己的浏览器打开就能看到同一份文档，双方改动实时互见。验收：同一 `docId` 多标签页协同生效；`onlineUsersChanged` 事件在 SDK 侧可见。

**US-4 · 一键回到本地 Word。** 作为业务用户，编辑完成后我点「下载原 .docx」拿到上传时的原始版本，或者用编辑器右上角「导出」拿到当前最新编辑版本。验收：原始下载走我们自己的存储；导出版本走 JitWord 的 `document.exportDocx`（Demo 环境暂不支持 PDF 导出，UI 层需明确标灰）。

**US-5 · 集成工程师复现部署。** 作为客户工程师，我 clone 仓库，把 `.env.local` 里的 JitWord 三密钥（tenantKey / providerKey / clientSecret）和一个 `SESSION_SECRET` 换成自己的，`npm i && npm run db:push && npm run dev` 就能起。验收：README 步骤内跑通；数据落在本地单文件 SQLite（`data/jitdrive.db`），无需预置任何外部数据库服务。

---

> 以下 US-6 ~ US-9 随 v0.2「协同云盘骨架」交付；US-10 ~ US-13 为 v0.3「真实账号体系」新增，均已落地。身份不再是 cookie 模拟花名册，而是**真实邮箱+密码账号**（首次运行播种 4 个演示账号：alice/bob/carol/dave@jitdrive.dev，密码 `demo1234`），注册需邀请码，且不同账号之间文件数据完全隔离。

**US-6 · 快速找回我刚看过的文档（最近打开）。** 作为业务用户，我想知道最近打开/编辑过哪些文档，不用在全部文件里翻。验收：左侧「最近打开」列出当前身份有权访问且未删除、按 `lastAccessedAt` 倒序的文档；每次打开编辑/预览页会自动埋点（`POST /api/files/[id]/touch`），无需手动操作。

**US-7 · 处理同事分享给我的文档（共享给我）。** 作为同事（非所有者），别人分享给我的文档应该出现在一个独立列表里，我只能看不能改。验收：用同事账号登录后，「共享给我」列出 `owner ≠ 我 且 我在 FileShare 只读名单里 且 未删除` 的文档；行内只有「查看」，标「只读」徽标与「来自 {所有者}」来源；点进编辑 URL 也会被服务端 ticket 强制降级为 viewer/readonly，前端拿不到编辑能力。

**US-8 · 删错了能救回来（回收站）。** 作为文档所有者，删除不应是即时不可逆的。验收：文件行「删除」→ 软删除（`deleted=true` + `deletedAt`），从我的云盘消失、进入「回收站」；回收站支持逐条「还原」、「彻底删除」，以及顶部「清空回收站」；彻底删除时物理文件通过 `moveToTrash` 移入系统废纸篓（绝不 `unlink`），元数据记录移除，页面显示 30 天保留期倒计时。

**US-9 · 把文档共享给指定同事。** 作为文档所有者，我可以选择把某份文档共享给用户目录里的某些账号。验收：文件行「共享」→ 弹窗（拉 `GET /api/users` 花名册）勾选同事 → `POST /api/files/[id]/share`（body `{subjectIds}`）写入 FileShare 只读名单；仅 owner 可操作，非 owner 调用返回 403；被共享方立刻在「共享给我」可见（只读）。

**US-10 · 用邀请码注册新账号。** 作为被拉进来的新用户，我用一个邀请码即可开号。验收：`/register` 填邮箱/昵称/密码 + 邀请码 → `POST /api/auth/register` 校验邮箱格式、密码 ≥ 6 位、邀请码有效后建号并直接登录；密码用 scrypt 加盐哈希存储。主邀请码（`DEMO_INVITE_CODE`）不限次且不被消耗；用户可在头像菜单「邀请同事加入」自助生成一次性邀请码（`InviteCode.usedById` unique，复用即 400）。

**US-11 · 登录 / 退出，会话可保持。** 作为回访用户，我登录后关掉浏览器再开还在登录态。验收：`POST /api/auth/login` 校验通过后写入 HttpOnly 签名会话 Cookie（`userId.exp.hmac`，HMAC-SHA256，30 天），`getActorId()` 从 Cookie 解析当前用户；未登录访问任意 `/` 云盘页由 `(drive)/layout` 服务端 `redirect('/login')`；「退出登录」`POST /api/auth/logout` 清 Cookie 并跳回登录页。

**US-12 · 我的文件别人看不到（数据隔离）。** 作为任一账号，我在云盘里只应看到自己拥有或分享给我的文档。验收：所有 `list*` 视图按当前登录用户 `ownerId / FileShare` 过滤；`GET /api/files/[id]`、下载、ticket 对既非我所有也未分享给我的文档返回 404；非 owner 的重命名/共享/删除/彻底删除返回 403。用 alice 上传的文档，切到 bob 登录时在「我的云盘」和全局搜索里都不出现。

**US-13 · 按标题快速找到文档（全局搜索）。** 作为文档变多的用户，我希望能像云盘那样在顶部直接搜标题定位文件。验收：顶栏搜索框对当前用户可见范围做**标题模糊匹配**（`GET /api/search?q=`，防抖输入、限 20 条、含所有者与共享文档，标注「只读/来自 xx」）；进入编辑 / 预览页（`/files/…`）时搜索框与新建/上传一并隐藏，避免在写文档时误触；点结果跳转对应文件页。

**US-14 · 编辑器有编辑工具条，但不重复顶栏。** 作为写作者，我在编辑模式下要看到 JitWord 的**编辑工具条**（字体 / 段落 / 列表 / 加粗等，正文正上方那一横排），但**不需要** JitWord 的顶栏（"文件"入口、AI 入口），因为文件菜单、下载、模式切换、返回云盘这些"外壳"操作已经由 JitDrive 自己的 FileHeader 承担，两套顶栏并排反而让用户迷惑。预览模式下只要干净的正文。验收：`EditorClient` 的 `createEditor.ui` 用 **`chrome:'toolbar'`**（编辑）/ **`chrome:'host'`**（预览）——早期版本写的是 `ui.toolbar`，SDK 已重命名为 `ui.chrome`，会被 profile 忽略回落默认 `host`（"什么都看不到"），曾一度改成 `chrome:'full'` 让 JitWord 顶栏跑出来跟 FileHeader 重复，最终锁定 `'toolbar'`；`types/jitword-sdk.d.ts` 也补齐 `chrome` 字段与新 SDK 方法（`insertContent / clearContent / setWatermark / getOnlineUsers / setSelection / scrollTo` 等，对齐 `manifest.json` capabilities）。运行时保留 `editor.setToolbar('full')` 兜底重试。

**US-15 · 编辑器内直接换正文（导入 Word）。** 作为文档所有者，我在编辑器里点「导入 Word」选一个 .docx，正文就应该被替换成这个文件的内容，不用回到云盘首页重新上传。验收（**v0.4.1 起**）：FileHeader 通过 `lib/editor-bridge.ts` 把用户选中的 `File` 直接交给 EditorClient 的 `importDocxFile`，后者调 iframe-sdk 1.1 的 `document.importDocx({ content, mode:'replace' })` 用 JitWord 官方引擎在浏览器内高保真解析并写入，随后 `editor.save()` 落库；客户端前置校验（仅 owner 编辑态、非 .docx 拒、>30MB 拒），SDK 返回值里的 `applied/importedComments/headerFooter/warnings` 汇总成 toast。**不再走** `POST /api/files/[id]/import` + mammoth + `htmlToSafeBlocks` + `setContent`（该服务端通道已降级为 410 Gone，解析不落服务端）。JitWord 顶栏的「文件」入口在嵌入模式下只能管在线文档列表、不接 .docx 导入（且我们主动关掉了 JitWord 顶栏），所以 Word 导入入口由我们自己的 FileHeader 提供。

> 以下 US-16 ~ US-18 随 v0.4「目录层级 + 多类型 + Preview SDK」交付。

**US-16 · 用目录整理我的云盘（Folder 树 + 面包屑 + 移动到）。** 作为文档越来越多的用户，我希望能像系统文件夹那样把文档分门别类放好，而不是在一个长列表里翻。验收：TopBar「新建」下拉里选「新建文件夹」→ 弹输入框 → `POST /api/folders {name, parentId?}` 建立；`Folder{id, ownerId, parentId?, name, deleted, deletedAt, deletedViaParentId?, createdAt, updatedAt}` 是**自引用森林**，同 parentId 下 `(ownerId, parentId, name, deleted=false)` 应用层查重（重名 409）；根页面通过 `?folderId=<id>` 进入子目录，渲染 `<Breadcrumb>`（我的云盘 › 一级 › 二级…，非末级可点，末级加粗不链），下面同时列出该目录直接子 Folder（`FolderGrid`）与 File（`FileList.currentFolderId=folderId`）；Folder 与 File 行都有「移动到」→ 打开 `MoveToFolderDialog`，`GET /api/folders` 拉平铺树，前端做定点迭代剔除自己+子孙（防自锁），确认后 `PATCH /api/folders/[id]` 或 `PATCH /api/files/[id]` 带 `{parentId}`；后端 `moveFolder` 再沿新 `parentId` 上溯，遇到自己返回 **409 「不能把文件夹移动到它自己的子目录下」**（深度硬闸 64 防脏数据）。删 Folder 走**级联软删**——`deletedViaParentId=<顶层 Folder.id>` 打标批次，回收站能看到「整个文件夹（含 N 项）」和内部单文件两种粒度，还原时按批次一起活；共享暂只到文件粒度（Folder 级共享推到 v0.5，UI 上 Folder 行的「共享」按钮隐藏）。

**US-17 · 上传任意常见文件都能预览（多类型 + Preview SDK + Range）。** 作为云盘用户，我不该被强制「只能传 Word」——一份 PDF、一张截图、一段录屏都应该能存、能就地看。验收：`lib/filetypes.ts` 集中白名单（`FileKind = 'jitword' | 'previewable' | 'image' | 'audio' | 'video' | 'archive' | 'other'`；office docx/xlsx/pptx/pdf/ofd/txt/md/html、图片 png/jpg/jpeg/gif/webp/svg/bmp、音视频 mp3/wav/m4a/aac/ogg/opus/mp4/mov/webm、zip/rar/7z/tar/gz；`kindOf(name)`、`kindOfExt(ext)`、`acceptAttrFor(purpose)`、`maxSizeFor(kind)`、`isJitwordDoc(name)` 一个模块导出）；`POST /api/files` 按 kind 分流——docx 走原 JitWord 建文档 + mammoth 暂存通道不变，其他 kind 只落 `data/uploads/<id>/<rev>/<safeName>` 并写 `File.extension/File.mime`（服务端 `mmDetect` 嗅探 magic bytes 兜底，不信客户端 `file.type`），**kind 永远从 extension 派生、不入库**（改一次白名单老数据自动重新分类，不会漂移）；`kind='jitword'` 才有 `docId/jwSubject` 与非空 `pendingImport`，其他 kind `docId=null`；`FileList.openHref(f, mode)` 按 kind 分流：jitword → `/files/[id]?mode=…`（JitWord iframe），其他 → `/files/[id]/view`（`PreviewClient` 分派）；`PreviewClient` 里 `previewable` 动态注入 `https://jitword.com/preview_sdk/file-preview.bundle.js`（`lib/preview-sdk.ts` 单例 Promise + 8s 超时保护），拿 `window.JitWordFilePreview.createFilePreview(el).open('/api/files/<id>/raw')`——因为是 same-origin fetch，HttpOnly 会话 Cookie 会自动带上（不同于早期 iframe 里跨站图片 Cookie 带不上的坑）；`image/audio/video` 用浏览器原生 `<img>` / `<audio controls>` / `<video controls>`，`src` 同样指向 raw；`archive/other` 显示「下载查看」卡片，不做预览（zip-bomb 风险 + SDK 官方也不承诺）。raw 路由 `GET/HEAD /api/files/[id]/raw` 强制鉴权 + 支持 `Range: bytes=start-end` → `206 + Content-Range`（音视频拖动进度条依赖此项），`416` 处理不满足范围，响应头 `Content-Disposition: inline; filename*=UTF-8''…` + `X-File-Kind` + `X-File-Extension`；非授权一律 **404 而不是 403**（不泄露文件是否存在）；未登录 `POST /api/files/[id]/ticket` → 401，非 docx 走 ticket → 415。TopBar「上传 Word」改成「上传文件」，`<input accept>` 由 `uploadAcceptAttr()` 提供，可 `?folderId=…` 上传到当前目录。

**US-18 · 首次升级不用手动整理（老文件自动归档）。** 作为 v0.3 老用户，我上一次跑还是扁平列表，升到 v0.4 突然多出目录概念，不希望打开云盘看到「一片狼藉」，也不想被要求手动建一个 folder 把老 docx 拖进去。验收：`lib/bootstrap.ts::archiveLooseFiles()` 每次启动**幂等**跑一次——`prisma.file.groupBy({by:['ownerId'], where:{parentId:null, deleted:false}})` 找出根目录还有裸文件的用户，对每个用户：若已存在同名 folder「我的文档（已归档）」则复用，不存在则新建；然后 `updateMany({ where:{ ownerId, parentId:null, deleted:false }, data:{ parentId: archiveFolder.id } })`；已有 `parentId` 的行**不再动**（用户自己整理过的目录结构保留）。归档动作只在 bootstrap 里发生一次，UI 上不显示「已归档」的提示（避免用户以为这是回收站）；用户可以随时把这个 folder 改名或把里面的东西挪出去——一旦挪出根目录，下次启动 `archiveLooseFiles` 就不会再拉回来。老 docx 的 `docId/jwSubject/pendingImport` 均保持不变，编辑闭环无感。

> US-19 ~ US-21 随 v0.5 交付；US-22 随 v0.5.1 补齐「仅指定用户可见」白名单链接、可搜索邀请面板与两栏式首页。

**US-19 · 三种分享模式一键切换（公开 / 加密 / 邀请协作）。** 作为文档所有者，我分享文件的场景大致三类——「群发到群里，谁拿到谁能看」（公开）、「发给客户但要设个口令」（加密）、「指定内部同事查看并出现在他的『共享给我』」（邀请协作）。验收：文件页（`FileHeader`）与预览页（`ViewHeader`）的**下载按钮左侧**统一挂一个 `<Icon name="share"/> 分享` 按钮（仅 owner 且非"来自他人只读"时可见）；`FileList` 行"更多 ⋯"里也保留同一个入口；三处入口点开都是同一个 `<ShareDialog>` 组件（`components/ShareDialog.tsx`），Tab 切换「分享链接」（新）与「邀请协作」（沿用 v0.2 `FileShare` 花名册勾选）。链接 Tab 里三张预设卡片（`LinkPane.tsx`）：**公开链接**（无密码，任何拿到 URL 的人可读）· **加密链接**（默认自动生成 6 位 base32 随机口令，字母表去掉易混淆的 `IO01`，可改）· **仅指定用户**（v0.5.1 交付：选中后用 `<UserPicker>` 搜索并添加同事，链接变成"登录 + ShareLinkUser 白名单"双重门，名单外的人即便拿到链接也只能看到「无访问权限」，与加密模式互斥）；卡片下方"高级选项"折叠区放出过期时间（不过期 / 1 天 / 3 天 / 7 天 / 30 天 / 自定义）、访问次数上限（不限 / 1 / 10 / 100 / 自定义，1-10000）、是否允许下载（勾选框）三项。生成后立刻在页面显示**完整链接 + 二维码 + 复制链接 / 打开预览 / 撤销**按钮，二维码用客户端 `qrcode` npm 包（`QrCard.tsx`）渲染 SVG，`errorCorrectionLevel: 'M'` + `margin: 1`；下方"已生效链接"列表把当前文件的所有活跃 ShareLink 按创建时间倒序列出，可再次撤销或改高级选项（`PATCH /api/share-links/[code]`）。owner 之外的用户访问任何 owner 端点（`POST /api/files/[id]/share-links`、`GET/PATCH/DELETE /api/share-links/[code]`）都得到 **403**，非存在 code 得 **404**（不泄露 code 归属）。

**US-20 · 匿名接收方也能正常预览（`/s/[code]` 落地页）。** 作为拿到分享链接的接收方，我可能根本没注册 JitDrive 账号——不该被强制拉去登录才能看内容。验收：`/s/[code]` 路由**刻意挂在 `(drive)` 组之外**（`app/s/[code]/page.tsx` + 独立 `layout.tsx`，只放一个极简 header "JitDrive logo + 进入我的云盘"），彻底绕过 Sidebar 服务端鉴权门；SSR 内部按 `authorizePublic(code)` 分派：`not-found(404)` / `revoked(410)` / `expired(410)` / `view-limit(410)` / `file-gone(410)` 五种失败态各自有独立文案（`ShareError.tsx`），需要密码但未解锁时渲染 `<PasswordGate>` 表单，其他失败态直接把用户挡在门外、绝不下发文件名 / 所有者 / 大小等元数据。解锁成功后（`POST /api/share/[code]/unlock`）写入 `jw_share=<code>.<exp>.<hmac>` 独立 HttpOnly Cookie（HMAC-SHA256 + `SESSION_SECRET`），前端调 `router.refresh()` 让 SSR 重跑一次立即进入正常渲染。渲染按 kind 分派：**jitword**（docx）走 `<ShareEditorClient>` 简化版 iframe（`mode:'preview'` + `ui:{readonly:true, chrome:'host'}`，ticket 从 `/api/share/[code]/ticket` 换，`role:'viewer' scopes:['document:read']` 硬编码不可提权）；**previewable** 走 `<ShareFilePreview>` 的 SdkPreview 分支（复用 JitWord-Preview SDK，绝对 URL 拼 `/api/share/[code]/raw`）；**image/audio/video** 走原生 `<img>/<audio>/<video>` src 同样指向 share raw；**archive/other** 只显示下载卡片（`allowDownload=false` 时隐藏下载按钮）。所有 share 端点响应头带 `X-Robots-Tag: noindex, nofollow`，页面 `<meta name="robots" content="noindex, nofollow">`，避免搜索索引意外泄漏。viewCount 只在 `/s/[code]` SSR 成功分支中 `recordView(id)` 递增一次，从 raw / ticket 子资源请求**不重复计数**（防止 PDF 分片下载或 iframe 握手把浏览次数打爆）。

**US-21 · 加密链接要能防爆破、可撤销、可过期。** 作为把文档加密分享给外部客户的用户，我担心两件事：口令被脚本暴力撞开、链接失控后无法收回。验收：**防爆破**——`lib/share.ts` 内置**内存级滑动窗口限速**（key = `${ip}|${code}`，15 分钟窗口内累计 5 次失败即锁 15 分钟），命中 `isLocked(ip,code)` 时 `POST /unlock` 直接 429 返回"尝试次数过多，请稍后再试"；早期版本用过 `{fails, until}` 字段结构，会因"首次失败就把 `until = now + WINDOW_MS`"导致一次输错立即锁号——v0.5 已重写为 `{fails, windowStart}` 语义：只在 `fails >= MAX_FAILS && windowStart + WINDOW_MS > now` 才锁；限速表就是 Node 进程内 `Map`，重启即清空（生产应换 Redis，接缝在 `lib/share.ts` 三四个函数）。**可撤销**——owner 在 LinkPane 里点"撤销"→ `DELETE /api/share-links/[code]` 标 `revoked=true + revokedAt`，`authorizePublic` 优先判 revoked 直接 410，落地页显示"分享已被撤销 · 分享者主动关闭了这个链接"；已种下的 `jw_share` Cookie 立即失效（每次 gate 都重查库）。**可过期**——`expiresAt: BigInt?`（epoch 毫秒）在创建或 PATCH 时写入，`authorizePublic` 判 `Date.now() > expiresAt` → 410；`maxViews: Int?`（1-10000）超限同理。**元数据隐藏**——未解锁前 `GET /api/share/[code]` 只回 `{status:'need-password', hasPassword:true}`，**不含文件名 / 所有者 / 大小**（避免通过公开 API 侧信道枚举），解锁后才回完整 `{link, file}`。密码用 `lib/auth.ts::hashPassword/scrypt` 直接复用（同一实现，同一 `passwordHash` 列命名风格）。

**US-22 · 精确邀请到指定人 + 云盘首页两栏更顺手（v0.5.1）。** 作为要把某份内部资料只给"特定几位同事"看的用户，我既不想用公开链接（怕转发失控），也不想用加密链接（发口令麻烦），还要能在"邀请协作 / 仅指定用户"里**按姓名或邮箱搜到具体的人**而不是在固定小名单里翻。验收：

- **仅指定用户可见（白名单链接）**：`prisma/schema.prisma` 新增 `ShareLinkUser`（`@@id([linkId,userId])`、`onDelete: Cascade`、`@@index([userId])`）作为 ShareLink↔User 白名单连接表。owner 在 `LinkPane` 选「仅指定用户」预设 → 用 `<UserPicker>` 搜索并添加同事 → `POST /api/files/[id]/share-links { inviteeIds:[...] }`；服务端去重、上限 100、逐个 `userExists` 校验（未知 id → 400），并强制**与 `password` 互斥**（同时给 → 400）。`lib/share.ts::createShareLink` 在 `$transaction` 里建链 + `createMany` 白名单行，`ShareLinkView` 带出 `invitees:[{id,name,color}]`。
- **双重公开门**：`authorizePublic(code, viewerUserId)` 新增入参（各 `/api/share/[code]`、`/raw`、`/ticket` 处理器与 `/s/[code]` SSR 都传 `getSessionUserId()`）。命中白名单链接时：无会话 → **401 `need-login`**、有会话但不在名单且非 owner → **403 `not-invited`**、命中或 owner 本人 → 直接放行（`unlocked:true`，跳过密码门）。名单为空则完全走 v0.5 原逻辑（匿名 / 密码），**行为字节级不变**。
- **落地页体验**：`/s/[code]` 未登录访问白名单链接渲染 `<LoginGate>`（"此分享仅对指定用户可见 · 前往登录"），`LoginForm` 支持 `?next=/s/<code>` 安全回跳（`safeNext()` 仅允许同源单斜杠路径，挡 `//host`、协议、空白注入）；登录后自动回到原分享页。名单外登录用户看到 `ShareError reason="not-invited"` 文案。
- **可搜索 UserPicker**：`components/share/UserPicker.tsx` 统一支撑「邀请协作」与「仅指定用户」两处。输入 220ms 防抖打 `/api/users?q=`（`listShareableUsers(excludeId,{keyword,limit})` 用 `OR:[{name contains},{email contains}]`，SQLite LIKE 对 ASCII 天然大小写不敏感、CJK 无大小写），已选渲染为可删 chips，键盘 ↑/↓/Enter/Esc/Backspace 可达，`seq` 自增防竞态。`/api/users` 新增 `?q=` 与 `?limit=`。旧的写死短列表（"3 个用户、搜不到人"）被替换。
- **两栏式云盘首页**：`app/(drive)/page.tsx` 由"上传条在上、列表在下"的单列改为 `grid lg:grid-cols-[minmax(0,1fr)_300px]`——**左＝文件/文件夹列表（主列）**、**右＝上传卡片侧栏（`lg:sticky lg:top-6`）**；窄屏单列堆叠（列表在上、上传在下）。`UploadZone` 从满宽横幅重做成竖版卡（图标头 + 大号虚线点选/拖拽区 + 支持类型脚注），并支持**多选顺序上传**（进度 `done/total`、完成后 `router.refresh()` 再跳首个新文件）。

**US-23 · 一次性分享整个目录（v0.5.2）。** 作为要把一整套资料（合同包、招标文件包、会议纪要合集）一次性发给外部合作方的用户，我不想为每一份文档单独建链接、也不想每加一份就要重发。验收：

## 4. MVP 范围

### 4.1 v0.1 · 单文档集成闭环（已交付）

**做**：无账号单租户（`externalSubject = demo-alice`）· 上传 .docx · 新建空白文档 · 文件列表 · 预览 · 协同编辑 · 原文下载 · 重命名 · 记录级删除（保留物理文件） · 简易错误提示。

**明确拒绝**：任何把 `clientSecret` 送到浏览器 / 客户端存储 / 打包进前端 bundle 的做法；任何复用 / 缓存 ticket 的做法（JitWord 会返回 409）；「用 JitWord 原生登录当云盘账号」的偷懒方案（inner 站点已屏蔽 `/login`、`/admin`）。

### 4.2 v0.2 · 协同云盘骨架（已交付）

**做**：多身份模拟（cookie `jw_actor` + 4 人花名册 + 右上角切换器；**此项已在 v0.3 被真实账号体系替换**）· 我的云盘 / 最近打开 / 共享给我 / 回收站 四大视图 · 服务端强制的 owner/editor 与 shared/viewer 权限矩阵 · 文件级共享名单 · 访问埋点（`lastAccessedAt` / `accessCount`）· 回收站完整生命周期（软删 → 还原 / 彻底删除 → 清空；30 天保留期提示；物理文件安全移入系统废纸篓）· emoji 全量替换为内联 SVG 图标。

**权限矩阵（服务端 ticket 层强制）**

| 当前登录用户 × 文档 | 我的云盘（我拥有） | 共享给我（他人拥有，分享给我） | 无关文档（既非我所有也未分享给我） |
| --- | --- | --- | --- |
| 打开预览 | ✓ 可 | ✓ 可（只读） | ✗ 404（前端跳回云盘） |
| 进入编辑 | ✓ editor ticket | ✗ 强制降级 viewer/readonly | ✗ |
| 重命名 / 共享 / 删除 / 彻底删除 | ✓ 仅 owner | ✗ 403 | ✗ |
| 还原 | ✓（回收站中我拥有的） | ✓（回收站中分享给我的） | ✗ |

**已知产品缺口（诚实标注）**：同事「拥有」的播种文档，正文注入只在所有者编辑态发生；他人打开预览可能为空——因 JitWord 无服务端写入通道、且本轮文档编辑能力被用户暂停，属演示数据限制，非云盘骨架缺陷。真实上传的自有文档不受影响。

### 4.3 v0.3 · 真实账号体系（本次交付）

**做**：真实邮箱 + 密码账号（scrypt 加盐哈希，密码不落明文）· **邀请码注册**（种子主邀请码 `DEMO_INVITE_CODE` 不限次不消耗，用户可在头像菜单自助生成一次性码，`InviteCode.usedById` unique 防重放）· HMAC-SHA256 **签名会话 Cookie**（`userId.exp.hmac`，HttpOnly，30 天）· `(drive)` 路由组 layout **服务端鉴权门**（未登录 `redirect('/login')`）· **多用户数据隔离**（所有视图 / 详情 / 下载 / ticket 按 `ownerId + FileShare` 强制过滤，无关 404、越权写 403）· 移除 cookie 身份切换器，右上角换成**用户菜单**（账号信息 / 邀请同事 / 退出登录）· 顶部**全局标题搜索**（编辑/预览页自动隐藏）· **统一 Modal / Toast** 替代浏览器原生 `alert/confirm/prompt`。

**数据层（可迁移性优先）**：元数据从本地 JSON 迁到 **Prisma + SQLite**；`lib/store.ts` 作仓储 seam，对上层保持 `FileRecord` DTO 与函数签名不变，换实现只动一个文件；共享名单/邀请码用**连接表**（`FileShare` / `InviteCode`）而非数组列，迁 Postgres 只需改 `schema.prisma` 的 `provider` + `DATABASE_URL` 再 `prisma migrate`；时间戳用 **`BigInt` 存 epoch 毫秒**（32 位 `Int` 会溢出，读路径 `Number()` 回接 DTO）；首次运行 `ensureBootstrap()` 幂等播种 4 个演示账号并把遗留 `data/files.json` 导入后改名 `files.json.migrated`。

**仍不做（明确 out of scope，留待后续）**：分享链接（短码 / 过期 / 密码）· 文件夹 / 标签 / 收藏 · 全文（正文级）搜索（本轮只做到标题级）· 版本时间轴 · 真实企业 SSO / MFA（本轮为邮箱+密码）· 表格 / 演示 / 脑图（JitWord Demo 环境不支持）· PDF 导出 · Webhook 消费 · 对象存储迁移 · 回收站到期自动清理定时任务。

### 4.4 v0.3.1 · 编辑器体验收口（已交付）

**做**：编辑器**只保留 JitWord 编辑工具条**（`createEditor.ui.chrome:'toolbar'`，修 `ui.toolbar` 字段被 SDK 忽略的老 bug；不再启用 `chrome:'full'` 是因为 JitWord 顶栏与我们 FileHeader 承担同样职责，两段并排会让用户以为有两套系统）· 编辑页 FileHeader 单按钮：**导入 Word**（`POST /api/files/[id]/import` 复用现有 mammoth→sanitize→setContent 通道替换正文，仅 owner）· `types/jitword-sdk.d.ts` 与 `iframe-sdk/manifest.json` 全面对齐（补 `chrome / insertContent / clearContent / setWatermark / getOnlineUsers / setSelection / scrollTo` 等）· `lib/editor-bridge.ts` 单例命令总线让 FileHeader 无侵入地驱动 EditorClient（挂载注册 / 卸载清空 / fileId 校验防串档，当前仅 `importStaged` 一个方法）。

**仍不做**：图片 URL 化落库（JitWord SDK 没暴露 uploadHandler / assetHost 回调，`SameSite=Lax` 会话 cookie 也带不进 `inner.jitword.com` 的跨站图片请求；用户明确不需要「插入图片 / 转存粘贴图片」变通按钮，粘贴图片短期内仍以 `data:image/...` 内联存在）；生产演进建议跟进 JitWord 后台是否上线 asset host 能力。

### 4.5 v0.4 · 目录层级 + 多类型文件 + JitWord-Preview SDK（本次交付）

**做**：**Folder 树 + File.parentId 递归外键**（自引用森林、`deletedViaParentId` 批次软删、`moveFolder` 上溯循环检测、深度硬闸 64）· **多类型白名单集中在 `lib/filetypes.ts`**（`FileKind = jitword / previewable / image / audio / video / archive / other`；`kindOf / kindOfExt / acceptAttrFor / maxSizeFor / isJitwordDoc` 单一模块导出，改一次全站生效；扩展名 + MIME 持久化，kind **不入库**、永远从 extension 派生，白名单漂移自动重分类）· **`/api/files` 按 kind 分流**（docx 保留原有 JitWord 建文档 + mammoth 暂存 + `pendingImport` 编辑闭环；其他 kind 只落 `data/uploads/<id>/<rev>/<safeName>`，`docId/jwSubject=null`，MIME 用 `mmDetect` 服务端 magic bytes 嗅探）· **`/api/files/[id]/raw` 流式服务**（`Readable.toWeb(fs.createReadStream)` + `Range → 206 + Content-Range` + `416` + `HEAD` + `Content-Disposition: inline; filename*=UTF-8''…` + `X-File-Kind/X-File-Extension`，非授权 **404 而非 403**、软删 410）· **JitWord-Preview SDK 集成**（`lib/preview-sdk.ts` 单例 Promise + 8s 超时；`PreviewClient` 按 kind 分派 SdkPreview / ImagePreview / AudioPreview / VideoPreview / DownloadOnly；same-origin fetch 天然带 HttpOnly 会话 Cookie，与早期 iframe 跨站图片是**两条鉴权路径**；SDK 加载失败降级为「预览服务不可达，请下载查看」卡片）· **UI 层**（TopBar「新建」下拉拆成「新建 Word / 新建文件夹」、「上传 Word」改「上传文件」支持全类型；根页 `?folderId=…` 进入子目录，`<Breadcrumb>` + `<FolderGrid>` + `<FileList>` 三段并列；File/Folder 行内「移动到」→ `<MoveToFolderDialog>` 前端剔除自己+子孙防自锁；`<FileKindIcon>` + kind 标签徽标；`FileList.openHref` 按 kind 分流到 `/files/[id]` 或 `/files/[id]/view`）· **首次升级自动归档**（`archiveLooseFiles()` 幂等：把根目录裸文件移到「我的文档（已归档）」folder，用户整理过的目录不动）· **回收站支持 folder**（`listTrash` 返回 `{files, folders}`，级联软删按 `deletedViaParentId` 打标批次，`FolderTrashList` 组件显示「包含 N 项 · 剩 N 天」）。

**仍不做（明确 out of scope）**：**文件夹级共享**（`FolderShare` + 递归 ACL + "子孙动态移入"的语义易飘，UI 上 folder 行的「共享」按钮隐藏；生产演进走 `FolderShare(folderId, userId)` + `WITH RECURSIVE effectiveVisibility()`）· 版本时间轴 · 全文（正文级）搜索 · PDF / 表格 / 演示 走 JitWord 编辑（Preview SDK 只读，写入仍需要 docx → JitWord 建文档这条路；xlsx/pptx 编辑能力 SDK 未提供）· 对象存储切换（raw 路由已经预留 `openStream` seam，实际替换推到 v0.5）· 压缩包内预览（zip-bomb 风险）· 拖拽移动到目录（本轮只到菜单/对话框）· 回收站到期自动清理定时任务。

**关键的向下兼容点**：docx 编辑闭环（US-1~US-15）完全不变，ticket 端点新增 `!rec.docId → 415`、编辑页 `redirect('/files/[id]/view')`，其他一律走原路径；`schema.prisma` 中 `File.docId` 由 `String` 改为 `String?`、`jwSubject` 保持 nullable；`FileRecord` DTO 新增 `extension/mime/kind/parentId`，`lib/store.ts::toRecord` 对老 SQLite 行 `extension || 'docx'` 兜底，未回归任何 v0.3 API 契约。

### 4.6 v0.4.1 · Word 解析迁到浏览器端 iframe-sdk `document.importDocx`（本次交付）

**背景**：v0.3~v0.4 的 Word 导入一直是"服务端 mammoth 把 .docx 拍成 HTML → 暂存 → 客户端 `setContent` 注入"，痛点是保真度封顶（表格/图片被拍平或丢）、注入时机玄学（`ready` 时协同模型仍可能 not-ready，写要被静默丢弃，只能退避重试 + 回读校验兜）、以及服务端和 JitWord 各维护一套 docx 解析器。iframe-sdk 1.1（`v1/loader.js`）新增 `document.importDocx`（scope `document:edit`，≤30MB，magic-byte 嗅探），用 JitWord 官方引擎在 iframe 内直接解析并写入，三个痛点一起消解。

**做**：`types/jitword-sdk.d.ts` 补 `JitWordImportDocxOptions / JitWordImportDocxResult` 与实例方法 `importDocx()`，banner 对齐 `loaderVersion 1.1.0` · `EditorClient` 删掉整套 mammoth 时代的注入管线（`htmlToSafeBlocks / inlineClean / waitUntilWritable / verifyContent`），改为统一的 `runImportDocx(source, name)`：调 `editor.importDocx({ content, mode:'replace' })` → `save({force:true})` → 汇总 `applied/importedComments/headerFooter/warnings` · **两条触发路径**都走它：（a）新上传 docx 首次进编辑页（`pendingImport=true`）时 `GET /api/files/[id]/raw` 把原字节流回浏览器（same-origin，会话 Cookie 自动带上）解析导入，成功后 `POST /api/files/[id]/content` 清标记，避免刷新覆盖用户编辑；（b）FileHeader「导入 Word」把用户新选的 `File` 经 `lib/editor-bridge.ts::importDocxFile` 直接喂给 `document.importDocx`，全程不落服务端 · FileHeader 前置校验（仅 owner 编辑态、非 `.docx` 拒、>30MB 拒）与 toast 文案改为描述"浏览器内 iframe-sdk 高保真解析"。

**清理 / 向下兼容**：删 `lib/docx.ts`、`npm uninstall mammoth`；`GET /api/files/[id]/content` 与 `POST /api/files/[id]/import` 降级为 **410 Gone**（防老缓存 / 书签直达，给明确回执）；`POST /api/files/[id]/content` 保留（只清 `pendingImport`）；`File.pendingHtmlPath` 列标 `@deprecated` 保留（新写入恒空，彻底删除时把遗留 html 一并移入废纸篓）；已交付的 v0.4 数据无需迁移，老 docx 的 `docId/jwSubject/pendingImport` 语义不变。

**仍不做（out of scope）**：`importDocx` 已识别但暂不写入的**批注 / 页眉页脚**落库（等 SDK 后续版本）；`.doc`（97-2003 二进制）解析；服务端批量 / 离线转换（如生产需要仍走 LibreOffice headless 池那条独立路线）。

### 4.7 v0.5 · 分享链接（公开 / 加密 / 邀请协作） + 二维码 + 匿名落地页 `/s/[code]`（本次交付）

**背景**：v0.2~v0.4 的分享一直是「指定花名册里某几个账号 → 出现在对方『共享给我』」，本质是**已登录内部协作**；对外发一份份合同给客户 / 把一份份说明书丢到微信群里这种最常见诉求完全对不上——对方既没账号也懒得注册。v0.4 交付后复盘，PM 收到的第一句反馈就是「共享的有问题，没有按照我的需求实现」。v0.5 把分享拆成三条正交通道：**公开链接 / 加密链接 / 邀请协作**，都收敛到同一个 `<ShareDialog>` 组件、同一套 owner API 与同一份匿名落地页 `/s/[code]`。

**做**：**数据模型** `ShareLink{id, fileId, code(unique 8 位 base62), creatorId, passwordHash?, expiresAt?: BigInt, maxViews?: Int, viewCount: Int, allowDownload: Bool, revoked: Bool, revokedAt?, createdAt, updatedAt}`（连接表风格，Postgres 平移）· **`lib/share.ts` 仓储 seam**（`generateCode / createLink / listByFile / getByCode / updateLink / revokeLink / authorizePublic / recordView / setUnlockCookie / readUnlockCookie / isUnlocked / hashPassword / verifyPassword`，密码 scrypt 直接复用 `lib/auth.ts` 的实现）· **`POST /api/files/[id]/share-links` + `GET/PATCH/DELETE /api/share-links/[code]`** 四个 owner 端点（越权一律 404 不 403，不泄露 code 归属）· **四个公开端点**（`GET /api/share/[code]` 元数据 / `POST /api/share/[code]/unlock` 口令 / `GET/HEAD /api/share/[code]/raw` 流式（含 Range）/ `POST /api/share/[code]/ticket` JitWord viewer 只读）· **匿名落地页** `app/s/[code]/` 独立于 `(drive)` 路由组（自带极简 layout，避开 Sidebar 鉴权门），SSR 分派 `<PasswordGate>` / `<ShareEditorClient>` / `<ShareFilePreview>` / `<ShareError>` 四态，全部渲染点带 `X-Robots-Tag: noindex, nofollow` + `<meta robots noindex>` 防搜索索引泄漏 · **UI 层**（`ShareDialog` 重写为 tab 容器：`链接` / `邀请协作`；`LinkPane` 三张预设卡片（公开 / 加密 / 邀请-灰置待 v0.5.1）+ 折叠"高级选项"（过期 / 浏览次数 / 允许下载）+ 已生效链接列表；`QrCard` 客户端 `qrcode` SVG 二维码；加密模式默认自动生成 6 位 base32 随机口令，字母表 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` 去易混淆字符；`FileHeader` 与 `ViewHeader` 下载按钮左侧统一挂「分享」按钮，共用同一 `ShareDialog`；`Icon` 补 `lock / globe / qrcode`）· **防爆破限速**（`lib/share.ts` 内存级滑动窗口，key=`ip|code`，15 分钟内累计 5 次失败 → 锁 15 分钟，`POST /unlock` 429；v0.5 修正了早期 `{fails, until}` 结构"首次失败就锁"的 bug 为 `{fails, windowStart}` 只在跨过阈值时才锁）。

**仍不做（明确 out of scope）**：**文件夹级分享链接**（v0.5.1 与 `FolderShare` 递归 ACL 一起做，UI 上 folder 行的分享按钮隐藏）· **真实第三方短信/邮件口令下发**（当前只把口令展示给 owner 自己复制，接收方靠 owner 私下传）· **服务端限速**（当前是 Node 进程内 `Map`，重启即清空、多实例不共享，生产换 Redis，接缝在 `lib/share.ts::isLocked/recordFail/resetFails`）· **分享链接独立密钥域**（当前 `jw_share` Cookie 与 `jw_session` 用同一个 `SESSION_SECRET`，生产应拆签名密钥）· **下载水印 / 强制预览**（`allowDownload=false` 只隐藏下载按钮，仍可从 raw 直接下，防君子不防小人）· **短链服务**（code 就是 8 位 base62 直接放 URL 里，暂不接第三方短链）· **分享详情审计流**（谁在什么时间点了什么，viewCount 只记数字，不留 ip / UA）· **"仅限受邀"链接预设**（当前卡片置灰引导去"邀请协作"Tab，本质是 `ShareLink + FileShare` 的交叉预设，M2.1 才做）。

**关键的向下兼容点**：docx 编辑闭环（US-1~US-15）、多类型预览（US-17）、目录层级（US-16）、回收站与共享花名册（US-7 / US-9）完全不变；`ShareLink` 与 `FileShare` 是**两张正交的表**，一份文件可以同时挂在 3 条加密链接 + 5 个花名册用户上，互不干扰；`File.docId` nullable、`File.jwSubject` backfill、`pendingImport` 语义全部保留。落地页 docx 走 `ShareEditorClient`（`mode:'preview' + ui:{readonly:true, chrome:'host'}`），服务端 ticket 端点 `POST /api/share/[code]/ticket` 里的 `permission.role='viewer' scopes=['document:read']` **硬编码不可被前端参数覆盖**，即使 owner 后来撤销链接、匿名 Cookie 也立刻失效（每次都重查库）。

### 4.8 v0.5.1 · 仅指定用户可见（白名单链接） + 可搜索 UserPicker + 两栏式首页（本次交付）

**背景**：v0.5 交付后 owner 侧分享三条通道里，**「邀请协作」Tab 里那 3 个演示用户是写死的**（`GET /api/users` 无过滤直接返回全部），用户越加越多就会退化成"翻名单找人"，没法像飞书 / Google Docs 那样键入 `张三` 或 `zhang@corp.com` 直接搜；同时**「仅指定用户可见」预设卡片是灰置的**，owner 想要"这一份份合同只给你我三四个人看、并且必须登录才能看、被转发出去也进不去"的诉求只能靠"发加密链接 + 私下发口令"凑，或者退回"邀请协作"（对方一定要在『共享给我』里翻）。首页 layout 上，v0.4 的「上传横幅 + 列表」单列堆叠在多栏浏览器窗口里右边一大片空白，拖拽区窄窄一条反而不显眼。v0.5.1 一起收掉这三处。

**做**：**ShareLinkUser 白名单连接表**（`prisma/schema.prisma` 新增 `ShareLinkUser{ linkId, userId, createdAt }`，`@@id([linkId,userId])` + `onDelete: Cascade` + `@@index([userId])`，`ShareLink.invitees` 与 `User.shareLinkInvites` 双向关系；连接表风格与 `FileShare` / `InviteCode` 一致，Postgres 平移零改造）· **`lib/share.ts` 三处扩展**：`createShareLink({ inviteeIds })` 在 `$transaction` 里建链 + `createMany` 白名单（SQLite 分支不支持 `skipDuplicates`，因为 link 刚建、`inviteeIds` 已 `Set` 去重，无冲突风险；生产 Postgres 可开）；`ShareLinkView` 新增 `invitees: ShareInvitee[]`；`authorizePublic(code, viewerUserId?)` 加入第三个 gate 分支——命中白名单则**跳过密码路径**、直接按登录态判定（`!viewerUserId → 401 'need-login'`、`viewerUserId 不在名单 && 非 owner → 403 'not-invited'`、命中或 owner 本人 → `unlocked:true` 放行）；名单为空的链接完全走 v0.5 原逻辑，**行为字节级不变** · **Owner POST `/api/files/[id]/share-links`** 接受 `inviteeIds: string[]`（去重 → 上限 100 → 逐个 `userExists` 校验，未知 id → 400）；与 `password` **强制互斥**（同时给 → 400 "「仅指定用户」和「密码保护」不能同时启用"，避免产品语义上"要么匿名 + 口令、要么登录 + 白名单"两种门并存造成接收方一头雾水）· **三个公开端点透传 `getSessionUserId()`**：`GET /api/share/[code]` / `GET HEAD /api/share/[code]/raw` / `POST /api/share/[code]/ticket`（未登录时 `undefined` → 白名单命中就是 401）· **`/s/[code]` SSR 分派 `<LoginGate>`**：命中 `reason:'need-login'` 时渲染登录引导卡（不暴露文件名 / 所有者），CTA 是 `<Link href="/login?next=/s/[code]">前往登录</Link>` · **`LoginForm` 安全回跳**：`useSearchParams().get('next')` + `safeNext()` 白名单（必须以 `/` 单斜杠开头、不能是 `//host`、不含反斜杠与空白、不含协议头），命中则 `router.replace(next)`；否则回落 `/`。这样防止把用户从钓鱼站 `https://evil.example.com/x` 用 `?next=https://evil.example.com/x` 直接带回外部站 · **可搜索 UserPicker**（`components/share/UserPicker.tsx`，统一支撑「邀请协作」与「仅指定用户」两处）：输入 **220ms 防抖** 打 `/api/users?q=<kw>&limit=20`，`lib/auth.ts::listShareableUsers(excludeId, { keyword, limit })` 用 `where.OR = [{ name: { contains: kw } }, { email: { contains: kw } }]`（SQLite 的 `LIKE` 对 ASCII 天然大小写不敏感，CJK 无大小写概念，直接 `contains` 覆盖两种）；已选渲染为可删 chips、下拉每行 avatar+name+email、鼠标 hover 与 ↑/↓ 键盘双向高亮、Enter 添加、Backspace 空查询移除最后一条、Esc 关面板，`document.mousedown` 外点击关闭，`seq.current` 自增防"慢查询覆盖快查询"竞态；`/api/users` 新增 `?q=` 与 `?limit=` · **LinkPane 集成**：三张预设卡片里"仅指定用户"从灰置改为可用，选中时 `password` 与 `inviteeUsers` 双向清空互斥保护；`createLink` 提交 `inviteeIds: preset==='invite-only' ? inviteeUsers.map(u=>u.id) : []`；已生效链接行 `summaryBits` 从 `string[]` 改为 `React.ReactNode[]`（预分 key 的 span 数组），当 `link.invitees.length > 0` 时首位显示「👥 N 人可见」而不再显示「🔒 密码」· **两栏式首页 layout**（`app/(drive)/page.tsx`）：容器 `max-w-7xl`，`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] items-start gap-6`——左列 `min-w-0`（防子元素 overflow）承载 `<Breadcrumb>` + `<DriveBrowser>`，右列 `<aside class="lg:sticky lg:top-6">` 承载 `<UploadZone>`；窄屏单列堆叠（列表在上、上传在下，方便手机上先看到内容再选择上传）· **UploadZone 重设计**（`components/UploadZone.tsx`）：从满宽横幅改成竖版卡（图标头 + `min-h-[132px]` 大号虚线"点击或拖拽上传"点选区 + 支持类型脚注 + 错误态独立图标）；新增 `<input multiple>` + 顺序 `sendAll(files: File[])` 上传队列，进度显示 `done/total`，busy 时 spinner；上传成功后保留 `router.refresh()` + 60ms 等 RSC 缓存失效再 `router.push(firstId)` 的语义（防止 back 看到旧列表）。

**仍不做（明确 out of scope）**：**文件夹级白名单**（v0.5.1 白名单只到 file 粒度，folder 分享按 v0.5 决策仍推到 v0.6 与 `FolderShare` 递归 ACL 一起做）· **白名单批量导入 / 从组织架构选人**（现阶段只有花名册搜索，接企业 SSO 后走部门树）· **"公开 + 白名单"混合门**（当前是 XOR：要么匿名/加密路径，要么登录白名单；混合模式容易产品语义打架，暂不开）· **白名单变更通知 / 邮件下发**（新增/删除 invitee 只是库表变化，无邮件通知；生产演进走 SMTP + 事件源）· **搜索拼音 / 全拼 / 首字母匹配**（当前 `contains` 只按 name/email 子串，用户搜 `xuxx` 找"徐晓溪"命中不了；生产换 Postgres `pg_trgm` 或 es 索引）· **拖拽上传到指定 folder 卡片**（右侧栏只能上传到当前目录，跨目录还是靠 `?folderId=` 或进目录再传）。

**关键的向下兼容点**：v0.5 已交付的**公开链接、加密链接、邀请协作花名册、`/s/[code]` 落地页、防爆破滑动窗口、`X-Robots-Tag` noindex、`viewCount` 只在 SSR +1 语义、`allowDownload` 只隐藏 UI**完全不变；白名单是 `ShareLink` 的**可选附加维度**（`invitees: ShareLinkUser[]`），老的公开 / 加密链接在新 `authorizePublic` 下走原分支、零行为漂移；`jw_share` Cookie 逻辑保留（白名单链接当前不写入，但代码路径不删，方便后续"白名单 + 临时解密期"组合预设复用）；schema 迁移只 ADD TABLE `ShareLinkUser`，不改任何现有列，老 SQLite 数据无缝。首页 layout 从"上传横幅在上、列表在下"变成"列表左、上传右 sticky"，**URL / 事件语义 / folderId 传参完全相同**，仅视觉与顺序变化。

### 4.9 v0.5.2 · 目录分享（folder-scoped ShareLink） + 卡片 / 目录树切换按钮左对齐（本次交付）

**背景**：v0.5 / v0.5.1 交付了三种文件级分享，但用户反馈最强烈的一条是"**我有一份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份份**"——把整套资料（合同包 / 招标文件包 / 会议纪要合集）一次性发给外部合作方，如果只能一个文件一个文件建链接，接收方要么挨个点、要么就要向 owner 索要剩下的；同时 owner 每次改文件还要重发链接，管理成本随文件数线性增长。**文件夹级分享**（Google Drive 的 folder-link、飞书的"分享目录"）是必然的下一种分发模型。此外 v0.5 首页 `DriveBrowser` 顶部的"卡片 / 目录树"切换按钮组是右对齐的，视觉重心偏右，与左对齐的搜索框、左侧栏不对齐——用户提了一轮"往左挪挪"，一起在这次收掉。

**做**：**数据模型泛化**（`ShareLink.fileId` 从必填改成 `String?`，新增 `folderId String?` + `Folder.shareLinks ShareLink[]` 反向关系 + `@@index([folderId, revokedAt])`；XOR 约束在应用层由 `createShareLink` 强制——SQLite 的 `CHECK` 加上去老库 `db push` 会失败，应用层判断在 Postgres 平移时可以再补 `@@check`，语义不变）· **`lib/share.ts` 全面泛化**：`ShareLinkView` 新增 `folderId: string | null`；`ShareStatus` union 加 `'folder-gone'`；`createShareLink` 输入 `{fileId?, folderId?}`，XOR 违规抛 `SHARE_TARGET_XOR`；`evaluateShare(link, target)` 按 `link.fileId ? 'file-gone' : 'folder-gone'` 分派；`PublicGateOk` 改为判别联合 `{kind:'file',file} | {kind:'folder',folder}`，`authorizePublic` 白名单分支与目标类型无关（比对 `target.ownerId`）；新增递归子树 helpers `folderSubtreeHasFile(rootId, fileId)` / `folderSubtreeHasFolder(rootId, subId)`（parent-chain 上溯 + 64 跳硬闸防环）、`listPublicFolderChildren(folderId)`（不含子孙，只列即时可见）、`getPublicFolderInfo(folderId)`、`breadcrumbWithinShare(rootId, currentId)`、`getPublicFileRow(fileId)`、`listShareLinksByFolder(folderId)`；`getShareLinkForOwner` 用 `row.file?.ownerId ?? row.folder?.ownerId` 判归属；`getShareLinkPublic` include 里同时拉 file 与 folder（用 `PUBLIC_INCLUDE + 双 select`）· **Owner API**：新增 `POST /api/folders/[id]/share-links`（与文件版同结构，走 `createShareLink({folderId})`），`GET /api/folders/[id]/share-links` 列该目录的活跃链接；`GET/PATCH/DELETE /api/share-links/[code]` **完全不改 URL 契约**——通过判断 `link.fileId` 是否为空自动分派 file 面 / folder 面，非 owner 一律 404（同 code 不存在响应）继续防枚举 · **匿名 API 泛化**：`GET /api/share/[code]` 返回 `{status:'ok', kind:'file'|'folder', link, file|folder, folders, files}`（folder 面附带**即时子内容**，减少首屏一次 RTT）；`GET/HEAD /api/share/[code]/raw` 与 `POST /api/share/[code]/ticket` 引入 `?fileId=<id>`——file-link 忽略该参数（走原 `gate.file.id`），folder-link **必须**带 `?fileId=`，服务端 `resolveTargetFileId(gate, url)` 分派后**强制走 `folderSubtreeHasFile(linkRoot, fileId)` 校验**，不在子树里 → 404（不泄露 fileId 存在性）；新增 `GET /api/share/[code]/children?folderId=<sub>` 支持子目录懒加载（同样 `folderSubtreeHasFolder` 校验）；`POST /api/share/[code]/unlock` 用 `row.file ?? row.folder` 兜底，加 `folder-gone` 分支 · **落地页路由拆分**：`app/s/[code]/page.tsx` SSR 判别 `gate.kind`，file 走 `<ShareFileRender>`（原逻辑抽出到 `app/s/[code]/renderShareFile.tsx`），folder 走 `<ShareFolderShell>`（**服务端渲染**，无 client state，所有导航走 `<Link>`）；新增 `app/s/[code]/d/[folderId]/page.tsx`（子目录浏览）与 `app/s/[code]/f/[fileId]/page.tsx`（子文件预览，走 `resolveTargetFileId + folderSubtreeHasFile` 验证）——**`recordView` 只在 `/s/[code]` 根 SSR 触发一次**，`/d/` `/f/` 子路由不重复计数（保留 v0.5 "一次落地页打开 = 一次浏览"的语义）；`<ShareFilePreview>` / `<ShareEditorClient>` 加可选 `fileId?` prop，透传 `?fileId=` 到 raw 与 ticket · **Owner UI**：`LinkPane` props 从 `{file}` 泛化为 `{target: ShareTarget}`，`ShareTarget = {kind:'file',file} | {kind:'folder',folder}`，内部派生 `apiBase` 打两个不同 owner 端点；`ShareDialog` 同款泛化，folder 目标下**隐藏"邀请协作" Tab**（`FileShare` 只挂 file，目录级协作名单推到 v0.6）+ 显示"目录暂只支持链接分享，子目录与文件会跟随父目录一起可见"提示；`FolderGrid` 卡片操作行新增「分享」按钮（放在「进入」右边、「移动到」左边，与文件行位置对齐），打开 `<ShareDialog target={{kind:'folder',folder}}>` · **首页卡片 / 目录树切换按钮左对齐**（`DriveBrowser.tsx`）：ModeButton 组外层容器 `justify-end` → `justify-start`，与左侧搜索、左侧栏形成左对齐视觉。

**仍不做（明确 out of scope）**：**目录级"邀请协作"名单**（`FolderShare` 连接表与递归 ACL 推到 v0.6，本期 folder 分享只走 ShareLink；`<ShareDialog>` folder 分支的"邀请协作" Tab 直接隐藏）· **folder ticket 一次性下发多个文件**（当前 `POST /api/share/[code]/ticket?fileId=X` 一个 ticket 只能给一个 file，客户端逐个申请；生产演进做"一次签发一批 viewer ticket + 短 TTL 队列"以省 RTT）· **子树快照（snapshot）语义**（folder 分享是"动态可见"——owner 事后往共享目录里加文件 / 移走文件，接收方看到的会**跟着变**，与 Google Drive folder-link 一致；快照版本需要 `ShareLinkSnapshot` 表 + 后台清理，暂未做）· **跨 owner 授权分享他人目录**（folder 分享仅 owner 可发起，非 owner 拿不到 `<ShareDialog>` folder 分支的入口，`POST /api/folders/[id]/share-links` 403）· **分享链接列表页 / 我发出的分享**（owner 目前只能在具体文件 / 目录面板看，没有全局列表；生产做 `/shared-by-me`）· **匿名端"下载全部"**（zip 归档推到 v0.6；folder 分享里的下载只能一个文件一个文件走 `?fileId=X&download=1`）· **子目录独立密码 / 子目录从父链接中被"挖洞"隐藏**（一旦分享目录，子树里所有非软删内容全部可见；细粒度需要新表 `ShareLinkExclusion`）。

**关键的向下兼容点**：v0.5 / v0.5.1 已交付的**所有文件级分享路径字节级不变**——file-link 的 `POST /api/share/[code]/ticket` 不带 `?fileId=` 直接走 `gate.file.id`；`GET /api/share/[code]` 返回 `{kind:'file', ...}`，`data.file` 字段名与 shape 完全相同；owner `/api/share-links/[code]` GET/PATCH/DELETE 语义与响应 shape 不变，只是在 handler 里加了一行 `link.fileId ?? link.folderId` 分派；`<ShareDialog>` file 入口（`FileHeader` / `ViewHeader` / `FileList`）三个 caller 改成 `<ShareDialog target={{kind:'file', file}}>`，UI 表现完全一致；schema 迁移 `fileId` 从必填改可空是向后兼容（老库已有数据的 `fileId` 都非空），SQLite `db push` 无数据搬迁。folder 分享是**加法**：只有 `folderId` 非空的记录才会走新分支。冒烟 30 断言（10 文件面回归 + 20 目录面新用例）全绿，包含三种预设、`/s/[code]/d/` `/s/[code]/f/` 子路由、动态子树、外域 fileId 404、invite-only 三态、`folder-gone`、revoke 即时生效、viewCount 语义与 owner 反枚举。

## 5. 度量口径

Demo 阶段不做 DAU 类指标，聚焦「集成质量」。核心三项：

- **端到端首屏**：拖入 .docx → 编辑器 ready 且 `importDocx` 自动导入完成，P95 ≤ 5s（本地网络条件下）。
- **SDK 握手失败率**：`error` / `auth.sessionExpired` / `HANDSHAKE_TIMEOUT` 事件占比 ≤ 2%。
- **导入保真度主观评分**：内部 5 分制打分（结构完整、加粗/列表还原、图片正常），目标均分 ≥ 4。

## 6. 迭代路线图

**v0.1（已交付）** 单租户 Demo 闭环，验证 iframe SDK 集成路径。

**v0.2（已交付）** 协同云盘骨架：多身份模拟 + 我的云盘/最近打开/共享给我/回收站四大模块 + 服务端权限矩阵 + 文件级共享名单 + 回收站生命周期（软删/还原/彻底删除，物理文件进系统废纸篓）+ 幂等播种演示数据 + SVG 图标化。

**v0.3（已交付）** 真实账号体系：邮箱+密码登录（scrypt 哈希）+ 邀请码注册（主码不限次 / 一次性码防重放）+ HMAC 签名会话 Cookie + `(drive)` 路由组服务端鉴权门 + 多用户数据隔离 + Prisma/SQLite 仓储层（BigInt 时间戳、连接表建模，可对上 Postgres）+ JSON→SQLite 迁移与演示账号播种 + 统一 Modal/Toast + 全局标题搜索（编辑页隐藏）；移除 cookie 身份切换器。补丁 v0.3.1：修 JitWord ticket 403 双身份（`File.jwSubject` + `backfillJwSubject`）。

**v0.3.1（已交付）** 编辑器体验收口：JitWord 编辑工具条（`ui.chrome:'toolbar'`——SDK 字段名从 `ui.toolbar` 迁移过来 + 主动关掉 JitWord 顶栏避免与 FileHeader 重复）+ FileHeader「导入 Word」原地换正文；SDK 类型 `types/jitword-sdk.d.ts` 对齐 `iframe-sdk/manifest.json`。

**v0.4（已交付）** 云盘真正的"云盘化"：**目录层级**（Folder 树 + File.parentId + 级联软删 + 循环检测 + 移动对话框 + 面包屑）+ **多类型文件**（`lib/filetypes.ts` 单一白名单：office / 图片 / 音视频 / 压缩包；扩展名 + MIME 持久化、kind 派生不入库；`POST /api/files` 按 kind 分流；`/api/files/[id]/raw` 支持 HTTP `Range` 流式服务）+ **JitWord-Preview SDK 集成**（`docx/xlsx/pptx/pdf/ofd/txt/md/html` 页内预览，same-origin 会话 Cookie 直连 raw；image/audio/video 走浏览器原生标签；archive/other 降级为下载卡片；SDK 加载失败不阻断页面）+ **首次升级自动归档**（老根目录裸文件幂等移到「我的文档（已归档）」folder，docx 编辑闭环无感）+ **回收站支持 folder**（`listTrash` 返回 `{files, folders}`，`deletedViaParentId` 批次还原）；UI 层新增 `<Breadcrumb> / <FolderGrid> / <MoveToFolderDialog> / <FileKindIcon> / <PreviewClient> / <FolderTrashList> / <ViewHeader>`，TopBar「新建」拆分为下拉（Word / 文件夹）、「上传 Word」升级为「上传文件」；首页新增卡片 / 目录树双视图切换。

**v0.4.1（已交付）** Word 解析从服务端 mammoth 迁到浏览器端 iframe-sdk 1.1 `document.importDocx`：新上传 docx 首次进编辑页自动经 `GET /raw` 流回原字节、由 JitWord 官方引擎高保真解析并 `save()`，FileHeader「导入 Word」把新选 `File` 经 `editor-bridge` 直喂 `importDocx`（原地换正文），全程解析不落服务端；移除 mammoth 依赖，`GET /content` 与 `POST /import` 降级为 410 Gone，`pendingHtmlPath` 列保留为 `@deprecated`。保真度对齐官方、消解 setContent 时机玄学。

**v0.5（已交付）** 分享能力全面重做：`ShareLink` 数据模型（8 位 base62 短码 + scrypt 加密口令 + BigInt 过期 + 浏览次数上限 + `allowDownload` 开关 + `revoked` 撤销位）· **四种模式**（公开链接 / 加密链接 / 邀请协作（沿用 `FileShare` 花名册）/ "仅限受邀"链接预留在 v0.5.1）· **统一 `<ShareDialog>` 组件**（Tab 分「链接 / 邀请协作」；三张预设卡片 + 折叠高级选项；生成后即时展示**链接 + 二维码 + 复制 / 打开 / 撤销**；已生效链接倒序列表可撤销或改属性）· **顶栏入口**（`FileHeader` 与 `ViewHeader` 下载按钮左侧统一加"分享"按钮，与 `FileList` 行"更多"入口共用同一组件）· **匿名落地页 `/s/[code]`**（挂在 `(drive)` 组外，独立 layout 绕过 Sidebar 鉴权门；SSR 分派 `<PasswordGate>` / `<ShareEditorClient>` / `<ShareFilePreview>` / `<ShareError>`；docx 走 JitWord iframe viewer 只读 + 硬编码 `scopes:['document:read']`；previewable/image/audio/video 走 `POST /api/share/[code]/raw` 流式（Range 206 支持）；`X-Robots-Tag` + `<meta robots>` 双保险防搜索索引）· **防爆破**（`lib/share.ts` 进程内滑动窗口，`ip|code` 键，15 分钟 5 次失败 → 锁 15 分钟；修正了早期"首次失败立即锁号"的语义 bug）· **Owner API 越权防御**（`GET/PATCH/DELETE /api/share-links/[code]` 非 owner 一律 **404** 不 403，不泄露 code 归属；未解锁时 `GET /api/share/[code]` 只回 `status:'need-password'`，**不含文件名/所有者/大小**）。

**v0.5.1（已交付）** 分享闭环补齐 + 首页 layout 优化：**「仅指定用户可见」白名单链接**（`ShareLinkUser` 连接表 + `authorizePublic(code, viewerUserId?)` 三态分支 `401 need-login / 403 not-invited / 200 unlocked`，与加密模式互斥；SSR `<LoginGate>` 引导登录，`LoginForm` `safeNext()` 白名单回跳挡开放重定向）· **可搜索 `<UserPicker>`**（220ms 防抖 + `/api/users?q=…&limit=…` + `listShareableUsers({keyword, limit})` OR name/email `contains`；chips + 键盘 ↑↓ Enter Backspace Esc + 外点击关闭 + `seq` 防竞态；替换「邀请协作」和「仅指定用户」两处写死短列表）· **两栏式首页**（`app/(drive)/page.tsx` 容器 `max-w-7xl` + `grid lg:grid-cols-[minmax(0,1fr)_300px]`，左列 `min-w-0` 列表 / 右列 `lg:sticky lg:top-6` 上传卡；窄屏单列堆叠）· **`UploadZone` 重设计**（横幅 → 竖版卡；`<input multiple>` + `sendAll(files)` 顺序队列 + `done/total` 进度 + spinner；`router.refresh()+60ms+router.push(firstId)` 语义保留）· **`LinkPane` 集成**（"仅指定用户"卡片可用 + password/inviteeUsers 双向清空 + `inviteeIds: string[]` 提交 + `summaryBits: React.ReactNode[]`「👥 N 人可见」）。冒烟 22 断言全绿（登录 3 人 + 搜索命中/未命中/邮箱 + 建白名单 + 互斥 + 未知用户 400 + 匿名 401 + 名单内 200 + 名单外 403 + owner 直放 + raw 三门 + `/s` SSR 双分支 + 撤销 410 + 公开链接不受影响）。

**v0.5.2（本次交付）** 目录分享 + 首页视觉细节收口：**`ShareLink` 泛化 fileId XOR folderId**（`ShareLink.fileId` 从必填改可空 + 新增 `folderId String?` + `Folder.shareLinks` 反向关系 + `@@index([folderId, revokedAt])`；应用层 `SHARE_TARGET_XOR` 校验，SQLite 不能 CHECK 迁移，Postgres 平移时再补 `@@check`）· **递归子树鉴权**（`folderSubtreeHasFile` / `folderSubtreeHasFolder` parent-chain 上溯 + 64 跳硬闸防环，语义与 Google Drive folder-link 一致的"动态可见"——事后往共享目录加/删内容接收方立刻看到）· **匿名 API 引入 `?fileId=<id>`**（`raw` / `ticket` / 新增 `children` 端点），file-link 忽略、folder-link 强制子树校验，越权 404 不泄露存在性 · **落地页路由拆分**（`app/s/[code]/page.tsx` SSR 判别 `gate.kind` → file 走 `<ShareFileRender>` / folder 走 `<ShareFolderShell>`；新增 `app/s/[code]/d/[folderId]` 子目录页 + `app/s/[code]/f/[fileId]` 子文件预览页；`recordView` 仍只在 `/s/[code]` 根触发保留 v0.5 语义）· **Owner API 新增** `POST/GET /api/folders/[id]/share-links`；`GET/PATCH/DELETE /api/share-links/[code]` **契约不变**，内部按 `link.fileId ?? link.folderId` 分派 · **Owner UI** `ShareTarget = {kind:'file',file} | {kind:'folder',folder}` 判别联合，`LinkPane` / `ShareDialog` 泛化（file 场景字节级兼容），folder 场景隐藏"邀请协作" Tab（推到 v0.6 `FolderShare`）；`FolderGrid` 卡片操作行加「分享」按钮（进入右边、移动到左边）· **首页卡片 / 目录树切换按钮组左对齐**（`DriveBrowser` `justify-end` → `justify-start`）。冒烟 46 断言全绿（10 文件面回归 + 36 目录面新用例：三种预设、`/s/d/` `/s/f/` 子路由、动态子树、外域 fileId 404、invite-only 三态、folder-gone、revoke 即时生效、viewCount 只在 landing +1、owner 反枚举 404）。

**v0.6 生产级存储与账号强化**：SQLite → Postgres（改 `provider`+`DATABASE_URL` + `prisma migrate deploy`）；本地磁盘 → S3 / OSS 兼容对象存储（`lib/storage.ts` 的 `openStream/writeBlob` 已是 seam，替换在一处）；企业 SSO（邮箱魔法链接 / 飞书 / 钉钉）与 MFA 替换密码登录；角色→scope 映射细化（editor / viewer / commenter）；**文件夹级协作名单（`FolderShare` + 递归 ACL `WITH RECURSIVE effectiveVisibility()`）**——v0.5.2 已交付 folder **链接**分享，v0.6 补 folder **花名册**协作（把 `<ShareDialog>` folder 分支的"邀请协作" Tab 从隐藏状态打开）；标签 / 收藏；JitWord Webhook（`contentChanged`、`saveStateChanged`）回写 updatedAt；分享链接审计流（ip / UA / 每次访问时间打点）；限速表迁 Redis；回收站到期自动清理定时任务；**分享全局列表页 `/shared-by-me`**（跨文件 / 目录看所有活跃 ShareLink）；**目录 zip 归档下载**（`?download=zip` 或子树 `?fileId=` 批量）。

**v0.6.1 官网 + 侧栏用量收口（本次交付）**：官网营销页接管根路径 `/`（Hero / 能力矩阵 / 智能云盘 / 分享运营化 / 安全可控 / 平台形态 / 页脚），登录 / 注册留在 origin 根；云盘整体迁至 `/drive` 前缀，`lib/routes.ts` 作为 URL seam 统一驱动约 15 个组件的跳转；分享落地页 `/s/[code]` 与 `/api/*` 契约字节级不变，已在流通的分享链接零迁移成本；`Cookie path:'/'` 保持 origin 域（若跟路由改成 `/drive` 会静默丢会话）；营销页除导航栏交互（滚动阴影 + 移动菜单 + CTA 埋点）外全部走 server component 最小化首屏 JS。**侧栏「已用空间」显示真实数据**——`lib/store.ts::getStorageUsage(actorId)` 用两条 `File.size` 聚合并行算出「活跃 / 回收站 / 合计 / 配额 / ratio」，`StorageUsage` 类型上移到 `lib/types.ts` 让 client 组件 `import type` 免拖 Prisma；配额默认 1 GB 可由 `STORAGE_QUOTA_BYTES` 环境变量覆盖，为将来付费档位留一个 env 开关；Sidebar 卡片渲染「已用 X MB / 1 GB」+ 真实百分比进度条 + 「活跃 · 回收站 · 百分比」三段小标（回收站字节计入配额，防止批量软删绕过限额；≥90% 时进度条转 amber 做视觉预警）。

**v0.7 AI 智能 P0 · Quick Wins（本次交付）**：把 PRD §11.3 四条 P0 全部落地，零 LLM 供应商依赖，纯本地 heuristic + 库表扩展。**架构决策三条**：（1）**落库策略** = 混合：轻列入库 + 派生运行时——`File` 表加 `contentHash String?` + `sensitivity String?` 两列（+ `@@index([ownerId, contentHash])` + `@@index([ownerId, sensitivity])`），标签建议与推荐保持运行时算，`FileInsight` 表推到 v0.8；（2）**扫描时机** = 上传即算 hash + 页面懒扫 sensitivity/标签 — `POST /api/files` 两条分支（docx + generic blob）都在内存 Buffer 上 `inlineSha256(buf)` 零额外 IO 就写入；sensitivity 与标签在用户进入 `/drive/smart` 或打开分享弹窗时按需 `POST /api/smart/scan` 一批 20 条（text-family 走 4 MB head slice 正文扫描，其他走文件名关键词），老数据靠扫描渐进回填；（3）**UI 入口** = 侧栏新加「AI 智能」模块（`/drive/smart` 面板四段合一：汇总卡 + 你可能想找 + 重复文件 + 敏感预警 + 标签建议）+ 首页顶部「你可能想找」可关闭横幅（SSR 直出、`sessionStorage` 24h 关闭记忆）+ `<LinkPane>` 分享弹窗敏感文件预警 banner（high 红 / medium amber，非阻断）。**核心红线（对齐 §11.5）**：AI 只提示**不动手**——重复文件展示"原件 vs 可释放 X"但不主动 purge；敏感文件分享前挂 banner 但不阻断，owner 仍可发送；标签只显式建议不落库（FileTag v0.8）。**关键坑与修法**：`lib/smart/sensitive.ts` 用 `fs/promises` 会被 webpack 拖进 client bundle 触发 `UnhandledSchemeError` → 拆 `sensitive-core.ts`（client-safe：规则 + `scanContent` + `bannerTextFor`）+ `sensitive.ts`（server-only：`scanFile` wrapper re-export core）；`LinkPane` 从 `-core` import；`putFile` 的 upsert create 分支必须显式列出 `contentHash` / `sensitivity`（update 分支走 `columns()` 已覆盖），踩过一次上传后 hash=null 的坑。**API 面**：五个新端点 `/api/smart/{scan, duplicates, suggestions, recommendations, summary}`，全部 `getActorId()` 门 + owner-scoped 查询，跨 owner 严格隔离（sha256 相同但 ownerId 不同的文件绝不组成一个 dup group，防侧信道）。冒烟全绿：上传即 hash ✓ / 老数据懒回填 ✓ / 同内容双文件形成 dup group ✓ / text-family 正文扫描命中身份证 · 手机号 · 邮箱 ✓ / 文件名关键词命中"身份证"→ high ✓ / `/drive/smart` 四段 SSR ✓ / `/drive` 首页横幅 SSR ✓ / 侧栏 AI 智能 nav ✓ / LinkPane 敏感 banner 触发 ✓。

：全文搜索 / 版本时间轴 / 多租户切换 / SDK 灰度通道（canary / latest）。

## 7. 风险与假设

**风险 1 · 保真度（v0.4.1 已显著缓解）**：早期用服务端 mammoth 转 HTML，复杂样式（艺术字、SmartArt、嵌入对象、表格、图片）还原有限。**v0.4.1 起改用 JitWord 官方 `document.importDocx`（浏览器内解析），保真度对齐原生**；剩余边界是 `importDocx` 当前**只回填正文**，解析到的批注 / 页眉页脚不写入（结果对象给出计数），`.doc`（97-2003）与 >30MB 不支持。缓解：解析告警 `warnings[]` 透到 toast；需要 100% 原样时保留「下载原 .docx」。

**风险 2 · 权限模型漂移**：Demo 环境 `authorization domains = *`，生产必须收敛到具体域；`resolveOrigin` 需要按部署环境注入。缓解：把 origin 解析集中在 `lib/jitword.ts`，一处切换。

**风险 3 · ticket 生命周期**：SDK 在握手 & 刷新时都会调 `getEmbedTicket`，任何缓存都会踩 409。缓解：接口 `POST /api/files/[id]/ticket` 强制 `cache: 'no-store'` + `dynamic = 'force-dynamic'`；客户端 `getEmbedTicket` 每次直接 fetch。

**风险 4 · Word 注入路径（v0.4.1 已由 `importDocx` 取代）**：≤v0.4 时代 `setContent` 是主要坑源——JitWord 为 Notion 内核，只认 `{format:'html', content}`、拒绝 Word 的 `<table>/<img>/<hr>` 节点，且 `ready` 时协同模型可能仍 not-ready 导致写入被静默丢弃，需要 `htmlToSafeBlocks` 净化 + 轮询就绪 + 分档重试 + 回读校验一整套兜底。**v0.4.1 起改走原子化的 `document.importDocx`（解析与写入同引擎内完成），上述时机与 schema 坑整体消失**。剩余风险：首开自动导入依赖 `GET /api/files/[id]/raw` 能拉到字节（会话过期 401 / 无权限 404 会导致跳过），且必须在 owner 编辑态（scope `document:edit`）下；缓解：失败时保留 `pendingImport=true` 下次自动重试，并允许 FileHeader「导入 Word」手动兜底 + 「下载原 .docx」。

**风险 5 · 软删除一致性**：回收站把「可见性（deleted）」「所有权（ownerId）」「共享（FileShare）」三态耦合在一条记录上，视图查询若漏过滤会串台。缓解：所有列表查询统一走 `lib/store.ts` 的 `listDrive/listSharedWithMe/listRecent/listTrash`，每个函数内置 `deleted` 过滤与身份判定；**鉴权/可达性判断必须在「是否已删除/已还原」的提前返回之前执行**（冒烟时发现 `restoreFile/softDeleteFile` 若先返回未删除记录会绕过非 owner 的 403，已修正为可达性优先）；换存储后由 `prisma` 查询保证，不再依赖运行时 `normalize()`。

**风险 6 · 物理删除不可逆（产品级红线）**：「彻底删除」若直接 `unlink` 会违反文件保护原则、且用户误删无法挽回。缓解：`lib/fsafe.ts` 仅 `rename` 到系统废纸篓（跨盘降级为 copy + 本地暂存），并校验「目标存在且源已消失」才认定成功，全程零 `fs.unlink`；元数据记录移除与物理移动分离，用户可从系统废纸篓二次恢复。

**风险 7 · 会话与口令安全**：相比 v0.2 明文 `jw_actor`（改一下就越权），v0.3 用 HttpOnly **签名会话 Cookie**（HMAC-SHA256 + `SESSION_SECRET`）+ **scrypt 加盐哈希**口令，已能防普通篡改与撞库读取；但 Cookie 一旦泄漏仍可被重放，`SESSION_SECRET` 若留空/弱值形同虚设，且邮箱+密码无 MFA。缓解：生产须用强随机 `SESSION_SECRET`、Cookie 加 `Secure` + `SameSite`、缩短 TTL 与刷新、上 CSRF 令牌，并以真实 SSO / MFA 替换口令登录。

**风险 8 · Prisma `Int` 溢出（已定位并缓解）**：epoch 毫秒（如 `1790…`）写进 32 位 `Int` 列会抛 `does not fit in an INT column`，早期表现为「只播种出第一个演示账号」的诡异半初始化。缓解：`schema.prisma` 中所有时间戳列（`createdAt/updatedAt/deletedAt/lastAccessedAt`）声明为 `BigInt`（`size/accessCount` 仍是 `Int`）；Prisma 写入接受普通 `number`、读出给 `bigint`，`lib/store.ts` 仅在读路径 `Number(b)` 回接 `FileRecord` DTO，保证上层不感知。

**风险 9 · JitWord `externalSubject` 双身份（已定位并缓解）**：v0.3 把应用层 owner 换成真实用户 cuid 后，用当前 cuid 去给 v0.2 时代用 persona（`demo-alice` 等）建过的老文档换 ticket 会踩 JitWord 侧 `403 document permission denied`——JitWord 的文档 ACL 是在 `/embed/documents` 时**永久绑定**到当时的 `externalSubject`，跟我们库里的 `ownerId` 是两套体系。缓解：`File` 加 `jwSubject`（nullable String）专门存 JitWord 认识的创建者；`POST /api/files/[id]/ticket` 用 `rec.jwSubject || actor` 重放；新建 / 上传时 `jwSubject=actor`；迁移行由 `lib/bootstrap.ts::backfillJwSubject()` 每次启动**幂等回填**（读旧 `files.json` 原 persona 或邮箱反查，库里已有值不覆盖）。JitDrive 侧 `editor/viewer` 判定仍走 `ownerSubject===actor`，两层解耦、互不越权。未来若迁 Postgres 或接真实 SSO，接缝就在 `jwSubject` 与 `externalSubject` 的映射层，业务代码不动。

**风险 10 · 顶栏字段名漂移：`ui.toolbar` vs `ui.chrome`（已定位并缓解）**：iframe SDK 把外壳可见性的开关字段从（推测的旧名）`ui.toolbar` 改成了 `ui.chrome`，取值也从 `full/simple/none` 变成 `host/toolbar/full`（含义不同——`chrome:'toolbar'` = 只有编辑工具条但没顶栏；`chrome:'full'` 才有顶栏 + 右侧工具条）。宿主 `createEditor` 若继续传 `ui.toolbar:'full'`，SDK 会**静默忽略**并回落默认 `host`，用户看不到 JitWord 的编辑工具条。缓解：`EditorClient.tsx` 已改传 `ui:{ theme, readonly, chrome }`——编辑模式选 `'toolbar'`（保留编辑条、隐藏 JitWord 顶栏，因为文件菜单/下载/模式切换这些"外壳"操作由我们自己的 FileHeader 承担，两套并排会让用户以为是两个产品），预览模式选 `'host'`；`types/jitword-sdk.d.ts` 把 `chrome` 加进类型并把 `toolbar` 标为 legacy alias，避免下一次改回来又忘记；同时保留运行时 `editor.setToolbar('full')` 兜底重试。生产阶段应锁 SDK loader 版本（当前 `v1/loader.js`），或订阅 manifest 变更通知。

**风险 11 · 目录层级循环 / 孤儿（v0.4 新增，已定位并缓解）**：Folder 与 File 都是自引用 (`parentId`)，一旦允许「移动到任意父」，用户可以把自己套进自己的子孙里形成循环（后续面包屑 / 上溯查询会死循环），或者出现「子活了父还死」的孤儿视图（回收站还原不当时）。缓解：① `moveFolder` **写前沿新 `parentId` 上溯**，遇到 `cursor.id === moving.id` 直接 409「不能把文件夹移动到它自己的子目录下」，深度硬闸 64 防脏数据把请求打爆；② 前端 `<MoveToFolderDialog>` **拉平铺树后做定点迭代**剔除「自己 + 自己所有后代」，视觉上直接不给这些节点可点，双保险；③ 级联软删打 `deletedViaParentId=<顶层 Folder.id>`，还原 folder 时 `updateMany` 按同一批次还原其内所有 file/folder，避免"子活了父还死"；④ 每次 `listChildren` 强制 `deleted=false` 且 `parentId=<目标>`，视图查询绝不带"未过滤已删"路径。冒烟已断言：alice 建 A→B→C，尝试 `PATCH /api/folders/A {parentId: C.id}` → 409。

**风险 12 · Preview SDK 外部脚本 / CSP（v0.4 新增，已定位并缓解）**：`https://jitword.com/preview_sdk/file-preview.bundle.js` 是**运行时动态注入的第三方脚本**——若上线生产配了 CSP `script-src 'self'`，脚本会被浏览器拦下，用户点 PDF 只能看到"预览服务不可达"降级卡片；jitword.com 挂了 / CDN 抽风 / 网络抖也会让 `await load <script>` 卡住不动。缓解：① CSP 需显式允许 `script-src 'self' https://jitword.com`（README 部署一节已列出），Dev 环境未设 CSP 不阻塞；② `lib/preview-sdk.ts` 用**单例 Promise + 8s 超时**包住 `<script>` 加载：同一页面第二次 `loadPreviewSdk()` 直接 await 缓存，超时后 `Promise.reject`；③ `SdkPreview` 用 `try/catch` 捕获错误，渲染降级卡片（"预览服务不可达 · 重新加载 / 下载文件"），不阻断面包屑 / 文件名 / 大小 / 共享 / 返回按钮；④ 生产演进建议：把 bundle 拉到我们自己的 CDN（同域），或用 `<script>` SRI 锁哈希。同时 CSP 需保留 `frame-src https://inner.jitword.com`（iframe 编辑器）与 `connect-src 'self' https://inner.jitword.com https://jitword.com`（ticket / raw fetch / preview bundle）。

**风险 13 · 扩展名 / kind 派生漂移（v0.4 新增，已定位并缓解）**：一旦 `lib/filetypes.ts` 白名单把某个扩展去掉（例：某天决定不再支持 `.ofd`），老 SQLite 行仍带着 `extension='ofd'` 存在；如果 kind 也持久化到库里就会出现"库里 kind='previewable'、UI 按最新白名单算 kind='other'"的错乱。缓解：**只持久化 extension + mime，不存 kind**——`kindOfExt(extension)` 每次从 `lib/filetypes.ts` 现算，白名单一变老数据自动重分类，UI 会自然降级到「下载查看」而不报错。副作用：`schema.prisma` 里 `File.extension` 是 `String?`，历史行为 `null`，`toRecord` 用 `extension || 'docx'` 兜底（v0.3 时代所有行都是 docx，安全）。曾踩过的孪生 bug：`kindOf(name)` 需要有点号，`toRecord` 传的是**裸 extension**（无点）导致全部派生成 `other`——已拆出 `kindOfExt(ext)` 供库内使用，`kindOf(name)` 内部 delegate 到 `kindOfExt`。冒烟已断言：上传 PDF → `X-File-Kind: previewable`，上传 PNG → `X-File-Kind: image`。

**风险 14 · 匿名分享链接的枚举与爆破（v0.5 新增，已定位并缓解）**：`/s/[code]` 完全匿名可访问，意味着任何人都能拿 code 猜；短码空间如果太小（例：6 位十进制 10^6）会被脚本短时间穷举；有口令时不做限速会被离线爆破。缓解：① `generateCode()` 用 `crypto.randomBytes` + **rejection sampling** 保证 base62 均匀分布，code 长 8 位 ⇒ 空间 ≈ 218 万亿（2.18 × 10^14），配合"未解锁时 `GET /api/share/[code]` 只回 status 不回元数据"杜绝侧信道枚举；② `POST /unlock` 走 `lib/share.ts` 进程内**滑动窗口限速**（key=`ip|code`，15 分钟 5 次失败即锁 15 分钟）——早期 `{fails, until}` 结构"首次失败就把 until = now + WINDOW_MS"会导致一次输错立即锁号，已重写为 `{fails, windowStart}`，只在跨过 `MAX_FAILS=5` 阈值时才锁；③ 口令本身走 scrypt + 随机 salt（复用 `lib/auth.ts::hashPassword`），离线拖库也难恢复；④ Owner API `GET/PATCH/DELETE /api/share-links/[code]` 越权一律 **404 不 403**，不给 code-enumeration 留 oracle。红线：限速表当前是 Node 进程内 `Map`，重启清空、多实例不共享——生产必须换 Redis（`SET key EX 900 INCR`）；接缝只在 `isLocked/recordFail/resetFails` 三个函数，替换成本很低。另需生产化：口令下发走短信 / 邮件签名链接而不是让 owner 手动复制；`allowDownload=false` 只隐藏 UI 下载按钮、raw 路由不真正禁止，防君子不防小人。

**风险 15 · 匿名落地页 viewCount 被资源子请求打爆（v0.5 新增，已定位并缓解）**：`/s/[code]` 一次页面渲染会额外派生多个资源子请求（PDF 分片 Range / 音视频拖动 / iframe 握手换 ticket / 图片 `<img>` src 拉 raw / JitWord-Preview SDK 内部反复 fetch），如果 viewCount 在每个资源端点都 `+1`，一份 PDF 拖 3 次进度条就能记 5 次浏览次数，`maxViews=10` 的链接瞬间被打爆。缓解：**只在 `page.tsx` SSR 成功分支里 `recordView(id)` 一次**（`authorizePublic` 通过后、渲染 `<ShareEditorClient>` / `<ShareFilePreview>` 之前）；raw / ticket / unlock 三个资源端点**绝不 `recordView`**，它们只做 gate 检查（`authorizePublic` 复用一次但不写计数）。冒烟已断言：owner 建 maxViews=100 链接，访客连开 3 次 `/s/{code}`，`viewCount` 从 1 递增到 4（delta=3），后续 curl `raw` 20 次不再让计数变化。副作用：iframe 里 JitWord 编辑器自己发的 websocket 心跳不计入，只计"人打开了落地页 HTML"这一层，符合"浏览次数"的产品语义。生产演进：真要审计谁/什么时候点了，加 `ShareView(id, linkId, ip, ua, ts)` 明细表，viewCount 走 `COUNT(*)` 派生而不是列自增。

**假设**：JitWord Demo 环境在演示时段可用；不承诺生产级 SLA。若 demo 站点 5xx，UI 层给出友好提示且不落库错误状态。JitWord-Preview SDK 官方承诺覆盖 `docx/xlsx/pptx/ofd/pdf/txt/md/html` 八类；若上游扩/缩清单需同步 `lib/filetypes.ts::PREVIEWABLE_EXT`。

## 8. 界面结构

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ JitDrive  [ 搜索 ] [ + 新建 ▾ ] [ ↑ 上传文件 ]        (徐晓溪 ▾ 用户菜单) │  TopBar（新建拆 Word/文件夹；编辑/预览页隐藏搜索+新建+上传）
├──────────┬─────────────────────────────────────────────────────────────────────┤
│ 我的云盘 │ 我的云盘 › 项目资料 › Q4 复盘                                          │  Breadcrumb
│ 最近打开 │ ┌──── 左：文件 / 文件夹列表 ─────┐  ┌── 右（sticky）：上传卡 ──┐  │  grid lg:grid-cols-[minmax(0,1fr)_300px]
│ 共享给我 │ │                                │  │  ⬆  点击 / 拖拽上传     │  │  UploadZone 竖版（图标头 + 虚线区 + 支持类型脚注）
│ 回收站   │ │ ┌── 文件夹 ─────────────────┐ │  │  Word · Excel · PPT ·   │  │
│          │ │ │ 📁 会议纪要  [移动][改名]  │ │  │  PDF · 图片 · 音视频…   │  │  <input multiple> 顺序队列 done/total
│ ─ 模块 ─ │ │ └─────────────────────────────┘ │  │ ────────────────────────  │  │
│ 保留 30天│ │ ┌── 文件 ─────────────────────┐ │  │  [选择文件]              │  │  上传后 router.refresh()+60ms+push(firstId)
│          │ │ │ 图标 名称        大小  …    │ │  └──────────────────────────┘  │
│          │ │ │ 📄 合同.docx    12KB  查看  │ │                                 │  FileList（kind 分色 + 移动到 + 分享）
│          │ │ │ 📕 需求.pdf    340KB  查看  │ │                                 │
│          │ │ │ 🖼  首页.png    88KB  查看  │ │                                 │
│          │ │ └─────────────────────────────┘ │                                 │
│          │ 回收站态：混合列表（folders + files），顶部 = [清空回收站]         │
└──────────┴─────────────────────────────────────────────────────────────────────┘
                                                       ↑ 窄屏单列堆叠（列表在上、上传在下）
```

**首页 / 目录页**：容器 `max-w-7xl`；grid `lg:grid-cols-[minmax(0,1fr)_300px] items-start gap-6`——**左列 `min-w-0`**（防子元素溢出）承载 `<Breadcrumb>` + `<DriveBrowser>`（内含 `<FolderGrid>` + `<FileList currentFolderId=…>`），**右列 `<aside class="lg:sticky lg:top-6">`** 承载 `<UploadZone folderId=…>`；窄屏单列堆叠顺序"列表 → 上传"。TopBar「新建」下拉：新建 Word 文档（走 `/api/new`，仍进 JitWord 编辑）· 新建文件夹（走 `/api/folders`）。「上传文件」按 `uploadAcceptAttr()` 接受全白名单类型，v0.5.1 起卡片本体支持 `<input multiple>` 多选顺序上传。

**文件详情的两条路**：`kind='jitword'`（docx）→ `/files/[id]?mode=edit|preview`，JitWord iframe + FileHeader（返回 / 模式切换 / 下载原 .docx / 导入 Word，仅 owner 见编辑入口）；`kind ∈ {previewable, image, audio, video, archive, other}` → `/files/[id]/view`，`<ViewHeader>`（返回 / 文件名 / kind 徽标 / 大小 / 下载原文件）+ `<PreviewClient kind=…>`。previewable 走 JitWord-Preview SDK 挂载到 div；image/audio/video 走浏览器原生标签；archive/other 显示下载卡片。

**共享弹窗**：仅文件（不含文件夹），FileList「共享」按钮 → 拉 `GET /api/users` 花名册（`kind='jitword'` 的 sharedWith 走 JitWord viewer 只读 ticket；非 docx 类型共享后对方同样可在「共享给我」看到并可预览/下载）。

**四大模块**（复用同一 FileList，`variant` 切换列 / 行内操作）：drive 完整操作 · recent 只读 · shared 只读 + 「来自 xx」 · trash 显示还原 / 彻底删除 + 「剩 N 天」；trash 页面同时渲染 `<FolderTrashList>` 与 `<FileList variant="trash">`，`listTrash` 一次返回 `{files, folders}`。

## 9. 非目标（防止范围蔓延）

- 不做「网盘型」超大量存储：图片上限 20MB、office/pdf 上限 50MB、音视频 / 压缩包上限 200MB（详见 `lib/filetypes.ts::maxSizeFor`）；再大引导用户走对象存储直传（v0.5+）。
- 不做「离线可编辑」；关闭浏览器即断开协同，重开走完整握手。
- 不做「多格式互转」（xlsx / pptx / pdf → docx），需要转的引导用户先用桌面 Office 另存；Preview SDK 只做只读渲染，写入仍走 docx → JitWord 建文档这条路。
- 不做「正文全文检索 / OCR」——SDK 未提供，别在云盘这层造轮子；本轮只做到**标题级**全局搜索（v0.3）。正文级检索与 AI 摘要 / 问答能力已列入路线图，见 §11「AI 智能能力规划」。
- 不做「文件夹级共享 / 权限继承」（v0.5）；不做「拖拽移动到目录」（本轮只到菜单/对话框）；不做「回收站到期自动清理」；不做「压缩包内预览」（zip-bomb 风险）。

## 10. 交付物清单

代码：`/Users/xuxiaoxi/Desktop/pay-wx/ai_lab/iframe-sdk-demo/`（Next.js 14 全栈 + Prisma / SQLite + JitWord iframe SDK + JitWord-Preview SDK）。
文档：本 PRD、`ARCHITECTURE.md`（时序图 / 信任边界 / v0.4 决策 4.13~4.18 / v0.4.1 决策 4.19 / v0.5 决策 4.20~4.24 / v0.5.1 决策 4.25~4.28）、`README.md`（跑起来 + 数据层迁移 + 排错）。
演示脚本：`/tmp/test-content.docx`（macOS `textutil` 生成，可作为 UAT 输入）；任意 PDF / PNG / MP4 走 `/api/files` 上传通路即可覆盖 v0.4 新增分支。
运行验证：见 `README.md` 第 6 节「冒烟测试」——① ~ ⑤ 覆盖 v0.1 文档闭环，⑥ 覆盖 v0.3 数据隔离，⑦ 覆盖共享 / 回收站，⑧ 覆盖邀请码注册；v0.4 新增断言 ⑨~⑯：建 folder / 列 folders / 上传 PDF 与 PNG（kind 派生） / `raw` 200 + `Range` 206 + `HEAD` 200 / 非 owner `raw` 404 / 非 docx 走 ticket 415 / 文件夹循环 409 / 级联软删→还原→purge / `archiveLooseFiles` 幂等。v0.5 新增断言 ⑰~㉓：owner 建 3 类链接（docx/pdf/image 各一） → 匿名 GET `/s/{code}` 200 + `<meta robots noindex>` → 加密链接未解锁只回 `status:need-password`（不含文件名） → `POST /unlock` 正确 → 种 `jw_share` → `router.refresh` 后真实渲染 → `viewCount` 只在 `/s/` SSR +1（资源子请求不重复计数）→ owner 撤销 → 再访问显示"分享已被撤销" → 未知 code → 404 → 非 owner `POST /api/files/[id]/share-links` → 403。v0.5.1 新增断言 ㉔~㉗：owner 建**白名单链接**（`inviteeIds=[bob]`） → 匿名 `GET /s/{code}` 命中 `reason:'need-login'` 渲染 `<LoginGate>` / `GET /api/share/{code}` 401 → bob 登录后 200 正常预览、carol 登录后 403 `not-invited`、owner 本人 bypass → `POST /api/files/[id]/share-links { inviteeIds, password }` 400 互斥；未知 `userId` 400；`GET /api/users?q=<kw>&limit=20` name/email OR contains 命中，`q=不存在的关键词` 空数组；白名单链接 owner 撤销 → 之前 `unlocked:true` 立即变 410；同一文件同时存在的**公开 / 加密链接**在新 `authorizePublic(code, viewerUserId)` 下**行为字节级不变**（匿名 200 / 密码门照旧）；两栏首页 `?folderId=…` 传参 / `router.refresh()` 上传后跳转 firstId 语义保留（无 URL 变化）。v0.5.1 三条交付线：白名单链接双重门 + 可搜索 UserPicker + 两栏首页 layout。

## 11. AI 智能能力规划（v0.7 → v1.0 路线图）

**本节现状**：v0.6.1 只出规划；**v0.7 已把 P0 四条 quick-wins 全部落地**（智能标签建议 · 重复文件检测 · 敏感内容启发式扫描 · 最近智能推荐 + 顶栏「你可能想找」），入口是新的 `/drive/smart` 面板 + 首页横幅 + 分享弹窗预警。P1 (v0.8) / P2 (v1.0) 仍是规划状态，等 embedding / LLM 供应商合同签下后再启动。

**为什么先做规划、再落 P0**：v0.5.2 交付后 PM 侧收集到的下一波诉求已经明显从「能存能分享」迁移到「能不能帮我读、帮我找、帮我总结」——同事开一份 30 页的合同要看半小时、「我去年 Q4 那份预算表在哪」翻 5 分钟、共享目录里到底哪份文件被同事改过又要重看一遍。这类「文档太多读不过来」的痛点是**智能云盘**相对传统网盘的真正分水岭。但 AI 能力背后是一整套新栈（embedding 供应商、LLM 供应商、向量库、OCR、密钥托管、成本预算、用户同意流），任何一环没定就动手都是把技术债种进产品。所以先钉方向、优先级、依赖、风险、验收指标；再把不依赖任何供应商合同的**纯 heuristic / 本地库表**四条 P0 落地做验证——v0.7 走完这一段。

### 11.1 能力矩阵（五条正交轴）

**内容理解（Content Understanding）**——把不可检索的字节变成结构化语义。核心动作是**文档解析 + 特征抽取**：docx 走 JitWord `importDocx` 抽正文（浏览器内），PDF 走 pdf.js 或 pdf-parse（服务端），图片走 OCR（v0.8+）。派生层：**摘要**（1 句 TL;DR + 3~5 条要点），**智能标签**（合同 / 简历 / 会议纪要 / 财务 / 技术设计 / 个人 / 学习…），**关键实体**（人名 / 时间 / 金额 / 甲乙方 / 项目编号），**内容分类建议**（"这份像是合同，建议放进『法务/合同』"）。派生结果落 `FileInsight{ fileId, kind, payload json, modelVersion, contentHash, ts }`，按 `contentHash + modelVersion` 幂等，成本可控——同一份文件同一版模型只算一次。

**检索增强（Retrieval Augmentation）**——把标题级搜索升级成正文 + 语义级。核心是**每条洞察一份 embedding 向量**（中文优先 `bge-large-zh-v1.5`，或阿里 DashScope `text-embedding-v3`；OpenAI 走 `text-embedding-3-small`），存 `FileEmbedding{ fileId, vector blob, model, dim, ts }`；SQLite 阶段用 `sqlite-vec` 扩展做 KNN，Postgres 迁移后换 `pgvector`（`lib/store.ts` 已预留 seam，raw query 出口）。产品形态：**语义搜索框**（"报销流程"能命中"差旅费管理办法.pdf"）、**相似文件推荐**（打开一份文档，右侧栏推 Top-5 语义相近）、**近似重检测**（content hash 精重 + embedding 余弦 ≥ 0.95 找近似重）、**跨文件问答 RAG**（"我合同里的违约金一般是多少？"→ 检索 → LLM 汇总）。

**协作智能（Collaborative Intelligence）**——多人共同编辑现场更省心。核心挂在 JitWord 编辑器侧：**一键大纲**（长文自动目录）、**段落改写 / 语气调整**（正式化 / 口语化 / 精简）、**续写 / 补全**、**AI 校对**（错别字 / 标点 / 单位一致性）、**智能批注建议**（读一遍给出「第 3 段数字前后不一致」「这里的日期没写年份」）。会议场景是协作智能最大蓝海——**语音上传 → ASR → 纪要 + 待办抽取 + @ 到具体人**。这一栏**强依赖 JitWord SDK 是否开放 selection / insertContent API**（`types/jitword-sdk.d.ts` 里已经有 `setSelection / scrollTo / insertContent`），落地上更多是 JitWord 侧的能力联动而不是我们造编辑器插件——生产演进时和 JitWord 团队一起排 Sprint。

**安全与治理（Safety & Governance）**——AI 反过来服务于合规。**敏感内容检测**（身份证号 / 银行卡 / 手机号 / 密钥 PEM / 长 base64 用 regex + entropy 双路启发式，v0.7 即可开工不依赖 LLM），命中时打 `File.sensitivity:'low|medium|high'`；分享弹窗**风险预警**（"这份文件包含 3 处疑似身份证，是否继续分享？"），高敏文件默认建议走白名单链接；**外发内容审计**（企业版：谁通过哪个 ShareLink 把哪类内容分享给了外部域，出报表）；**版权 / PII 打标**（图片 OCR 出人脸 / 车牌时提示）。这一栏的**产品价值最高**——很多客户买企业网盘不为快而为「出事时能追」，是 B 端付费转化的第一理由。

**自动化（Automation / Agents）**——重复动作沉淀成规则。形态是**触发器 + 动作**：「上传的合同 → 抽甲方乙方 → 打标签 → 归档到 `/法务/合同/2025Q4`」「每周五把新增文档摘要发到飞书群」「共享链接浏览 > N 次自动提醒 owner」「批量把『扫描件-2024-XX-XX.pdf』按日期重命名」。实现路径三级：先做**内置 5 条预设模板**（开箱可用），再做**低代码规则编辑器 DSL**，最后做**自然语言生成规则**（用户敲一句 AI 生成 YAML）。这一栏是 v1.0 智能体形态的雏形，v0.7/v0.8 先把数据层（洞察 / embedding / 事件流）铺好。

### 11.2 三阶段路线图

**v0.7 · Quick Wins（3~6 周，本地 heuristic 为主，零 LLM 依赖）**——目标「用户点开云盘立刻感到它比 Notion / 百度网盘聪明一点」，**绝不自建解析器**（保真度已交给 JitWord）。四条并行 Story：**智能标签建议**（title + extension + 首段文本 + 目录上下文，规则版即可，接受率 ≥ 40% 就切下一版）· **最近智能推荐**（`listRecent` 已有底，加 recency × frequency × 编辑权重排序 + 顶栏「你可能想找」）· **重复文件检测**（sha256 精重 → 一键合并；size + 前 8 KB + 扩展名启发近似重）· **敏感内容启发式扫描**（regex 覆盖身份证 / 银行卡 / 手机号 / 私钥 / 长 base64，命中打标 `File.sensitivity`）。这四条**不需要 embedding / LLM 供应商合同**，纯服务端 + 本地库表，做完 v0.7 就有「AI 味」，为付费档位埋点。**唯一新增基建**：`FileInsight` 表 + 首段文本抽取（docx 走 importDocx 结果 payload，pdf 走 `pdf-parse` npm）。

**v0.8 · LLM 集成（8~12 周，成本敏感，需供应商合同）**——目标「用户能真正让 AI 读文件」。**语义搜索**（bge / DashScope embedding + `sqlite-vec` / pgvector KNN + 结果卡片高亮命中片段）· **单文档摘要**（TL;DR 一句话 + 3~5 要点，按需生成不是上传即生成，用户点「✨ AI 摘要」才调用）· **单文档问答**（针对一份文档的 Q&A，答案带引用片段+「跳到原文」）· **一键大纲 + 段落改写**（走 JitWord SDK selection / insertContent）· **OCR 接入**（PaddleOCR 自建池 或 阿里云 OCR 按量，扫描件 PDF / 图片可检索）· **分享前风险提示**（结合 v0.7 的 sensitivity 标记 + LLM 判「这份文档看起来适合对外分享吗」）。这一阶段**开始有月度成本**——embedding 便宜（百万 token 几美元），LLM 摘要按用户 / 按天做硬熔断（每人 200 次/天），OCR 走按量代金券；**必须先签供应商合同**。**用户同意流**必须一起做：首次点击 AI 功能弹「我们使用 XX 模型处理你的正文，仅本次调用不留存；如需完全本地模式请点这里」。

**v1.0 · 智能体与自动化（3~6 月，产品形态创新）**——目标「云盘从被动仓库变成主动助手」。**跨文件问答（RAG）**（用户在自己所有文件里问「过去半年合同金额 > 5 万的有哪些」，检索 + LLM 汇总）· **工作流引擎**（触发器 + 动作 DSL，内置 5 条模板 + 自然语言生成规则）· **智能归档**（新上传文件 AI 建议目录，用户点确认即移动；批量整理「下载」文件夹场景一击解千愁）· **会议纪要智能体**（语音上传 → ASR → 纪要 + 待办 + @ 人 → 自动挂到具体 ShareLink 供与会人查看）· **周报 digest**（本周新增 / 更新 / 分享出去的文件 + AI 摘要，发到邮箱 / IM）。这一阶段的核心决策是「要不要引入**私有部署模型**」——面向企业客户几乎必然要（金融 / 政企过不了数据出境关），要么支持 BYO-LLM（客户填自己 OpenAI / 阿里 / 讯飞 key）要么走本地 llama.cpp / vLLM 池。

### 11.3 高价值 / 高优先级功能清单（PM 视角，可直接排 Sprint）

**P0（v0.7 起步必做，价值 ÷ 成本比最高）—— ✅ 已交付**：

1. **智能标签建议（规则版）** ✅ — 落 `lib/smart/tags.ts::suggestTags`（扩展名 → 类别标签 + 关键词命中 → 语义标签 + 目录上下文 → 上下文标签，三档 confidence）。API：`GET /api/smart/suggestions?limit=20`。UI：`/drive/smart` 底部「智能标签建议」段，运行时建议不写库（FileTag 表 v0.8 落地）。
2. **重复文件检测（sha256 精重）** ✅ — `lib/smart/hash.ts::inlineSha256` 在 POST /api/files 上传分支同步算，v0.7 之前的老数据由 `POST /api/smart/scan` 懒回填。API：`GET /api/smart/duplicates?limit=50`（GROUP BY contentHash + `@@index([ownerId, contentHash])`，跨 owner 严格隔离）。UI：`/drive/smart` 中段可展开组，"原件 vs 重复" + 可释放字节数显示。**清理动作 v0.8 补一键批量 purge**（当前只显式提示，用户按现有 ⋯ 菜单自删）。
3. **敏感内容启发式扫描（regex + entropy）** ✅ — 拆两文件避免 client bundle 拖入 fs：`lib/smart/sensitive-core.ts`（纯规则 + `scanContent` + `bannerTextFor`，client-safe）+ `lib/smart/sensitive.ts`（`scanFile` 服务端 IO wrapper）。命中规则：身份证 / 银行卡（Luhn 精判）/ 私钥 PEM / AWS AKIA / 明文密码 → high；手机号 / 邮箱 / 合同关键词 → medium。text-family（txt/md/html/htm/csv）走正文扫描（4 MB head slice 上限）；其他所有类型走文件名关键词。UI：**分享弹窗 `<LinkPane>` 顶部自动挂预警 banner**（high 红 / medium amber，非阻断，"AI 不动手"红线）+ `/drive/smart` 敏感文件段。列 `File.sensitivity String?`（应用层校验，SQLite ↔ Postgres 可移植）。
4. **最近智能推荐 + 顶栏「你可能想找」** ✅ — `lib/smart/recommend.ts::rankRecommendations`（recency × frequency × editBoost，冷启动走基于 createdAt 的 48h 平方衰减回退）。API：`GET /api/smart/recommendations?limit=5`。UI：`/drive` 首页顶部 `<RecommendationStrip>` SSR 直出，`sessionStorage` 记忆"关闭后 24 小时内不再弹"（对齐"不打扰"红线）+ `/drive/smart` 顶部推荐段。

**P1（v0.8 核心，需要 embedding / LLM 供应商 · 规划中）**：

5. **语义搜索**——正文 + 意图检索，直接对标 Notion AI / Glean 的核心心智；一旦做了就是**留存与付费**双引擎。
6. **单文档 AI 摘要**——按需生成成本可控；把 30 页 PDF 变成 30 秒能读完的东西；付费墙最合理的第一道产品能力。
7. **单文档 Q&A（带引用）**——摘要之上加一次交互，答案必须给「跳到原文」防幻觉；合同 / 财务 / 技术文档场景刚需。
8. **分享前风险提示**——把 v0.7 sensitivity 标记 + 语义判「适合公开吗」结合，owner 每次分享被兜一次；既是价值也是安全。

**P2（v0.8 后期 → v1.0）**：

9. **一键大纲 + 段落改写**（依赖 JitWord SDK 协作能力）
10. **OCR + 扫描件检索**（图片 / 扫描 PDF 打通语义搜索）
11. **跨文件问答 RAG**（v1.0 门面能力）
12. **智能归档 / 自动化工作流**（v1.0 智能体形态）
13. **会议纪要智能体**（语音上传 → 待办，最场景差异化）
14. **周报 digest 推送**（IM 集成）

**为什么 P0 里「敏感内容启发式扫描」排在语义搜索之前**——语义搜索是营销亮点，扫描是合规底线；启发式扫描**不用签供应商、不用 embedding、不用 LLM 预算审批**，v0.7 就能交付一条真金白银的付费理由。等产品侧把 embedding / LLM 合同签下来（一般 4~8 周），P1 里第一条正好是语义搜索无缝接上——PM 视角这个顺序是「低成本高感知先跑，重投入排后」。

### 11.4 关键依赖（任何一条不落实都不该开 Sprint）

**Embedding 供应商**——中文优先 `bge-large-zh-v1.5`（BAAI 开源，可本地部署）或阿里 DashScope `text-embedding-v3`；纯 OpenAI 走 `text-embedding-3-small`（1536 维，成本 $0.02 / 1M tokens）。选型先定 3 个月后能否换模型——`FileEmbedding` 表带 `model + dim` 列，切换后异步重刷，历史向量按 modelVersion 隔离。

**LLM 供应商**——国内合规考虑（金融 / 政企 / 教育客户）首选**通义千问 / 文心 / DeepSeek**；海外或技术团队用 **Claude / GPT**；混合策略——用户 BYO 模型 key 是企业版差异化能力。**合同要点**：数据不留存条款 / SOC2 / ISO 27001 / 支持数据出境评估报告。**Demo 阶段兜底**：任何 LLM 未接入前，AI 摘要按钮可先用启发式（首段 + title 拼接 + 停用词过滤）冒充，产品界面先跑起来。

**向量库**——SQLite 走 `sqlite-vec`（Prisma 里得 raw SQL，`lib/store.ts` 需新增 raw query 出口）；Postgres 平移后走 `pgvector`（`Vector(1536)` + HNSW 索引）。**Demo 阶段可以延后到 v0.7 收尾再定**——如果只做智能标签 + 重复检测，向量库都不用。

**OCR**——PaddleOCR 自建池（有 GPU 或走 CPU 慢速）或云端 API（阿里云 / Azure / Google Vision）。扫描件比例小的话 v0.8 后期再上，v0.7 完全不做。

**解析器**——docx 走 JitWord `importDocx` 已解析（客户端）；若服务端拿文本要么调 JitWord 侧导出 API（需与 JitWord 团队协商），要么用 `mammoth` 或 `python-docx`（v0.4.1 已移除 mammoth，重新引入服务端解析器需评估）。**PDF** 走 `pdf-parse` npm 或 pdf.js 客户端。**xlsx / pptx** 短期不做（比例小 + 结构复杂）。

**密钥管理**——LLM API key 只落 server `process.env`，**永远不进 client bundle**（Next.js 里凡是 `NEXT_PUBLIC_*` 都会泄漏）；BYO 场景下企业客户自填 key 需加密存 `TenantConfig` 表（AES-GCM with `SECRETS_KEY` env）；每用户 token 用量落 `AiUsageLog` 供配额熔断。

**成本预算**——v0.8 起步要有一张每月预算表。假设 **500 demo 用户 × 每人每月 20 次摘要 + 5 次问答 + 3 次搜索**：embedding 一次 2k token（约 $0.00004），摘要一次 input 4k + output 400（约 $0.02）。**每用户 token 熔断必须做**，产品级红线；`STORAGE_QUOTA_BYTES` 那种 env 覆盖机制在 AI 侧对应 `AI_MONTHLY_TOKEN_BUDGET_PER_USER`。

**用户同意流**——AI 功能**必须**在首次触发时弹同意对话框（「你的正文会送到 XX 模型处理，仅本次调用不留存；如需完全关闭 AI 请点这里 → 设置」），同意状态记 `User.aiConsentAt`；欧盟用户还要考虑 GDPR Art.22 自动化决策条款。**产品红线**：AI 摘要默认关闭、用户主动点「✨」才调用；不做「上传即全量索引」（成本 + 隐私双坑）。

### 11.5 风险与合规底线

**风险 · 隐私外泄**——用户正文送到第三方 LLM 是最刺的一根神经。缓解：企业版 BYO / 私有部署；个人版明示模型供应商 + 数据不留存政策；提供「仅本地 heuristic」模式；embedding 落库前**先做 PII masking**（正则替换身份证 / 手机 / 邮箱为占位符，向量照样能用但不含 PII）；`AiUsageLog` 只记 hash + token 数不记正文。

**风险 · 幻觉**——AI 摘要错说合同条款、问答答非所问是产品信任杀手。缓解：**所有 AI 答案必须附引用片段 +「跳到原文」链接**（这是 RAG 之所以存在的核心原因）；对合同 / 财务 / 医疗类文档打红色水印「AI 结果仅供参考，请以原文为准」；摘要生成落 `AiGenerated` 表留审计；用户可一键「标记不准」进反馈队列。

**风险 · 成本失控**——一个重度用户能一天调 500 次 LLM 把预算打爆。缓解：**per-user per-day token 熔断**（默认 100 万 tokens，超了降级 heuristic 或拒服务 + toast）；**embedding 幂等**（content hash + modelVersion 未变则跳过）；**结果缓存**（同一 fileId 同一 prompt 24h 内直接读缓存）；**告警**（成本日 > $X 时 IM 通知 PM 与工程）。

**风险 · 合规归属**——AI 生成的摘要 / 大纲是否算用户作品？AI 抽取的合同条款算不算「自动化决策」？中国境内还有《生成式 AI 服务管理暂行办法》的**备案要求**。缓解：**AI 输出内容归属用户**（写进用户协议）；v1.0 之前所有 AI 功能**只作为「辅助阅读」不做自动化决策**（自动化归档必须用户点确认）；国内上线走算法备案（若模型未备案则用已备案供应商，例如通义已备案）。

**风险 · 分享泄漏**——`/s/[code]` 匿名访客能不能看到 AI 摘要？规则：**摘要只对 owner 与 `FileShare` 花名册成员可见**，匿名访客即使有 ShareLink 也只看到原文；`FileInsight` 表读取时走 `authorizeView(actor, fileId)` 判定，**不走 ShareLink**。这条要在 API 层硬约束，不能靠前端隐藏。

**风险 · 冷启动体验差**——新用户没历史数据、推荐不准、语义搜索召回弱。缓解：v0.7 阶段以 heuristic 打底（title + extension + 时间排序），v0.8 embedding 上后逐步切换；对文件 < 20 份的用户不强推 AI 功能，避免「翻来覆去都是这三份」的尴尬。

**红线（产品级）**——**不做「AI 自动改用户文档」**：AI 建议永远是**用户显式点确认才写入**；**不做「AI 自动分享 / 自动发邮件」**：所有对外动作保留人审；**不做「AI 自动删除用户文件」**：归档、清理只出建议。这三条是文件保护原则（MEMORY 中「永不用 `unlink`」精神）在 AI 层的镜像。

### 11.6 验收指标（上线后 PM 每周看的东西）

**采纳类**——智能标签建议接受率 ≥ 40%（v0.7 · 决定要不要切 LLM 版）；语义搜索使用率 ≥ 30% 周活（v0.8 · 决定要不要继续投 embedding）；AI 摘要按钮点击率 ≥ 20% 打开过文件的人（v0.8 · 决定付费墙能否站住）；重复文件「清理」按钮接受率 ≥ 60%（v0.7 · 用户真的信这个能力）。

**质量类**——摘要主观分（内部 5 分制）≥ 3.5；抽查 100 条 AI 答案幻觉率 < 5%；敏感内容启发式扫描召回 ≥ 90%、误报 ≤ 10%；语义搜索 Top-3 命中率 ≥ 70%（内部 recall eval 集）。

**成本类**——embedding 平均一次调用 ≤ $0.0001；LLM 摘要平均一次 ≤ $0.02；per-user 月度 ≤ $0.5；每周总账单 ≤ 预算线；熔断触发次数 < 5% 用户（超过说明预算定低了或滥用严重）。

**信任类**——AI 同意弹窗接受率（多少用户点了「关闭 AI」）若 > 30% 说明营销过头用户不信任；「标记 AI 不准」反馈率 < 3%（超过说明幻觉或质量已经伤到核心体验）；企业版 BYO 模型客户占比（v1.0 · 差异化能力是否成立）。

**反指标（止损红线）**——如果 **AI 摘要按钮点击率高但二次点击率 < 20%**（用户点一次觉得没用不再点），意味着质量不过关，**立刻停止 v1.0 智能体投入**回到 v0.8 打磨；如果 **per-user 成本月环比翻倍**，意味着滥用严重（爬虫脚本刷 API），必须先补限速再谈功能。这两条写在 PRD 里避免团队「上了就舍不得撤」。

### 11.7 与其他 PRD 章节的联动

**§6 迭代路线图**：v0.6.1（本次）之后接 v0.7（§11.2 quick wins）→ v0.8（LLM 集成）→ v1.0（智能体形态）。**§7 风险与假设**：新增风险 16「AI 幻觉与隐私外泄」，与 §11.5 交叉引用。**§9 非目标**：原「不做正文全文检索 / OCR / AI 摘要」一句已改为「正文级检索与 AI 摘要 / 问答能力已列入路线图，见 §11」。**§4 MVP 范围**：v0.7 交付时新开 §4.10 描述具体 Story 拆分与验收断言。数据层新增表（`FileInsight / FileEmbedding / AiGenerated / AiUsageLog / TenantConfig`）与 v0.6 Postgres 迁移同步做，避免二次 schema 变更。

