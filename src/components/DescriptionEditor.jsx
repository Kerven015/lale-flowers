// Admin: product description per language (TM / RU / TR) with a small
// rich-text editor (bold, italic, bullet list, line breaks), optional
// composition / size / care fields and a live preview of the product page.
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../contexts/I18nContext'
import { htmlToText, productDetails, sanitizeHtml, textToHtml } from '../utils/richText'
import Icon from './Icons'
import ProductDescription from './ProductDescription'

export const DESC_LANGS = ['tm', 'ru', 'tr']
export const emptyDetails = () => Object.fromEntries(DESC_LANGS.map((l) => [l, { desc: '', composition: '', size: '', care: '' }]))

// product -> editor value
export function detailsFromProduct(p) {
  return Object.fromEntries(DESC_LANGS.map((l) => {
    const d = p?.i18n?.[l] || {}
    return [l, {
      desc: d.descHtml || textToHtml(d.desc),
      composition: d.composition || '',
      size: d.size || '',
      care: d.care || '',
    }]
  }))
}

const filled = (d) => !!(htmlToText(d.desc) || d.composition.trim() || d.size.trim() || d.care.trim())

function RichEditor({ html, onChange, placeholder, labels, id, labelledBy }) {
  const ref = useRef(null)
  const [state, setState] = useState({ bold: false, italic: false, list: false })
  const [empty, setEmpty] = useState(!htmlToText(html))

  // The editor is uncontrolled: its content is set once (the parent remounts
  // it with a new key when the product or language changes).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeHtml(html)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onSel() {
      const el = ref.current
      if (!el || !el.contains(document.getSelection()?.anchorNode)) return
      setState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList'),
      })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  function emit() {
    const el = ref.current
    if (!el) return
    setEmpty(!htmlToText(el.innerHTML))
    onChange(el.innerHTML)
  }

  function cmd(name) {
    ref.current?.focus()
    document.execCommand(name, false, null)
    emit()
    setState((s) => ({
      ...s,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      list: document.queryCommandState('insertUnorderedList'),
    }))
  }

  // Pasted text keeps only bold / italic / lists / line breaks.
  function onPaste(e) {
    const cd = e.clipboardData
    if (!cd) return
    e.preventDefault()
    const raw = cd.getData('text/html') || textToHtml(cd.getData('text/plain'))
    document.execCommand('insertHTML', false, sanitizeHtml(raw) || '')
    emit()
  }

  const btn = (key, command, icon, label) => (
    <button
      type="button"
      className={`rte-btn${state[key] ? ' on' : ''}`}
      aria-pressed={state[key]}
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()} // keep the text selection
      onClick={() => cmd(command)}
    >
      <Icon name={icon} size={17} />
    </button>
  )

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label={labels.toolbar}>
        {btn('bold', 'bold', 'bold', `${labels.bold} (Ctrl+B)`)}
        {btn('italic', 'italic', 'italic', `${labels.italic} (Ctrl+I)`)}
        {btn('list', 'insertUnorderedList', 'list', labels.list)}
      </div>
      <div
        ref={ref}
        id={id}
        className={`rte-area${empty ? ' is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelledBy}
        data-placeholder={placeholder}
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
      />
    </div>
  )
}

export default function DescriptionEditor({ value, onChange, L, resetKey }) {
  const { lang: siteLang } = useI18n()
  const [lang, setLang] = useState(DESC_LANGS.includes(siteLang) ? siteLang : 'ru')
  const cur = value[lang]
  const set = (patch) => onChange((v) => ({ ...v, [lang]: { ...v[lang], ...patch } }))
  const [editorKey, setEditorKey] = useState(0)

  // What the product page will show in the selected language (with fallback).
  const preview = productDetails({
    i18n: Object.fromEntries(DESC_LANGS.map((l) => [l, {
      descHtml: sanitizeHtml(value[l].desc),
      composition: value[l].composition,
      size: value[l].size,
      care: value[l].care,
    }])),
  }, lang)
  const previewEmpty = !preview.html && !preview.composition && !preview.size && !preview.care

  function clearLang() {
    set({ desc: '', composition: '', size: '', care: '' })
    setEditorKey((k) => k + 1)
  }

  return (
    <div className="de">
      <div className="de-langs" role="tablist" aria-label={L.descTitle}>
        {DESC_LANGS.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lang === l}
            className={`de-lang${lang === l ? ' active' : ''}`}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
            {filled(value[l]) && <span className="de-dot" aria-label={L.descFilled} />}
          </button>
        ))}
        <button type="button" className="de-clear" onClick={clearLang} disabled={!filled(cur)}>{L.descClear}</button>
      </div>

      <label className="de-label" id={`de-desc-label-${lang}`} htmlFor={`de-desc-${lang}`}>{L.descText} ({lang.toUpperCase()})</label>
      <RichEditor
        key={`${resetKey}-${lang}-${editorKey}`}
        id={`de-desc-${lang}`}
        labelledBy={`de-desc-label-${lang}`}
        html={cur.desc}
        onChange={(html) => set({ desc: html })}
        placeholder={L.descPh}
        labels={{ bold: L.bold, italic: L.italic, list: L.listBtn, toolbar: L.descText }}
      />

      <div className="de-fields">
        <div className="form-field">
          <label htmlFor={`de-comp-${lang}`}>{L.composition}</label>
          <input id={`de-comp-${lang}`} className="field" value={cur.composition} placeholder={L.compositionPh} maxLength={300} onChange={(e) => set({ composition: e.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor={`de-size-${lang}`}>{L.size}</label>
          <input id={`de-size-${lang}`} className="field" value={cur.size} placeholder={L.sizePh} maxLength={120} onChange={(e) => set({ size: e.target.value })} />
        </div>
        <div className="form-field de-full">
          <label htmlFor={`de-care-${lang}`}>{L.care}</label>
          <textarea id={`de-care-${lang}`} className="field" rows={3} value={cur.care} placeholder={L.carePh} maxLength={800} onChange={(e) => set({ care: e.target.value })} />
        </div>
      </div>

      <div className="de-preview" aria-live="polite">
        <span className="de-preview-label">{L.preview} · {lang.toUpperCase()}</span>
        {previewEmpty
          ? <p className="muted de-preview-empty">{L.previewEmpty}</p>
          : <ProductDescription details={preview} idPrefix="de-pv" className="pd-preview" />}
      </div>
    </div>
  )
}
