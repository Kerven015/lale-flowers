import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import BottomNav from './BottomNav'
import { CardTilt, ScrollProgress } from '../motion/Ambient'
import { QuickViewProvider } from '../motion/QuickView'

export default function Layout() {
  const { pathname } = useLocation()

  // New page -> start at the top (smooth motion is handled by the fade-in)
  useEffect(() => {
    // Jump, don't glide: the site uses smooth scrolling, so switch it off for
    // this one jump. (behavior:'instant' is not understood by older phones.)
    const root = document.documentElement
    const before = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    window.scrollTo(0, 0)
    root.style.scrollBehavior = before
  }, [pathname])

  // QuickViewProvider sits inside the router, so links in the preview work
  return (
    <QuickViewProvider>
      <ScrollProgress enabled={/^\/(about|delivery|product\/)/.test(pathname)} />
      <CardTilt />
      <Header />
      <main>
        {/* keyed by path: each page change replays the soft fade-up */}
        <div className="page-enter" key={pathname}>
          <Outlet />
        </div>
      </main>
      <Footer />
      <BottomNav />
    </QuickViewProvider>
  )
}
