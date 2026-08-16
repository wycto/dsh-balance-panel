/**
 * dsh-model-balance — Host 半身。
 *
 * 职责：
 *  1. 枚举当前 DSH 配置的所有模型 Provider（可配置 Provider 目录 + 默认模型回退）；
 *  2. 通过凭证服务解析每个 Provider 的 API Key（密钥全程留在进程内，不出 Host）；
 *  3. 按余额策略查询各账号余额（内置 DeepSeek /user/balance，或 profile.balance 自定义）；
 *  4. 在回环 webServer 上注册 GET /model-balance，返回归一化的 JSON 给浏览器半身。
 *
 * 依赖：webServer（硬依赖，挂载本插件的路由）、settings / llm / credentials /
 * agentDefaultModel（可选读取，缺失时优雅降级）。
 *
 * @module dsh-model-balance/host
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials'

/** Cordis 插件名。 */
export const name = 'model-balance'

/** 硬依赖：路由需要 webServer 服务。 */
export const inject = ['webServer']

/** deepseek-official 内置默认值（适配器默认配置的镜像，配置缺失时兜底）。 */
const DEEPSEEK_DEFAULTS = {
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  baseURL: 'https://api.deepseek.com',
}

/**
 * 每个 Provider 的余额查询策略。
 * 优先级：provider 配置里的 `balance.endpoint` 自定义 > 内置映射。
 * @param providerId - provider 路由 id。
 * @param profile - 该 provider 的 settings profile（可为 undefined）。
 * @returns 策略对象或 null（不支持）。
 */
function balanceStrategy(providerId, profile) {
  const b = profile && typeof profile.balance === 'object' && profile.balance !== null
    ? profile.balance
    : null
  if (b && typeof b.endpoint === 'string' && b.endpoint) {
    return { endpoint: b.endpoint, auth: b.auth === 'none' ? 'none' : 'bearer' }
  }
  if (providerId === 'deepseek-official' || providerId === 'deepseek') {
    return { endpoint: '/user/balance', auth: 'bearer' }
  }
  return null
}

/**
 * 解析 DeepSeek `/user/balance` 响应（`balance_infos` 数组）。
 * @param body - 接口返回的 JSON。
 */
function parseBalance(body) {
  if (body && typeof body === 'object' && Array.isArray(body.balance_infos)) {
    return {
      status: 'ok',
      available: body.is_available === true,
      infos: body.balance_infos.map((i) => ({
        currency: typeof i.currency === 'string' ? i.currency : '?',
        totalBalance: i.total_balance != null ? String(i.total_balance) : null,
        grantedBalance: i.granted_balance != null ? String(i.granted_balance) : null,
        toppedUpBalance: i.topped_up_balance != null ? String(i.topped_up_balance) : null,
      })),
    }
  }
  return { status: 'error', message: '无法识别的余额响应' }
}

/** 沿 settingsPath 走一层对象（user/base/value 都可用）。 */
function walkPath(node, path) {
  for (const key of path || []) {
    node = node && typeof node === 'object' ? node[key] : undefined
  }
  return node
}

/** 从 profile 里提取模型 id 列表（字符串或 {id|name} 均可）。 */
function modelsOf(profile) {
  if (!profile || !Array.isArray(profile.models)) return []
  return profile.models
    .map((m) => (typeof m === 'string' ? m : m && (m.id || m.name)))
    .filter((x) => typeof x === 'string' && x)
}

/**
 * 枚举**已配置**的 Provider。
 *
 * 只保留真正配置过的 Provider：settings 的 user 层（用户自己写的）或 base 层
 * （部署层声明）里有该 Provider 的 profile，或者是默认模型选中的 Provider；
 * `listConfigurableProviders()` 返回的「注册或休眠」全量目录中其余条目一律跳过。
 *
 * 模型只取用户实际配置的（user 层优先，base 层次之）；schema 默认的模型列表
 * （如 deepseek 的全量模型 default）不会被带出来。默认 Provider 没有任何
 * 用户模型时只显示默认模型。
 */
function collectProviders(ctx) {
  const llm = ctx.get('llm')
  const settings = ctx.get('settings')
  const entries = (llm && llm.listConfigurableProviders ? llm.listConfigurableProviders() : []) || []
  let views = []
  try {
    views = (settings && settings.describe ? settings.describe({ redactSecrets: true }) : []) || []
  } catch {
    // settings 未挂载
  }

  let sel = null
  try {
    sel = (ctx.get('agentDefaultModel') && ctx.get('agentDefaultModel').currentSelection()) || null
  } catch {
    // 服务缺失
  }

  const out = new Map()
  for (const e of entries) {
    const desc = views.find((v) => v && String(v.ns) === e.settingsNs)
    const profileUser = desc ? walkPath(desc.user, e.settingsPath) : undefined
    const profileBase = desc ? walkPath(desc.base, e.settingsPath) : undefined
    const isDefaultProvider = !!(sel && sel.provider === e.provider)

    // 只保留实际配置过的 Provider
    const configured = isDefaultProvider
      || (profileUser && typeof profileUser === 'object')
      || (profileBase && typeof profileBase === 'object')
    if (!configured) continue

    const userModels = modelsOf(profileUser)
    const baseModels = modelsOf(profileBase)
    let models = userModels.length > 0 ? userModels : baseModels
    if (models.length === 0 && isDefaultProvider && sel && sel.model) models = [sel.model]

    const profile = profileUser && typeof profileUser === 'object'
      ? profileUser
      : (profileBase && typeof profileBase === 'object' ? profileBase : undefined)

    const isDeepseek = e.provider === 'deepseek-official' || e.provider === 'deepseek'
    let apiKeyEnv = profile && typeof profile.apiKeyEnv === 'string' ? profile.apiKeyEnv : undefined
    let baseURL = profile && typeof profile.baseURL === 'string' ? profile.baseURL : undefined
    let api = profile && typeof profile.api === 'string' ? profile.api : undefined
    if (isDeepseek) {
      apiKeyEnv = apiKeyEnv || DEEPSEEK_DEFAULTS.apiKeyEnv
      baseURL = baseURL || DEEPSEEK_DEFAULTS.baseURL
      api = api || 'deepseek'
    }

    out.set(e.provider, {
      id: e.provider,
      displayName: (profile && typeof profile.displayName === 'string' && profile.displayName) || e.displayName || e.provider,
      apiKeyEnv,
      baseURL,
      api,
      models,
      profile: profile || undefined,
    })
  }

  // 默认 Provider 若不在目录里，用内置默认兜底
  if (sel && sel.provider && !out.has(sel.provider)) {
    const isDeepseek = sel.provider === 'deepseek-official' || sel.provider === 'deepseek'
    out.set(sel.provider, {
      id: sel.provider,
      displayName: sel.provider,
      apiKeyEnv: isDeepseek ? DEEPSEEK_DEFAULTS.apiKeyEnv : undefined,
      baseURL: isDeepseek ? DEEPSEEK_DEFAULTS.baseURL : undefined,
      api: isDeepseek ? 'deepseek' : undefined,
      models: sel.model ? [sel.model] : [],
      profile: undefined,
    })
  }
  return { providers: Array.from(out.values()), default: sel }
}

/**
 * 用宿主全局 fetch 发起带认证头的 GET 并解析 JSON。
 * 静态插件运行在完整 Node 进程中（Node 18+ 自带 fetch）。
 */
async function httpGetJson(url, auth, key) {
  if (typeof fetch !== 'function') {
    return { ok: false, error: '宿主进程没有全局 fetch' }
  }
  const headers = {}
  if (auth === 'bearer' && key) headers.authorization = `Bearer ${key}`
  let res
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) }
  }
  if (!res.ok) return { ok: false, error: `余额接口 HTTP ${res.status}` }
  try {
    return { ok: true, body: await res.json() }
  } catch {
    return { ok: false, error: '余额接口返回了非 JSON 内容' }
  }
}

/** 查询单个 Provider 的余额，产出给前端的归一化条目。 */
async function queryProviderBalance(ctx, p) {
  const entry = {
    id: p.id,
    displayName: p.displayName,
    apiKeyEnv: p.apiKeyEnv || null,
    baseURL: p.baseURL || null,
    api: p.api || null,
    models: p.models || [],
    credentialConfigured: false,
    balance: null,
  }
  // 先报告密钥配置状态（describe 不读取值，任何 Provider 都适用）
  if (p.apiKeyEnv) {
    try {
      const credentials = ctx.get('credentials')
      const info = credentials ? await credentials.describe(credentialRef(p.apiKeyEnv)) : null
      entry.credentialConfigured = !!(info && info.configured)
    } catch {
      // 保持 false
    }
  }
  const strat = balanceStrategy(p.id, p.profile)
  if (!strat) {
    entry.balance = { status: 'unsupported', message: '该 Provider 没有已知的余额查询接口' }
    return entry
  }
  if (!p.apiKeyEnv) {
    entry.balance = { status: 'no-credential', message: '未配置 apiKeyEnv，无法查询余额' }
    return entry
  }
  let hit = null
  try {
    const credentials = ctx.get('credentials')
    hit = credentials ? await credentials.resolve(credentialRef(p.apiKeyEnv)) : null
  } catch {
    // 解析失败按未配置处理
  }
  if (!hit || !hit.value) {
    entry.balance = { status: 'no-credential', message: `凭证 ${p.apiKeyEnv} 未配置` }
    return entry
  }
  entry.credentialConfigured = true
  const url = /^https?:\/\//.test(strat.endpoint)
    ? strat.endpoint
    : `${(p.baseURL || DEEPSEEK_DEFAULTS.baseURL).replace(/\/+$/, '')}${strat.endpoint}`
  const res = await httpGetJson(url, strat.auth, hit.value)
  if (!res.ok) {
    entry.balance = { status: 'error', message: res.error }
    return entry
  }
  entry.balance = parseBalance(res.body)
  return entry
}

/** 汇总全部 Provider 的余额视图。 */
async function queryAll(ctx) {
  const collected = collectProviders(ctx)
  const providers = []
  for (const p of collected.providers) {
    try {
      providers.push(await queryProviderBalance(ctx, p))
    } catch (e) {
      providers.push({
        id: p.id,
        displayName: p.displayName,
        apiKeyEnv: p.apiKeyEnv || null,
        baseURL: p.baseURL || null,
        api: p.api || null,
        models: p.models || [],
        credentialConfigured: false,
        balance: { status: 'error', message: e && e.message ? e.message : String(e) },
      })
    }
  }
  return { generatedAt: Date.now(), default: collected.default, providers }
}

/** 序列化 JSON 响应。 */
function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

/** 插件主体：挂载 /model-balance 路由。 */
export function apply(ctx) {
  const handler = async (req, res) => {
    try {
      sendJson(res, 200, await queryAll(ctx))
    } catch (e) {
      sendJson(res, 500, {
        error: e instanceof Error ? e.message : String(e),
        providers: [],
      })
    }
  }
  ctx.webServer.register({
    kind: 'exact',
    path: '/model-balance',
    handler,
  })
}
