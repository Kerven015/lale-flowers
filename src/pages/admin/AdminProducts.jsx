// Admin: add / edit / delete flowers (saved on the server).
import { useCallback, useRef, useState } from 'react'
import { useI18n } from '../../contexts/I18nContext'
import { useToast } from '../../contexts/ToastContext'
import { productPhotos } from '../../utils/productHelpers'
import PhotoUploader, { photoFromUrl } from '../../components/PhotoUploader'
import AdminCatalog from '../../components/AdminCatalog'
import ConfirmDelete from '../../components/ConfirmDelete'
import DescriptionEditor, { detailsFromProduct, emptyDetails } from '../../components/DescriptionEditor'
import { ADMIN_TYPES, MAX_PHOTOS, validateForm } from '../../utils/adminProducts'
import { OTHER_TYPE, TAG_OPTIONS, editableTags } from '../../utils/productTypes'
import Icon from '../../components/Icons'
import { errorMessage } from '../../api'
import { useProducts } from '../../store/hooks'

const ERR_KEY = { name: 'eName', type: 'eType', customType: 'eCustom', occasions: 'eOcc', price: 'ePrice', old: 'eOld' }
const IMAGE_ERR = { image: 'eImage', too_many: 'eTooMany', too_large: 'eTooLarge', not_image: 'eFile', invalid: 'eFile', file: 'eFile' }

const emptyForm = () => ({ name: '', type: 'roses', customType: '', occasions: [], price: '', old: '', inStock: true, photos: [], details: emptyDetails() })

export default function AdminProducts({ L, onSessionLost }) {
  const { lang, t } = useI18n()
  const { products, name, catName, saveProduct, deleteProducts } = useProducts()
  const { toast } = useToast()
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [fileKey, setFileKey] = useState(0)
  const [editing, setEditing] = useState(null) // product being edited, null = adding
  const [saving, setSaving] = useState(false)
  const formRef = useRef(null)

  // Delete flow: confirmation dialog -> fade-out -> server -> message.
  const [confirm, setConfirm] = useState(null) // { items, resolve }
  const [removing, setRemoving] = useState(() => new Set())

  const failed = useCallback((err) => {
    if (err?.status === 401) { onSessionLost(); return }
    toast(errorMessage(t, err), 'error')
  }, [onSessionLost, toast, t])

  function resetForm() {
    setEditing(null)
    setForm(emptyForm())
    setErrors({})
    setFileKey((k) => k + 1)
  }

  function startEdit(p) {
    setEditing(p)
    setForm({
      name: name(p),
      type: ADMIN_TYPES.includes(p.cat) ? p.cat : OTHER_TYPE,
      customType: p.cat === OTHER_TYPE ? p.customType || '' : '',
      occasions: editableTags(p),
      price: String(p.price ?? ''),
      old: p.old ? String(p.old) : '',
      inStock: p.inStock !== false,
      photos: productPhotos(p).map(photoFromUrl),
      details: detailsFromProduct(p),
    })
    setErrors({})
    setFileKey((k) => k + 1)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function toggleOccasion(key) {
    setForm((f) => ({
      ...f,
      occasions: f.occasions.includes(key) ? f.occasions.filter((k) => k !== key) : [...f.occasions, key],
    }))
    setErrors((er) => ({ ...er, occasions: undefined }))
  }

  // PhotoUploader passes updater functions (photos load in the background).
  const setPhotos = useCallback((fn) => {
    setForm((f) => ({ ...f, photos: fn(f.photos) }))
    setErrors((er) => (er.image ? { ...er, image: undefined } : er))
  }, [])
  const setDetails = useCallback((fn) => setForm((f) => ({ ...f, details: fn(f.details) })), [])
  const onPhotoLimit = useCallback(() => toast(L.maxPhotos, 'error'), [toast, L])

  async function onSubmit(e) {
    e.preventDefault()
    if (saving) return
    if (form.photos.some((p) => p.status === 'loading')) { toast(L.wait, 'error'); return }
    const images = form.photos.filter((p) => p.status === 'done' && p.src).map((p) => p.src)
    const v = validateForm({ ...form, images }, { editing: !!editing })
    if (!v.ok) { setErrors(v.errors); showFirstError(); return }
    setSaving(true)
    try {
      await saveProduct({
        lang,
        name: form.name.trim(),
        type: form.type,
        customType: form.customType.trim(),
        occasions: form.occasions,
        price: Number(form.price),
        old: String(form.old).trim() === '' ? null : Number(form.old),
        inStock: form.inStock,
        images,
        details: form.details,
      }, editing ? editing.id : null)
      toast(editing ? L.updated : L.added)
      resetForm()
    } catch (err) {
      if (err.code === 'validation' && err.data?.fields) {
        const f = err.data.fields
        setErrors(Object.fromEntries(Object.entries(f).map(([k, code]) => [k, k === 'image' ? `img:${code}` : code])))
        showFirstError()
      } else if (err.status === 404) {
        toast(L.loadFailed, 'error')
        resetForm()
      } else {
        failed(err)
      }
    } finally {
      setSaving(false)
    }
  }

  // The form is long: bring the first error message into view (and put the
  // cursor in its field) so the admin sees what to fix.
  function showFirstError() {
    requestAnimationFrame(() => {
      const msg = formRef.current?.querySelector('.field-error')
      if (!msg) return
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' })
      msg.closest('.form-field')?.querySelector('input:not([type=file]), select, textarea, button')?.focus({ preventScroll: true })
    })
  }

  // Resolves true once the products are deleted, false if cancelled.
  function requestDelete(items) {
    return new Promise((resolve) => setConfirm({ items, resolve }))
  }

  function confirmDelete() {
    const { items, resolve } = confirm
    setConfirm(null)
    const ids = items.map((p) => p.id)
    setRemoving(new Set(ids))
    // let the cards fade out, then remove them
    setTimeout(async () => {
      try {
        await deleteProducts(ids)
        if (editing && ids.includes(editing.id)) resetForm()
        toast(ids.length > 1 ? L.deletedN.replace('{n}', ids.length) : L.deleted)
        resolve(true)
      } catch (err) {
        failed(err)
        resolve(false)
      } finally {
        setRemoving(new Set())
      }
    }, 320)
  }

  function cancelDelete() {
    confirm?.resolve(false)
    setConfirm(null)
  }

  const err = (field) => {
    const code = errors[field]
    if (!code) return null
    const msg = field === 'image' ? L[IMAGE_ERR[String(code).replace(/^img:/, '')] || 'eImage'] : L[ERR_KEY[field]]
    return <small role="alert" className="field-error">{msg}</small>
  }

  return (
    <>
      <div className="adm-form-wrap">
        <form ref={formRef} className="summary" style={{ position: 'static', scrollMarginTop: 140 }} onSubmit={onSubmit} noValidate>
          <h3 className="with-ico">
            <Icon name={editing ? 'edit' : 'plus'} size={20} />{editing ? L.edit : L.add}
          </h3>
          {editing && (
            <p className="muted" style={{ margin: '-4px 0 14px', fontWeight: 600 }}>{name(editing)}</p>
          )}
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label id="adm-photos-label">{L.photos}{editing ? '' : ' *'}</label>
            <PhotoUploader
              photos={form.photos}
              onChange={setPhotos}
              max={MAX_PHOTOS}
              L={L}
              inputKey={fileKey}
              onLimit={onPhotoLimit}
              error={err('image')}
            />
          </div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label htmlFor="adm-name">{L.name} *</label>
            <input id="adm-name" className="field" maxLength={120} value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors((er) => ({ ...er, name: undefined })) }} />
            {err('name')}
          </div>
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label htmlFor="adm-type">{L.type} *</label>
            <select
              id="adm-type"
              className="field"
              value={form.type}
              onChange={(e) => { setForm({ ...form, type: e.target.value }); setErrors((er) => ({ ...er, type: undefined, customType: undefined })) }}
            >
              {ADMIN_TYPES.map((c) => <option key={c} value={c}>{catName(c)}</option>)}
            </select>
            {err('type')}
          </div>
          {form.type === OTHER_TYPE && (
            <div className="form-field" style={{ marginBottom: 14 }}>
              <label htmlFor="adm-custom-type">{L.customType} *</label>
              <input
                id="adm-custom-type"
                className="field"
                maxLength={40}
                placeholder={L.customPh}
                value={form.customType}
                autoFocus={!editing}
                onChange={(e) => { setForm({ ...form, customType: e.target.value }); setErrors((er) => ({ ...er, customType: undefined })) }}
              />
              {err('customType')}
            </div>
          )}
          <div className="form-field" style={{ marginBottom: 14 }}>
            <label id="adm-occ-label">{L.occasions} *</label>
            <small className="muted" style={{ display: 'block', marginBottom: 8 }}>{L.occHint}</small>
            <div className="chips" role="group" aria-labelledby="adm-occ-label" style={{ marginBottom: 4 }}>
              {TAG_OPTIONS.map((o) => {
                const on = form.occasions.includes(o.key)
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={`chip${on ? ' active' : ''}`}
                    onClick={() => toggleOccasion(o.key)}
                  >
                    {on && <Icon name="check" size={14} />}{t(o.label)}
                  </button>
                )
              })}
            </div>
            {err('occasions')}
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="form-field">
              <label htmlFor="adm-price">{L.price} *</label>
              <input id="adm-price" className="field" type="number" min="1" inputMode="numeric" value={form.price} onChange={(e) => { setForm({ ...form, price: e.target.value }); setErrors((er) => ({ ...er, price: undefined })) }} />
              {err('price')}
            </div>
            <div className="form-field">
              <label htmlFor="adm-old">{L.old}</label>
              <input id="adm-old" className="field" type="number" min="1" inputMode="numeric" value={form.old} onChange={(e) => { setForm({ ...form, old: e.target.value }); setErrors((er) => ({ ...er, old: undefined })) }} />
              {err('old')}
            </div>
          </div>
          <label className="check adm-stock" style={{ marginBottom: 18 }}>
            <input type="checkbox" checked={form.inStock} onChange={(e) => setForm({ ...form, inStock: e.target.checked })} />
            <span><strong>{L.inStock}</strong><small className="muted">{L.inStockHint}</small></span>
          </label>
          <fieldset className="de-section">
            <legend className="with-ico"><Icon name="blossom" size={18} />{L.descTitle}</legend>
            <small className="muted de-hint">{L.descHint}</small>
            <DescriptionEditor value={form.details} onChange={setDetails} L={L} resetKey={fileKey} />
          </fieldset>
          <button className="btn btn-primary btn-block" type="submit" disabled={saving} aria-busy={saving}>
            {saving ? L.saving : editing ? L.saveEdit : L.save}
          </button>
          {editing && (
            <button className="btn btn-outline btn-block" type="button" style={{ marginTop: 10 }} onClick={resetForm} disabled={saving}>{L.cancel}</button>
          )}
        </form>
      </div>

      <div className="adm-catalog">
        <div className="listing-title adm-catalog-head">
          <h2 className="with-ico"><Icon name="box" size={24} />{L.list}</h2>
        </div>
        <AdminCatalog
          products={products}
          L={L}
          removing={removing}
          onEdit={startEdit}
          requestDelete={requestDelete}
        />
      </div>
      {confirm && <ConfirmDelete items={confirm.items} L={L} onCancel={cancelDelete} onConfirm={confirmDelete} />}
    </>
  )
}
