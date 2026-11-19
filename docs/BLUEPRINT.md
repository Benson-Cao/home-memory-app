# Memory Harness v1.2.0 · 这一版的作用与下一项目完整实现过程

> 本文刻意放在**底盘仓库外**，不进 git、不推送 —— 远端 `main` 已定格在 `5f18012`、tag `v1.2.0` 与 Release 附件都已发布。往仓库里再加文件会产生新提交，让 tag 与 main 漂移，还得重跑双平台 CI。
> 建议落位：**新项目 repo 的 `docs/BLUEPRINT.md`**。
> 基线来源：本地仓库实读 + 公开只读 API 终检（2026-11-19）。你附的两个 GitHub 链接资源解析失败，本文不依赖它们。

> **进度（2026-11-19）**：阶段 0 ✅ · 阶段 1 ✅（真调 `deepseek-flash`）· **阶段 2 ✅**（底盘 `verify` 129/129，真维度 + SQL ANN + 跨维度隔离，见底盘 `docs/PHASE2.md`）。下一刀 = 阶段 3 真语义抽取与归纳。

---

## 0. 这一版到底交付了什么

### 一句话定位

**它不是记忆产品，而是「可替换性」的一份可执行证明 + 一条冻结的契约基线。**

当初那句 slogan ——「不是家庭 AI 产品，而是可被任意场景挂载的记忆基础设施」—— 在这一版之前只是图上的箭头；这一版把它变成了**可证伪的机器断言**：换掉 provider，场景插件源码零改动，116 项验收仍然全绿。

### 五个真实交付物

| 交付物 | 内容 |
|---|---|
| 契约 | `CONTRACT_VERSION = 1.2.0`；`seam-registry.json` 5 组 32 seam **全 `implemented`**；10 份 JSON Schema + TS 类型 |
| 内核 | L1 五件事：声明式依赖、类型化事件、`ctx` 逆序回收、契约版本、强制鉴权（fail-closed） |
| 治理语义 | 证据累积不覆盖、矛盾/过期只归档、`occurred_at`/`recorded_at`/`valid_from~valid_to`、换 embedding 后旧向量隔离拒检、插件卸载不物理删除、ABAC 执行点在 L2 |
| 运行形态 | PG16 + pgvector、compose、备份恢复、常驻 REST 10 端点、后台 worker、成员签名 token、审计落库（正文脱敏） |
| 工程闭环 | 116 项验收 + `ubuntu`/`windows` 双绿 + `v1.2.0` tag + Release 附件 + protection + About |

### 它不是什么（必须说清，否则下一项目会走错）

实读 `docs/USER_GUIDE.md` 的能力边界：

- 抽取是**按句号分句**，`embedder` 是 **16 维哈希** → 现在 recall 的「语义」其实是假的
- 四路检索**在内存跑**，`memory_embeddings` 虽已落库但**未用 SQL ANN**
- Reflect 挂了真模型才是真综合，否则是确定性桩
- 身份是本地 HMAC token + 目录，**不是 OAuth/OIDC**
- **没有界面**，`GET /` 只是端点索引；没有真 MCP 监听、没有采集器、没有 HTTPS/公网
- `package.json` 没有 `main` / `exports` → **底盘不是可 `import` 的 npm 库，只能当服务调**

所以准确说法是：**管理机制完整且被 116 项覆盖，但管的是确定性模拟数据。** 换成真实现时 `src/scenes/` 一行都不用改 —— 这句话现在有测试兜底，不是口号。

### 它的作用，一句话

> **把「换宿主 / 换模型 / 换引擎 / 换场景不改场景代码」从架构判断，降格成一条 CI 里的静态扫描。**

下一项目唯一不该做的事，就是 fork 底盘改源码：那等于宣告这一版没过关。底盘从现在起进入**依赖冻结**。

---

## 1. 新项目定义

**代号**：`home-memory-app`（可换）
**形态**：一个独立消费方仓库 + 以 A 档在底盘上填真 provider
**目标**：一个能被多端挂载、有真语义记忆、私有化可运维的服务 + 一个薄前端
**非目标**：OpenViking、Home Assistant（已排除）、重写底盘、动架构图 v1.2 / ADR / `CONTRACT_VERSION`

### 仓库拓扑

```
Benson-Cao/HomeServiceAI        ← 冻结：tag v1.2.0，只收 A 档 provider 填充
        │  REST 10 端点 / zip 附件
        ▼
home-memory-app (新 repo)       ← 消费方：只调 REST，禁止 import 底盘内部
   ├── apps/web                 前端（阶段 5）
   ├── apps/ingest              采集器（阶段 4，也可作为底盘 provider）
   ├── packages/providers       真 embedding / 真抽取（阶段 2–3，落回底盘 A 档）
   └── docs/BLUEPRINT.md        本文
```

**为什么双 repo**：底盘的验收是「消费方零耦合」。消费方一旦能 import `src/`，这条验收就失效了。第一个里程碑必须证明「薄消费方只靠 HTTP 就能跑通闭环」。

### 底盘对外形态（实读）

- 包：`@memory-harness/contracts@1.2.0`，`type: module`，无 `main` / `exports`，核心零依赖，唯一 `optionalDependencies: pg`
- 端点：GET `/health` `/stats` `/tree` `/`；POST `/retain` `/recall` `/reflect` `/sync` `/archive` `/precompute`
- 脚本：`verify` `test` `build` `check:schemas` `check:kernel` `acceptance` `governance` `dump:tree` `compose:config` `db:backup` `db:restore` `token:issue` `audit:recent` `smoke:llm` `smoke:stack` `smoke:daemon` `push:deferred`

---

## 2. 开工前先清的基线债（不写业务，A 档）

发版后实读发现 5 处**文档/打包层**残留，全是 v1.2.0 结项时没收干净。它们不改任何契约字段，不动 `CONTRACT_VERSION`，但会让下一项目的第一份文档建立在错基线上。

| # | 位置 | 问题 | 修法 |
|---|---|---|---|
| D1 | `docs/USER_GUIDE.md:481` | 仍写「线上仍是导入版 `4ca682f`，所有本地切片按 §10 延迟推送」 | 改为 `main=5f18012` / tag `v1.2.0` / Release 已发布 |
| D2 | `docs/USER_GUIDE.md` §11 | 写「`docs/ADR.md` 6 条架构决策」 | 实际 **5 条**：ADR-001/002/003/004/**006**（无 005，当时用覆盖映射表替代了） |
| D3 | `docs/ADR.md` 头部 | 「适用：v1.1 架构图 + V0.5 切片」 | 改为 v1.2 图 + v1.2.0 基线；**只改头部，不动 5 条决策正文** |
| D4 | `CONTRACTS.md`「V0.5 边界」段 | 仍写「Reflect / Graph / Temporal / 预计算只定义契约、不实现」 | 与 registry 32 全 `implemented` 冲突，改为「V0.5 曾降级，V0.7 起已全部实现，状态以 registry 为准」 |
| D5 | `package.json` | 无 `main` / `exports` | 若消费方坚持 npm 引用，补 `exports`（A 档打包配置）；**推荐走 REST，不改** |

另有一条未列：`docs/provider-swap-acceptance.md` 存在但 USER_GUIDE §11 没列进文档索引，顺手补。

> **阶段 2 收口时已处理**：D1 / D2 / D4 顺手修进底盘（USER_GUIDE 发布状态、ADR 条数 6→5、CONTRACTS V0.5 边界改为历史口径），`docs/provider-swap-acceptance.md` 与 `docs/PHASE2.md` 已补进 §11 索引，DEPLOY §10 改为「已完成 + 后续通用手册」。**D3 按冻结纪律未动**（ADR 头部保留原文，登记在 `docs/BASELINE-CORRECTIONS.md`），**D5 不改**（底盘只当服务调，不补 `exports`）。
> 阶段 2 必然产生新提交，tag `v1.2.0` 是发布快照、不随后续 A 档提交移动 —— 这是预期行为，不是漂移事故；CHANGELOG 已记「文档基线订正，契约未变」。

---

## 3. 全局闸门（每个阶段结束都跑，不新造流程）

| 闸门 | 命令 / 判据 |
|---|---|
| G0 回归 | `npm run verify` → **129/129**（阶段 2 后；或后续 N/N，fail=0） |
| G1 契约 | `check:schemas` 版本一致 `1.2.0`；`git diff` 未落 `seams/*.ts` / `*.schema.json` |
| G2 纯度 | `check:kernel` PASS；注入 `if (scene === 'health')` → **exit 1**，还原 → PASS |
| G3 可替换 | 场景插件源码零 provider 名 / 品牌名 / 部署通道判断；A/B 两份 profile **原样不动**，seam 集合一致 |
| G4 离线 | 单测**绝不**真发网络 / 连真 DB / 烧钱；真调用只在 `scripts/smoke-*.mjs`，需 env 才跑，**不进 `verify` / CI** |
| G5 双平台 | push 后 `ubuntu-latest` + `windows-latest` 双绿（Node 20，`node --test` 不带路径） |
| G6 凭据 | `.env` / key / token 只放本地，不进仓库、不进对话、不进 CI Secrets |

**分档哨兵**：`git diff` 落在 `src/providers/` `src/scenes/` `src/profiles/` + registry 的 `v05_status` → **A，直接合**；动 `seams/*.ts` 或 schema 且改字段语义 → **停，先写 ADR**。唯一触发 C 档的仍是「无 Node runtime 的单文件安装包」（ADR-006）。

**同步契约阻抗的现成桥接**（别改契约）：内存镜像 + flush 全量 diff / `prepare()` → 同步槽 / 审计缓冲批量写。新增 provider 照抄这三套，不要试图把 `complete()` / `put()` 改成 async。

---

## 4. 完整实现过程（阶段 0 → 8，一次只换一个变量）

### 阶段 0 · 锁基线 + 消费方骨架

**目标**：证明底盘能被外部项目挂载，零契约变更。

1. 新 repo `home-memory-app`，`git init`，加 `README.md` + `docs/BLUEPRINT.md`（本文）
2. `compose.consumer.yaml` 只引用已发布的底盘镜像/zip，锁 `v1.2.0` tag，**不 clone 底盘源码进 vendor**
3. 写 `packages/client/` 一个极薄 HTTP client：只封装 `/health`、`POST /retain`、`POST /recall`；带 `x-request-id` 透传与 `x-contract-version` 断言
4. 清 §2 的 D1–D5（或按你的 tag 策略决定不清）
5. 写 `tests/consumer.test.mjs`：**mock fetch**，断言三件事 —— 请求形状、`202 Accepted + job_id` 处理、`x-contract-version === '1.2.0'`

**检查**：G0–G4 全过；静态扫描新 repo 里**零 `from '../../HomeServiceAI/src'`**；`curl /health` 返回 `identity: member-token`。

**go / no-go**：这是第一个关卡。若消费方必须 import 底盘内部才能跑，停 —— 说明 v1.2.0 的「可挂载」没成立，先补 `exports`（D5）再继续。

---

### 阶段 1 · 真模型真调验证（已写但从未被真验证的那块）

**目标**：把 ② 的 `deepseekLlm` / `localGatewayLlm` 从「代码写了」变成「真跑过」。这是当前唯一**已实现、却被沙盒 403 挡住从未真调**的切片。

1. 本机 `cp .env.example .env`，填 `DEEPSEEK_API_KEY`（或 `LLM_LOCAL_ENDPOINT` 指向 Ollama / vLLM / LM Studio）
2. `npm run smoke:llm` → 先打 `/models` 打印当期真实列表，再真调一次，打印 token usage
3. `npm run smoke:llm -- --local` → 本地网关，无需云密钥
4. 把**真实模型名**回填 `.env` 的 `DEEPSEEK_MODEL`，**不自动取列表第一个**（不同型号价差数倍，选错不报错只悄悄变贵）
5. 校验 `reflect` 的 `synthesis` 是真模型输出、`sources` 非空、`hasPendingReply() === false`

**参数纪律**：`base_url = https://api.deepseek.com`（**不加 `/v1`**）、路径 `/chat/completions`、`thinking: {type}`、`choices[0].message.content`。模型名有版本漂移（`deepseek-v4-flash` / `deepseek-flash` 在不同快照出现过；`deepseek-chat` / `reasoner` 已退役）——**以 `/models` 实读为准，不凭记忆写死**。

**检查**：G4（真调只在 smoke）、G6（key 只在本地 `.env`）；`npm run verify` 必须仍是 116/116 且**不因缺 key 变红**；错误路径（超时 / 429 尊重 `Retry-After` / 协议错）由离线 mock 覆盖。

**隐私约束**：默认 profile 仍走本地模型；云 API 只挂**明确授权**的 profile；`defense` 脱敏保持**在 retain 之前**。别让「接了云」悄悄破掉双通道平级。

---

### 阶段 2 · 真 Embedding + 维度迁移 + SQL ANN（最大落差）

**目标**：把「语义」从假的变成真的。这是全项目技术风险最高的一刀。

1. 新增 `realEmbedder` provider（`embedder` seam），输出维度 `N`（如 1024/1536），**保留 `hashEmbedder` 作为 A/B 的另一实现**
2. **不要**把 `N` 写进 `seams/*.ts` 当契约字段 —— 保持代码常量 `EMBEDDING_DIM`，否则立刻滑到 B 档 1.3.0
3. DDL migration：`memory_embeddings` 的 `vector(16)` → `vector(N)`，写 `docker/migrations/002-embedding-dim.sql`；`npm run db:backup` **先备份**
4. 四路检索从内存搬到 pgvector ANN：`retriever.semantic` 走 SQL，`bm25` / `graph` / `temporal` 保持各自实现，融合权重 `CHANNEL_WEIGHTS` 不动
5. `vector` seam 的 upsert 写入 `embedding_dim` + `quantization_version` 到 `provenance`

**这一刀第一次真跑验收项 ⓘ**：换 `embedding_dim` / `quantization_version` 后，**旧向量必须被隔离 / 拒检且可观测**。这是整套架构专门加的「不报错、只变差」防线 —— 之前一直是模拟数据，现在才被真实检验。

**检查**：G0–G4；新增专项：`dim` 变更后旧记录 `recall` 返回空且审计有 `stale-vector` 事件；A/B 切 `hashEmbedder` / `realEmbedder` 场景插件零改动；migration 可从备份恢复演练；`npm run smoke:stack -- --mock` 回归 OK。

**坑**：`L0` 是**单写进程**（内存镜像在进程内）。daemon 跑着时别用 `l0-cli` 写；`SIGTERM` 会最后落库；**不要调 `app.dispose()`**（那是插件卸载语义，会把记录全标归档待审）。

---

### 阶段 3 · 真语义抽取与真归纳

**目标**：`extractor` 从「按句号分句」→ 经 `llm` seam 抽事实/实体；`precompute` 从「截断前 240 字」→ 真归纳。

1. `llmExtractor` provider：输入原文 → 结构化断言列表；**失败时降级回 `sentenceExtractor`，绝不抛穿内核**
2. `llmPrecompute` provider：生成心智模型摘要，仍写回既有字段，不新增契约字段
3. 保持 `consolidator` 判重口径统一 `normalized()`（上轮修过的缺陷：`"Hello  World"` vs `"hello world"` 必须 `strengthened`，不能 `new`）
4. 离线 mock 断言：抽取结果带 `occurred_at` / `dedupe_fingerprint` / `provenance`，且 `defense` 已在抽取**之前**跑过

**检查**：G0–G4；证据累积用例（同断言 `proof_count` 单调、`confidence` 单调、不新建不覆盖）；矛盾裁决后**旧证据链完整保留**；`reflect` 的 `sources` 可追溯到 `pipeline_run_id` / `model_id`。

**坑**：真抽取会让 `retain` 变成「一次 LLM 调用 + 一次 embedding」。必须复用阶段 1 的**有界队列 + 单并发 + 背压**，否则 NAS 瞬间被打满（ADR-001 第一次真压力）。

---

### 阶段 4 · 第一个采集器（合成数据 + 事件风暴）

**目标**：`source` / `sync` seam 接真实目录，验证水位线、指纹去重、断点续传、背压。

1. `fileSource` provider：只接一个笔记目录，白名单写在 `config/`（**配置数据，不能写成 `if (path.startsWith(...))` 落在场景插件**）
2. 用**合成数据**，不要给真实家庭/健康数据
3. 走 `sync()`：`time_fired → occurred_at`、指纹去重、`cursor` 水位线、断点续传、lag 可观测
4. 造一次事件风暴（如 500 条），验证有界队列超限转 deferred + 背压计数，**宁可写入慢不让服务挂**
5. 端侧只缓冲、不裁决；冲突一律回服务端按 `ConflictPolicy` 裁决

**检查**：G0–G4；回归上轮修过的 `resumableSync` 缺陷 —— `restore(snapshot)` 后 `cursor` / `buffered` / `downstream` / `lagMs` 四项**不能是 `null / 0 / 0`**；逐条按指纹去重（别用整批 `r.accepted > 0` 判断）。

**分档提示**：若要做**持续推送式**采集（WebSocket / 长连接），现有 `SourceProvider.collect()` 是同步批量 → 需新增 `stream-source` seam，那才是 **B 档 1.3.0**。V1 用周期快照就够，别提前升版本。

---

### 阶段 5 · 消费方前端（独立 repo，只调 REST）

**目标**：把 `GET /` 从「端点索引」变成能用的界面。

1. `apps/web`：三屏 —— 写入（retain）、检索（recall + 时间/来源展示）、审计（audit:recent）
2. 成员 token 先由 `npm run token:issue -- --sub=parent --device=laptop-parent` 代发，**不上 OAuth**（阶段 7 再说）
3. 展示每条结果的 `time + provenance`，让「可追溯」在 UI 上可见
4. `child` 身份读 `work` bank：返回 **403 或空结果**，且不泄露 bank 存在（ABAC 四维已有）
5. 前端 repo 的 CI 只跑自己的单测，**不跑底盘 116 项**（底盘由自己的双平台 CI 守）

**检查**：`x-contract-version` 断言；错误码 400/401/403/404/405/413/500 结构化展示；局域网可达；**零底盘源码 import**。

---

### 阶段 6 · Agent 接入 + 网络边界（二选一，别一次上两个）

**目标**：从「人调 REST」到「Agent 调」。

1. **REST 或 MCP 二选一先跑通**：把 `agent-adapter` 变真 MCP server，或保持 REST 加一层 Agent SDK 适配
2. 反代 / TLS：局域网 HTTPS；远程按需开隧道，别裸奔 8080
3. 可选 `MH_HTTP_TOKEN` Bearer（`/health` 豁免供 healthcheck）
4. 端侧缓存 + 断点续传沿用 `sync` seam，冲突回服务端

**检查**：G0–G5；`smoke:daemon --identity` 全链路；MCP 工具列表与 10 端点一一对应；证书与凭据不进仓库。

---

### 阶段 7 · 身份真实化 + 审计可查

**目标**：`principal` 从测试字符串变成真实 subject。

1. 成员目录从 `config/members.json` 换成真实来源（LDAP / 家庭账号表 / OIDC 二选一）；**OIDC 若新增字段 = B 档**，优先用「OIDC 换发本地 HMAC token」保持 A 档
2. ABAC 四维（角色 / 敏感度 / 设备可信度 / UTC 时间窗，支持跨午夜）从目录查，执行点**仍在 L2 `isolation-policy`**，profile 只装配不裁决
3. 审计 `memory_audit_log` 加查询界面：`http.request` / `response` / `auth_failed` / `retain.*` 可检索；**正文一律 `[redacted]`**
4. 清掉 `policy.ts` 里任何「V0.5 不实现」类过时注释

**检查**：伪造身份 → `400 principal-mismatch`；策略缺失/抛错 → **fail-closed**；审计表不含记忆正文。

---

### 阶段 8 · 运维、压测与发布

1. 限流与成本控制（云 API 按 `usage` 计量设日上限）
2. 监控告警：队列深度、背压计数、`accepted → visible` P95、dead-letter、stale-vector 拒检数
3. 并发压测：真实 SLA，不再用 `setImmediate` 模拟延迟
4. 备份恢复**演练**（不是只跑脚本）：`npm run db:backup` → 删卷 → `npm run db:restore -- backups/xxx.sql.gz` → 数据一致
5. 按 `docs/RELEASE.md` 发版：双绿 → protection → tag → Release 附 zip → About
6. 更新 `CHANGELOG.md` / `CONTRIBUTING.md` / `docs/provider-swap-acceptance.md`

**完成判据**：双平台 CI 绿 · 116+ 验收全绿 · `accepted→visible` 有可复现数字 · 恢复演练通过 · 内网 HTTPS 可达 · 零密钥入仓。

---

## 5. 里程碑与 go / no-go

| # | 里程碑 | 判据 | 不过就停 |
|---|---|---|---|
| M0 | 消费方挂载 | 薄 client 只靠 HTTP 跑通 retain/recall | 补 `exports`，不 fork |
| M1 | 真模型 | `smoke:llm` 真调一次，usage 可观测 | 查 `/models`，别猜型号 |
| M2 ✅ | 真语义（离线已验） | 旧向量隔离拒检 + SQL ANN 生效 | 备份先做，别直接改 DDL；真 PG 迁移仍需你本机 |
| M3 | 真抽取 | 证据链/冲突治理在真数据下仍成立 | 降级回分句抽取 |
| M4 | 真采集 | 事件风暴不拖死服务 | 缩小队列/加背压 |
| M5 | 可用 | 前端三屏 + 多成员隔离 | — |
| M6 | 可挂 Agent | REST/MCP 之一跑通 | 别同时上两个 |
| M7 | 可运维 | 恢复演练 + 监控 + 压测 | — |

**一条纪律**：每阶段结束打一个本地 commit、`npm run verify` + G1–G4 全过才进下一阶段。上一版一口气铺 32 seam，回头补了 6 个真实缺陷 —— 别重复。

---

## 6. 风险登记（都是这一版真踩过的，直接复用）

| 风险 | 防线 |
|---|---|
| Windows CRLF 让「DDL 逐字一致」断言假失败 | `.gitattributes: * text=auto eol=lf` 已在；断言比较前 `replace(/\r\n/g,'\n')`；**别回退** |
| `node --test tests/` 在 Windows 被当模块路径 | `package.json` 保持 `node --test`（不带路径） |
| 打包漏 `build/` | 六个 `pre*` 钩子 + `files` 含 `build/`；改 `.ts` 才需 `npm install` |
| 解压覆盖留幽灵文件 | `push:deferred` 先清空工作树再复制 |
| 本地改了修复、远端没同步 | 重打 zip 前核对 `package.json` 的 `test` 值（真踩过：差点覆盖回退） |
| 「汇总没打印」被误读为通过 | 检查编排本身：分段记录 rc + try/finally 还原 |
| 占位 git 身份 | 推前局部 `git config`，**别 amend 已两次复核的 SHA** |
| PAT 明文出现在对话 | 立即 Revoke；**别动 GCM 登录态**（tag/后续 push 靠它） |
| 换 embedding 后静默降质 | `embedding_dim` / `quantization_version` 隔离拒检 + 可观测 |
| 单写进程被并发写坏 | daemon 跑着禁用 `l0-cli` 写；不调 `app.dispose()` |
| 模型名退役 / 价差 | `/models` 实读，不自动取第一个 |
| 真抽取 + 真 embedding 双击 NAS | 有界队列 + 单并发 + 背压，写入先落原始事件立即 `accepted` |

---

## 7. 分档与 ADR 触发（照抄 `CONTRACTS.md`）

- **A**：填真 provider、采集器、前端、MCP、SQL ANN、Reflect 实现 → 版本**不动 1.2.0**、不写 ADR、图 v1.2 不动
- **B**：新增 seam / 新增可选字段 / 新增 profile 装配层 → `1.3.0`、建议记一笔、仅 seam 清单变时出图的小版本
- **C**：删字段 / 改类型 / 推翻既有 ADR / **无 Node runtime 单文件安装包** → MAJOR + 必须新 ADR + 必须升图版本

> `ADR-004`「切忌在 V0.5 铺开」是**排期纪律，不是契约冻结**。阶段 2–8 全部 A 档，不需要为每批 provider 开 ADR。
> C 档必须升版本的真理由：`provenance.contract_version` 不变时，旧记忆会被新代码按同版本读 —— 不报错只变差。

---

## 8. 发布流程（复用，不重造）

全程**不 force**、以远端为父叠提交：

```bash
npm run push:deferred -- --dry-run --yes   # 离线预演，含假远端 fast-forward
npm run push:deferred -- --yes             # 真实推送，走本机 credential manager
git ls-remote --tags origin                # 独立回读
```

然后按 `docs/RELEASE.md`：等 `ubuntu-latest` + `windows-latest` 双绿 → protection（两个 `verify (..., 20)` 必过、Bypass list 空、Active）→ annotated tag → Release 附 zip（**不勾 pre-release**）→ About/topics → Secrets 保持空 → Revoke 临时 PAT。

公开只读终检可查：tag ref、`/releases/tags/...` 的 `assets[]` 与 `prerelease`、`/repos/...` 的 `description/topics`、CI jobs。**protection 公开读 401，不冒充复核**。

---

## 9. 交付物清单

- 底盘：`v1.2.0` 冻结，只收 A 档 provider 填充
- 消费方 repo：`apps/web` `apps/ingest` `packages/client` `packages/providers` `compose.consumer.yaml`
- 文档：`docs/BLUEPRINT.md`（本文）、`CHANGELOG.md`、`CONTRIBUTING.md`、`docs/provider-swap-acceptance.md`
- 运维：`docker/migrations/002-embedding-dim.sql`、备份恢复演练记录、监控面板、压测报告
- 发布：新 tag + Release 附件 + 双绿 CI

---

## 10. 已完成与下一刀

**阶段 0 + 1 + 2 全部收口**：

1. 阶段 0：薄 client 只靠 HTTP 跑通闭环，M0 静态扫描证明零底盘内部耦合（`f2f54a8`）
2. 阶段 1：`deepseek-flash` 真调、56 tokens、校验器 PASS、`verify` 116/116（`b8d6a71`）
3. 阶段 2：真维度 provider + SQL ANN + 幂等迁移 + 13 项专项，底盘 `verify` **129/129**；ⓘ 第一次在持久化层真检验旧向量双重拒检（见底盘 `docs/PHASE2.md`）

**下一刀 = 阶段 3 真语义抽取与归纳**：`extractor` 从按句号分句换成经 `llm` seam 抽事实/实体，`precompute` 从截断 240 字换成真归纳；失败降级回分句抽取、不抛穿内核。仍是 A 档，不动契约 / 版本 / 图 / ADR。

真要上线阶段 2 的能力，你本机还需按顺序做：`npm run db:backup` → `npm run migrate:embedding` → `npm run smoke:embedding`（见底盘 `docs/PHASE2.md`）。沙盒无 Docker daemon 与 embedding 端点，这两步从未在此真跑过。
