window.__ModuleLoader__.load({
  id: 'dsh-whale-widget',
  factory: require => {
    const React = require('react')
    const h = React.createElement
    const NS = 'whale-widget'
    const URL = '/dsh-whale/size.json'
    const EVENT = 'dshw-config-changed'
    const zh = { title: '用量显示' }
    const en = { title: 'Usage Display' }

    class Controller {
      snapshot = null
      listeners = new Set()
      queue = Promise.resolve()
      disposed = false
      revision = 0
      pending = 0
      error = ''
      onEvent = event => { if (event.detail?.source === 'widget' && !this.pending) void this.load() }
      constructor() { window.addEventListener(EVENT, this.onEvent) }
      subscribe = fn => { this.listeners.add(fn); return () => this.listeners.delete(fn) }
      read = () => this.snapshot
      publish(value) {
        if (this.disposed) return
        this.snapshot = value
        for (const fn of this.listeners) fn()
      }
      async load() {
        const revision = this.revision
        try {
          const response = await fetch(URL, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const raw = await response.json()
          if (typeof raw.scale !== 'number') throw new Error('配置缺少尺寸字段')
          if (revision !== this.revision || this.pending) return
          this.error = ''
          this.publish(raw)
        } catch (error) {
          this.error = error.message
          this.publish(this.snapshot ? { ...this.snapshot } : null)
        }
      }
      patch(update) {
        const revision = ++this.revision
        this.pending++
        this.publish({ ...this.snapshot, ...update })
        this.queue = this.queue.catch(() => {}).then(async () => {
          if (this.disposed) return
          const response = await fetch(URL, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            // Send only edited fields. The upstream Host preserves every other setting.
            body: JSON.stringify({ scale: this.snapshot.scale, ...update }),
          })
          const result = await response.json()
          if (!response.ok || result.ok === false) throw new Error(result.error || `HTTP ${response.status}`)
          this.error = ''
          if (revision === this.revision) this.publish({ ...this.snapshot, ...result })
          window.dispatchEvent(new CustomEvent(EVENT, { detail: { source: 'settings' } }))
        }).catch(error => {
          this.error = error.message
          this.publish(this.snapshot ? { ...this.snapshot } : null)
        }).finally(() => { this.pending-- })
      }
      dispose() {
        this.disposed = true
        window.removeEventListener(EVENT, this.onEvent)
        this.listeners.clear()
      }
    }

    function UsageDisplay({ controller, t }) {
      const english = t('title') === 'Usage Display'
      const cfg = React.useSyncExternalStore(controller.subscribe, controller.read)
      React.useEffect(() => { void controller.load() }, [controller])
      const copy = (cn, en) => english ? en : cn
      if (!cfg) return h('div', { 'data-dsh-whale-settings': '' },
        h('p', { role: 'status' }, controller.error || copy('正在读取挂件配置…', 'Loading widget settings…')),
        h('button', { onClick: () => controller.load() }, copy('重新读取', 'Retry')))
      const patch = update => controller.patch(update)
      const check = (id, key, fallback = true) => h('input', {
        id, type: 'checkbox', checked: typeof cfg[key] === 'boolean' ? cfg[key] : fallback,
        onChange: event => patch({ [key]: event.target.checked }),
      })
      const row = (id, title, control, note) => h('div', { className: 'whale-setting-row', key: id },
        h('div', { className: 'whale-setting-head' }, h('label', { htmlFor: id }, title), control),
        note && h('p', { className: 'whale-setting-note' }, note))
      const soundOptions = [['duck', copy('小黄鸭', 'Rubber duck')], ['fx1', copy('音效 1', 'FX 1')]]
      if (!soundOptions.some(([value]) => value === cfg.soundSet)) soundOptions.push([cfg.soundSet, cfg.soundSet])
      return h('ul', { 'data-dsh-whale-settings': '' }, h('li', { className: 'whale-settings-card' },
        h('p', null, copy('管理右下角的小鲸鱼余额挂件。这里的改动与挂件菜单同步，并沿用全局明暗主题。', 'Manage the balance whale. Changes sync with the widget menu and follow the global color scheme.')),
        controller.error && h('p', { role: 'alert' }, controller.error),
        row('whale-enabled', copy('启用鲸鱼挂件', 'Enable whale widget'), check('whale-enabled', 'enabled'), copy('关闭后隐藏挂件并暂停余额和提示轮询。', 'Hides the widget and pauses balance and notification polling.')),
        row('whale-scale', copy('大小', 'Size'), h('span', { className: 'whale-setting-controls' },
          h('input', { id: 'whale-scale', type: 'range', min: 0.6, max: 2.5, step: 0.1, value: cfg.scale, onChange: event => patch({ scale: Number(event.target.value) }) }),
          h('output', null, `${Number(cfg.scale).toFixed(1)}×`))),
        row('whale-sound', copy('按压音效', 'Press sound'), check('whale-sound', 'sound')),
        row('whale-sound-set', copy('音效组', 'Sound set'), h('select', { id: 'whale-sound-set', value: cfg.soundSet, onChange: event => patch({ soundSet: event.target.value }) }, soundOptions.map(([value, label]) => h('option', { key: value, value }, label)))),
        row('whale-volume', copy('音量', 'Volume'), h('span', { className: 'whale-setting-controls' },
          h('input', { id: 'whale-volume', type: 'range', min: 0, max: 1, step: 0.05, value: cfg.vol, onChange: event => patch({ vol: Number(event.target.value) }) }),
          h('output', null, `${Math.round(cfg.vol * 100)}%`))),
        row('whale-bubble', copy('气泡', 'Bubbles'), check('whale-bubble', 'bubbleOn')),
        row('whale-turn-cost', copy('每轮消耗提示', 'Per-turn cost'), check('whale-turn-cost', 'turnCostOn')),
        row('whale-auto-close', copy('提示自动关闭（秒）', 'Close cost bubble after (seconds)'), h('input', { id: 'whale-auto-close', type: 'number', min: 0, step: 1, value: cfg.turnCostCloseMs / 1000, onChange: event => patch({ turnCostCloseMs: Math.max(0, Number(event.target.value) || 0) * 1000 }) }), copy('0 表示保持显示，直到手动关闭。', '0 keeps the bubble open until dismissed.')),
        row('whale-scroll-gap', copy('避让滚动条', 'Avoid scrollbar'), check('whale-scroll-gap', 'scrollGapOn', false)),
        row('whale-scroll-width', copy('避让宽度（px）', 'Scrollbar clearance (px)'), h('input', { id: 'whale-scroll-width', type: 'number', min: 0, step: 1, value: cfg.scrollGapPx, onChange: event => patch({ scrollGapPx: Math.max(0, Math.round(Number(event.target.value) || 0)) }) })),
        h('p', { className: 'whale-setting-note' }, copy('新版统一使用小鲸鱼记账；峰谷文案、角色和自定义提示在挂件菜单中管理。', 'The current widget uses ledger accounting. Edit peak copy, roles and custom notices in the widget menu.')),
      ))
    }

    const css = `[data-dsh-whale-settings]{list-style:none;margin:0;padding:0;color:var(--dsw-alias-label-primary);font:inherit}
      [data-dsh-whale-settings] .whale-settings-card{padding:16px;border-radius:var(--dsw-radius-settings-card,16px);background:var(--dsw-alias-bg-layer-1);box-shadow:var(--dsw-elevation-panel)}
      [data-dsh-whale-settings] .whale-setting-row{padding:12px 0;border-top:1px solid var(--dsw-alias-border-l1)}
      [data-dsh-whale-settings] .whale-setting-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
      [data-dsh-whale-settings] .whale-setting-note{font-size:12px;color:var(--dsw-alias-label-secondary);margin:6px 0 0;line-height:1.6}
      [data-dsh-whale-settings] .whale-setting-controls{display:flex;align-items:center;gap:8px}
      [data-dsh-whale-settings] input{accent-color:var(--dsw-alias-brand-primary)}
      [data-dsh-whale-settings] input[type=number]{width:78px}
      [data-dsh-whale-settings] input[type=range]{width:150px}
      [data-dsh-whale-settings] select,[data-dsh-whale-settings] input[type=number]{font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 6px}
      [data-dsh-whale-settings] output{min-width:42px;text-align:right}`
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }))
        const controller = new Controller()
        ctx.effect(() => () => controller.dispose())
        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.appendChild(style)
          return () => style.remove()
        })
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'usage-display', order: 130,
          label: () => ctx.locale.bind(NS)('title'), locale: NS,
          inject: () => ({ controller }),
        }, UsageDisplay))
      },
    }
  },
})
