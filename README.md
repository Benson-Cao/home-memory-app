# home-memory-app

**Memory Harness v1.2.0 的薄消费方** —— 阶段 0 里程碑：证明底盘真的能被外部项目挂载。

底盘仓库：[Benson-Cao/HomeServiceAI](https://github.com/Benson-Cao/HomeServiceAI) · 锁定 tag **`v1.2.0`**（commit `5f18012`，`ubuntu`/`windows` 双绿，Release 附 `memory-harness-contracts.zip`）。

## 这个仓库是什么 / 不是什么

- ✅ 独立消费方 repo，只通过 **HTTP** 调底盘 REST 端点
- ✅ 带 mock 验收与离线 smoke，CI 不需要任何密钥、不连真 DB
- ❌ **不是**底盘的 fork，不 vendor `src/`，不 `npm install` 底盘源码
- ❌ 阶段 0 **只有 3 个端点**：`GET /health`、`POST /retain`、`POST /recall`

> 一旦 `packages/client/` 出现指向底盘内部 `src/` 的 import，`tests/consumer.test.mjs` ⑧ 立即 FAIL。这就是 M0 的 go/no-go 关卡 —— 它把 v1.2.0 的「换 provider 零改动」从口号变成静态扫描。

## 三条铁律

1. **只认 REST + `contract_version`**：客户端在响应头不是 `1.2.0` 时直接抛错，不静默降级
2. **零内部耦合**：禁止 import `src/kernel` `src/runtime` `src/providers` `src/scenes`
3. **真调不进 CI**：`scripts/smoke-consumer.mjs` 需 `MH_BASE_URL` 才跑；无 env 时 SKIP `exit 2`，单测全部 mock

## 快速起步（零依赖、零凭据）

```bash
npm test                      # 10 项，全 mock
npm run smoke:consumer:mock   # 起本地假底盘，跑 health → retain(202) → recall
npm run verify                # 上面两条串起来
```

预期：

```
1/3 /health       → 200 · identity=member-token · cv=1.2.0
2/3 POST /retain  → 202 · accepted=true · job_id=job-...
3/3 POST /recall  → 200 · items=1
[smoke] PASS · 消费方仅靠 HTTP 跑通 health → retain → recall 闭环。
```

Node ≥ 20（用全局 `fetch` / `Response`），**无 `npm install` 依赖**。`npm test` 用 `node --test`（不带路径，Windows 兼容）。

## 真调底盘（你本机）

```bash
cp .env.example .env
# 先按底盘 docs/DEPLOY.md 起 db + app
npm run smoke:consumer
```

未设 `MH_BASE_URL` → `[smoke] SKIP` + `exit 2`，不会误挂 CI。
真底盘下 `retain` 返回 `202 + job_id`，`accepted → visible` 由后台 worker 异步完成；本 smoke 只验证链路可达，不轮询可见性（阶段 8 才做 SLA 压测）。

Docker 方式见 `compose.consumer.yaml`：底盘由 tag v1.2.0 单独起，本仓库只跑消费方容器。

## 目录

| 路径 | 作用 |
|---|---|
| `packages/client/client.mjs` | 薄 HTTP client，3 个方法、`x-request-id`、契约版本断言 |
| `tests/consumer.test.mjs` | 10 项：请求形状 / 202 / 契约漂移 / 403 / Bearer / 零耦合 / 端点不扩面 |
| `scripts/smoke-consumer.mjs` | `--mock` 离线全链路；无 `--mock` 需 env 真调 |
| `scripts/phase1-check.mjs` | 校验阶段 1 本机真调结果，专门拦「拿 `--mock` 交差」 |
| `fixtures/bad/**` | **违例注入夹具**，仅用于验证 ⑧ 真的会 FAIL，不参与运行 |
| `docs/BLUEPRINT.md` | 下一项目完整实现过程（阶段 0–8） |
| `docs/PHASE1.md` | 阶段 1：真模型 smoke 操作清单 |
| `docs/BASELINE-CORRECTIONS.md` | v1.2.0 遗留的 4 处文档基线债登记 |

## 阶段 0 完成判据

- [x] `npm test` 10/10；违例注入 → ⑧ FAIL（9 pass / 1 fail）；还原 → 10/10
- [x] `smoke --mock` 全链路 PASS；无 env 真调 SKIP `exit 2`
- [x] 静态扫描零底盘内部 import
- [x] `x-contract-version` 非 `1.2.0` 时消费方拒绝
- [ ] 你本机对真实底盘跑一次 `npm run smoke:consumer`（需 GCM/底盘已起，沙盒侧网络 403 做不到）

## 下一刀

阶段 1：`docs/PHASE1.md`（真模型 smoke，需你本机执行）→ 阶段 2 真 Embedding + `vector(16)→vector(N)` migration + SQL ANN。分档全程 **A 档**：`CONTRACT_VERSION` 保持 `1.2.0`、架构图 v1.2 不动、不新开 ADR。
