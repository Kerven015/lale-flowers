// Admin: every product in the same card grid, filters and sorting as the shop,
// plus a name search, edit/delete on each card and a "Select" mode to delete
// several products at once.
import { useMemo, useState } from 'react'
import CatalogBrowser from './CatalogBrowser'
import Icon from './Icons'
import ProductCard from './ProductCard'
import ProductGrid from './ProductGrid'
import { useI18n } from '../contexts/I18nContext'
import { EMPTY_FILTERS } from '../utils/catalogFilter'

export default function AdminCatalog({ products, L, removing, onEdit, requestDelete }) {
  const { t } = useI18n()
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS }))
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recommended')
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState(() => new Set())

  // Only products that still exist count as selected.
  const selected = useMemo(() => products.filter((p) => picked.has(p.id)), [products, picked])

  const toggle = (id) => setPicked((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const stopSelecting = () => { setSelecting(false); setPicked(new Set()) }

  async function deleteSelected() {
    if (!selected.length) return
    if (await requestDelete(selected)) stopSelecting()
  }

  const labels = { edit: L.editBtn, del: L.del, select: L.select }

  return (
    <>
      <div className="adm-search">
        <Icon name="search" size={18} />
        <input
          className="field"
          type="search"
          value={query}
          placeholder={L.search}
          aria-label={L.search}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="adm-search-clear" aria-label={t('menu.close')} onClick={() => setQuery('')}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <CatalogBrowser
        products={products}
        filters={filters}
        setFilters={setFilters}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        resultsExtra={(list) => (
          <div className="adm-select-toggle">
            {selecting ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                const allPicked = list.length > 0 && list.every((p) => picked.has(p.id))
                setPicked(allPicked ? new Set() : new Set(list.map((p) => p.id)))
              }}>
                {list.length > 0 && list.every((p) => picked.has(p.id)) ? L.unselectAll : L.selectAll}
              </button>
            ) : (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelecting(true)} disabled={!list.length}>
                <Icon name="check" size={16} />{L.select}
              </button>
            )}
          </div>
        )}
        renderGrid={(list) => (
          <ProductGrid
            products={list}
            renderCard={(p) => (
              <ProductCard
                key={p.id}
                product={p}
                admin={{
                  labels,
                  selecting,
                  selected: picked.has(p.id),
                  removing: removing.has(p.id),
                  onToggleSelect: () => toggle(p.id),
                  onEdit: () => onEdit(p),
                  onDelete: () => requestDelete([p]),
                }}
              />
            )}
          />
        )}
      />

      {/* Selection bar: slides up while "Select" mode is on */}
      <div className={`adm-selectbar${selecting ? ' show' : ''}`} aria-hidden={!selecting}>
        <span className="adm-selectbar-count">{L.selectedN.replace('{n}', selected.length)}</span>
        <div className="adm-selectbar-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={stopSelecting} tabIndex={selecting ? 0 : -1}>{L.cancel}</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={deleteSelected} disabled={!selected.length} tabIndex={selecting ? 0 : -1}>
            <Icon name="trash" size={16} />{L.deleteN.replace('{n}', selected.length)}
          </button>
        </div>
      </div>
    </>
  )
}
