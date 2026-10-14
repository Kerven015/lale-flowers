// "Are you sure?" dialog for deleting one or several products, with their photos.
import { useEffect, useRef, useState } from 'react'
import { productImage } from '../utils/productHelpers'
import Icon from './Icons'
import { useProducts } from '../store/hooks'

export default function ConfirmDelete({ items, L, onCancel, onConfirm }) {
  const { name } = useProducts()
  const [shown, setShown] = useState(false)
  const cancelRef = useRef(null)
  const deleteRef = useRef(null)
  const many = items.length > 1
  const closing = useRef(false)

  // Fade in after mounting, fade out before closing.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    const before = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    return () => {
      cancelAnimationFrame(id)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])

  function close(confirmed) {
    if (closing.current) return
    closing.current = true
    setShown(false)
    setTimeout(() => (confirmed ? onConfirm() : onCancel()), 220)
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Tab') {
        // keep focus on the two buttons
        e.preventDefault()
        ;(document.activeElement === cancelRef.current ? deleteRef.current : cancelRef.current)?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const shownItems = items.slice(0, 4)
  const extra = items.length - shownItems.length
  const title = many ? L.confirmTitleN.replace('{n}', items.length) : L.confirmTitle1
  const text = many ? L.confirmTextN.replace('{n}', items.length) : L.confirmText1

  return (
    <div className={`modal adm-confirm${shown ? ' show' : ''}`} onClick={() => close(false)}>
      <div
        className="modal-box"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="adm-confirm-title"
        aria-describedby="adm-confirm-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`adm-confirm-photos${many ? ' many' : ''}`}>
          {shownItems.map((p) => <img key={p.id} src={productImage(p)} alt="" />)}
          {extra > 0 && <span className="adm-confirm-more">+{extra}</span>}
        </div>
        <h3 id="adm-confirm-title">{title}</h3>
        {!many && <p className="adm-confirm-name">{name(items[0])}</p>}
        <p id="adm-confirm-text" className="muted">{text}</p>
        <div className="adm-confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-outline" onClick={() => close(false)}>{L.cancel}</button>
          <button ref={deleteRef} type="button" className="btn btn-primary" onClick={() => close(true)}>
            <Icon name="trash" size={17} />{many ? L.deleteN.replace('{n}', items.length) : L.del}
          </button>
        </div>
      </div>
    </div>
  )
}
