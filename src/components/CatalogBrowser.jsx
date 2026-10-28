// The catalog toolbar (filter dropdowns + Sort), active-filter chips,
// "X products found", the product grid and the phone Filter/Sort sheets.
// Used by the shop's catalog page and by the admin panel, so both look and
// behave the same. The parent owns filters / query / sort.
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icons'
import ProductGrid from './ProductGrid'
import { useDelivery } from '../contexts/DeliveryContext'
import { useI18n } from '../contexts/I18nContext'
import { occasionByKey } from '../data/navigation'
import {
  CATEGORY_KEYS,
  COLOR_KEYS,
  EMPTY_FILTERS,
  PRICE_RANGES,
  RATING_STEPS,
  SORT_KEYS,
  activeFilterCount,
  filterProducts,
  sortProducts,
} from '../utils/catalogFilter'
import { customTypes } from '../utils/productTypes'
import { useProducts } from '../store/hooks'

const rangeText = (lo, hi) => (lo && hi ? `${lo} – ${hi} TMT` : lo ? `${lo}+ TMT` : hi ? `≤ ${hi} TMT` : '')

// One toolbar dropdown (used by every filter and by Sort). The parent decides
// which one is open, so only one can be open at a time.
function ToolbarDropdown({ id, label, icon, value, active, open, onToggle, onClose, align = 'left', wide, children }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div className={`tb-dd${open ? ' open' : ''}${active ? ' is-active' : ''}`} ref={ref}>
      <button
        type="button"
        className={`tb-btn${value ? ' has-value' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`tb-panel-${id}`}
        onClick={onToggle}
      >
        {icon && <Icon name={icon} size={16} className="tb-ico" />}
        <span className="tb-label">{label}{value ? ':' : ''}</span>
        {value && <span className="tb-value">{value}</span>}
        <Icon name="chevron" size={15} className="tb-caret" />
      </button>
      <div id={`tb-panel-${id}`} className={`tb-panel tb-panel-${align}${wide ? ' wide' : ''}`} role="dialog" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export default function CatalogBrowser({
  products,
  filters,
  setFilters,
  query,
  setQuery,
  sort,
  setSort,
  resetKey,            // closes dropdowns/sheets when it changes (e.g. navigation)
  renderGrid,          // (list) => grid; defaults to the shop's ProductGrid
  resultsExtra = null, // extra controls next to "X products found" (node or (list) => node)
}) {
  const { t } = useI18n()
  const { catName, status, addedCategories } = useProducts()
  const { isSameDay } = useDelivery()

  const [openDd, setOpenDd] = useState('')          // which toolbar dropdown is open
  const [filtersOpen, setFiltersOpen] = useState(false) // phone filter sheet
  const [sortOpen, setSortOpen] = useState(false)       // phone sort sheet
  const [openAcc, setOpenAcc] = useState('cats')        // open accordion in the sheet

  useEffect(() => {
    setOpenDd('')
    setFiltersOpen(false)
    setSortOpen(false)
  }, [resetKey])

  // Lock page scroll while a bottom sheet is open on phones/tablets.
  useEffect(() => {
    document.body.style.overflow = filtersOpen || sortOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [filtersOpen, sortOpen])

  const update = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const toggleIn = (key, value) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }))
  const resetAll = () => {
    setFilters({ ...EMPTY_FILTERS })
    setQuery('')
  }

  const occasion = occasionByKey(filters.occasion)
  // Fixed categories, the categories the admin added, and any custom types
  // typed with "Other".
  const catKeys = useMemo(
    () => [...CATEGORY_KEYS, ...addedCategories.map((c) => c.key), ...customTypes(products).map((c) => c.key)],
    [products, addedCategories],
  )
  const list = useMemo(
    () => sortProducts(
      filterProducts(products, filters, query, { isSameDay, occasionIds: occasion ? occasion.ids : null }),
      sort,
    ),
    [products, filters, query, sort, isSameDay, occasion],
  )

  const sortNames = {
    recommended: t('sort.recommended'),
    priceDesc: t('sort.priceDesc'),
    priceAsc: t('sort.priceAsc'),
    newest: t('sort.newest'),
    popular: t('sort.popular'),
  }

  const nActive = activeFilterCount(filters)
  const rangeActive = ([lo, hi]) => filters.minPrice === lo && filters.maxPrice === hi
  const priceSet = filters.minPrice !== '' || filters.maxPrice !== ''

  // What each button shows when its filter is active.
  const multiValue = (arr, prefix) => (arr.length === 1 ? t(`${prefix}.${arr[0]}`) : arr.length > 1 ? `(${arr.length})` : '')
  const groups = [
    {
      id: 'cats',
      icon: 'tag',
      label: t('catalog.category'),
      value: filters.cats.length === 1 ? catName(filters.cats[0]) : filters.cats.length > 1 ? `(${filters.cats.length})` : '',
      active: filters.cats.length > 0,
      render: () => catKeys.map((c) => (
        <label className="check" key={c}>
          <input type="checkbox" checked={filters.cats.includes(c)} onChange={() => toggleIn('cats', c)} />
          <span>{catName(c)}</span>
        </label>
      )),
    },
    {
      id: 'price',
      icon: 'wallet',
      label: t('listing.priceRanges'),
      value: priceSet ? rangeText(filters.minPrice, filters.maxPrice) : '',
      active: priceSet,
      wide: true,
      render: (scope) => (
        <>
          <label className="check">
            <input type="radio" name={`price-${scope}`} checked={!priceSet} onChange={() => update({ minPrice: '', maxPrice: '' })} />
            <span>{t('listing.anyPrice')}</span>
          </label>
          {PRICE_RANGES.map((r) => (
            <label className="check" key={r.join('-')}>
              <input type="radio" name={`price-${scope}`} checked={rangeActive(r)} onChange={() => update({ minPrice: r[0], maxPrice: r[1] })} />
              <span>{rangeText(r[0], r[1])}</span>
            </label>
          ))}
          <div className="range-row">
            <input className="field" type="number" min="0" inputMode="numeric" placeholder={t('listing.from')} aria-label={t('listing.from')} value={filters.minPrice} onChange={(e) => update({ minPrice: e.target.value })} />
            <span className="range-dash">–</span>
            <input className="field" type="number" min="0" inputMode="numeric" placeholder={t('listing.to')} aria-label={t('listing.to')} value={filters.maxPrice} onChange={(e) => update({ maxPrice: e.target.value })} />
          </div>
        </>
      ),
    },
    {
      id: 'delivery',
      icon: 'truck',
      label: t('listing.delivery'),
      value: filters.sameDay ? t('listing.sameDay') : '',
      active: filters.sameDay,
      render: () => (
        <label className="check">
          <input type="checkbox" checked={filters.sameDay} onChange={(e) => update({ sameDay: e.target.checked })} />
          <span className="with-ico"><Icon name="truck" size={16} />{t('listing.sameDay')}</span>
        </label>
      ),
    },
    {
      id: 'color',
      icon: 'palette',
      label: t('catalog.color'),
      value: multiValue(filters.colors, 'color'),
      active: filters.colors.length > 0,
      render: () => COLOR_KEYS.map((c) => (
        <label className="check" key={c}>
          <input type="checkbox" checked={filters.colors.includes(c)} onChange={() => toggleIn('colors', c)} />
          <span>{t(`color.${c}`)}</span>
        </label>
      )),
    },
    {
      id: 'stock',
      icon: 'packageCheck',
      label: t('catalog.availability'),
      value: filters.inStockOnly ? t('avail.in') : '',
      active: filters.inStockOnly,
      render: () => (
        <label className="check">
          <input type="checkbox" checked={filters.inStockOnly} onChange={(e) => update({ inStockOnly: e.target.checked })} />
          <span>{t('avail.in')}</span>
        </label>
      ),
    },
    {
      id: 'rating',
      icon: 'star',
      label: t('catalog.rating'),
      value: filters.minRating > 0 ? `${filters.minRating}+` : '',
      active: filters.minRating > 0,
      render: (scope) => [...RATING_STEPS, 0].map((r) => (
        <label className="check" key={r}>
          <input type="radio" name={`rating-${scope}`} checked={filters.minRating === r} onChange={() => update({ minRating: r })} />
          <span>{r === 0 ? t('catalog.all') : `${r}+`}</span>
        </label>
      )),
    },
  ]

  // Removable chips for everything that is applied.
  const chips = [
    ...filters.cats.map((c) => ({ key: `c-${c}`, text: catName(c), remove: () => toggleIn('cats', c) })),
    ...(priceSet ? [{ key: 'price', text: rangeText(filters.minPrice, filters.maxPrice), remove: () => update({ minPrice: '', maxPrice: '' }) }] : []),
    ...(filters.sameDay ? [{ key: 'sameday', text: t('listing.sameDay'), remove: () => update({ sameDay: false }) }] : []),
    ...filters.colors.map((c) => ({ key: `col-${c}`, text: t(`color.${c}`), remove: () => toggleIn('colors', c) })),
    ...(filters.inStockOnly ? [{ key: 'stock', text: t('avail.in'), remove: () => update({ inStockOnly: false }) }] : []),
    ...(filters.minRating > 0 ? [{ key: 'rating', text: `${t('catalog.rating')} ${filters.minRating}+`, remove: () => update({ minRating: 0 }) }] : []),
    ...(occasion ? [{ key: 'occ', text: `${t('listing.occasion')}: ${t(occasion.label)}`, remove: () => update({ occasion: '' }) }] : []),
    ...(query.trim() ? [{ key: 'q', icon: 'search', text: `“${query.trim()}”`, remove: () => setQuery('') }] : []),
  ]

  const toggleDd = (id) => setOpenDd((cur) => (cur === id ? '' : id))
  const closeDd = () => setOpenDd('')

  return (
    <>
      {/* Desktop toolbar: filters left, sort right */}
      <div className="filter-toolbar">
        <div className="tb-filters">
          {groups.map((g) => (
            <ToolbarDropdown
              key={g.id}
              id={g.id}
              label={g.label}
              icon={g.icon}
              value={g.value}
              active={g.active}
              wide={g.wide}
              open={openDd === g.id}
              onToggle={() => toggleDd(g.id)}
              onClose={closeDd}
            >
              <div className="fp">{g.render('dd')}</div>
            </ToolbarDropdown>
          ))}
        </div>
        <ToolbarDropdown
          id="sort"
          label={t('listing.sort')}
          icon="sort"
          value={sortNames[sort]}
          align="right"
          open={openDd === 'sort'}
          onToggle={() => toggleDd('sort')}
          onClose={closeDd}
        >
          <ul className="sort-list" role="listbox" aria-label={t('listing.sort')}>
            {SORT_KEYS.map((k) => (
              <li key={k} role="option" aria-selected={sort === k}>
                <button type="button" className={`sort-opt${sort === k ? ' selected' : ''}`} onClick={() => { setSort(k); closeDd() }}>
                  <span>{sortNames[k]}</span>
                  {sort === k && <Icon name="check" size={16} className="sort-check" />}
                </button>
              </li>
            ))}
          </ul>
        </ToolbarDropdown>
      </div>

      {/* Phone / tablet: Filter + Sort */}
      <div className="mob-listing-bar">
        <button type="button" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
          <Icon name="filter" size={17} /> {t('listing.filter')}
          {nActive > 0 && <span className="count-pill">{nActive}</span>}
        </button>
        <button type="button" aria-haspopup="dialog" onClick={() => setSortOpen(true)}>
          <Icon name="sort" size={17} /> {t('listing.sort')}
        </button>
      </div>

      <div className="results-bar">
        {/* no "0 found" while the flowers are still loading */}
        {(status === 'ready' || products.length > 0) && (
          <span className="found" aria-live="polite"><strong>{list.length}</strong> {t('catalog.found')}</span>
        )}
        {chips.length > 0 && (
          <div className="active-chips">
            {chips.map((c) => (
              <button key={c.key} type="button" className="fchip" onClick={c.remove} aria-label={`${c.text} – ${t('menu.close')}`}>
                {c.icon && <Icon name={c.icon} size={14} />}
                <span>{c.text}</span>
                <Icon name="close" size={12} />
              </button>
            ))}
            <button type="button" className="clear-all" onClick={resetAll}>{t('listing.clearAll')}</button>
          </div>
        )}
        {typeof resultsExtra === 'function' ? resultsExtra(list) : resultsExtra}
      </div>

      {renderGrid ? renderGrid(list) : <ProductGrid products={list} />}

      {/* Filter bottom sheet with accordions */}
      <div className={`mob-sheet filter-sheet${filtersOpen ? ' show' : ''}`} aria-hidden={!filtersOpen}>
        <div className="mob-sheet-backdrop" onClick={() => setFiltersOpen(false)} />
        <div className="mob-sheet-panel" role="dialog" aria-label={t('catalog.filters')}>
          <div className="mob-sheet-handle" />
          <div className="sheet-head">
            <h3>{t('catalog.filters')}</h3>
            <button type="button" className="sheet-close" aria-label={t('menu.close')} onClick={() => setFiltersOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </div>
          <div className="sheet-body">
            {groups.map((g) => {
              const isOpen = openAcc === g.id
              return (
                <div key={g.id} className={`acc${isOpen ? ' open' : ''}`}>
                  <button type="button" className="acc-head" aria-expanded={isOpen} onClick={() => setOpenAcc(isOpen ? '' : g.id)}>
                    <Icon name={g.icon} size={17} className="acc-ico" />
                    <span className="acc-title">{g.label}</span>
                    {g.value && <span className="acc-value">{g.value}</span>}
                    <Icon name="chevron" size={16} className="acc-caret" />
                  </button>
                  {isOpen && <div className="acc-body fp">{g.render('sheet')}</div>}
                </div>
              )
            })}
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn btn-outline" onClick={resetAll}>{t('listing.clearAll')}</button>
            <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>
              {t('listing.showN').replace('{n}', list.length)}
            </button>
          </div>
        </div>
      </div>

      {/* Sort bottom sheet */}
      <div className={`mob-sheet${sortOpen ? ' show' : ''}`} aria-hidden={!sortOpen}>
        <div className="mob-sheet-backdrop" onClick={() => setSortOpen(false)} />
        <div className="mob-sheet-panel" role="dialog" aria-label={t('listing.sort')}>
          <div className="mob-sheet-handle" />
          <h3 className="with-ico sheet-title-ico"><Icon name="sort" size={18} />{t('listing.sort')}</h3>
          <div role="listbox" aria-label={t('listing.sort')}>
            {SORT_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={sort === k}
                className={`mob-sort-option${sort === k ? ' active' : ''}`}
                onClick={() => { setSort(k); setSortOpen(false) }}
              >
                <span>{sortNames[k]}</span>
                {sort === k && <Icon name="check" size={18} className="sort-check" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
