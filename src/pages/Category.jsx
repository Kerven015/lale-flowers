import { useLocation, useParams } from 'react-router-dom'
import Catalog from './Catalog'

const VALID = ['roses', 'tulips', 'bouquets', 'gifts', 'plants']

// Category pages (/roses, /tulips, /bouquets, /gifts, /category/:cat) use the
// same listing as the catalog, starting with that one category selected.
export default function Category() {
  const { cat: param } = useParams()
  const { pathname } = useLocation()
  const fromPath = pathname.replace(/^\//, '')
  const raw = VALID.includes(param) ? param : fromPath
  const cat = VALID.includes(raw) ? raw : 'roses'
  return <Catalog presetCat={cat} />
}
