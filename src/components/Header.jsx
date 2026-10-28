import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../contexts/I18nContext'
import { useTheme } from '../contexts/ThemeContext'
import { occasionPath } from '../data/navigation'
import { formatPrice, productImage } from '../utils/productHelpers'
import Icon from './Icons'
import { CountBadge } from '../motion/RollingNumber'
import { useSlidingPill } from '../motion/motion'
import { useAuth, useCart, useFlowerTypeLinks, useOccasions, useProducts, useTopMenuLinks } from '../store/hooks'
import { LOGO } from '../utils/assets'

const LANGS = ['tm', 'ru', 'tr']

function LangSwitch({ className = '' }) {
  const { t, lang, setLang } = useI18n()
  const box = useRef(null)
  useSlidingPill(box, 'button.active', [lang])
  return (
    <div ref={box} className={`lang-switch ${className}`} role="group" aria-label={t('a11y.language')}>
      {LANGS.map((code) => (
        <button key={code} type="button" className={lang === code ? 'active' : ''} onClick={() => setLang(code)}>
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function MegaColumns({ onPick }) {
  const { t } = useI18n()
  const types = useFlowerTypeLinks()
  const { occasions } = useOccasions()
  return (
    <div className="mega-cols">
      <div className="mega-col">
        <h4>{t('menu.byOccasion')}</h4>
        {occasions.map((o) => (
          <Link key={o.key} to={occasionPath(o.key)} onClick={onPick}>{o.label}</Link>
        ))}
      </div>
      <div className="mega-col">
        <h4>{t('menu.byType')}</h4>
        {types.map((c) => (
          <Link key={c.key} to={c.to} onClick={onPick}>{c.label}</Link>
        ))}
      </div>
    </div>
  )
}

function useSearch(q) {
  const { products, name } = useProducts()
  return useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return products
      .filter((p) => ['tm', 'ru', 'tr'].some((l) => (p.i18n?.[l]?.name || '').toLowerCase().includes(s)) || name(p).toLowerCase().includes(s))
      .slice(0, 6)
  }, [q, products, name])
}

function SearchResults({ q, results, onPick }) {
  const { t } = useI18n()
  const { name } = useProducts()
  if (!q.trim()) return null
  return (
    // mousedown would blur the search box and hide the list before the click lands
    <div className="search-results" onMouseDown={(e) => e.preventDefault()}>
      {results.length === 0 && <div className="search-empty">{t('search.empty')}</div>}
      {results.map((p) => (
        <Link key={p.id} to={`/product/${p.id}`} onClick={onPick}>
          <img src={productImage(p)} alt={name(p)} />
          <span className="sr-name">{name(p)}</span>
          <span className="sr-price">{formatPrice(p.price)}</span>
        </Link>
      ))}
    </div>
  )
}

// One shared underline that slides to the active menu item. It is moved with
// transform only (translateX + scaleX), so it never causes layout work.
// Icon + text of a menu item. The sliding underline measures .mm-text, so it
// covers the icon and the label together.
const MENU_ICON_FALLBACK = 'blossom'
function MenuLabel({ icon, label }) {
  return (
    <span className="mm-text">
      <Icon name={icon || MENU_ICON_FALLBACK} size={16} className="mm-ico" />
      <span className="mm-label">{label}</span>
    </span>
  )
}

// Keeps the menu on one line in every language: 0 = normal spacing,
// 1-2 = slightly tighter, 3 = "secondary" items (About, Contacts) move out of
// the row (they stay in the side menu and the footer), 4 = tightest. If the
// admin's links (admin → Menu) still do not fit, the last ones move into
// "More". Returns how many moved.
function fitMenu(list) {
  const own = [...list.querySelectorAll(':scope > li.mm-own')]
  own.forEach((li) => li.classList.remove('mm-moved'))
  list.dataset.more = '0'
  const fits = () => list.scrollWidth <= list.clientWidth + 1
  for (const level of ['0', '1', '2', '3', '4']) {
    list.dataset.fit = level
    if (fits()) return 0
  }
  list.dataset.more = '1'
  let moved = 0
  for (let i = own.length - 1; i >= 0 && !fits(); i--, moved++) own[i].classList.add('mm-moved')
  return moved
}

function useSlidingIndicator(listRef, indicatorRef, deps, onMoved) {
  const first = useRef(true)
  const place = useCallback(() => {
    const list = listRef.current
    const bar = indicatorRef.current
    if (!list || !bar) return
    onMoved(fitMenu(list))
    const active = list.querySelector(':scope > li:not(.mm-moved) > .active .mm-text')
    if (!active) { bar.style.opacity = '0'; return }
    const lr = list.getBoundingClientRect()
    const ar = active.getBoundingClientRect()
    const x = ar.left - lr.left + list.scrollLeft
    bar.style.transform = `translateX(${x}px) scaleX(${ar.width / 100})`
    bar.style.opacity = '1'
    if (first.current) {
      // first placement (load / refresh): jump into place, animate afterwards
      first.current = false
      requestAnimationFrame(() => requestAnimationFrame(() => bar.classList.add('ready')))
    }
  }, [listRef, indicatorRef, onMoved])

  useLayoutEffect(place, [place, ...deps])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    // text widths change on resize, language switch and when web fonts finish loading
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => place()) : null
    if (ro) {
      ro.observe(list)
      list.querySelectorAll(':scope > li').forEach((li) => ro.observe(li))
    }
    document.fonts?.ready?.then(place)
    window.addEventListener('resize', place)
    return () => { ro?.disconnect(); window.removeEventListener('resize', place) }
  }, [listRef, place, ...deps])
}

export default function Header() {
  const { t, lang } = useI18n()
  // the admin's links (admin → Menu) between "Home" and "Catalog"
  const topLinks = useTopMenuLinks()
  const { theme, toggle } = useTheme()
  const { count, favCount } = useCart()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const [sideOpen, setSideOpen] = useState(false)
  const [megaOpen, setMegaOpen] = useState(false)
  const [moved, setMoved] = useState(0) // the admin's links that did not fit: shown under "More"
  const [moreOpen, setMoreOpen] = useState(false)
  const [sideFlowers, setSideFlowers] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [q, setQ] = useState('')
  const [deskFocus, setDeskFocus] = useState(false)
  const megaTimer = useRef(null)
  const listRef = useRef(null)
  const indicatorRef = useRef(null)
  const mobileSearchRef = useRef(null)
  const results = useSearch(q)

  // phone/tablet: opening the search bar puts the cursor in the box
  useEffect(() => {
    if (searchOpen) mobileSearchRef.current?.focus({ preventScroll: true })
  }, [searchOpen])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close every menu after navigation.
  useEffect(() => {
    setSideOpen(false)
    setMegaOpen(false)
    setSearchOpen(false)
    setDeskFocus(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    document.body.style.overflow = sideOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sideOpen])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setMegaOpen(false); setSideOpen(false); setSearchOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openMega = () => { clearTimeout(megaTimer.current); setMegaOpen(true) }
  const closeMega = () => { clearTimeout(megaTimer.current); megaTimer.current = setTimeout(() => setMegaOpen(false), 120) }

  const submitSearch = (e) => {
    e.preventDefault()
    navigate(`/catalog?q=${encodeURIComponent(q.trim())}`)
  }

  const initials = user ? `${(user.first || 'U')[0] || ''}${(user.last || '')[0] || ''}`.toUpperCase() : ''
  const accountTo = user ? '/profile' : '/login'
  const accountLabel = user ? t('top.account') : t('top.login')

  // Every menu item has an icon (MENU_ICON_FALLBACK is used if one is forgotten).
  const menuLinks = [
    ...topLinks.map((l) => ({ ...l, own: true })),
    { to: '/catalog', label: t('nav.catalog'), icon: 'grid' },
    // "secondary" links leave the desktop row on narrow laptops (they stay in
    // the side menu and the footer) so the row never gets cut off.
    { to: '/about', label: t('nav.about'), icon: 'info', secondary: true },
    { to: '/contact', label: t('nav.contact'), icon: 'phone', secondary: true },
  ]
  const isActive = (to) => {
    const [path, qs] = to.split('?')
    if (qs) return location.pathname === path && location.search === `?${qs}`
    return location.pathname === path && (path !== '/catalog' || !location.search.includes('occasion='))
  }
  const onHomeClick = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  useSlidingIndicator(listRef, indicatorRef, [location.pathname, location.search, lang, topLinks], setMoved)

  return (
    <>
      <div className="topbar">
        <div className="container topbar-inner">
          <span className="topbar-note"><Icon name="truck" size={16} /> {t('top.delivery')}</span>
          <nav className="topbar-links" aria-label={t('a11y.profile')}>
            <Link to={accountTo}><Icon name="user" size={15} /> {accountLabel}</Link>
            <Link to="/track"><Icon name="box" size={15} /> {t('top.track')}</Link>
            <LangSwitch />
          </nav>
        </div>
      </div>

      <header className={`site-header${scrolled ? ' scrolled' : ''}`} id="siteHeader">
        <div className="container header-inner">
          <button
            className="burger"
            type="button"
            aria-label={t('a11y.menu')}
            aria-expanded={sideOpen}
            onClick={() => setSideOpen(true)}
          >
            <span /><span /><span />
          </button>

          <Link className="brand" to="/">
            <img className="brand-logo" src={LOGO} alt="Läle gülleri logo" />
            <span className="brand-name">Läle Gülleri<small>{t('brand.tagline')}</small></span>
          </Link>

          <form className="header-search" onSubmit={submitSearch} role="search">
            <Icon name="search" size={18} />
            <input
              type="search"
              value={q}
              placeholder={t('search.ph')}
              aria-label={t('a11y.search')}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setDeskFocus(true)}
              onBlur={() => setTimeout(() => setDeskFocus(false), 150)}
            />
            {deskFocus && <SearchResults q={q} results={results} onPick={() => setDeskFocus(false)} />}
          </form>

          <div className="header-actions">
            <button type="button" className="icon-btn search-toggle" aria-label={t('a11y.search')} aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}><Icon name="search" size={20} /></button>
            <Link className="icon-btn" to="/favorites" aria-label={t('a11y.favorites')}>
              <Icon name="heart" size={20} /><CountBadge count={favCount} />
            </Link>
            <Link className="icon-btn" to="/cart" aria-label={t('a11y.cart')}>
              <Icon name="cart" size={20} /><CountBadge count={count} />
            </Link>
            <button type="button" className="icon-btn hide-phone" onClick={toggle} aria-label={t('a11y.theme')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
            </button>
            <Link className={`icon-btn hide-phone${user ? ' logged-in' : ''}`} to={accountTo} aria-label={t('a11y.profile')}>
              {user ? <span className="user-avatar-mini">{initials || 'U'}</span> : <Icon name="user" size={20} />}
            </Link>
          </div>
        </div>

        <nav className="mainmenu" aria-label={t('a11y.menu')}>
          <div className="container mainmenu-inner">
            <ul className="mainmenu-list" ref={listRef}>
              <li>
                <Link to="/" className={location.pathname === '/' ? 'active' : ''} onClick={onHomeClick} aria-current={location.pathname === '/' ? 'page' : undefined}>
                  <MenuLabel icon="home" label={t('nav.home')} />
                </Link>
              </li>
              <li className={`has-mega${megaOpen ? ' open' : ''}`} onMouseEnter={openMega} onMouseLeave={closeMega}>
                <button type="button" aria-expanded={megaOpen} onClick={() => setMegaOpen((v) => !v)} onFocus={openMega}>
                  <MenuLabel icon="flower" label={t('menu.flowers')} /> <Icon name="chevron" size={14} className="caret" />
                </button>
                <div className="mega" onMouseEnter={openMega} onMouseLeave={closeMega}>
                  <MegaColumns onPick={() => setMegaOpen(false)} />
                  <Link className="mega-all" to="/catalog" onClick={() => setMegaOpen(false)}>{t('menu.allFlowers')} →</Link>
                </div>
              </li>
              {menuLinks.map((l) => (
                <li key={l.to} className={l.secondary ? 'mm-secondary' : l.own ? 'mm-own' : undefined}>
                  <Link to={l.to} className={isActive(l.to) ? 'active' : ''} aria-current={isActive(l.to) ? 'page' : undefined}>
                    <MenuLabel icon={l.icon} label={l.label} />
                  </Link>
                </li>
              ))}
              {topLinks.length > 0 && (
                <li className={`mm-more has-mega${moreOpen ? ' open' : ''}`} onMouseEnter={() => setMoreOpen(true)} onMouseLeave={() => setMoreOpen(false)}>
                  <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((v) => !v)}>
                    <MenuLabel icon="list" label={t('menu.more')} /> <Icon name="chevron" size={14} className="caret" />
                  </button>
                  <div className="mega mm-more-list">
                    {topLinks.slice(topLinks.length - moved).map((l) => (
                      <Link key={l.to} to={l.to} onClick={() => setMoreOpen(false)}>
                        <Icon name={l.icon} size={16} />{l.label}
                      </Link>
                    ))}
                  </div>
                </li>
              )}
              <li className="mm-indicator" ref={indicatorRef} aria-hidden="true" />
            </ul>
          </div>
        </nav>

        <div className={`search-bar${searchOpen ? ' open' : ''}`}>
          <div className="container">
            <form onSubmit={submitSearch} role="search">
              <input ref={mobileSearchRef} type="search" value={q} placeholder={t('search.ph')} aria-label={t('a11y.search')} onChange={(e) => setQ(e.target.value)} />
            </form>
            <SearchResults q={q} results={results} onPick={() => setSearchOpen(false)} />
          </div>
        </div>
      </header>

      <div className={`side-overlay${sideOpen ? ' show' : ''}`} onClick={() => setSideOpen(false)} />
      <aside className={`side-menu${sideOpen ? ' open' : ''}`} aria-hidden={!sideOpen} aria-label={t('menu.title')}>
        <div className="side-head">
          <Link className="brand" to="/">
            <img className="brand-logo" src={LOGO} alt="" />
            <span className="brand-name">Läle Gülleri</span>
          </Link>
          <button type="button" className="icon-btn" aria-label={t('menu.close')} onClick={() => setSideOpen(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <Link className="side-account" to={accountTo}>
          <Icon name="user" size={18} /> {accountLabel}
        </Link>
        <nav className="side-nav">
          <NavLink to="/" end onClick={onHomeClick}><MenuLabel icon="home" label={t('nav.home')} /></NavLink>
          <button type="button" className={`side-acc${sideFlowers ? ' open' : ''}`} aria-expanded={sideFlowers} onClick={() => setSideFlowers((v) => !v)}>
            <MenuLabel icon="flower" label={t('menu.flowers')} /> <Icon name="chevron" size={16} className="caret" />
          </button>
          {sideFlowers && (
            <div className="side-sub">
              <MegaColumns onPick={() => setSideOpen(false)} />
              <Link className="mega-all" to="/catalog" onClick={() => setSideOpen(false)}>{t('menu.allFlowers')} →</Link>
            </div>
          )}
          {menuLinks.map((l) => (
            <Link key={l.to} to={l.to} className={isActive(l.to) ? 'active' : ''}><MenuLabel icon={l.icon} label={l.label} /></Link>
          ))}
          <NavLink to="/delivery"><MenuLabel icon="truck" label={t('foot.delivery')} /></NavLink>
          <NavLink to="/track"><MenuLabel icon="box" label={t('top.track')} /></NavLink>
          <NavLink to="/favorites"><MenuLabel icon="heart" label={t('fav.title')} /></NavLink>
        </nav>
        <div className="side-foot">
          <LangSwitch />
          <button type="button" className="btn btn-outline btn-sm" onClick={toggle}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /> {t('profile.theme')}
          </button>
        </div>
      </aside>
    </>
  )
}
