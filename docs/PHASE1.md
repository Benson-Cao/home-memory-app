# 阶段 1 · 真模型真调验证（需你本机执行）

> **状态：✅ 已验收（2026-11-19）**。真实型号 `deepseek-flash`、云 API 通道、56 tokens、`last_error=null`、`verify 116/116`。完整证据见 **`docs/PHASE1-RESULT.md`**。本文件保留为操作手册，供换 key / 换通道后复跑。
>
> **为什么单独列**：② 的真 HTTP provider 代码已经写了、离线 mock 也全绿，但这是 v1.2.0 里**唯一「已实现却从未真调」的切片** —— 沙盒出口对 `api.deepseek.com` 返回 `403 policy_default_denied`（实测，带不带 key 一样），不是 401 缺认证。所以这一步只能在你本机跑。
> 本文件不替代底盘 `docs/LLM.md`，只是把「阶段 0 + 1 合并」这一刀里属于你的部分列成可勾清单。

## 前置

- [ ] 已 clone 底盘 `HomeServiceAI` 并切到 tag `v1.2.0`（或解压 Release 附件 `memory-harness-contracts.zip`）
- [ ] Node ≥ 20；底盘目录已跑过 `npm install`
- [ ] 二选一：
  - **云 API**：一个 DeepSeek key，只放底盘目录的本地 `.env`
  - **本地网关**：Ollama / vLLM / LM Studio 的 `host:port` + 模型名，与底盘同网可达
- [ ] 底盘 `npm run verify` 仍是 **116/116**（确认起点干净）

## 操作步骤

```bash
cd <HomeServiceAI>
cp .env.example .env
# 编辑 .env：填 DEEPSEEK_API_KEY，或 LLM_LOCAL_ENDPOINT
npm run smoke:llm              # 云：先打 /models 打印当期真实列表，再真调一次
npm run smoke:llm -- --local   # 本地网关，无需云密钥
npm run verify                 # 必须仍 116/116，且不因缺 key 变红
```

### 参数纪律（别凭记忆写死）

- `base_url = https://api.deepseek.com`，**不加 `/v1`**；chat 路径直接 `/chat/completions`
- **模型名先由 `/models` 实读**：不同快照出现过 `deepseek-v4-flash` / `deepseek-flash`；旧名 `deepseek-chat` / `deepseek-reasoner` 已退役
- 把实读到的型号回填 `.env` 的 `DEEPSEEK_MODEL`。**不要自动取列表第一个** —— 不同型号价差数倍，选错不报错、只悄悄变贵
- `.env` 里 `DEEPSEEK_MODEL=` 留空会被解析成空字符串（上轮抓到过 `??` 不兜底的缺陷，已修为 `||`）
- 思考与否用请求级 `thinking` / `reasoning_effort` 控制，不靠换型号名

## 校验清单

- [ ] `/models` 输出了当期真实型号列表
- [ ] `smoke:llm` 打印了 **token usage**（`prompt/completion/total`）
- [ ] `reflect` 的 `synthesis` 是**真模型输出**，不是 `[api] 长度:ok` 这类确定性桩
- [ ] `sources` 非空，可追溯到 `pipeline_run_id` / `model_id`
- [ ] `hasPendingReply() === false`（`prepare()` 真调 → 同步槽被内核 `reflect()` 消费完）
- [ ] `npm run verify` 116/116，**单测没有真发网络**
- [ ] 错误路径由离线 mock 覆盖：`AbortController` 超时、429 尊重 `Retry-After`、协议错不抛穿内核
- [ ] 无 key 时 `smoke:llm` SKIP，而不是误报通过

## 隐私约束（别让「接了云」破功）

- [ ] **默认 profile 仍走本地模型**；云 API 只挂在明确授权的 profile 上 —— 双通道平级、不设默认，这是 ADR-001 定稿口径
- [ ] `defense` 脱敏保持在 **retain 之前**，健康 / 孩子 / 工作类文本先过扫描
- [ ] key 只在本地 `.env`，不进仓库、不进对话、不进 CI Secrets
- [ ] 用完按成本看一眼 usage；云端调用量与 `provenance.model_id` 能对上

## 结果怎么「拿到」并交回来

**结果产生在你本机，不在沙盒。** 沙盒出口对 `api.deepseek.com` 实测 `403 policy_default_denied`（带不带 key 都一样），我这边读不到你的终端，也读不到你本机文件。所以「拿到」= 你保存输出 → 传给我。

### 第 1 步：把输出落成文件

`smoke:llm` 往 stdout 打**两段 JSON**（`step: models` 和 `step: chat`，含真实型号、`channel`、`synthesis`、`stats.totalTokens`、`last_error`），**不落盘、不打印密钥**。所以要自己重定向：

```bash
# bash / macOS / Git Bash（在底盘 repo 根目录）
npm run smoke:llm 2>&1 | tee ~/phase1.txt
echo "smoke exit=${PIPESTATUS[0]}"     # 别只看 tee 的 0
```

```powershell
# PowerShell
npm run smoke:llm 2>&1 | Tee-Object -FilePath "$env:USERPROFILE\phase1.txt"
$LASTEXITCODE
```

> ⚠️ 别用 `--mock` 的结果交差。校验器会专门拦这一条。
> 输出里 `endpoint` 是公开 base_url、`synthesis` 是固定测试问题的答案，**不含 key、不含你的私人记忆**；整段贴是安全的。唯一别贴的是 `.env` 本身。

### 第 2 步：三条交付路径（任选）

| 路径 | 做法 | 适合 |
|---|---|---|
| **A（最省事，推荐）** | 把 `~/phase1.txt` 全文**贴回对话**，再附一行 `verify：116/116` | 只有几 KB，最快 |
| **B** | 把该文件**作为附件上传**给我 | 不想贴长文本 |
| **C** | 在本消费方 repo 存成 `docs/PHASE1-RESULT.md` 再上传/提交 | 想留工程档案 |

### 第 3 步（可选但推荐）：让回填可验收

消费方自带校验器，防止「拿离线输出当真调」或「字段缺一半」：

```bash
npm run phase1:check -- <phase1.txt 路径>
```

它会提取两段 JSON 并断言：`mode !== 'mock'`、`chat.ok`、型号非空、`channel` 合法、`synthesis` 非确定性桩、`totalTokens > 0`、`last_error` 为空、`sources >= 1`。通过后直接打印一份可复制的回填摘要：

```
真实型号：______   通道：云 API / 本地网关（api / local）   usage：total=__
/models 当期列表：______
reflect synthesis 是否真模型输出：是
verify：116/116（请另附 —— 本文件不含该结果）
```

校验器**不联网、不读 `.env`、不打印密钥**，也不冒充确认 `verify` —— 那一行要你单独跑 `npm run verify` 后附上。它本身已被证伪验证过：喂底盘 `--mock` 输出 → `exit 1` 并精确报「mode = mock」；喂真调形状 → `exit 0`。

### 我拿到后做什么

回填真实型号 → 确认 ② 的真模型代码不是纸上实现 → 阶段 2（真 Embedding + `vector(16)→vector(N)` migration + SQL ANN）开工。**型号只影响 `.env` 与 `docs/PHASE1.md`，不进任何契约字段。**

> 阶段 1 **不改任何契约字段、不升 `CONTRACT_VERSION`、不动架构图、不写 ADR**，属 A 档。若发现 `llm` provider 必须改 `seams/*.ts` 才能跑通，停 —— 那是 B/C 档信号，先回来写 ADR。
