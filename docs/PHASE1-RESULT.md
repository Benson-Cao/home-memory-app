# 阶段 1 · 真模型真调结果（回填档案）

> 本文件记录阶段 1 的真调证据，供回填真实型号与阶段 2 开工前核对。
> 来源：本机底盘 repo（`memory-harness-contracts`）执行 `npm run smoke:llm`，非 `--mock`。
> 密钥只存在于本机 `.env`，**未写入本文件、未进仓库**。

## 环境事实

- 本机到 `https://api.deepseek.com` 实测返回 401（可达），非沙盒侧的 `403 policy_default_denied`
- 底盘 `/models` 当期列表：`deepseek-flash`、`deepseek-v4-pro`
- 实读型号回填 `.env`：`DEEPSEEK_MODEL=deepseek-flash`（不自动取列表第一个，避免换型号涨价）
- 通道：云 API（`api`）
- `smoke` exit = 0；`phase1:check` exit = 0（PASS）；`npm run verify` = 116/116（pass 116 / fail 0）

## 校验器回填摘要

```
真实型号：deepseek-flash   通道：云 API（api）   usage：total=56
/models 当期列表：deepseek-flash, deepseek-v4-pro
reflect synthesis 是否真模型输出：是
verify：116/116
```

## smoke:llm 完整输出（phase1.txt 全文）

```text
> @memory-harness/contracts@1.2.0 smoke:llm
> node scripts/smoke-llm.mjs

{
  "step": "models",
  "ok": true,
  "ids": [
    "deepseek-flash",
    "deepseek-v4-pro"
  ],
  "note": "默认模型 deepseek-flash 在当期列表中"
}
{
  "step": "chat",
  "ok": true,
  "mode": "api",
  "endpoint": "https://api.deepseek.com/chat/completions",
  "model": "deepseek-flash",
  "channel": "api",
  "synthesis": "持久化记忆系统的价值在于让 AI 跨会话保留并复用关键信息，从而提供连贯、个性化的长期交互体验。",
  "sources": 1,
  "model_reply": {
    "model": "deepseek-flash",
    "latencyMs": 675,
    "retries": 0,
    "usage": {
      "prompt_tokens": 30,
      "completion_tokens": 26,
      "total_tokens": 56
    },
    "reasoningChars": 0
  },
  "stats": {
    "requests": 1,
    "succeeded": 1,
    "failed": 0,
    "retried429": 0,
    "timeouts": 0,
    "totalTokens": 56,
    "lastError": null
  },
  "last_error": null
}
```

## 校验器证伪记录（确认不是拿假数据糊过去）

- 喂 `--mock` 输出 → exit 1，精确报 `mode = "mock"`
- 无参数 → exit 2
- 喂本次真调输出 → exit 0，PASS

## 隐私确认

- 输出文件 `sk-` 命中 0 次
- 全仓库树 `sk-[0-9a-f]{32}` 命中 0 文件
- `.gitignore` 含 `.env`、`.env.local`、`.env.*.local`

## 后续

- 真实型号只影响 `.env` 与本文档，不进任何契约字段，属 A 档
- 阶段 2（真 Embedding + `vector(16)→vector(N)` migration + SQL ANN）待对方回填确认后开工
