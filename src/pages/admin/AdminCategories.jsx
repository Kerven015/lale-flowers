// Admin → Categories: add, rename, reorder and delete categories. They show up
// in the menus, the footer, the Categories page, the catalog filter and the
// flower form. The built-in ones (roses, tulips, ...) are only listed.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import Icon from '../../components/Icons'
import { useProducts } from '../../store/hooks'
import { fill } from '../../utils/productHelpers'

const LANGS = ['tm', 'ru', 'tr']
const emptyNames = () => ({ tm: '', ru: '', tr: '' })

export default function AdminCategories({ L, call }) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const { reload } = useProducts() // the shop's menus get the new list
  const [data, setData] = useState(null) // { builtIn, categories }; null = loading
  const [failed, setFailed] = useState(false)
  const [names, setNames] = useState(emptyNames)
  const [editing, setEditing] = useState(null) // id being renamed
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try { setData(await call('/api/admin/categories')) } catch { setFailed(true) }
  }, [call])
  useEffect(() => { load() }, [load])

  // after every change: the new list here, and fresh menus in the shop
  const changed = (d, message) => {
    setData(d)
    reload()
    if (message) toast(message)
  }

  function reset() {
    setNames(emptyNames())
    setEditing(null)
    setError('')
  }

  function startEdit(c) {
    setEditing(c.id)
    setNames({ ...emptyNames(), ...c.names })
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (busy) return
    if (!LANGS.some((l) => names[l].trim())) { setError(L.catNeedName); return }
    setBusy(true)
    setError('')
    try {
      const d = await call(editing ? `/api/admin/categories/${editing}` : '/api/admin/categories', {
        method: editing ? 'PUT' : 'POST', body: { names },
      })
      changed(d, editing ? L.catSaved : L.catAdded)
      reset()
    } catch (err) {
      setError(err?.code === 'too_many_categories' ? fill(L.catTooMany, { max: err.data?.max ?? '' }) : L.loadFailed)
    } finally {
      setBusy(false)
    }
  }

  async function move(i, dir) {
    const ids = data.categories.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    try { changed(await call('/api/admin/categories/order', { method: 'POST', body: { ids } })) } catch { toast(L.loadFailed, 'error') }
  }

  async function remove(c) {
    if (c.products) { toast(fill(L.catInUse, { n: c.products }), 'error'); return }
    if (!window.confirm(fill(L.catDeleteConfirm, { name: c.names[lang] || c.names.tm }))) return
    try {
      changed(await call(`/api/admin/categories/${c.id}`, { method: 'DELETE' }), L.catDeleted)
      if (editing === c.id) reset()
    } catch (err) {
      toast(err?.code === 'category_in_use' ? fill(L.catInUse, { n: err.data?.products ?? '' }) : L.loadFailed, 'error')
      load()
    }
  }

  const label = { tm: L.catNameTm, ru: L.catNameRu, tr: L.catNameTr }

  return (
    <>
      <form className="summary adm-settings" style={{ position: 'static', marginBottom: 24 }} onSubmit={onSubmit} noValidate>
        <h3 className="with-ico"><Icon name={editing ? 'edit' : 'plus'} size={20} />{editing ? L.catEdit : L.catNew}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{L.catHint}</p>
        <div className="form-grid cat-names">
          {LANGS.map((l) => (
            <div className="form-field" key={l}>
              <label htmlFor={`cat-${l}`}>{label[l]}</label>
              <input
                id={`cat-${l}`}
                className="field"
                maxLength={40}
                value={names[l]}
                onChange={(e) => { setNames((n) => ({ ...n, [l]: e.target.value })); setError('') }}
              />
            </div>
          ))}
        </div>
        <small className="muted" style={{ display: 'block', margin: '-4px 0 14px' }}>{L.catNamesHint}</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? L.saving : editing ? L.saveEdit : L.catAdd}</button>
        {editing && <button className="btn btn-outline btn-block" type="button" style={{ marginTop: 10 }} onClick={reset} disabled={busy}>{L.cancel}</button>}
      </form>

      <div className="adm-list">
        {failed && (
          <div className="empty-state" role="alert">
            <h3>{L.loadFailed}</h3>
            <button type="button" className="btn btn-primary" onClick={load}>{L.retry}</button>
          </div>
        )}
        {!failed && data === null && <p className="muted" role="status">{t('loading.wait')}</p>}
        {data && !data.categories.length && <div className="empty-state"><div className="es-icon"><Icon name="tag" size={32} /></div><h3>{L.catEmpty}</h3></div>}
        {data?.categories.map((c, i) => (
          <article key={c.id} className="adm-card-row">
            <div className="adm-customer-main">
              <strong>{c.names[lang] || c.names.tm}</strong>
              <small className="muted">{LANGS.filter((l) => l !== lang).map((l) => c.names[l]).join(' · ')}</small>
              <small className="muted">
                {fill(L.catFlowers, { n: c.products })} · <Link to={`/category/${c.key}`} target="_blank" rel="noopener">/category/{c.key}</Link>
              </small>
            </div>
            <div className="adm-customer-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${L.catUp} – ${c.names[lang]}`}>↑</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, 1)} disabled={i === data.categories.length - 1} aria-label={`${L.catDown} – ${c.names[lang]}`}>↓</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(c)}><Icon name="edit" size={16} />{L.catRename}</button>
              <button type="button" className="btn btn-outline btn-sm adm-cus-delete" onClick={() => remove(c)} aria-label={`${L.del} – ${c.names[lang]}`}><Icon name="trash" size={16} />{L.del}</button>
            </div>
          </article>
        ))}
        {data && (
          <div className="summary adm-settings" style={{ position: 'static', marginTop: 24 }}>
            <h3 className="with-ico"><Icon name="flower" size={20} />{L.catBuiltIn}</h3>
            <p className="muted" style={{ marginTop: 0 }}>{L.catBuiltInHint}</p>
            <div className="adm-cus-tags">
              {data.builtIn.map((b) => <span key={b.key} className="adm-cus-tag">{t(`cat.${b.key}`)} · {b.products}</span>)}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
