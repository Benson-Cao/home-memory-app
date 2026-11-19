import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryHarnessClient, CONTRACT_VERSION, DEFAULT_BASE_URL } from '../packages/client/client.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/**
 * 零耦合扫描器（⑧ 与 ⑪ 共用）。
 * 覆盖 4 种真实模块加载形式：side-effect import、dynamic import、带 from 的 import/export、require。
 * 历史缺陷：初版只认带 `from` 的 import，一条 `import '../../HomeServiceAI/src/kernel/x.mjs'`
 * 就能绕过 M0 关卡 —— ⑪ 专门守这个检查器自身。
 */
const IMPORT_LINE = /^\s*(?:import\s*['"]|import\s*\(\s*['"]|import\b[^;\n]*\bfrom\s*['"]|export\b[^;\n]*\bfrom\s*['"]|\b(?:const|let|var)\b[^;\n]*\brequire\s*\(\s*['"]|\b(?:const|let|var)\b[^;\n]*=\s*await\s+import\s*\(\s*['"]|await\s+import\s*\(\s*['"])/
const FORBIDDEN_PATH = /(?:HomeServiceAI|memory-harness-contracts)\/(?:src|build)\/|\/src\/(?:kernel|runtime|providers|scenes|seams)\//

/** 记录调用的 mock fetch；返回原生 Response（Node 20 全局可用）。 */
function mockFetch(handler) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  fn.calls = calls
  return fn
}

const ok = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-contract-version': CONTRACT_VERSION, ...extra },
  })

test('① health：请求形状正确，带 x-request-id，GET 无 body', async () => {
  const f = mockFetch(() => ok({ status: 'ok', identity: 'member-token' }))
  const c = new MemoryHarnessClient({ fetchImpl: f, requestId: () => 'rid-1' })
  const r = await c.health()
  assert.equal(r.data.status, 'ok')
  assert.equal(r.contractVersion, CONTRACT_VERSION)
  assert.equal(f.calls[0].url, `${DEFAULT_BASE_URL}/health`)
  assert.equal(f.calls[0].init.method, 'GET')
  assert.equal(f.calls[0].init.body, undefined)
  assert.equal(f.calls[0].init.headers['x-request-id'], 'rid-1')
})

test('② retain：202 Accepted + job_id 被正确解析，body 三字段齐全', async () => {
  const f = mockFetch(() => ok({ accepted: true, job_id: 'job-42' }, 202))
  const c = new MemoryHarnessClient({ fetchImpl: f })
  const r = await c.retain({ content: '客厅灯晚上七点自动开', principal: 'parent', bank_id: 'home' })
  assert.equal(r.status, 202)
  assert.equal(r.data.accepted, true)
  assert.equal(r.data.job_id, 'job-42')
  assert.equal(r.requestId.startsWith('m0-'), true)
  const sent = JSON.parse(f.calls[0].init.body)
  assert.deepEqual(Object.keys(sent).sort(), ['bank_id', 'content', 'principal'])
  assert.equal(sent.bank_id, 'home')
  assert.equal(f.calls[0].init.headers['content-type'], 'application/json')
})

test('③ recall：query / token_budget 透传，结果带 items', async () => {
  const f = mockFetch(() => ok({ items: [{ event_id: 'e1', content: '客厅灯' }] }))
  const c = new MemoryHarnessClient({ fetchImpl: f })
  const r = await c.recall({ query: '客厅灯', principal: 'parent', bank_id: 'home', token_budget: 512 })
  assert.equal(r.data.items.length, 1)
  assert.equal(f.calls[0].init.method, 'POST')
  assert.equal(f.calls[0].url.endsWith('/recall'), true)
  assert.equal(JSON.parse(f.calls[0].init.body).token_budget, 512)
})

test('④ 契约版本：响应 x-contract-version 必须是 1.2.0', async () => {
  const f = mockFetch(() => ok({ ok: true }))
  const c = new MemoryHarnessClient({ fetchImpl: f })
  const r = await c.health()
  assert.equal(r.contractVersion, '1.2.0')
})

test('⑤ 契约漂移：底盘返回 1.3.0 时消费方立即拒绝，不静默降级', async () => {
  const f = mockFetch(() =>
    new Response('{}', { status: 200, headers: { 'x-contract-version': '1.3.0' } }))
  const c = new MemoryHarnessClient({ fetchImpl: f })
  await assert.rejects(() => c.health(), /契约版本漂移.*1\.3\.0/)
})

test('⑥ 错误：403 结构化抛出，带 status / requestId / body', async () => {
  const f = mockFetch(() => ok({ error: 'forbidden' }, 403))
  const c = new MemoryHarnessClient({ fetchImpl: f, requestId: () => 'rid-403' })
  await assert.rejects(
    () => c.recall({ query: 'x', principal: 'child', bank_id: 'work' }),
    (e) => e.status === 403 && e.requestId === 'rid-403' && e.body.error === 'forbidden',
  )
})

test('⑦ Bearer 仅在配置 token 时出现，默认不带', async () => {
  const f1 = mockFetch(() => ok({}))
  await new MemoryHarnessClient({ fetchImpl: f1 }).health()
  assert.equal(f1.calls[0].init.headers.authorization, undefined)

  const f2 = mockFetch(() => ok({}))
  await new MemoryHarnessClient({ fetchImpl: f2, token: 'tok' }).health()
  assert.equal(f2.calls[0].init.headers.authorization, 'Bearer tok')
})

test('⑧ 零耦合（M0 go/no-go）：消费方源码禁止 import 底盘内部模块', () => {
  const files = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'node_modules') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(mjs|js|ts)$/.test(e.name)) files.push(p)
    }
  }
  walk(ROOT)
  const bad = []
  // 只认真实模块加载语句；注释与文档里的反例不算耦合。
  for (const p of files) {
    const t = readFileSync(p, 'utf8')
    for (const line of t.split('\n')) {
      if (!IMPORT_LINE.test(line)) continue
      if (FORBIDDEN_PATH.test(line)) bad.push(`${p.replace(ROOT, '')}: ${line.trim().slice(0, 90)}`)
    }
  }
  assert.deepEqual(bad, [], `发现底盘内部耦合：${bad.join(' | ')}`)
})

test('⑨ 阶段0 只用 3 个端点，不偷偷扩面', () => {
  const t = readFileSync(join(ROOT, 'packages/client/client.mjs'), 'utf8')
  const paths = [...t.matchAll(/this\._call\('(GET|POST)',\s*'(\/[^']+)'/g)].map((m) => `${m[1]} ${m[2]}`)
  assert.deepEqual(paths.sort(), ['GET /health', 'POST /recall', 'POST /retain'])
})

test('⑩ baseUrl 可覆盖，末尾斜杠被归一化', async () => {
  const f = mockFetch(() => ok({}))
  const c = new MemoryHarnessClient({ fetchImpl: f, baseUrl: 'http://nas.local:8080/' })
  await c.health()
  assert.equal(f.calls[0].url, 'http://nas.local:8080/health')
})

test('⑪ 零耦合扫描器自身：4 种模块加载形式都抓得住，注释不误伤', () => {
  const coupled = [
    `import '../../fixtures/bad/HomeServiceAI/src/kernel/runtime.mjs'`,        // side-effect
    `const x = await import('../../HomeServiceAI/src/kernel/runtime.mjs')`,     // dynamic
    `import { x } from '../../HomeServiceAI/src/kernel/runtime.mjs'`,           // 带 from
    `export * from '../../HomeServiceAI/src/scenes/memory-scene.ts'`,           // export-from
    `const k = require('../../HomeServiceAI/src/kernel/runtime.mjs')`,          // require
  ]
  for (const line of coupled) {
    assert.ok(IMPORT_LINE.test(line), `未识别模块加载语句：${line}`)
    assert.ok(FORBIDDEN_PATH.test(line), `未识别底盘内部路径：${line}`)
  }
  const innocent = [
    `import test from 'node:test'`,
    `import { readFileSync } from 'node:fs'`,
    `// 反例：import '../../HomeServiceAI/src/kernel/runtime.mjs' 不该算耦合`,
    `const note = 'HomeServiceAI/src 只是文档里的字符串'`,
    `const mod = await import('node:fs')`,
  ]
  for (const line of innocent) {
    const hit = IMPORT_LINE.test(line) && FORBIDDEN_PATH.test(line)
    assert.equal(hit, false, `误伤：${line}`)
  }
})
