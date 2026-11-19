/**
 * 消费方薄客户端 —— 只通过 HTTP 调用 Memory Harness v1.2.0。
 *
 * 铁律：禁止 import 底盘内部模块。消费方只认 REST 端点 + contract_version。
 * 一旦出现指向底盘内部源码目录的 import，v1.2.0 的「可挂载」验收即告破。
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8080'
export const CONTRACT_VERSION = '1.2.0' // 锁 tag v1.2.0

const genRequestId = () =>
  `m0-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export class MemoryHarnessClient {
  constructor(opts = {}) {
    this.baseUrl = String(opts.baseUrl ?? process.env.MH_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')
    this.token = opts.token ?? process.env.MH_HTTP_TOKEN ?? ''
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
    this.requestId = opts.requestId ?? genRequestId
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('fetchImpl 必须是函数（Node 20 自带全局 fetch）')
    }
  }

  _headers(rid, extra = {}) {
    const h = { 'x-request-id': rid, ...extra }
    if (this.token) h.authorization = `Bearer ${this.token}`
    return h
  }

  async _call(method, path, body) {
    const rid = this.requestId()
    const headers = this._headers(rid, body === undefined ? {} : { 'content-type': 'application/json' })
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const got = res.headers?.get?.('x-contract-version') ?? undefined
    if (got !== undefined && got !== CONTRACT_VERSION) {
      throw new Error(`契约版本漂移：期望 ${CONTRACT_VERSION}，实得 ${got}（底盘 tag 不再是 v1.2.0）`)
    }

    const text = await res.text()
    let data
    try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${data?.error ?? data?.message ?? text.slice(0, 120)}`)
      err.status = res.status
      err.requestId = rid
      err.body = data
      throw err
    }
    return { data, requestId: rid, contractVersion: got ?? null, status: res.status }
  }

  health() {
    return this._call('GET', '/health')
  }

  retain({ content, principal, bank_id }) {
    return this._call('POST', '/retain', { content, principal, bank_id })
  }

  recall({ query, principal, bank_id, token_budget } = {}) {
    return this._call('POST', '/recall', { query, principal, bank_id, token_budget })
  }
}
