// 3 · Numbers that roll like a counter when they change (basket count, totals).
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './motion'

const DIGITS = '0123456789'

export default function RollingNumber({ value, suffix = '', className = '' }) {
  const text = String(value ?? '')
  const chars = [...text]
  return (
    <span className={`rn ${className}`.trim()}>
      <span className="sr-only">{text}{suffix}</span>
      <span className="rn-roll" aria-hidden="true">
        {chars.map((ch, i) => {
          // keyed from the right, so units stay units when the length changes
          const key = chars.length - i
          if (!/\d/.test(ch)) return <span key={`s${key}`} className="rn-sep">{ch}</span>
          return (
            <span key={`d${key}`} className="rn-digit">
              <span className="rn-col" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
                {[...DIGITS].map((d) => <span key={d}>{d}</span>)}
              </span>
            </span>
          )
        })}
        {/* a leading space would be dropped inside the flex row ("2630TMT") */}
        {suffix && <span className="rn-suffix">{suffix.replace(/^ /, '\u00A0')}</span>}
      </span>
    </span>
  )
}

// Red counter badge (header, bottom menu) with a small bounce when it grows.
export function CountBadge({ count, className = 'badge', id }) {
  const ref = useRef(null)
  const prev = useRef(count)
  useEffect(() => {
    const el = ref.current
    if (el && count > prev.current && !prefersReducedMotion() && el.animate) {
      el.animate([{ scale: 1 }, { scale: 1.35 }, { scale: 1 }], { duration: 450, easing: 'cubic-bezier(.34, 1.56, .64, 1)' })
    }
    prev.current = count
  }, [count])
  return (
    <span ref={ref} id={id} className={`${className}${count ? ' show' : ''}`}>
      <RollingNumber value={count} />
    </span>
  )
}
