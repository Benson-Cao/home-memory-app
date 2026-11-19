#!/usr/bin/env node
/**
 * 消费方一键延迟推送（在你自己的电脑上跑，不需要把 token 交给任何人）。
 *
 * 线上 `Benson-Cao/home-memory-app` 目前是 1 个导入提交（d023276），与本仓库
 * 的 4 个本地提交历史无关。直接 `git push` 会 non-fast-forward 被拒；本脚本
 * clone 远端 → 以远端 HEAD 为父叠「一个替换提交」→ fast-forward push，
 * 绝不 --force，也不覆盖导入记录。
 *
 *   npm run push:deferred -- --dry-run --yes       # 离线全演练：本地 bare 仓库当假远端，连 push 一起验
 *   npm run push:deferred -- --yes                # 真正推送到 GitHub
 *   npm run push:deferred                          # 打印计划后交互式确认
 *
 * 为什么需要脚本而不是「解压覆盖」：
 *   简单覆盖**不会删除**远端已存在、但本地已经删掉的文件（例如线上导入版
 *   仍在跟踪的 build/ 产物、旧 stubs）。结果是推上去后仓库残留幽灵文件。
 *   本脚本先清空 clone 下来的工作树（保留 .git），再整体复制，
 *   让 git 自己把这些文件 stage 成 deleted —— 历史干净且不需要 force。
 *
 * 流程保证：
 *   - 以远端当前 HEAD 为父叠「一个替换提交」，绝不 --force / --force-with-lease
 *   - 不读任何 token：凭据完全交给你本机 git 的 credential helper
 *   - 排除 .git / node_modules / build / backups / .env / *.zip / *.log / 临时产物
 *   - build/ 不提交（由 pretest / prepack 自动生成），推送后 CI 会自己构建
 */
import {
  mkdtempSync, mkdirSync, rmSync, readdirSync, cpSync, writeFileSync, existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_REMOTE = 'https://github.com/Benson-Cao/home-memory-app.git'
const DEFAULT_BRANCH = 'main'
const DEFAULT_MESSAGE =
  'feat(consumer): phase1 live LLM result + phase2 blueprint sync (A-tier)'

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=')
      return [k, v.length ? v.join('=') : true]
    }),
)

const dryRun = Boolean(args['dry-run'])
const autoYes = Boolean(args.yes)
const keep = Boolean(args.keep)
const remote = typeof args.remote === 'string' ? args.remote : DEFAULT_REMOTE
const branch = typeof args.branch === 'string' ? args.branch : DEFAULT_BRANCH
const message = typeof args.message === 'string' ? args.message : DEFAULT_MESSAGE

/** 顶层排除目录（不会误伤 src/ 下的同名业务目录）。 */
const EXCLUDE_TOP_DIRS = new Set(['.git', 'node_modules', 'build', 'backups'])
const EXCLUDE_FILES = new Set([
  '.env', 'tsconfig.build.json', 'project-engineering-file.md',
])

function git(cwd, argv, opts = {}) {
  return execFileSync('git', argv, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  }).trim()
}

function shouldCopy(src) {
  const rel = relative(SOURCE, src)
  if (rel === '') return true
  const parts = rel.split(sep)
  const name = parts[parts.length - 1]
  if (parts.length === 1 && EXCLUDE_TOP_DIRS.has(name)) return false
  if (EXCLUDE_FILES.has(name)) return false
  // .env.* 排除，但 .env.example 必须保留
  if (name.startsWith('.env.') && name !== '.env.example') return false
  if (/\.(zip|log)$/.test(name)) return false
  return true
}

function clearWorktree(work) {
  const removed = []
  for (const e of readdirSync(work, { withFileTypes: true })) {
    if (e.name === '.git') continue
    rmSync(join(work, e.name), { recursive: true, force: true })
    removed.push(e.name)
  }
  return removed
}

function parsePorcelain(out) {
  const lines = out.split('\n').filter(Boolean)
  const added = [], modified = [], deleted = []
  for (const l of lines) {
    const status = l.slice(0, 2)
    const path = l.slice(3)
    if (status.includes('D')) deleted.push(path)
    else if (status.includes('A') || status === '??') added.push(path)
    else modified.push(path)
  }
  return { added, modified, deleted }
}

function makeFakeRemote(tmp) {
  const bare = join(tmp, 'fake-remote.git')
  const seed = join(tmp, 'seed')
  git(tmp, ['init', '--bare', '-b', branch, bare])
  git(tmp, ['clone', bare, seed])
  // 模拟线上导入版：带一个会被新版删掉的跟踪目录 + 仍在跟踪的 build/ 产物 + 旧 README
  writeFileSync(join(seed, 'README.md'), '# imported consumer baseline\n', 'utf8')
  writeFileSync(join(seed, 'OLD_RESIDUE.md'), 'should be removed by push\n', 'utf8')
  const staleDocs = join(seed, 'docs')
  mkdirSync(staleDocs, { recursive: true })
  writeFileSync(join(staleDocs, 'STALE.md'), 'tracked stale doc from import\n', 'utf8')
  git(seed, ['config', 'user.name', 'Fake Remote'])
  git(seed, ['config', 'user.email', 'fake@local'])
  git(seed, ['add', '-A'])
  git(seed, ['commit', '-m', 'chore: import baseline'])
  git(seed, ['push', '-u', 'origin', branch])
  return bare
}

async function confirm(plan) {
  if (autoYes || !process.stdin.isTTY) return true
  console.log('\n以上为执行计划，继续？[y/N] ')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise((r) => rl.question('', r))
  rl.close()
  return /^y(es)?$/i.test(answer.trim())
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'mh-deferred-push-'))
  let work
  try {
    const cloneFrom = dryRun ? makeFakeRemote(tmp) : remote
    work = join(tmp, 'work')

    console.log(`[push] 模式：${dryRun ? 'DRY-RUN（离线假远端）' : '真实推送'}`)
    console.log(`[push] clone 源：${dryRun ? '(local bare)' : remote}`)
    console.log(`[push] 分支：${branch}`)
    console.log(`[push] 源仓库：${SOURCE}`)
    git(tmp, ['clone', '--branch', branch, '--single-branch', cloneFrom, work])

    const parentSha = git(work, ['rev-parse', 'HEAD'])
    console.log(`[push] 父提交：${parentSha.slice(0, 12)}（以远端为父，不 force）`)

    const cleared = clearWorktree(work)
    console.log(`[push] 已清空远端工作树（保留 .git），移除 ${cleared.length} 个顶层条目`)

    cpSync(SOURCE, work, { recursive: true, filter: shouldCopy })
    console.log('[push] 已复制本地工作树（排除 .git / node_modules / build / backups / .env / 临时产物）')

    // 清空 + 复制后，线上旧文件会自然变成 staged deletion；这正是我们要的效果。
    git(work, ['add', '-A'])
    const status = git(work, ['status', '--porcelain'])
    const changes = parsePorcelain(status)
    const short = git(work, ['diff', '--cached', '--shortstat'])
    console.log(`[push] 变更：新增 ${changes.added.length} / 修改 ${changes.modified.length} / 删除 ${changes.deleted.length}`)
    console.log(`[push] ${short || '(无文件变更)'}`)
    if (changes.deleted.length) {
      console.log(`[push] 将删除线上遗留 ${changes.deleted.length} 个文件，例如：${changes.deleted.slice(0, 3).join(', ')}`)
    }
    if (changes.added.length + changes.modified.length + changes.deleted.length === 0) {
      console.log('[push] 远端已是最新，无需提交。')
      return
    }

    const plan = { parentSha, changes, message }
    if (!(await confirm(plan))) {
      console.log('[push] 已取消，未做任何远端变更。')
      return
    }

    // 不覆盖用户全局 git 身份；只有完全没有配置时（典型于 dry-run 沙盒）才用占位。
    let name = '', email = ''
    try { name = git(work, ['config', 'user.name']) } catch { /* 未配置 */ }
    try { email = git(work, ['config', 'user.email']) } catch { /* 未配置 */ }
    const identity = []
    if (!name) identity.push('-c', 'user.name=Memory Harness Deferred Push')
    if (!email) identity.push('-c', 'user.email=deferred-push@local')
    git(tmp, ['-C', work, ...identity, 'commit', '-m', message])
    const newSha = git(work, ['rev-parse', 'HEAD'])
    console.log(`[push] 新提交：${newSha.slice(0, 12)} · ${message}`)

    git(tmp, ['-C', work, 'push', 'origin', `HEAD:refs/heads/${branch}`])
    console.log(`[push] ✅ ${dryRun ? '已推送到离线假远端（fast-forward 验证通过）' : '已推送到远端'}`)

    // 回读远端 ref，证明真的落上去了
    const remoteSha = git(tmp, ['ls-remote', cloneFrom, `refs/heads/${branch}`]).split(/\s+/)[0]
    console.log(`[push] 远端 HEAD 回读：${remoteSha.slice(0, 12)} ${remoteSha === newSha ? '✓ 一致' : '✗ 不一致'}`)
    if (remoteSha !== newSha) throw new Error('远端 HEAD 与新提交不一致')

    console.log('\n复核与收尾（真实推送时执行）：')
    console.log(`  git ls-remote ${remote} refs/heads/${branch}`)
    console.log('  打开仓库页确认 README 已更新、docs/PHASE1-RESULT.md 存在')
    console.log('  若要发版：git tag -a v0.3.1 -m "home-memory-app 0.3.1" && git push origin v0.3.1')
    console.log(`  临时目录：${keep ? tmp + '（保留）' : '已清理'}`)
  } catch (err) {
    const msg = err?.stderr?.toString?.() || err?.message || String(err)
    console.error(`[push] FAIL · ${msg.split('\n').slice(0, 6).join('\n')}`)
    if (/Authentication failed|could not read Username|403|permission denied/i.test(msg)) {
      console.error('  凭据由你本机 git 提供：确认已登录 GitHub / credential helper 可用。')
      console.error('  本脚本不读取、不存储任何 token。')
    }
    if (/non-fast-forward|rejected/i.test(msg)) {
      console.error('  远端可能已被别人更新：重新跑一次脚本即可（它会再以最新远端为父）。')
      console.error('  **不要** --force / --force-with-lease。')
    }
    process.exitCode = 1
  } finally {
    if (!keep && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  }
}

void main()
