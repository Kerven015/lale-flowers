// Admin: dashboard and sales numbers, all from real orders (/api/admin/stats).
//   Revenue     = delivered orders ("done"): customers pay on delivery / in the shop.
//   Order value = every order that is not cancelled (paid or still on its way).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import Icon from '../../components/Icons'
import { StatusPill, orderDate } from '../../components/OrderStatus'
import { formatPrice } from '../../utils/productHelpers'

// 'YYYY-MM-DD' helpers (calendar days, no time zones)
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const mondayOf = (day) => { const d = new Date(`${day}T00:00:00Z`); return addDays(day, -((d.getUTCDay() + 6) % 7)) }
const monthOf = (day) => `${day.slice(0, 7)}-01`
const nextMonth = (day) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return iso(d) }

// every period in the range, so days without orders show as 0
function periods(from, to, group) {
  const out = []
  let p = group === 'week' ? mondayOf(from) : group === 'month' ? monthOf(from) : from
  while (p <= to && out.length < 1200) {
    out.push(p)
    p = group === 'week' ? addDays(p, 7) : group === 'month' ? nextMonth(p) : addDays(p, 1)
  }
  return out
}

const PRESETS = [['7', 7], ['30', 30], ['90', 90], ['365', 365]]

function Tile({ label, value, hint, icon, tone }) {
  return (
    <div className={`dash-tile${tone ? ` is-${tone}` : ''}`}>
      <span className="dash-tile-label">{icon && <Icon name={icon} size={16} />}{label}</span>
      <strong className="dash-tile-value">{value}</strong>
      {hint && <small className="muted">{hint}</small>}
    </div>
  )
}

// One series of bars (revenue or orders per period). Hover / focus a bar for
// its exact value; the same numbers are in the table view.
function BarChart({ rows, metric, L, lang }) {
  const [hover, setHover] = useState(null)
  const wrap = useRef(null)
  const W = 720
  const H = 220
  const pad = { l: 56, r: 8, t: 12, b: 28 }
  const max = Math.max(1, ...rows.map((r) => r[metric]))
  // round the top to a tidy number for the grid
  const step = 10 ** Math.floor(Math.log10(max))
  const top = Math.ceil(max / step) * step
  const ticks = Number.isInteger(top / 2) ? [0, top / 2, top] : [0, top] // never a repeated label
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const bw = iw / rows.length
  const barW = Math.max(2, Math.min(28, bw - 2)) // 2px gap between bars
  const y = (v) => pad.t + ih - (v / top) * ih
  const fmt = (v) => (metric === 'orders' ? String(v) : formatPrice(v))
  const label = (p) => new Date(`${p}T00:00:00Z`).toLocaleDateString(lang === 'tm' ? 'tk' : lang, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const every = Math.ceil(rows.length / 8) // at most ~8 x labels

  return (
    <div className="dash-chart" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={metric === 'orders' ? L.dashChartOrders : L.dashChartRevenue} preserveAspectRatio="none">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="dash-grid" />
            <text x={pad.l - 8} y={y(v)} className="dash-axis" textAnchor="end" dominantBaseline="middle">{metric === 'orders' ? v : Math.round(v).toLocaleString('ru')}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const x = pad.l + i * bw + (bw - barW) / 2
          const h = Math.max(0, pad.t + ih - y(r[metric]))
          const rad = Math.min(4, barW / 2, h)
          return (
            <g key={r.period}>
              {/* rounded top, square bottom on the baseline */}
              {h > 0 && (
                <path
                  className={`dash-bar${hover === i ? ' is-hover' : ''}`}
                  d={`M${x},${pad.t + ih} V${pad.t + ih - h + rad} Q${x},${pad.t + ih - h} ${x + rad},${pad.t + ih - h} H${x + barW - rad} Q${x + barW},${pad.t + ih - h} ${x + barW},${pad.t + ih - h + rad} V${pad.t + ih} Z`}
                />
              )}
              {/* hit target: the whole column, bigger than the bar */}
              <rect
                x={pad.l + i * bw} y={pad.t} width={bw} height={ih} fill="transparent"
                tabIndex={0} aria-label={`${label(r.period)}: ${fmt(r[metric])}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)} onBlur={() => setHover(null)}
              />
              {i % every === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 8} className="dash-axis" textAnchor="middle">{label(r.period)}</text>}
            </g>
          )
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="dash-baseline" />
      </svg>
      {hover !== null && rows[hover] && (
        <div className="dash-tip" role="status" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%` }}>
          <strong>{fmt(rows[hover][metric])}</strong>
          <span>{label(rows[hover].period)}</span>
          <span className="muted">{L.dashOrdersN.replace('{n}', rows[hover].orders)}</span>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard({ L, call, onOpenTab }) {
  const { t, lang } = useI18n()
  const [preset, setPreset] = useState('30')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [group, setGroup] = useState('day')
  const [metric, setMetric] = useState('revenue')
  const [showTable, setShowTable] = useState(false)
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading') // loading | ready | error
  const [rangeError, setRangeError] = useState(false)
  const today = useRef(null) // the shop's today, from the server (Ashgabat time)

  const load = useCallback(async () => {
    setState((s) => (s === 'ready' ? 'ready' : 'loading'))
    setRangeError(false)
    let q = ''
    if (preset === 'custom') {
      if (!custom.from || !custom.to || custom.from > custom.to) { setRangeError(true); return }
      q = `from=${custom.from}&to=${custom.to}`
    } else if (today.current) {
      // the last N days up to the shop's today
      q = `from=${addDays(today.current, -(Number(preset) - 1))}&to=${today.current}`
    } else if (preset !== '30') {
      const now = iso(new Date())
      q = `from=${addDays(now, -(Number(preset) - 1))}&to=${now}`
    } // (30 days is also the server's default)
    try {
      const d = await call(`/api/admin/stats?${q}&group=${group}`)
      today.current = d.range.today
      setData(d)
      setState('ready')
    } catch {
      setState('error')
    }
  }, [call, preset, custom.from, custom.to, group])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const by = new Map(data.series.map((s) => [s.period, s]))
    return periods(data.range.from, data.range.to, data.range.group).map((p) => by.get(p) || { period: p, orders: 0, revenue: 0, orderValue: 0 })
  }, [data])

  if (state === 'loading' && !data) return <p className="muted" role="status">{t('loading.wait')}</p>
  if (state === 'error' && !data) {
    return (
      <div className="empty-state" role="alert">
        <h3>{L.loadFailed}</h3>
        <button type="button" className="btn btn-primary" onClick={load}>{L.retry}</button>
      </div>
    )
  }

  const tt = data.totals
  const now = data.now
  const name = (names) => names?.[lang] || names?.tm || names?.ru || '—'

  return (
    <div className="dash">
      {/* right now (not affected by the date range) */}
      <section className="dash-tiles" aria-label={L.dashNow}>
        <Tile icon="orders" label={L.dashToday} value={now.todayOrders} hint={formatPrice(now.todayValue)} />
        <Tile icon="clock" label={L.dashPending} value={now.pending} hint={`${t('status.new')}: ${now.byStatus.new}`} tone={now.byStatus.new ? 'attn' : ''} />
        <Tile icon="truck" label={L.dashTodayDeliveries} value={now.todayDeliveries} />
        <Tile icon="box" label={L.dashLowStock} value={data.lowStock.length} hint={L.dashLowStockHint.replace('{n}', data.lowStockThreshold)} tone={data.lowStock.length ? 'warn' : ''} />
      </section>

      {/* filters: one row above the numbers they change */}
      <div className="dash-filters" role="group" aria-label={L.dashRange}>
        <div className="chips">
          {PRESETS.map(([key]) => (
            <button key={key} type="button" className={`chip${preset === key ? ' active' : ''}`} aria-pressed={preset === key} onClick={() => setPreset(key)}>
              {L.dashLastN.replace('{n}', key)}
            </button>
          ))}
          <button type="button" className={`chip${preset === 'custom' ? ' active' : ''}`} aria-pressed={preset === 'custom'} onClick={() => setPreset('custom')}>{L.dashCustom}</button>
        </div>
        {preset === 'custom' && (
          <div className="dash-custom">
            <label>{L.dashFrom}<input className="field" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label>{L.dashTo}<input className="field" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
          </div>
        )}
        <label className="dash-group">{L.dashGroup}
          <select className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="day">{L.dashByDay}</option>
            <option value="week">{L.dashByWeek}</option>
            <option value="month">{L.dashByMonth}</option>
          </select>
        </label>
      </div>
      {rangeError && <p className="form-error" role="alert">{L.dashBadRange}</p>}
      {state === 'error' && <p className="form-error" role="alert">{L.loadFailed}</p>}

      <section className="dash-tiles" aria-label={L.dashPeriod}>
        <Tile icon="wallet" label={L.dashRevenue} value={formatPrice(tt.revenue)} hint={L.dashRevenueHint.replace('{n}', tt.delivered)} />
        <Tile icon="cart" label={L.dashOrderValue} value={formatPrice(tt.orderValue)} hint={L.dashOrderValueHint} />
        <Tile icon="orders" label={L.dashOrders} value={tt.orders} hint={L.dashCancelledN.replace('{n}', tt.cancelled)} />
        <Tile icon="sparkles" label={L.dashAvg} value={formatPrice(tt.avgDelivered)} hint={L.dashAvgHint.replace('{n}', formatPrice(tt.avgOrder))} />
        <Tile icon="percent" label={L.dashDiscounts} value={formatPrice(tt.discounts)} />
      </section>

      <section className="summary dash-card" style={{ position: 'static' }}>
        <div className="dash-card-head">
          <h3>{metric === 'orders' ? L.dashChartOrders : L.dashChartRevenue}</h3>
          <div className="chips" role="group">
            <button type="button" className={`chip${metric === 'revenue' ? ' active' : ''}`} aria-pressed={metric === 'revenue'} onClick={() => setMetric('revenue')}>{L.dashRevenue}</button>
            <button type="button" className={`chip${metric === 'orderValue' ? ' active' : ''}`} aria-pressed={metric === 'orderValue'} onClick={() => setMetric('orderValue')}>{L.dashOrderValue}</button>
            <button type="button" className={`chip${metric === 'orders' ? ' active' : ''}`} aria-pressed={metric === 'orders'} onClick={() => setMetric('orders')}>{L.dashOrders}</button>
            <button type="button" className="chip" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}><Icon name="list" size={14} />{L.dashTable}</button>
          </div>
        </div>
        {!tt.orders && !tt.cancelled ? (
          <p className="muted dash-empty">{L.dashEmpty}</p>
        ) : showTable ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead><tr><th>{L.dashPeriodCol}</th><th>{L.dashOrders}</th><th>{L.dashRevenue}</th><th>{L.dashOrderValue}</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.period}><td>{r.period}</td><td>{r.orders}</td><td>{formatPrice(r.revenue)}</td><td>{formatPrice(r.orderValue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <BarChart rows={rows} metric={metric} L={L} lang={lang} />
        )}
      </section>

      <div className="dash-cols">
        <section className="summary dash-card" style={{ position: 'static' }}>
          <h3>{L.dashBest}</h3>
          {!data.bestSellers.length ? <p className="muted">{L.dashEmpty}</p> : (
            <ol className="dash-list">
              {data.bestSellers.map((b) => (
                <li key={b.productId ?? name(b.names)}>
                  <span>{name(b.names)}</span>
                  <span className="muted">{L.dashSoldN.replace('{n}', b.qty)} · {formatPrice(b.amount)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="summary dash-card" style={{ position: 'static' }}>
          <h3>{L.dashLowStock}</h3>
          {!data.lowStock.length ? <p className="muted">{L.dashNoLowStock}</p> : (
            <ul className="dash-list">
              {data.lowStock.map((p) => (
                <li key={p.id}>
                  <span>{name(p.names)}</span>
                  <span className={p.stock === 0 ? 'dash-out' : 'muted'}>{p.stock === 0 ? t('prod.out') : L.stockN.replace('{n}', p.stock)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.lowStock.length > 0 && <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenTab('products')}>{L.dashGoProducts}</button>}
        </section>
      </div>

      <section className="summary dash-card" style={{ position: 'static' }}>
        <h3>{L.dashRecent}</h3>
        {!data.recent.length ? <p className="muted">{L.dashEmpty}</p> : (
          <ul className="dash-list">
            {data.recent.map((o) => (
              <li key={o.id}>
                <span><strong className="order-code">{o.code}</strong> · {o.name}</span>
                <span className="dash-recent-side">
                  <span className="muted">{orderDate(o.createdAt, lang, true)}</span>
                  <StatusPill status={o.status} />
                  <strong>{formatPrice(o.total)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenTab('orders')}>{L.dashGoOrders}</button>
      </section>
    </div>
  )
}
