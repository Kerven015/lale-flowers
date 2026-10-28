import { useLocation, useParams } from 'react-router-dom'
import Catalog from './Catalog'
import NotFound from './NotFound'
import { useProducts } from '../store/hooks'
import { isCategorySlug } from '../utils/catalogFilter'

const VALID = ['roses', 'tulips', 'bouquets', 'gifts', 'plants']

// Category pages (/roses, /tulips, /bouquets, /gifts, /category/:cat) use the
// same listing as the catalog, starting with that one category selected.
// /category/:cat also opens the categories the admin added.
export default function Category() {
  const { cat: param } = useParams()
  const { pathname } = useLocation()
  const { addedCategories, status } = useProducts()
  if (param && !VALID.includes(param)) {
    const known = addedCategories.some((c) => c.key === param)
    // unknown address (or a deleted category) once the list has loaded
    if (!known && (status === 'ready' || !isCategorySlug(param))) return <NotFound />
    return <Catalog presetCat={param} />
  }
  const fromPath = pathname.replace(/^\//, '')
  const raw = VALID.includes(param) ? param : fromPath
  const cat = VALID.includes(raw) ? raw : 'roses'
  return <Catalog presetCat={cat} />
}
