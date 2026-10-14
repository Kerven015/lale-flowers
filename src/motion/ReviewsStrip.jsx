// 5 · Customer reviews gliding sideways in an endless loop (pauses on hover).
// Reviews come from src/data/reviews.js.
import { useI18n } from '../contexts/I18nContext'
import { REVIEWS } from '../data/reviews'
import Stars from '../components/Stars'

export default function ReviewsStrip() {
  const { t } = useI18n()
  if (!REVIEWS.length) return null
  // repeat short lists so the strip is always wider than the screen
  const base = []
  while (base.length < 6) base.push(...REVIEWS)
  const card = (r, k, hidden) => (
    <figure className="rv-card" key={k} aria-hidden={hidden || undefined}>
      <Stars rating={r.rating || 5} size={14} />
      <blockquote>{r.text}</blockquote>
      <figcaption>{r.name}</figcaption>
    </figure>
  )
  return (
    <section className="reviews-strip" aria-labelledby="reviews-strip-title">
      <h2 id="reviews-strip-title" className="reviews-strip-title">{t('rev.title')}</h2>
      <div className="rv-marquee">
        <div className="rv-track">
          {base.map((r, k) => card(r, `a${k}`, k >= REVIEWS.length))}
          {base.map((r, k) => card(r, `b${k}`, true))}
        </div>
      </div>
    </section>
  )
}
