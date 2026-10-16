/**
 * Höflicher HTTP-Client für die Scraper: ehrlicher User-Agent, Mindestabstand
 * pro Host, Timeouts, Wiederholungen mit Backoff und robots.txt-Prüfung.
 */

export const USER_AGENT =
  'Mozilla/5.0 (compatible; GspartVorarlberg/1.0; +https://github.com/jessehaemmerle/price-tracker)'

const DEFAULT_DELAY_MS = 400
const hostDelay = new Map<string, number>()
const lastRequest = new Map<string, number>()

/** Mindestabstand zwischen zwei Requests auf denselben Host setzen. */
export function setHostDelay(host: string, ms: number): void {
  hostDelay.set(host, ms)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function throttle(host: string): Promise<void> {
  const delay = hostDelay.get(host) ?? DEFAULT_DELAY_MS
  const last = lastRequest.get(host) ?? 0
  const wait = last + delay - Date.now()
  lastRequest.set(host, Math.max(Date.now(), last + delay))
  if (wait > 0) await sleep(wait)
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} für ${url}`)
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
  timeoutMs?: number
  retries?: number
  /** robots.txt nicht prüfen (nur für reine JSON-APIs ohne robots.txt). */
  skipRobots?: boolean
}

async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, headers = {}, timeoutMs = 60_000, retries = 4 } = opts
  const host = new URL(url).host
  if (!opts.skipRobots && !(await isAllowedByRobots(url))) {
    throw new Error(`robots.txt verbietet ${url}`)
  }
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle(host)
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'de-AT,de;q=0.9',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      })
      if (res.ok) return res
      // 4xx außer 408/429 sind endgültig – nicht weiter belasten.
      if (res.status < 500 && res.status !== 408 && res.status !== 429) throw new HttpError(res.status, url)
      lastError = new HttpError(res.status, url)
      if (attempt === retries) break
      const retryAfter = Number(res.headers.get('retry-after'))
      // Bei Drosselung (429) deutlich länger warten als bei Serverfehlern.
      const backoff = res.status === 429 ? 10_000 * 2 ** attempt : 2000 * 2 ** attempt
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(retryAfter * 1000, backoff) : backoff)
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 408 && err.status !== 429) throw err
      lastError = err
      if (attempt === retries) break
      await sleep(2 ** attempt * 2000)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...opts.headers } })
  return (await res.json()) as T
}

export async function postJson<T>(url: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, { ...opts, method: 'POST', body, headers: { Accept: 'application/json', ...opts.headers } })
  return (await res.json()) as T
}

export async function getText(url: string, opts: RequestOptions = {}): Promise<string> {
  const res = await request(url, { ...opts, headers: { Accept: 'text/html,application/xhtml+xml', ...opts.headers } })
  return res.text()
}

export async function getBytes(url: string, opts: RequestOptions = {}): Promise<Uint8Array> {
  const res = await request(url, opts)
  return new Uint8Array(await res.arrayBuffer())
}

/* ---------------------------- robots.txt ---------------------------- */

interface RobotsRules {
  allow: string[]
  disallow: string[]
}

const robotsCache = new Map<string, Promise<RobotsRules>>()

/** Minimaler robots.txt-Parser: Gruppen für "*" und unseren Bot, Wildcards * und $. */
export function parseRobots(txt: string, agent = 'gspartvorarlberg'): RobotsRules {
  const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = []
  let current: (typeof groups)[number] | null = null
  let lastWasAgent = false
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    if (!line) continue
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (key === 'allow' && value) current.allow.push(value)
    if (key === 'disallow' && value) current.disallow.push(value)
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)))
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'))
  return {
    allow: chosen.flatMap((g) => g.allow),
    disallow: chosen.flatMap((g) => g.disallow),
  }
}

function ruleToRegex(rule: string): RegExp {
  // "$" bleibt als Zeilenende-Anker stehen, alles andere wird wörtlich genommen.
  const escaped = rule.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + escaped)
}

export function robotsAllows(rules: RobotsRules, pathWithQuery: string): boolean {
  // Längste passende Regel gewinnt, bei Gleichstand gewinnt Allow (Google-Semantik).
  let best: { len: number; allow: boolean } | null = null
  for (const [list, allow] of [
    [rules.allow, true],
    [rules.disallow, false],
  ] as const) {
    for (const rule of list) {
      if (ruleToRegex(rule).test(pathWithQuery)) {
        if (!best || rule.length > best.len || (rule.length === best.len && allow)) best = { len: rule.length, allow }
      }
    }
  }
  return best ? best.allow : true
}

export async function isAllowedByRobots(url: string): Promise<boolean> {
  const u = new URL(url)
  let rules = robotsCache.get(u.origin)
  if (!rules) {
    rules = (async () => {
      try {
        const res = await fetch(`${u.origin}/robots.txt`, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return { allow: [], disallow: [] }
        return parseRobots(await res.text())
      } catch {
        return { allow: [], disallow: [] }
      }
    })()
    robotsCache.set(u.origin, rules)
  }
  return robotsAllows(await rules, u.pathname + u.search)
}
