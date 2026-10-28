import { useLocation, useParams } from 'react-router-dom'
import Catalog from './Catalog'
import NotFound from './NotFound'
import { useProducts } from '../store/hooks'
import { isCategorySlug } from '../utils/catalogFilter'

// Category pages (/roses, /tulips, /bouquets, /gifts, /category/:cat) use the
// same listing as the catalog, starting with that one category selected.
// Once the list of categories has loaded, an address that is not one of them
// (never existed, or deleted in admin → Categories) shows "page not found".
export default function Category() {
  const { cat: param } = useParams()
  const { pathname } = useLocation()
  const { categoryKeys, status } = useProducts()
  const cat = param || pathname.replace(/^\//, '')
  if (!isCategorySlug(cat)) return <NotFound />
  if (status === 'ready' && !categoryKeys.includes(cat)) return <NotFound />
  return <Catalog presetCat={cat} />
}
