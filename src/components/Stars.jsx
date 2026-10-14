import Icon from './Icons'

// Rating stars as thin line icons (full = gold, empty = faint).
export default function Stars({ rating = 0, size = 14 }) {
  const full = Math.round(rating)
  return (
    <span className="stars" role="img" aria-label={`${Number(rating).toFixed(1)} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Icon key={i} name="star" size={size} className={i < full ? 'star-on' : 'star-off'} />
      ))}
    </span>
  )
}
