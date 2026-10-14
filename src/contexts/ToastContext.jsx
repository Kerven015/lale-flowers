import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Icon from '../components/Icons'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list, { id, message, type }])
    setTimeout(() => {
      setToasts((list) => list.filter((item) => item.id !== id))
    }, 2400)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {toasts.map((item) => (
          <div key={item.id} className={`toast${item.type === 'error' ? ' error' : ''}`} role="status">
            <span className="t-icon"><Icon name={item.type === 'error' ? 'alert' : 'check'} size={16} /></span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
