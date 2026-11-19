# Changelog

## 0.3.1 · 推送工具链（消费方 repo 上线用）

- 新增 `scripts/deferred-push.mjs`（复用底盘逻辑，默认远端改为 `Benson-Cao/home-memory-app.git`）：`clone` 线上 → 以远端 HEAD 为父叠一个替换提交 → fast-forward push → `ls-remote` 回读；**不 force、不读 token**
- `--dry-run` 用本地 bare 假远端验证，含 `OLD_RESIDUE.md` / `docs/STALE.md` 两个幽灵文件，确认清空工作树会把线上残留 stage 成 deleted
- `package.json` 加 `push:deferred` 脚本；README 补「推送到 GitHub」一节
- **边界**：沙盒 `github.com` 403、无 GITHUB_TOKEN / GH_TOKEN → 真实推送只能你本机执行；公开只读仅能核到线上 HEAD = `d023276a96e7`
- 业务代码零改动：薄 client、10 项原有测试、`phase1:check`、`smoke-consumer` 全部不变
- **抓到并修掉一个检查器缺陷**：M0 零耦合扫描初版只认带 `from` 的 import，一条 side-effect `import '../../HomeServiceAI/src/kernel/x.mjs'` 就能绕过。补齐 side-effect / dynamic / `await import()` / export-from / require 五种形式，新增 ⑪ 专门验扫描器自身（含注释不误伤）
- 违例注入复验：注入 → **仅 ⑧ FAIL**（10 pass / 1 fail）；还原 → **11/11**

## 0.3.0 · 阶段 2（真 Embedding 维度 + SQL ANN · 底盘侧完成）

**代码落在底盘 `@memory-harness/contracts`（本地提交，未 push）；消费方本轮只更新文档状态，薄 client 零改动、仍锁 `v1.2.0`。**

- 底盘新增 `realEmbedder` / `createHttpEmbeddingEncoder` / `pgAnnRetriever` / `annProfile` + 幂等 `002-embedding-dim.sql` + 13 项专项；`verify` **129/129**
- ⓘ 第一次在**持久化层**真检验：旧 `embedding_dim` / NULL 向量被 SQL WHERE 与 provenance 双重拒检，`quarantined()` 可观测，记录仍 `visible`（隔离 ≠ 删除）
- 迁移脚本两条机器约束：真跑前必须有非空备份、文件维度必须与 env 一致；`smoke:embedding --mock` 离线全链路 PASS
- 默认 `EMBEDDING_DIM=16` / `SCHEMA_SQL` 逐字不变，A/B profile、`bindings` DEFAULTS、`seams/`、`src/scenes/`、registry 全部未动
- 蓝图 M2 标 ✅、G0 更新为 129/129、§2 基线债登记改为实际处理结果（D1/D2/D4 已修，D3/D5 保留）
- **边界**：沙盒无 Docker daemon / 无 embedding 端点 → 真实 PG 迁移与真模型向量调用留给你本机（见底盘 `docs/PHASE2.md`）

全程 **A 档**：`CONTRACT_VERSION` 1.2.0、架构图 v1.2、ADR、契约 schema 均未改。下一刀 = 阶段 3 真语义抽取与归纳。

## 0.2.0 · 阶段 1（真模型真调验收 · 已通过）

**结果由用户本机实跑，沙盒侧只做独立复核与登记** —— `api.deepseek.com` 在沙盒仍是 `403 policy_default_denied`，真调无法在此发生。

- 真实型号 **`deepseek-flash`**（`/models` 当期列表：`deepseek-flash`, `deepseek-v4-pro`；已显式回填本机 `.env`，不自动取第一个）
- 通道 `api` · `chat.ok=true` · `succeeded=1` / `failed=0` / `retries=0` / `last_error=null` · `total=56 tokens`（30+26）· `latency 675ms` · `sources=1`
- `synthesis` 为真模型输出，非确定性桩；`reflect` 的同步槽被正常消费
- 用户本机 `npm run verify` **116/116**（单独实跑；校验器那行硬编码提示不采信）
- 消费方侧复核：`phase1:check` **exit 0 PASS**；交回原文 `sk-` / `github_pat` / `Authorization` / `api_key` **均 0 命中**；底盘同版本副本 `verify` 116/116 + `kernel-purity PASS`
- 新增 `docs/PHASE1-RESULT.md`（只记事实，不记密钥）

**未改**：底盘 `main` / `seams/` / `CONTRACT_VERSION`（仍 1.2.0）/ 架构图 v1.2 / ADR —— 全程 A 档。
**待用户收尾**：轮换明文出现在对话里的 key；本机 `.env` 换新值。
**下一刀**：阶段 2 真 Embedding + `vector(16)→vector(N)` migration + SQL ANN（先 `db:backup`）。

## 0.1.0 · 阶段 0（M0 消费方挂载）

- 独立消费方 repo，锁底盘 tag `v1.2.0`（commit `5f18012`），**零底盘源码耦合**
- `packages/client/client.mjs`：只封装 `GET /health`、`POST /retain`、`POST /recall`；`x-request-id` 透传；响应 `x-contract-version !== 1.2.0` 时抛错（契约漂移不静默降级）
- `tests/consumer.test.mjs` 10 项（0.1.0 时）：请求形状 / 202+job_id / recall / 契约版本 / 漂移拒绝 / 403 结构化 / Bearer 条件 / **零内部 import 静态扫描** / 端点不扩面 / baseUrl 归一化
- `scripts/smoke-consumer.mjs`：`--mock` 起本地假底盘跑全链路；无 `MH_BASE_URL` 时 SKIP `exit 2`；真调不进 test / CI
- `compose.consumer.yaml`：只定义消费方容器，底盘由 tag v1.2.0 自己的 compose 单独起
- `scripts/phase1-check.mjs` / `npm run phase1:check`：把阶段 1 的本机结果变成可验收回填；提取 `smoke:llm` 两段 JSON，断言 `mode !== 'mock'`、型号/通道/synthesis/usage/last_error 合格，不联网不读密钥
- 文档：`docs/BLUEPRINT.md`（阶段 0–8）、`docs/PHASE1.md`（真模型 smoke + **结果怎么拿到并交回**）、`docs/BASELINE-CORRECTIONS.md`（4 处基线债登记，不改底盘 main）

### 验证

- `npm test` **10/10**（当时项数）
- 违例注入（真实可加载的底盘内部 import）→ ⑧ FAIL，9 pass / 1 fail；还原 → 10/10
- `smoke:consumer:mock` PASS（health 200 → retain 202+job_id → recall 200）
- 无 env 真调 SKIP `exit 2`
- `npm run verify` 全序列 rc=0
- Node 20.19.5，零 `npm install` 依赖，零密钥入仓

### 未完成（下一步）

- 阶段 1：`docs/PHASE1.md` 的真模型 smoke —— 沙盒 `api.deepseek.com` 403，需你本机执行
- 阶段 2：真 Embedding + `vector(16)→vector(N)` migration + SQL ANN（需先 `db:backup`）

全程 **A 档**：`CONTRACT_VERSION` 保持 `1.2.0`，架构图 v1.2 / ADR / 底盘 `seams/` 均未改动。
