// Admin → Menu: the links of the top menu bar (between "Home" and "Catalog"),
// and the occasions ("Birthday", "Love & romance" ...).
import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import Icon from '../../components/Icons'
import { useFlowerTypeLinks, useOccasions, useProducts } from '../../store/hooks'
import { fill } from '../../utils/productHelpers'
import { occasionPath } from '../../data/navigation'
import NameList from './NameList'

const MAX_ITEMS = 10 // same as the server (occasions.js MAX_MENU_ITEMS)
const id = (i) => `${i.type}:${i.key}`

function TopMenu({ L, call }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const { reload } = useProducts() // the shop's header gets the new links
  const { occasions, occasionName } = useOccasions()
  const categories = useFlowerTypeLinks()
  const [items, setItems] = useState(null) // null = loading
  const [failed, setFailed] = useState(false)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try { setItems((await call('/api/admin/menu')).items) } catch { setFailed(true) }
  }, [call])
  useEffect(() => { load() }, [load])

  const name = (i) => (i.type === 'occasion' ? occasionName(i.key) : categories.find((c) => c.key === i.key)?.label) || i.key

  // every change is saved at once
  async function save(next) {
    if (busy) return
    setBusy(true)
    try {
      setItems((await call('/api/admin/menu', { method: 'PUT', body: { items: next } })).items)
      reload()
      toast(L.menuSaved)
    } catch {
      toast(L.loadFailed, 'error')
      load()
    } finally {
      setBusy(false)
    }
  }

  function move(i, dir) {
    const next = items.slice()
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    save(next)
  }

  function add(e) {
    e.preventDefault()
    if (!pick) return
    const [type, ...rest] = pick.split(':')
    save([...items, { type, key: rest.join(':') }])
    setPick('')
  }

  if (failed) {
    return (
      <div className="empty-state" role="alert">
        <h3>{L.loadFailed}</h3>
        <button type="button" className="btn btn-primary" onClick={load}>{L.retry}</button>
      </div>
    )
  }
  if (!items) return <p className="muted" role="status">{t('loading.wait')}</p>

  const used = new Set(items.map(id))
  const freeOcc = occasions.filter((o) => !used.has(`occasion:${o.key}`))
  const freeCat = categories.filter((c) => !used.has(`category:${c.key}`))
  const full = items.length >= MAX_ITEMS

  return (
    <div className="summary adm-settings" style={{ position: 'static', marginBottom: 24 }}>
      <h3 className="with-ico"><Icon name="sort" size={20} />{L.menuTitle}</h3>
      <p className="muted" style={{ marginTop: 0 }}>{L.menuHint}</p>
      <ol className="menu-edit">
        <li className="is-fixed"><span>{t('nav.home')}</span><small className="muted">{L.menuFixed}</small></li>
        {items.map((i, n) => (
          <li key={id(i)}>
            <span>{name(i)}</span>
            <small className="muted">{i.type === 'occasion' ? L.menuOcc : L.menuCat}</small>
            <span className="menu-edit-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(n, -1)} disabled={busy || n === 0} aria-label={`${L.catUp} – ${name(i)}`}>↑</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(n, 1)} disabled={busy || n === items.length - 1} aria-label={`${L.catDown} – ${name(i)}`}>↓</button>
              <button type="button" className="btn btn-outline btn-sm adm-cus-delete" onClick={() => save(items.filter((x) => x !== i))} disabled={busy} aria-label={`${L.menuRemove} – ${name(i)}`}><Icon name="close" size={16} />{L.menuRemove}</button>
            </span>
          </li>
        ))}
        {['nav.catalog', 'nav.about', 'nav.contact'].map((k) => (
          <li key={k} className="is-fixed"><span>{t(k)}</span><small className="muted">{L.menuFixed}</small></li>
        ))}
      </ol>
      <form className="menu-add" onSubmit={add}>
        <label htmlFor="menu-pick">{L.menuAddLabel}</label>
        <div className="menu-add-row">
          <select id="menu-pick" className="field" value={pick} onChange={(e) => setPick(e.target.value)} disabled={full || busy}>
            <option value="">{full ? fill(L.menuFull, { max: MAX_ITEMS }) : L.menuPick}</option>
            {freeOcc.length > 0 && (
              <optgroup label={L.occTitle}>{freeOcc.map((o) => <option key={o.key} value={`occasion:${o.key}`}>{o.label}</option>)}</optgroup>
            )}
            {freeCat.length > 0 && (
              <optgroup label={L.tabCategories}>{freeCat.map((c) => <option key={c.key} value={`category:${c.key}`}>{c.label}</option>)}</optgroup>
            )}
          </select>
          <button className="btn btn-primary" type="submit" disabled={!pick || full || busy}><Icon name="plus" size={16} />{L.menuAddBtn}</button>
        </div>
      </form>
    </div>
  )
}

export default function AdminMenu({ L, call }) {
  return (
    <>
      <TopMenu L={L} call={call} />
      <h2 className="adm-section-title">{L.occTitle}</h2>
      <NameList L={L} call={call} endpoint="/api/admin/occasions" listKey="occasions" prefix="occ" pathFor={occasionPath} />
    </>
  )
}
