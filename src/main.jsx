import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import App from './App'
import { startStore, store } from './store'
import { ThemeProvider } from './contexts/ThemeContext'
import { I18nProvider } from './contexts/I18nContext'
import { ToastProvider } from './contexts/ToastContext'
import { DeliveryProvider } from './contexts/DeliveryContext'
import './styles/style.css'
import './styles/animations.css'
import './styles/responsive.css'
import './styles/mobile.css'
import './styles/extra.css'
import './styles/storefront.css'
import './styles/gallery.css'
import './styles/admin.css'
import './styles/card.css'
import './styles/description.css'
import './styles/nav-icons.css'
import './styles/motion.css'

// Data the old browser-only version kept on this device (accounts, orders,
// admin changes). Everything now lives on the server, so it is removed.
try {
  for (const k of ['lale_users', 'lale_session', 'lale_orders', 'lale_admin_products', 'lale_admin_session', 'lale_google_profiles']) {
    localStorage.removeItem(k)
  }
} catch {}

// flowers + who is logged in (Redux, see src/store/)
startStore()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <Provider store={store}>
            <DeliveryProvider>
              <App />
            </DeliveryProvider>
          </Provider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
