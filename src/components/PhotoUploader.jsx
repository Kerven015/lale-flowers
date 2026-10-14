// Admin: several photos per product. Choose files, drag & drop, or paste
// (Ctrl+V). Thumbnails can be reordered by dragging (mouse or finger) or with
// the arrow keys; the first photo is the main/cover photo.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { imageFilesFrom, processPhoto } from '../utils/imageFiles'
import Icon from './Icons'

let seq = 0
export const newPhotoId = () => `ph${Date.now().toString(36)}${(seq++).toString(36)}`

// photo: { id, src, status: 'loading' | 'done' | 'error', progress: 0..1 }
export const photoFromUrl = (src) => ({ id: newPhotoId(), src, status: 'done', progress: 1 })

export default function PhotoUploader({ photos, onChange, max = 8, L, error, onLimit, inputKey }) {
  const [dropping, setDropping] = useState(false)
  const [dragId, setDragId] = useState(null)
  const listRef = useRef(null)
  const items = useRef(new Map()) // id -> element
  const rects = useRef(null) // positions before a reorder (for the slide animation)
  const drag = useRef(null)
  const photosRef = useRef(photos)
  photosRef.current = photos

  const update = useCallback((fn) => onChange((list) => fn(list)), [onChange])

  // ---- adding files --------------------------------------------------------
  const addFiles = useCallback((fileList) => {
    const files = imageFilesFrom(fileList)
    if (!files.length) return
    const room = max - photosRef.current.length
    if (room <= 0) { onLimit?.(); return }
    if (files.length > room) onLimit?.()
    const batch = files.slice(0, room).map((file) => ({ file, photo: { id: newPhotoId(), src: null, status: 'loading', progress: 0 } }))
    update((list) => [...list, ...batch.map((b) => b.photo)])
    batch.forEach(({ file, photo }) => {
      const set = (patch) => update((list) => list.map((p) => (p.id === photo.id ? { ...p, ...patch } : p)))
      processPhoto(file, (progress) => set({ progress }))
        .then((src) => set({ src, status: 'done', progress: 1 }))
        .catch(() => set({ status: 'error', progress: 1 }))
    })
  }, [max, onLimit, update])

  // Paste anywhere on the admin page (only reacts when the clipboard holds images).
  useEffect(() => {
    function onPaste(e) {
      const files = imageFilesFrom(e.clipboardData?.files)
      if (!files.length) return
      e.preventDefault()
      addFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addFiles])

  const dropProps = {
    onDragEnter: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDropping(true) } },
    onDragOver: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropping(false) },
    onDrop: (e) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      setDropping(false)
      addFiles(e.dataTransfer.files)
    },
  }

  // ---- reordering ----------------------------------------------------------
  function snapshot() {
    const m = new Map()
    items.current.forEach((el, id) => { if (el) m.set(id, el.getBoundingClientRect()) })
    rects.current = m
  }

  function move(from, to) {
    if (from === to || to < 0 || to >= photosRef.current.length) return
    snapshot()
    update((list) => {
      const next = list.slice()
      const [it] = next.splice(from, 1)
      next.splice(to, 0, it)
      return next
    })
  }

  // Slide the other thumbnails into their new places (FLIP).
  useLayoutEffect(() => {
    const before = rects.current
    if (!before) return
    rects.current = null
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    items.current.forEach((el, id) => {
      const a = before.get(id)
      if (!el || !a || id === drag.current?.id) return
      const b = el.getBoundingClientRect()
      const dx = a.left - b.left
      const dy = a.top - b.top
      if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
    })
  }, [photos])

  function onPointerDown(e, id) {
    if (e.button !== 0 || e.target.closest('button')) return
    drag.current = { id, x: e.clientX, y: e.clientY, active: false, pointerId: e.pointerId }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
      d.active = true
      setDragId(d.id)
    }
    e.preventDefault()
    // Closest thumbnail centre to the pointer = new position. Layout positions
    // (offsetLeft/Top) are used, not on-screen ones, so thumbnails that are
    // still sliding into place do not confuse the calculation.
    const list = photosRef.current
    const box = listRef.current?.getBoundingClientRect()
    if (!box) return
    const px = e.clientX - box.left
    const py = e.clientY - box.top
    let best = -1
    let bestDist = Infinity
    list.forEach((p, i) => {
      const el = items.current.get(p.id)
      if (!el) return
      const cx = el.offsetLeft + el.offsetWidth / 2
      const cy = el.offsetTop + el.offsetHeight / 2
      const dist = Math.hypot(px - cx, py - cy)
      if (dist < bestDist) { bestDist = dist; best = i }
    })
    const from = list.findIndex((p) => p.id === d.id)
    if (best >= 0 && best !== from) move(from, best)
  }

  function endDrag() {
    drag.current = null
    setDragId(null)
  }

  // Releasing the mouse/finger outside the list also ends the drag.
  useEffect(() => {
    if (!dragId) return undefined
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragId])

  function onKeyDown(e, index) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(index, index - 1); requestAnimationFrame(() => items.current.get(photos[index].id)?.focus()) }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(index, index + 1); requestAnimationFrame(() => items.current.get(photos[index].id)?.focus()) }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(photos[index].id) }
  }

  function remove(id) {
    snapshot()
    update((list) => list.filter((p) => p.id !== id))
  }

  const full = photos.length >= max

  return (
    <div className={`pu${dropping ? ' pu-dropping' : ''}`} {...dropProps}>
      {photos.length > 0 && (
        <ul
          className="pu-list"
          ref={listRef}
          aria-label={L.photos}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {photos.map((p, i) => (
            <li
              key={p.id}
              ref={(el) => { if (el) items.current.set(p.id, el); else items.current.delete(p.id) }}
              className={`pu-item pu-${p.status}${dragId === p.id ? ' pu-drag' : ''}`}
              tabIndex={0}
              aria-label={`${L.photoN.replace('{n}', i + 1)}${i === 0 ? ` (${L.main})` : ''}. ${L.moveHint}`}
              onPointerDown={(e) => onPointerDown(e, p.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {p.src && <img src={p.src} alt="" draggable={false} />}
              {i === 0 && <span className="pu-main">{L.main}</span>}
              {p.status === 'loading' && (
                <span className="pu-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.progress * 100)}>
                  <span className="pu-pct">{Math.round(p.progress * 100)}%</span>
                  <span className="pu-bar"><span style={{ transform: `scaleX(${p.progress})` }} /></span>
                </span>
              )}
              {p.status === 'error' && (
                <span className="pu-failed"><Icon name="alert" size={18} />{L.failed}</span>
              )}
              <button type="button" className="pu-remove" aria-label={L.removePhoto} title={L.removePhoto} onClick={() => remove(p.id)}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className={`pu-drop${full ? ' pu-full' : ''}`} aria-disabled={full}>
        <input
          key={inputKey}
          type="file"
          accept="image/*"
          multiple
          disabled={full}
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
        <Icon name="imageAdd" size={26} />
        <span className="pu-drop-title">{L.choose} <span className="muted">({photos.length}/{max})</span></span>
        <span className="pu-drop-hint">{L.photosHint}</span>
      </label>
      {photos.length > 1 && <small className="muted pu-order-hint">{L.reorderHint}</small>}
      {error}
    </div>
  )
}
