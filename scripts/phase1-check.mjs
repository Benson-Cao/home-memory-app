#!/usr/bin/env node
/**
 * 阶段 1 结果校验器 —— 把「本机真调结果」变成可验收的回填，而不是一句「跑过了」。
 *
 *   npm run phase1:check -- <结果文件路径>
 *
 * 结果文件 = 在【底盘 repo】里跑 `npm run smoke:llm` 的完整终端输出（含 npm banner 无妨）。
 * 本脚本提取其中两段顶层 JSON（step: models / step: chat），断言：
 *   - 是真实调用而非 --mock（mode !== 'mock'）—— 最关键，否则拿离线输出就能糊过去
 *   - chat.ok / model / channel / synthesis / stats.totalTokens / last_error 全部合格
 *   - synthesis 不是确定性桩
 *
 * 它不联网、不读 .env、不打印任何密钥；只输出一份可直接贴回对话的回填摘要。
 * verify 116/116 不在本文件里，脚本会提示你另附一行，不冒充确认。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = process.argv[2]
if (!file) {
  console.error('用法：npm run phase1:check -- <smoke:llm 输出文件>')
  console.error('生成：在底盘 repo 跑 `npm run smoke:llm 2>&1 | tee phase1.txt`')
  process.exit(2)
}

let text
try { text = readFileSync(resolve(file), 'utf8') } catch (e) {
  console.error(`[phase1] FAIL · 读不到 ${file}：${e.message}`)
  process.exit(1)
}

/** 从混杂文本里提取所有顶层 JSON 对象（容忍 npm banner / 空行）。 */
function extractJsonObjects(s) {
  const out = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{') { if (depth === 0) start = i; depth++; continue }
    if (c === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(s.slice(start, i + 1))) } catch { /* 非 JSON 片段，跳过 */ }
        start = -1
      }
    }
  }
  return out
}

const objs = extractJsonObjects(text)
const models = objs.find((o) => o && o.step === 'models')
const chat = objs.find((o) => o && o.step === 'chat')

const errors = []
const check = (cond, msg) => { if (!cond) errors.push(msg) }

check(!!chat, '未找到 step:"chat" 的 JSON 段（结果文件不是 smoke:llm 输出，或输出被截断）')
if (chat) {
  check(chat.ok === true, `chat.ok = ${chat.ok}（真调失败）`)
  check(chat.mode !== 'mock', 'mode = "mock" —— 这是离线自检，不能当阶段 1 真调结果')
  check(['api', 'local'].includes(chat.mode), `mode = ${chat.mode}（应为 api / local）`)
  check(typeof chat.model === 'string' && chat.model.length > 0, 'model 为空 —— 需从 /models 实读并回填 DEEPSEEK_MODEL')
  check(['api', 'local'].includes(chat.channel), `channel = ${chat.channel}`)
  check(typeof chat.synthesis === 'string' && chat.synthesis.trim().length >= 8, 'synthesis 为空或过短')
  check(!/\[(api|local)\]|长度:ok|deterministic/.test(chat.synthesis ?? ''), 'synthesis 疑似确定性桩，不是真模型输出')
  check(Number(chat.stats?.totalTokens ?? 0) > 0, 'stats.totalTokens = 0（usage 未计量）')
  check(chat.last_error == null, `last_error = ${JSON.stringify(chat.last_error)}`)
  check(chat.sources >= 1, 'sources = 0（recall 未命中，reflect 可能没真调模型）')
}

if (errors.length) {
  console.error('[phase1] FAIL · 结果不合格：')
  for (const e of errors) console.error('  -', e)
  if (models) console.error(`  （/models: ok=${models.ok} ids=${JSON.stringify(models.ids ?? [])}）`)
  process.exit(1)
}

const usage = chat.stats?.totalTokens ?? '?'
console.log('[phase1] PASS · 这是一次真实调用，字段齐全。')
console.log('')
console.log('可直接贴回对话的回填摘要：')
console.log('```')
console.log(`真实型号：${chat.model}   通道：${chat.mode === 'local' ? '本地网关' : '云 API'}（${chat.channel}）   usage：total=${usage}`)
console.log(`/models 当期列表：${models?.ok ? (models.ids ?? []).join(', ') : '不可用（不影响，型号以厂商控制台为准）'}`)
console.log('reflect synthesis 是否真模型输出：是')
console.log('verify：116/116（请另附 —— 本文件不含该结果）')
console.log('```')
console.log('')
console.log('注意：脚本未确认 npm run verify 的 116/116，也没看到你的 .env；请单独跑一次并附一行。')
