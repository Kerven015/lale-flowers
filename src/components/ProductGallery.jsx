// Product photos: thumbnails on the left + large main photo (desktop),
// main photo with swipe + dots and a thumbnail row below (phones),
// ‹ › arrows, photo counter, keyboard arrows and a fullscreen viewer.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../contexts/I18nContext'
import Icon from './Icons'

const SWIPE = 40 // px

// Left/right swipe on touch screens. Returns pointer handlers and whether the
// last gesture was a swipe (so it does not also count as a click).
function useSwipe(onPrev, onNext) {
  const start = useRef(null)
  const swiped = useRef(false)
  return {
    swiped,
    handlers: {
      onPointerDown: (e) => {
        if (e.pointerType === 'mouse') return
        start.current = { x: e.clientX, y: e.clientY }
        swiped.current = false
      },
      onPointerUp: (e) => {
        const s = start.current
        start.current = null
        if (!s) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.2) {
          swiped.current = true
          if (dx < 0) onNext()
          else onPrev()
        }
      },
      onPointerCancel: () => { start.current = null },
    },
  }
}

function Lightbox({ images, index, alt, onIndex, onClose }) {
  const { t } = useI18n()
  const many = images.length > 1
  const closeRef = useRef(null)
  const prev = useCallback(() => onIndex((index - 1 + images.length) % images.length), [index, images.length, onIndex])
  const next = useCallback(() => onIndex((index + 1) % images.length), [index, images.length, onIndex])
  const swipe = useSwipe(prev, next)

  useEffect(() => {
    const before = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && many) prev()
      else if (e.key === 'ArrowRight' && many) next()
      else if (e.key === 'Tab') {
        // keep keyboard focus inside the viewer
        const els = [...document.querySelectorAll('.lb button')]
        if (!els.length) return
        const i = els.indexOf(document.activeElement)
        e.preventDefault()
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, prev, next, many])

  return createPortal(
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="lb-stage" {...swipe.handlers}>
        {images.map((src, k) => (
          <img key={k} src={src} alt={k === index ? alt : ''} className={k === index ? 'on' : ''} draggable={false} />
        ))}
      </div>
      <button ref={closeRef} type="button" className="lb-btn lb-close" aria-label={t('gallery.close')} onClick={onClose}>
        <Icon name="close" size={22} />
      </button>
      {many && (
        <>
          <button type="button" className="lb-btn lb-prev" aria-label={t('gallery.prev')} onClick={prev}><Icon name="prev" size={26} /></button>
          <button type="button" className="lb-btn lb-next" aria-label={t('gallery.next')} onClick={next}><Icon name="next" size={26} /></button>
          <div className="lb-count" aria-live="polite">{index + 1} / {images.length}</div>
        </>
      )}
    </div>,
    document.body,
  )
}

export default function ProductGallery({ images, alt }) {
  const { t } = useI18n()
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const scrollerRef = useRef(null)
  const thumbRefs = useRef([])
  const many = images.length > 1
  const n = images.length

  const prev = useCallback(() => setIndex((i) => (i - 1 + n) % n), [n])
  const next = useCallback(() => setIndex((i) => (i + 1) % n), [n])
  const swipe = useSwipe(prev, next)

  // Keep the selected thumbnail visible inside its own scroller (not the page).
  useEffect(() => {
    const box = scrollerRef.current
    const el = thumbRefs.current[index]
    if (!box || !el) return
    const vertical = box.scrollHeight > box.clientHeight + 1
    if (vertical) {
      const top = el.offsetTop - box.offsetTop
      if (top < box.scrollTop) box.scrollTo({ top: top - 4, behavior: 'smooth' })
      else if (top + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTo({ top: top + el.offsetHeight - box.clientHeight + 4, behavior: 'smooth' })
    } else {
      const left = el.offsetLeft - box.offsetLeft
      if (left < box.scrollLeft) box.scrollTo({ left: left - 4, behavior: 'smooth' })
      else if (left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left + el.offsetWidth - box.clientWidth + 4, behavior: 'smooth' })
    }
  }, [index])

  // Left/right arrow keys switch photos anywhere on the page (not while
  // typing in a field, and the fullscreen viewer handles its own keys).
  useEffect(() => {
    if (!many || open) return undefined
    function onKey(e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [many, open, prev, next])

  function onMainClick(e) {
    if (e.target.closest('.pg-arrow')) return
    if (swipe.swiped.current) { swipe.swiped.current = false; return }
    setOpen(true)
  }

  function onMainKey(e) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
  }

  return (
    <div className={`pg${many ? ' pg-many' : ''}`}>
      {many && (
        <div className="pg-thumbs">
          <div className="pg-thumbs-scroll" ref={scrollerRef} role="tablist" aria-label={alt}>
            {images.map((src, k) => (
              <button
                key={k}
                ref={(el) => { thumbRefs.current[k] = el }}
                type="button"
                role="tab"
                aria-selected={k === index}
                aria-label={t('gallery.photo').replace('{n}', k + 1).replace('{m}', n)}
                className={`pg-thumb${k === index ? ' active' : ''}`}
                onClick={() => setIndex(k)}
              >
                <img src={src} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="pg-main"
        role="button"
        tabIndex={0}
        aria-label={`${t('gallery.open')}${many ? ` — ${t('gallery.photo').replace('{n}', index + 1).replace('{m}', n)}` : ''}`}
        onClick={onMainClick}
        onKeyDown={onMainKey}
        {...swipe.handlers}
      >
        {images.map((src, k) => (
          <img
            key={k}
            src={src}
            alt={k === index ? alt : ''}
            className={k === index ? 'on' : ''}
            draggable={false}
            loading={k === 0 ? 'eager' : 'lazy'}
          />
        ))}
        {many && (
          <>
            <button type="button" className="pg-arrow pg-prev" aria-label={t('gallery.prev')} onClick={(e) => { e.stopPropagation(); prev() }}>
              <Icon name="prev" size={22} />
            </button>
            <button type="button" className="pg-arrow pg-next" aria-label={t('gallery.next')} onClick={(e) => { e.stopPropagation(); next() }}>
              <Icon name="next" size={22} />
            </button>
            <span className="pg-count" aria-hidden="true">{index + 1} / {n}</span>
            <div className="pg-dots" aria-hidden="true">
              {images.map((_, k) => <span key={k} className={k === index ? 'on' : ''} />)}
            </div>
          </>
        )}
      </div>

      {open && <Lightbox images={images} index={index} alt={alt} onIndex={setIndex} onClose={() => setOpen(false)} />}
    </div>
  )
}
