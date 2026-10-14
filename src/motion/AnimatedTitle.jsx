// 4 · Page titles drift in word by word out of a soft blur, and a line on the
// home page whose last word changes every few seconds.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { prefersReducedMotion } from './motion'

export default function AnimatedTitle({ text, as: Tag = 'h1', className = '' }) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  return (
    // keyed by the text: a new title replays the entrance
    <Tag key={text} className={`at ${className}`.trim()} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="at-w" aria-hidden="true" style={{ '--i': i }}>
          {w}{i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </Tag>
  )
}

// items: [{ label, to }]
export function TextLoop({ lead, items, interval = 2400 }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduce = prefersReducedMotion()

  useEffect(() => {
    if (reduce || paused || items.length < 2) return undefined
    const id = setInterval(() => setI((v) => (v + 1) % items.length), interval)
    return () => clearInterval(id)
  }, [reduce, paused, items.length, interval])

  if (reduce) {
    return (
      <p className="tl">
        <span className="tl-lead">{lead}</span>{' '}
        {items.map((it, k) => (
          <span key={it.to}>{k > 0 && ' · '}<Link to={it.to} className="tl-link">{it.label}</Link></span>
        ))}
      </p>
    )
  }
  return (
    <p className="tl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="tl-lead">{lead}</span>{' '}
      <span className="tl-words" aria-live="polite">
        {items.map((it, k) => (
          <Link
            key={it.to}
            to={it.to}
            className={`tl-link tl-word${k === i ? ' on' : ''}${k === (i - 1 + items.length) % items.length ? ' out' : ''}`}
            tabIndex={k === i ? 0 : -1}
            aria-hidden={k !== i}
          >
            {it.label}
          </Link>
        ))}
      </span>
    </p>
  )
}
