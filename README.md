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
npm test                      # 11 项，全 mock
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
| `tests/consumer.test.mjs` | 11 项：请求形状 / 202 / 契约漂移 / 403 / Bearer / 零耦合 / 端点不扩面 / **扫描器自身** |
| `scripts/smoke-consumer.mjs` | `--mock` 离线全链路；无 `--mock` 需 env 真调 |
| `scripts/phase1-check.mjs` | 校验阶段 1 本机真调结果，专门拦「拿 `--mock` 交差」 |
| `fixtures/bad/**` | **违例注入夹具**，仅用于验证 ⑧ 真的会 FAIL，不参与运行 |
| `docs/BLUEPRINT.md` | 下一项目完整实现过程（阶段 0–8） |
| `docs/PHASE1.md` | 阶段 1：真模型 smoke 操作清单（**已验收**） |
| `docs/PHASE1-RESULT.md` | 阶段 1 真调结果与独立复核证据（**不记密钥**） |
| `docs/BASELINE-CORRECTIONS.md` | v1.2.0 遗留的 4 处文档基线债登记 |

## 阶段 0 完成判据

- [x] `npm test` 11/11；违例注入 → ⑧ 精确 FAIL（10 pass / 1 fail）；还原 → 11/11
- [x] `smoke --mock` 全链路 PASS；无 env 真调 SKIP `exit 2`
- [x] 静态扫描零底盘内部 import
- [x] `x-contract-version` 非 `1.2.0` 时消费方拒绝
- [ ] 你本机对真实底盘跑一次 `npm run smoke:consumer`（需 GCM/底盘已起，沙盒侧网络 403 做不到）

## 阶段 1 完成判据（✅ 已通过）

- [x] 真调 `mode=api` / `deepseek-flash` / 56 tokens / `last_error=null`，`synthesis` 非桩
- [x] `phase1:check` exit 0 PASS；交回原文密钥扫描 0 命中
- [x] 用户本机 `verify` 116/116（单独实跑）；沙盒同版本副本独立复核 116/116
- [x] 实读型号回填本机 `.env`，不自动取列表第一个
- [ ] 轮换明文出现在对话里的 key（只能你做）

详见 `docs/PHASE1-RESULT.md`。

## 阶段 2 判据（✅ 底盘侧完成）

- [x] `realEmbedder` + SQL ANN + 幂等迁移；底盘 `verify` **129/129**（新增 13 项专项）
- [x] 跨维度迁移后旧向量被 SQL 与 provenance 双重拒检、可观测、不删除
- [x] 迁移脚本强制备份前置 + 维度一致性
- [ ] 你本机执行真 PG 迁移与真 embedding 端点调用（见底盘 `docs/PHASE2.md`）

## 推送到 GitHub

线上 `Benson-Cao/home-memory-app` 目前是 1 个导入提交（`d023276`），与本地 4 个提交历史无关 —— **直接 `git push` 会 non-fast-forward 被拒，别 force**。用一键脚本（凭据走你本机 git credential manager，脚本不读任何 token）：

```bash
npm run push:deferred -- --dry-run --yes   # 离线假远端预演，连 fast-forward push 一起验
npm run push:deferred -- --yes             # 真实推送
git ls-remote https://github.com/Benson-Cao/home-memory-app.git refs/heads/main
```

脚本会 `clone` 线上 → 清空工作树（保留 `.git`）→ 整体复制本地 → 以远端 HEAD 为父叠**一个替换提交** → fast-forward push → 回读 `ls-remote`。`--dry-run` 里专门放了 `OLD_RESIDUE.md` 与 `docs/STALE.md`，验证线上残留文件会被 stage 成 deleted。

沙盒侧 `github.com` 返回 403、无写凭据，**这一步只能你本机跑**；公开只读 API 能核到线上 HEAD（`d023276a96e7`）。

## 下一刀

**阶段 3**：真语义抽取与归纳 —— `extractor` 从分句换成经 `llm` seam 抽事实/实体，`precompute` 从截断 240 字换成真归纳；失败降级回分句抽取、不抛穿内核。分档全程 **A 档**：`CONTRACT_VERSION` 保持 `1.2.0`、架构图 v1.2 不动、不新开 ADR。
