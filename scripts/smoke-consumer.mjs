#!/usr/bin/env node
/**
 * 消费方端到端 smoke —— 独立脚本，不进 test / CI。
 *
 *   node scripts/smoke-consumer.mjs --mock   离线：本地起假底盘 HTTP server，全链路
 *   node scripts/smoke-consumer.mjs          真调：需 MH_BASE_URL（无则 SKIP exit 2）
 *
 * 真调绝不写死任何 key / token；凭据只从本地 .env / 环境变量读。
 */
import { createServer } from 'node:http'
import { MemoryHarnessClient, CONTRACT_VERSION } from '../packages/client/client.mjs'

const MOCK = process.argv.includes('--mock')
const RID = () => `smoke-${Math.random().toString(36).slice(2, 10)}`

function fakeHarness() {
  return createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'x-contract-version': CONTRACT_VERSION,
        'x-request-id': req.headers['x-request-id'] ?? '',
      })
      res.end(JSON.stringify(body))
    }
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/health') {
        return send(200, { status: 'ok', identity: 'member-token', mock: true })
      }
      if (req.method === 'POST' && req.url === '/retain') {
        return send(202, { accepted: true, job_id: `job-${RID()}`, mock: true })
      }
      if (req.method === 'POST' && req.url === '/recall') {
        return send(200, { items: [{ event_id: 'e-mock', content: '客厅灯晚上七点自动开' }], mock: true })
      }
      send(404, { error: 'not found' })
    })
  })
}

async function main() {
  let baseUrl = process.env.MH_BASE_URL
  let server

  if (MOCK) {
    server = fakeHarness()
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    baseUrl = `http://127.0.0.1:${server.address().port}`
    console.log(`[smoke] MOCK 模式 · 假底盘 ${baseUrl}`)
  } else if (!baseUrl) {
    console.log('[smoke] SKIP · 未设置 MH_BASE_URL（真调需你本地 .env）。离线自检请加 --mock。')
    process.exitCode = 2
    return
  } else {
    console.log(`[smoke] REAL 模式 · ${baseUrl}`)
  }

  const client = new MemoryHarnessClient({ baseUrl })

  try {
    const h = await client.health()
    console.log(`  1/3 /health       → ${h.status} · identity=${h.data.identity ?? '?'} · cv=${h.contractVersion}`)
    if (h.contractVersion !== CONTRACT_VERSION) throw new Error('契约版本不一致')

    const w = await client.retain({
      content: '客厅灯晚上七点自动开',
      principal: process.env.MH_PRINCIPAL || 'parent',
      bank_id: process.env.MH_BANK || 'home',
    })
    console.log(`  2/3 POST /retain  → ${w.status} · accepted=${w.data.accepted} · job_id=${w.data.job_id}`)
    if (w.status !== 202 || !w.data.job_id) throw new Error('retain 未返回 202 + job_id')

    // 真底盘下 accepted→visible 由后台 worker 异步完成；mock 下立即召回。
    const q = await client.recall({
      query: '客厅灯',
      principal: process.env.MH_PRINCIPAL || 'parent',
      bank_id: process.env.MH_BANK || 'home',
      token_budget: 512,
    })
    console.log(`  3/3 POST /recall  → ${q.status} · items=${q.data.items?.length ?? 0}`)
    if (q.status !== 200) throw new Error('recall 失败')

    console.log('[smoke] PASS · 消费方仅靠 HTTP 跑通 health → retain → recall 闭环。')
  } finally {
    if (server) await new Promise((r) => server.close(r))
  }
}

main().catch((e) => {
  console.error('[smoke] FAIL ·', e.message)
  if (e.status) console.error('  http status =', e.status, '| requestId =', e.requestId)
  process.exitCode = 1
})
