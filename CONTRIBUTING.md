# 贡献指引

## 三条铁律

1. **只读 REST**：`packages/client/` 禁止 import 底盘 `src/` 下任何东西。`tests/consumer.test.mjs` ⑧ 是 go/no-go 关卡，CI 会 FAIL。
2. **契约版本硬断言**：客户端锁 `1.2.0`，响应头不符就抛错，不要「兼容一下」。
3. **真调不进 CI**：网络 / DB / 密钥只出现在 `scripts/smoke-*.mjs`，且必须支持 `--mock` 与无 env SKIP。

## 先判分档（照抄底盘 `CONTRACTS.md`）

| 你想做的事 | 档 | 版本 | ADR | 图 |
|---|---|---|---|---|
| 加前端、采集器、真 provider、MCP、SQL ANN | **A** | 不动 `1.2.0` | 不用 | 不动 |
| 新增 seam / 可选字段 / profile | **B** | `1.3.0` | 建议记一笔 | 仅 seam 清单变时 |
| 删字段 / 改语义 / 无 Node runtime 单文件包 | **C** | MAJOR | **必须** | **必须升** |

判据看 `git diff`：落在消费方 `apps/` `packages/` `tests/` → 通常 A；**只要动底盘 `seams/*.ts` 或 `*.schema.json` 且改了字段语义 → 停，先写 ADR**。

## 每次提交前

```bash
npm test                      # 11/11（或新增后的 N/N）
npm run smoke:consumer:mock   # 离线全链路
npm run verify                # 上面两条串起来
```

再加一次违例注入自检：往 `packages/client/client.mjs` 临时加一行指向 `fixtures/bad/HomeServiceAI/src/kernel/runtime.mjs` 的 import，`npm test` 的 ⑧ 必须 FAIL；**还原后**再跑一次 11/110。`fixtures/bad/**` 就是为此存在的夹具，不要删。

## Windows 注意

`npm test` 用 `node --test`（**不带路径**）。写 `node --test tests/` 在 Windows 上会被当成模块路径报 `MODULE_NOT_FOUND` —— 底盘 v1.2.0 真踩过这个坑，别复制回去。

底盘侧还有 `.gitattributes: * text=auto eol=lf`，防止 CRLF 让「DDL 逐字一致」断言假失败。本仓库沿用同一条。
