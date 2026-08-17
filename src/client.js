/**
 * dsh-balance-panel — 浏览器半身源码。
 *
 * 纯 JS（React.createElement，无 JSX），只 `require('react')`（web 平台 seed）。
 * 数据通过同源 `fetch('/model-balance')` 获取（Host 半身注册的路由），
 * 因此不依赖 connection RPC，任何回环部署都能直接工作。
 *
 * 构建：`node scripts/build-client.mjs` → lib/client.js（__ModuleLoader__ 格式）。
 * @module dsh-balance-panel/client
 */

const React = require('react')

// ---------- 配色 ----------
const ACCENT_PALETTE = ['#4d9fff', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c', '#4ade80', '#e879f9', '#22d3ee']
const CURATED_ACCENTS = {
  'deepseek-official': '#4d9fff',
  deepseek: '#4d9fff',
  'qwen-token-plan-cn': '#fbbf24',
  fangzhou: '#a78bfa',
  openai: '#10a37f',
  anthropic: '#d97757',
  'google-gemini': '#4285f4',
}
function accentOf(id) {
  if (CURATED_ACCENTS[id]) return CURATED_ACCENTS[id]
  let h = 0
  const s = String(id)
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ACCENT_PALETTE[h % ACCENT_PALETTE.length]
}
const C_TOTAL = '#34d399'   // 总额：绿
const C_GRANTED = '#22d3ee' // 赠送：青
const C_TOPUP = '#fbbf24'   // 充值：金
const C_OK = '#34d399'
const C_ERR = '#f87171'

/** 迷你外部 store：footer 与 overlay 两个组件共享打开状态与数据。 */
function createStore() {
  let state = { data: null, loading: false, error: null, open: false }
  const listeners = new Set()
  return {
    get: () => state,
    set: (patch) => {
      state = Object.assign({}, state, patch)
      listeners.forEach((l) => l())
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

const store = createStore()

/** 从 Host 半身拉取全部 Provider 余额视图。 */
async function load() {
  if (store.get().loading) return
  store.set({ loading: true, error: null })
  try {
    const res = await fetch('/model-balance', { signal: AbortSignal.timeout(20000) })
    const result = await res.json()
    store.set({
      data: result,
      loading: false,
      generatedAt: result && result.generatedAt ? result.generatedAt : Date.now(),
    })
  } catch (e) {
    store.set({ loading: false, error: e && e.message ? e.message : String(e) })
  }
}

function useStore() {
  const [snap, setSnap] = React.useState(store.get())
  React.useEffect(() => store.subscribe(() => setSnap(store.get())), [])
  return snap
}

const fmt = (v) => (v == null || v === '' ? '—' : String(v))
const isDefault = (data, id) => data && data.default && data.default.provider === id
const hasBalance = (p) => p && p.balance && p.balance.status === 'ok'

/** 胶囊要展示的 Provider：优先当前使用模型（默认 Provider），不可查时回退到第一个可查的。 */
function pillProvider(data) {
  const providers = (data && Array.isArray(data.providers)) ? data.providers : []
  if (providers.length === 0) return null
  const def = data && data.default && data.default.provider
    ? providers.find((p) => p.id === data.default.provider)
    : undefined
  if (def && hasBalance(def)) return def
  const fallback = providers.find(hasBalance)
  if (fallback) return fallback
  return def || providers[0]
}

const CSS = '' +
  '.mb-card{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:12px;margin:8px 0;padding:10px 12px}' +
  '.mb-card-head{justify-content:space-between;align-items:center;gap:10px;display:flex;flex-wrap:wrap}' +
  '.mb-card-title{font-size:14px;font-weight:600}' +
  '.mb-card-body{margin-top:6px}' +
  '.mb-pill{box-sizing:border-box;cursor:pointer;height:22px;color:var(--dsw-alias-label-primary,#e8e8ea);background:var(--dsw-alias-button-elevated-fill,#26262b);border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:6px;align-items:center;gap:3px;margin:0;padding:0 6px;font-family:inherit;font-size:10px;line-height:14px;display:inline-flex;white-space:nowrap;overflow:hidden;max-width:108px}' +
  '.mb-pill-rail{width:32px;max-width:32px;padding:0;justify-content:center}' +
  '.mb-pill:hover{background:var(--dsw-alias-button-floating-hover,#33333b)}' +
  '.mb-pill.mb-error{color:var(--dsw-alias-state-error-primary,#f87171)}' +
  '.mb-overlay{z-index:1000;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}' +
  '.mb-mask{background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.5));backdrop-filter:var(--dsw-mask-blur,blur(2px));position:absolute;inset:0}' +
  '.mb-panel{z-index:1;background:var(--dsw-alias-bg-layer-2,#1d1d22);width:min(760px,calc(100vw - 48px));max-height:min(720px,calc(100vh - 48px));box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(0,0,0,.4));border-radius:20px;display:flex;flex-direction:column;position:relative;overflow:hidden}' +
  '.mb-header{flex:none;justify-content:space-between;align-items:center;gap:12px;padding:16px 20px 12px;display:flex}' +
  '.mb-title{color:var(--dsw-alias-label-primary,#e8e8ea);font-size:16px;font-weight:600;align-items:center;gap:8px;display:flex}' +
  '.mb-actions{justify-content:flex-end;align-items:center;gap:8px;display:flex}' +
  '.mb-updated{color:var(--dsw-alias-label-tertiary,#9a9aa2);font-size:12px}' +
  '.mb-refresh,.mb-close{cursor:pointer;color:var(--dsw-alias-label-primary,#e8e8ea);background:transparent;border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:8px;padding:4px 10px;font-family:inherit;font-size:12px}' +
  '.mb-refresh:hover,.mb-close:hover{background:var(--dsw-alias-interactive-bg-hover,#2c2c33)}' +
  '.mb-body{flex:1;min-height:0;padding:4px 20px 20px;overflow-y:auto}' +
  '.mb-row{border:1px solid var(--dsw-alias-border-l2,#3a3a42);border-radius:12px;margin:8px 0;padding:12px 14px}' +
  '.mb-row-head{justify-content:space-between;align-items:center;gap:8px;display:flex}' +
  '.mb-provider{color:var(--dsw-alias-label-primary,#e8e8ea);font-size:14px;align-items:center;gap:8px;display:inline-flex}' +
  '.mb-dot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}' +
  '.mb-default{color:var(--dsw-alias-accent,#4d9fff);font-size:11px;border:1px solid currentColor;border-radius:999px;padding:0 6px}' +
  '.mb-badge{flex:none;font-size:11px;border-radius:999px;padding:2px 8px;color:var(--dsw-alias-label-tertiary,#9a9aa2);border:1px solid var(--dsw-alias-border-l2,#3a3a42)}' +
  '.mb-badge.mb-ok{color:var(--dsw-alias-state-success-primary,#4ade80);border-color:currentColor}' +
  '.mb-badge.mb-warn{color:var(--dsw-alias-state-warning-primary,#fbbf24);border-color:currentColor}' +
  '.mb-badge.mb-error{color:var(--dsw-alias-state-error-primary,#f87171);border-color:currentColor}' +
  '.mb-row-sub{color:var(--dsw-alias-label-tertiary,#9a9aa2);font-size:12px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.mb-models{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}' +
  '.mb-chip{font-size:11px;border-radius:6px;padding:2px 8px}' +
  '.mb-balances{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l2,#3a3a42);padding-top:8px;display:flex;flex-direction:column;gap:4px}' +
  '.mb-balance{color:var(--dsw-alias-label-primary,#e8e8ea);font-size:13px;display:flex;gap:12px;flex-wrap:wrap}' +
  '.mb-balance-cur{font-weight:600;min-width:44px}' +
  '.mb-balance-total{font-weight:600}' +
  '.mb-balance-part{font-size:12px}' +
  '.mb-link{font-size:12px;text-decoration:none;display:inline-flex;align-items:center;gap:4px}' +
  '.mb-link:hover{text-decoration:underline}' +
  '.mb-msg{color:var(--dsw-alias-label-tertiary,#9a9aa2);font-size:12px;margin:8px 0}' +
  '.mb-error-text{color:var(--dsw-alias-state-error-primary,#f87171)}'

/** 幂等注入本插件的样式（静态环境没有 styles builtin，手动写 <style>）。 */
function insertStyles() {
  if (typeof document === 'undefined') return
  const tagId = 'dsh-balance-panel/client.css'
  if (document.querySelector(`style[data-plugin-css="${tagId}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-balance-panel'
  tag.dataset.pluginCss = tagId
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** 插件主体：注册 Run 卡片视图、侧边栏底部入口与悬浮面板三个 Slot。 */
function apply(ctx) {
  const slots = ctx.get('slots')
  if (slots === undefined) return
  const timer = ctx.get('timer')

  insertStyles()

  /** 卡片主体：配额 / 货币余额 / 登录跳转 / 提示信息。 */
  function balanceBody(b, infos, accent) {
    if (b && b.status === 'ok' && b.kind === 'quota') {
      const dimRows = Array.isArray(b.dims) && b.dims.length > 0
        ? b.dims.map((d, i) =>
            React.createElement('div', { key: i, className: 'mb-balance' },
              React.createElement('span', { className: 'mb-balance-cur', style: { color: accent } },
                d.window === 'weekly' ? '周额度' : '小时额度'),
              React.createElement('span', { className: 'mb-balance-total', style: { color: C_TOTAL } }, `剩余 ${fmt(d.remaining)}`),
              React.createElement('span', { className: 'mb-balance-part' }, `已用 ${fmt(d.used)} / ${fmt(d.limit)}`),
              d.resetTime
                ? React.createElement('span', { className: 'mb-balance-part' }, `重置 ${String(d.resetTime).slice(0, 16)}`)
                : null,
            ),
          )
        : null
      return React.createElement('div', { className: 'mb-balances' },
        React.createElement('div', { className: 'mb-balance' },
          React.createElement('span', { className: 'mb-balance-cur', style: { color: accent } }, '总额度'),
          React.createElement('span', { className: 'mb-balance-total', style: { color: C_TOTAL } },
            `剩余 ${fmt(b.remaining)}${b.unit ? ` ${b.unit}` : ''}`),
          React.createElement('span', { className: 'mb-balance-part' }, `已用 ${fmt(b.used)} / 总 ${fmt(b.limit)}`),
          b.resetTime
            ? React.createElement('span', { className: 'mb-balance-part' }, `重置 ${String(b.resetTime).slice(0, 16)}`)
            : null,
        ),
        dimRows,
      )
    }
    if (b && b.status === 'login-required' && b.consoleUrl) {
      return React.createElement('div', { className: 'mb-balances' },
        React.createElement('a', { href: b.consoleUrl, target: '_blank', rel: 'noreferrer', className: 'mb-link', style: { color: accent } },
          '去控制台查看余额 →'),
      )
    }
    if (infos.length > 0) {
      return React.createElement('div', { className: 'mb-balances' },
        infos.map((i, idx) =>
          React.createElement('div', { key: idx, className: 'mb-balance' },
            React.createElement('span', { className: 'mb-balance-cur', style: { color: accent } }, i.currency),
            React.createElement('span', { className: 'mb-balance-total', style: { color: C_TOTAL } }, `总额 ${fmt(i.totalBalance)}`),
            i.grantedBalance != null
              ? React.createElement('span', { className: 'mb-balance-part', style: { color: C_GRANTED } }, `赠送 ${fmt(i.grantedBalance)}`)
              : null,
            i.toppedUpBalance != null
              ? React.createElement('span', { className: 'mb-balance-part', style: { color: C_TOPUP } }, `充值 ${fmt(i.toppedUpBalance)}`)
              : null,
          ),
        ),
      )
    }
    return b && b.message
      ? React.createElement('div', { className: 'mb-msg' }, b.message)
      : null
  }

  /** 单个 Provider 卡片（三处复用），带独立主题色。 */
  function ProviderCard(p) {
    const accent = accentOf(p.id)
    const b = p.balance
    let statusText = '未知'
    let statusClass = 'mb-badge'
    let statusStyle = null
    if (b) {
      if (b.status === 'ok') { statusText = '可用'; statusClass = 'mb-badge mb-ok'; statusStyle = { color: C_OK, borderColor: C_OK } }
      else if (b.status === 'unsupported') { statusText = '不支持'; statusClass = 'mb-badge' }
      else if (b.status === 'no-credential') { statusText = '未配置密钥'; statusClass = 'mb-badge mb-warn' }
      else if (b.status === 'login-required') { statusText = '需登录'; statusClass = 'mb-badge mb-warn' }
      else { statusText = '查询失败'; statusClass = 'mb-badge mb-error'; statusStyle = { color: C_ERR, borderColor: C_ERR } }
    }
    const infos = b && b.status === 'ok' && Array.isArray(b.infos) ? b.infos : []
    return React.createElement('div', { key: p.id, className: 'mb-row' },
      React.createElement('div', { className: 'mb-row-head' },
        React.createElement('span', { className: 'mb-provider' },
          React.createElement('span', { className: 'mb-dot', style: { background: accent } }),
          React.createElement('span', { style: { color: accent, fontWeight: 600 } }, p.displayName),
          isDefault(store.get(), p.id) ? React.createElement('span', { className: 'mb-default' }, '默认') : null,
        ),
        React.createElement('span', { className: statusClass, style: statusStyle }, statusText),
      ),
      React.createElement('div', { className: 'mb-row-sub' },
        `ID: ${p.id}${p.api ? ` · ${p.api}` : ''}${p.baseURL ? ` · ${p.baseURL}` : ''}`,
      ),
      React.createElement('div', { className: 'mb-row-sub' },
        p.apiKeyEnv
          ? `密钥: ${p.apiKeyEnv}${p.credentialConfigured ? ' ✓' : ' ✗'}`
          : '密钥: 未配置 apiKeyEnv',
      ),
      p.models && p.models.length > 0
        ? React.createElement('div', { className: 'mb-models' },
            p.models.map((m) =>
              React.createElement('span', { key: m, className: 'mb-chip', style: { border: '1px solid ' + accent, color: accent, background: accent + '1a' } }, m)),
          )
        : null,
      balanceBody(b, infos, accent),
    )
  }

  /** Run 卡片内嵌余额视图。 */
  function RunCardView() {
    const s = useStore()
    React.useEffect(() => {
      load()
      const disposer = timer ? timer.interval(() => load(), 5 * 60 * 1000) : null
      return () => {
        if (disposer) disposer()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const providers = s.data && Array.isArray(s.data.providers) ? s.data.providers : []
    const okCount = providers.filter((p) => p.balance && p.balance.status === 'ok').length
    const now = new Date(s.generatedAt || Date.now())
    const accent = s.data && s.data.default ? accentOf(s.data.default.provider) : '#4d9fff'
    return React.createElement('div', { className: 'mb-card' },
      React.createElement('div', { className: 'mb-card-head' },
        React.createElement('span', { className: 'mb-card-title', style: { color: accent } }, '模型余额'),
        React.createElement('span', { className: 'mb-updated' },
          s.loading ? '刷新中…' : `更新于 ${now.toLocaleTimeString()} · ${okCount}/${providers.length} 可查`,
        ),
        React.createElement('button', { type: 'button', className: 'mb-refresh', onClick: () => load() }, '刷新'),
        React.createElement('button', { type: 'button', className: 'mb-close', onClick: () => store.set({ open: true }) }, '全屏'),
      ),
      React.createElement('div', { className: 'mb-card-body' },
        providers.length === 0 && !s.loading
          ? React.createElement('div', { className: 'mb-msg' }, '没有找到已配置的模型 Provider')
          : null,
        providers.map((p) => ProviderCard(p)),
      ),
    )
  }

  /** 侧边栏底部入口：当前默认 Provider 的余额摘要，点击打开面板。 */
  function BalanceFooter(props) {
    const s = useStore()
    React.useEffect(() => {
      load()
      const disposer = timer ? timer.interval(() => load(), 5 * 60 * 1000) : null
      return () => {
        if (disposer) disposer()
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const wide = !props || props.wide !== false
    const data = s.data
    let label = wide ? '余额 —' : '¥'
    let stateClass = 'mb-pill' + (wide ? '' : ' mb-pill-rail')
    let style = null
    let tip = '查看全部模型余额'
    if (s.error) {
      label = wide ? '余额 ×' : '!'
      stateClass = 'mb-pill mb-error' + (wide ? '' : ' mb-pill-rail')
      style = { color: C_ERR, borderColor: C_ERR + '66', background: C_ERR + '14' }
      tip = `余额加载失败: ${s.error}`
    } else if (data && Array.isArray(data.providers) && data.providers.length > 0) {
      const chosen = pillProvider(data)
      if (chosen && hasBalance(chosen)) {
        stateClass = 'mb-pill' + (wide ? '' : ' mb-pill-rail')
        style = { color: C_OK, borderColor: C_OK + '66', background: C_OK + '14' }
        if (chosen.balance.kind === 'quota') {
          label = wide ? `剩余 ${fmt(chosen.balance.remaining)}` : '¥'
          tip = `${chosen.displayName} 剩余 ${fmt(chosen.balance.remaining)}${chosen.balance.unit ? ` ${chosen.balance.unit}` : ''}，点击查看全部`
        } else {
          const info = chosen.balance.infos ? chosen.balance.infos[0] : null
          if (info) {
            label = wide ? `余额 ${fmt(info.totalBalance)}${info.currency ? ` ${info.currency}` : ''}` : '¥'
            tip = `${chosen.displayName} 余额 ${fmt(info.totalBalance)}${info.currency ? ` ${info.currency}` : ''}，点击查看全部`
          } else {
            label = wide ? '余额 —' : '¥'
            tip = `${chosen.displayName} 暂无可查余额，点击查看全部`
          }
        }
      } else {
        label = wide ? '余额 —' : '¥'
        tip = `${chosen ? chosen.displayName + ' 暂无可查余额' : '暂无可查余额'}，点击查看全部`
      }
    } else if (s.loading) {
      label = wide ? '余额 …' : '¥'
    }
    return React.createElement(
      'button',
      { type: 'button', className: stateClass, title: tip, onClick: () => store.set({ open: true }), style },
      label,
    )
  }

  /** 全屏悬浮面板：列出已配置 Provider 的模型与余额。 */
  function BalanceOverlay() {
    const s = useStore()
    if (!s.open) return null
    const data = s.data
    const providers = data && Array.isArray(data.providers) ? data.providers : []
    const now = new Date(s.generatedAt || Date.now())
    const accent = data && data.default ? accentOf(data.default.provider) : '#4d9fff'
    return React.createElement('div', { className: 'mb-overlay' },
      React.createElement('div', { className: 'mb-mask', onClick: () => store.set({ open: false }) }),
      React.createElement('div', { className: 'mb-panel' },
        React.createElement('div', { className: 'mb-header', style: { borderBottom: '1px solid ' + accent + '33' } },
          React.createElement('div', { className: 'mb-title' },
            React.createElement('span', { className: 'mb-dot', style: { background: accent } }),
            '模型余额',
          ),
          React.createElement('div', { className: 'mb-actions' },
            React.createElement('span', { className: 'mb-updated' },
              s.loading ? '刷新中…' : `更新于 ${now.toLocaleTimeString()}`,
            ),
            React.createElement('button', { type: 'button', className: 'mb-refresh', onClick: () => load() }, '刷新'),
            React.createElement('button', { type: 'button', className: 'mb-close', onClick: () => store.set({ open: false }) }, '✕'),
          ),
        ),
        React.createElement('div', { className: 'mb-body' },
          s.error ? React.createElement('div', { className: 'mb-msg mb-error-text' }, `加载失败: ${s.error}`) : null,
          providers.length === 0 && !s.loading
            ? React.createElement('div', { className: 'mb-msg' }, '没有找到已配置的模型 Provider')
            : null,
          providers.length === 0 && s.loading
            ? React.createElement('div', { className: 'mb-msg' }, '加载中…')
            : null,
          providers.map((p) => ProviderCard(p)),
        ),
      ),
    )
  }

  slots.inject('tool.view.cordis', () => slots.register(
    { name: 'tool.view.cordis', key: 'self' },
    () => React.createElement(RunCardView, null),
  ))
  // 余额胶囊：模型选择器左侧（composer 工具行尾段，紧挨模型选择器）
  slots.inject('conversation.input.right', () => slots.register(
    { name: 'conversation.input.right', id: 'balance-panel', order: 10 },
    (props) => React.createElement(BalanceFooter, props),
  ))
  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'balance-panel', order: 20 },
    () => React.createElement(BalanceOverlay, null),
  ))
}

exports.apply = apply
