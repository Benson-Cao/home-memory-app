# v1.2.0 基线订正登记（登记在消费方，不改底盘）

> **决策：不改底盘 `main`。** 远端 `main` 已定格 `5f18012` = tag `v1.2.0` = Release 附件，是一个干净的三方对齐状态。修文档会产生新提交，让 tag 不再等于 main。这是可接受的（tag 本就是发布快照），但刚结项就制造漂移没必要 —— 所以把订正**登记在消费方 repo**，让第一份新文档不建立在错基线上。
>
> 若你之后想修底盘：这 4 处全是文档层、A 档、不动 `CONTRACT_VERSION`，一条提交即可；修完在底盘 `CHANGELOG.md` 记「文档基线订正，契约未变」。

## 实读依据（2026-11-19，本地仓库）

| # | 位置 | 现状 | 应改为 |
|---|---|---|---|
| **D1** | `docs/USER_GUIDE.md:481` | 「线上仍是导入版 `4ca682f`，所有本地切片按 §10 延迟推送」 | `main = 5f18012`、tag `v1.2.0`、Release 已发布附 zip；`docs/DEPLOY.md §10` 保留为历史手册 |
| **D2** | `docs/USER_GUIDE.md` §11 | 「`docs/ADR.md` 6 条架构决策」 | **实际 5 条**：ADR-001 / 002 / 003 / 004 / **006**（无 ADR-005，当时用覆盖映射表替代，没新增决策） |
| **D3** | `docs/ADR.md` 头部 | 「适用：v1.1 架构图 + V0.5 切片」 | 「适用：v1.2 架构图 + v1.2.0 基线」。**只改头部，5 条决策正文一字不动** |
| **D4** | `CONTRACTS.md`「V0.5 边界」段 | 「Reflect / Graph / Temporal / Cross-Encoder / 预计算在本版本只定义契约、不实现」 | 与 `seam-registry.json` **32 seam 全 `implemented`** 冲突。改为「V0.5 曾降级，V0.7 起已全部实现，状态以 registry 的 `v05_status` 为准」 |

**另有一处索引遗漏**（非错误）：`docs/provider-swap-acceptance.md` 实际存在，但 `USER_GUIDE.md §11` 文档表没列它，顺手补一行即可。

## 不是债、别改

- `package.json` **无 `main` / `exports`**：底盘是「当服务调」而不是「npm import 的库」。这是设计选择，不是缺陷。消费方因此**只走 REST**（见 `README.md` 三条铁律）。若将来确实要 npm 引用，补 `exports` 属 A 档打包配置，仍不动契约。
- `docs/DEPLOY.md §10` 的「延迟推送手册」：历史流程已完成，留着当发版档案，不要删。
- 架构图 v1.2 / ADR 5 条 / `CONTRACT_VERSION 1.2.0`：**全部冻结**，下一项目阶段 2–8 全 A 档，不碰。

## 消费方如何防御这些错基线

本仓库 `packages/client/client.mjs` 把契约版本硬编码为 `1.2.0`，并在响应头不是该值时**抛错而非静默降级**；`tests/consumer.test.mjs` ⑤ 用 mock 断言了这条。所以即便底盘文档写错、或将来升到 1.3.0，消费方会立刻知道，不会悄悄读到旧语义。
