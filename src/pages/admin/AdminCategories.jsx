// Admin → Categories: add, rename, reorder and delete categories, the shop's
// original ones (roses, tulips ...) too. They show up in the menus, the footer,
// the Categories page, the catalog filter and the flower form.
import NameList from './NameList'
import { categoryPath } from '../../data/navigation'

export default function AdminCategories({ L, call }) {
  return (
    <NameList L={L} call={call} endpoint="/api/admin/categories" listKey="categories" prefix="cat" pathFor={categoryPath} blockUsed />
  )
}
