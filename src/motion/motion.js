// Small shared helpers for the site's motion effects (rebuilt from
// Motion-Primitives ideas in plain JS/CSS, no extra packages).
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const hasFinePointer = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches

// ---------------------------------------------------------------------------
// 8 · Sliding highlight: a pill (or underline) that glides behind the active
// item of a group. The container gets class "has-slider" and one child
// <span class="slider-pill"> that this hook positions.
export function useSlidingPill(containerRef, activeSelector, deps = []) {
  const first = useRef(true)
  const place = useCallback(() => {
    const box = containerRef.current
    if (!box) return
    let pill = box.querySelector(':scope > .slider-pill')
    if (!pill) {
      pill = document.createElement('span')
      pill.className = 'slider-pill'
      pill.setAttribute('aria-hidden', 'true')
      box.prepend(pill)
    }
    box.classList.add('has-slider')
    const el = box.querySelector(activeSelector)
    if (!el) { pill.style.opacity = '0'; return }
    pill.style.opacity = '1'
    if (first.current) pill.style.transition = 'none'
    pill.style.width = `${el.offsetWidth}px`
    pill.style.height = `${el.offsetHeight}px`
    pill.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`
    if (first.current) {
      first.current = false
      requestAnimationFrame(() => requestAnimationFrame(() => { pill.style.transition = '' }))
    }
  }, [containerRef, activeSelector])

  useLayoutEffect(place, [place, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const box = containerRef.current
    if (!box || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(() => place())
    ro.observe(box)
    document.fonts?.ready?.then(place)
    return () => ro.disconnect()
  }, [containerRef, place])
}

// ---------------------------------------------------------------------------
// 7 · Magnetic: the element is gently pulled toward a nearby mouse pointer and
// springs back when it leaves (desktop only).
export function useMagnetic(ref, { reach = 110, strength = 0.28, max = 10 } = {}, deps = []) {
  useEffect(() => {
    const el = ref.current
    if (!el || !hasFinePointer() || prefersReducedMotion()) return undefined
    el.classList.add('magnetic')
    let raf = 0
    let active = false
    function onMove(e) {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        // distance from the button's edge, not its centre
        const ex = Math.max(0, Math.abs(dx) - r.width / 2)
        const ey = Math.max(0, Math.abs(dy) - r.height / 2)
        const d = Math.hypot(ex, ey)
        if (d < reach) {
          const f = 1 - d / reach
          const clamp = (v) => Math.max(-max, Math.min(max, v))
          el.style.translate = `${clamp(dx * strength * f)}px ${clamp(dy * strength * f)}px`
          active = true
        } else if (active) {
          el.style.translate = ''
          active = false
        }
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      el.style.translate = ''
      el.classList.remove('magnetic')
    }
  }, [ref, reach, strength, max, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------------------------------------------------------------------------
// 1 · Cards appear one after another as they scroll into view. Works on any
// grid whose children are product cards; new cards (filters, search) get the
// same entrance. Cards are marked with data-rv (React never touches it).
// Pass the grid element itself (from a callback ref), so the effect also
// starts when the grid appears later (e.g. after "nothing found").
export function useStaggerReveal(box, itemSelector = '.product-card') {
  useEffect(() => {
    if (!box || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return undefined
    box.classList.add('rv-ready')
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => (a.target.compareDocumentPosition(b.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      visible.forEach((e, i) => {
        e.target.style.setProperty('--rv-delay', `${Math.min(i, 8) * 70}ms`)
        e.target.dataset.rv = 'in'
        io.unobserve(e.target)
      })
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 })
    const watch = () => box.querySelectorAll(`:scope > ${itemSelector}:not([data-rv])`).forEach((el) => io.observe(el))
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(box, { childList: true })
    return () => { io.disconnect(); mo.disconnect(); box.classList.remove('rv-ready') }
  }, [box, itemSelector])
}
