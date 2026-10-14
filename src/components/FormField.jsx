import { useI18n } from '../contexts/I18nContext'

// Label + input (or textarea) + error message under it, in the site's
// language. `error` is a translation key (see utils/formCheck.js).
export default function FormField({ id, label, error, textarea = false, className = '', style, ...props }) {
  const { t } = useI18n()
  const Tag = textarea ? 'textarea' : 'input'
  return (
    <div className={`form-field ${className}`.trim()} style={style}>
      <label htmlFor={id}>{label}</label>
      <Tag
        id={id}
        className={`field${error ? ' is-invalid' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        {...props}
      />
      {error && <small id={`${id}-err`} className="field-error">{t(error)}</small>}
    </div>
  )
}
