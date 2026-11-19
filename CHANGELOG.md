# Changelog

## 0.1.0 · 阶段 0（M0 消费方挂载）

- 独立消费方 repo，锁底盘 tag `v1.2.0`（commit `5f18012`），**零底盘源码耦合**
- `packages/client/client.mjs`：只封装 `GET /health`、`POST /retain`、`POST /recall`；`x-request-id` 透传；响应 `x-contract-version !== 1.2.0` 时抛错（契约漂移不静默降级）
- `tests/consumer.test.mjs` 10 项：请求形状 / 202+job_id / recall / 契约版本 / 漂移拒绝 / 403 结构化 / Bearer 条件 / **零内部 import 静态扫描** / 端点不扩面 / baseUrl 归一化
- `scripts/smoke-consumer.mjs`：`--mock` 起本地假底盘跑全链路；无 `MH_BASE_URL` 时 SKIP `exit 2`；真调不进 test / CI
- `compose.consumer.yaml`：只定义消费方容器，底盘由 tag v1.2.0 自己的 compose 单独起
- `scripts/phase1-check.mjs` / `npm run phase1:check`：把阶段 1 的本机结果变成可验收回填；提取 `smoke:llm` 两段 JSON，断言 `mode !== 'mock'`、型号/通道/synthesis/usage/last_error 合格，不联网不读密钥
- 文档：`docs/BLUEPRINT.md`（阶段 0–8）、`docs/PHASE1.md`（真模型 smoke + **结果怎么拿到并交回**）、`docs/BASELINE-CORRECTIONS.md`（4 处基线债登记，不改底盘 main）

### 验证

- `npm test` **10/10**
- 违例注入（真实可加载的底盘内部 import）→ ⑧ FAIL，9 pass / 1 fail；还原 → 10/10
- `smoke:consumer:mock` PASS（health 200 → retain 202+job_id → recall 200）
- 无 env 真调 SKIP `exit 2`
- `npm run verify` 全序列 rc=0
- Node 20.19.5，零 `npm install` 依赖，零密钥入仓

### 未完成（下一步）

- 阶段 1：`docs/PHASE1.md` 的真模型 smoke —— 沙盒 `api.deepseek.com` 403，需你本机执行
- 阶段 2：真 Embedding + `vector(16)→vector(N)` migration + SQL ANN（需先 `db:backup`）

全程 **A 档**：`CONTRACT_VERSION` 保持 `1.2.0`，架构图 v1.2 / ADR / 底盘 `seams/` 均未改动。
