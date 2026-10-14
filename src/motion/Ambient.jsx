// Page-wide effects mounted once in the layout:
// 9 · thin reading-progress line on long pages
// 6 · product photos lean toward the mouse with a soft light (desktop)
import { useEffect, useRef } from 'react'
import { hasFinePointer, prefersReducedMotion } from './motion'

export function ScrollProgress({ enabled }) {
  const bar = useRef(null)
  useEffect(() => {
    if (!enabled) return undefined
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - window.innerHeight
        const p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0
        if (bar.current) bar.current.style.transform = `scaleX(${p})`
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(document.body)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [enabled])
  if (!enabled) return null
  return <div className="scroll-progress" ref={bar} aria-hidden="true" />
}

export function CardTilt() {
  useEffect(() => {
    if (!hasFinePointer() || prefersReducedMotion()) return undefined
    let current = null
    let raf = 0
    const reset = () => {
      if (!current) return
      current.style.transform = ''
      current.style.transition = ''
      current.classList.remove('is-tilting')
      current = null
    }
    function onMove(e) {
      const card = e.target.closest?.('.product-card:not(.adm-card)')
      if (card !== current) reset()
      if (!card) return
      current = card
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (current !== card) return
        const r = card.getBoundingClientRect()
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
        card.classList.add('is-tilting')
        card.style.transition = 'transform .15s ease-out, box-shadow .3s ease, border-color .3s ease'
        card.style.transform = `translateY(-7px) perspective(1000px) rotateX(${((0.5 - y) * 6).toFixed(2)}deg) rotateY(${((x - 0.5) * 7).toFixed(2)}deg)`
        card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
        card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
      })
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', reset)
    window.addEventListener('blur', reset)
    window.addEventListener('scroll', reset, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      reset()
      document.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('mouseleave', reset)
      window.removeEventListener('blur', reset)
      window.removeEventListener('scroll', reset)
    }
  }, [])
  return null
}
