# 阶段 1 · 真模型真调结果（已验收）

> 2026-11-19 用户本机实跑，结果交回并在消费方侧独立复核通过。
> **本文件不记任何密钥。** `DEEPSEEK_API_KEY` 只存在于用户本机 `.env`；本仓库、日志、对话回执均不含该值。
> 原始输出见用户本机 `C:/Users/Administrator/phase1.txt`；本仓库内不复制 stdout 到可提交文件之外的位置。

## 实跑结果（用户本机）

| 项 | 值 |
|---|---|
| 命令 | `npm run smoke:llm`（底盘 repo，非 `--mock`） |
| `/models` 当期列表 | `deepseek-flash`, `deepseek-v4-pro` |
| 真实型号 | **`deepseek-flash`**（已显式回填本机 `.env` 的 `DEEPSEEK_MODEL`，不自动取列表第一个） |
| 通道 | `api`（云 API）· `endpoint = https://api.deepseek.com/chat/completions` |
| `mode` / `chat.ok` | `api` / `true` |
| `synthesis` | 「持久化记忆系统的价值在于让 AI 跨会话保留并复用关键信息，从而提供连贯、个性化的长期交互体验。」 |
| usage | `prompt 30 + completion 26 = total 56` |
| 调用统计 | `requests 1` / `succeeded 1` / `failed 0` / `retried429 0` / `timeouts 0` / `latency 675ms` / `retries 0` |
| `last_error` / `stats.lastError` | `null` / `null` |
| `sources` | 1（recall 有命中，`reflect` 真调了 `complete()`） |
| `reasoningChars` | 0（未触发思考模式，符合默认档） |

**真调判据**：`mode !== 'mock'` + `succeeded=1` + `last_error=null` + 非空 `synthesis` + `totalTokens>0`。这次是货真价实的网络调用 —— ② 的真 HTTP provider 不再是「写了没跑过」的纸上实现。

## 独立复核（消费方侧，2026-11-19）

| 检查 | 结果 |
|---|---|
| `npm run phase1:check -- <交回的 phase1.txt 全文>` | **exit 0 · PASS**，摘要与用户回填一致 |
| 交回原文的密钥扫描 | `sk-` 0 命中 · `github_pat` 0 · `Authorization` 0 · `api_key` 0（967 字节） |
| 底盘同版本副本 `npm run verify` | `# tests 116 / # pass 116 / # fail 0`，`kernel-purity PASS`，rc=0 |
| 用户本机 `npm run verify` | **116/116**（用户单独实跑，rc=0）—— 校验器打印的那行是硬编码提示，**不采信为证据** |

> 边界：沙盒里的 116/116 是**同版本副本独立复核**，不冒充用户本机的那次实跑；两者结论一致。`api.deepseek.com` 在沙盒侧仍是 `403 policy_default_denied`，所以真调只能由用户本机完成。

## 一处口径澄清

用户提到「本机到 DeepSeek 返回 401（可达）」—— 那是**不带凭据的连通性探测**结果，说明网络可达且服务端要求认证；真调带 key 的那次是成功（`succeeded=1`、`ok=true`），不是 401。沙盒的 `403 policy_default_denied` 是出口策略拦截，与「服务端要求认证」不是同一层，两者不矛盾。

## 回填到阶段 2 的输入

- `DEEPSEEK_MODEL=deepseek-flash`：仅进本机 `.env` 与本文档，**不进任何契约字段**
- 默认 profile 仍走本地模型、云 API 只挂明确授权的 profile、`defense` 保持在 retain 之前 —— 三条隐私约束未因接云破功
- `CONTRACT_VERSION` 仍 **1.2.0**；架构图 v1.2 / ADR / `seams/` 全部未动 → **A 档**

## 待办（收尾，只能用户做）

- [ ] 在 DeepSeek 控制台**轮换**本次明文出现在对话里的 key（我这边不接触、不落盘、不回显）
- [ ] 本机 `.env` 更新为新值；旧值作废
- [ ] 阶段 2 开工：真 Embedding + `vector(16)→vector(N)` migration + SQL ANN（需先 `npm run db:backup`）
