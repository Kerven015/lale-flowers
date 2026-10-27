import { useEffect } from 'react'

const SITE = 'Läle Gülleri'
// the title from index.html, used on pages without their own title (home)
const DEFAULT_TITLE = typeof document !== 'undefined' ? document.title : SITE
const countOf = () => (document.title.match(/^\(\d+\)\s*/) || [''])[0] // the admin's "(2)" new-orders count

// Browser tab title for the current page: "Roses — Läle Gülleri".
export function usePageTitle(title) {
  useEffect(() => {
    if (!title) return undefined
    document.title = `${countOf()}${title} — ${SITE}`
    return () => { document.title = `${countOf()}${DEFAULT_TITLE}` }
  }, [title])
}
