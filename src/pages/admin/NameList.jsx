// A list of names in three languages that the admin can add to, rename,
// reorder and delete: the categories (admin → Categories) and the occasions
// (admin → Menu), the shop's original ones too.
//   endpoint  /api/admin/categories or /api/admin/occasions
//   listKey   'categories' or 'occasions' (the list in the server's answer)
//   prefix    'cat' or 'occ': texts are L[prefix + 'New'] ..., shared ones fall back to 'cat'
//   pathFor   key -> the shop page that shows it
//   blockUsed true = only an empty one can be deleted (categories)
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import Icon from '../../components/Icons'
import { useProducts } from '../../store/hooks'
import { fill } from '../../utils/productHelpers'

const LANGS = ['tm', 'ru', 'tr']
const emptyNames = () => ({ tm: '', ru: '', tr: '' })

export default function NameList({ L, call, endpoint, listKey, prefix, pathFor, blockUsed = false }) {
  const T = (k) => L[prefix + k] ?? L[`cat${k}`] // e.g. T('New') -> L.occNew, or L.catNew
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const { reload } = useProducts() // the shop's menus get the new list
  const [data, setData] = useState(null) // the server's answer; null = loading
  const [failed, setFailed] = useState(false)
  const [names, setNames] = useState(emptyNames)
  const [editing, setEditing] = useState(null) // id being renamed
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try { setData(await call(endpoint)) } catch { setFailed(true) }
  }, [call, endpoint])
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
    if (!LANGS.some((l) => names[l].trim())) { setError(T('NeedName')); return }
    setBusy(true)
    setError('')
    try {
      const d = await call(editing ? `${endpoint}/${editing}` : endpoint, {
        method: editing ? 'PUT' : 'POST', body: { names },
      })
      changed(d, editing ? T('Saved') : T('Added'))
      reset()
    } catch (err) {
      setError(err?.code?.startsWith('too_many') ? fill(T('TooMany'), { max: err.data?.max ?? '' }) : L.loadFailed)
    } finally {
      setBusy(false)
    }
  }

  async function move(i, dir) {
    const ids = list.map((c) => c.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    try { changed(await call(`${endpoint}/order`, { method: 'POST', body: { ids } })) } catch { toast(L.loadFailed, 'error') }
  }

  async function remove(c) {
    if (blockUsed && c.products) { toast(fill(T('InUse'), { n: c.products }), 'error'); return }
    if (!window.confirm(fill(T('DeleteConfirm'), { name: c.names[lang] || c.names.tm, n: c.products }))) return
    try {
      changed(await call(`${endpoint}/${c.id}`, { method: 'DELETE' }), T('Deleted'))
      if (editing === c.id) reset()
    } catch (err) {
      toast(err?.code?.endsWith('_in_use') ? fill(T('InUse'), { n: err.data?.products ?? '' }) : L.loadFailed, 'error')
      load()
    }
  }

  const label = { tm: L.catNameTm, ru: L.catNameRu, tr: L.catNameTr }
  const list = data?.[listKey] || []

  return (
    <>
      <form className="summary adm-settings" style={{ position: 'static', marginBottom: 24 }} onSubmit={onSubmit} noValidate>
        <h3 className="with-ico"><Icon name={editing ? 'edit' : 'plus'} size={20} />{editing ? T('Edit') : T('New')}</h3>
        <p className="muted" style={{ marginTop: 0 }}>{T('Hint')}</p>
        <div className="form-grid cat-names">
          {LANGS.map((l) => (
            <div className="form-field" key={l}>
              <label htmlFor={`${prefix}-${l}`}>{label[l]}</label>
              <input
                id={`${prefix}-${l}`}
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
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? L.saving : editing ? L.saveEdit : T('Add')}</button>
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
        {data && !list.length && <div className="empty-state"><div className="es-icon"><Icon name="tag" size={32} /></div><h3>{T('Empty')}</h3></div>}
        {list.map((c, i) => (
          <article key={c.id} className="adm-card-row">
            <div className="adm-customer-main">
              <strong>{c.names[lang] || c.names.tm}</strong>
              <small className="muted">{LANGS.filter((l) => l !== lang).map((l) => c.names[l]).join(' · ')}</small>
              <small className="muted">
                {fill(L.catFlowers, { n: c.products })} · <Link to={pathFor(c.key)} target="_blank" rel="noopener">{pathFor(c.key)}</Link>
              </small>
            </div>
            <div className="adm-customer-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`${L.catUp} – ${c.names[lang]}`}>↑</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`${L.catDown} – ${c.names[lang]}`}>↓</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(c)}><Icon name="edit" size={16} />{L.catRename}</button>
              <button type="button" className="btn btn-outline btn-sm adm-cus-delete" onClick={() => remove(c)} aria-label={`${L.del} – ${c.names[lang]}`}><Icon name="trash" size={16} />{L.del}</button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
