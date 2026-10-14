import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CITIES, SAME_DAY_CITIES } from '../data/navigation'

const KEY = 'lale_city'
const DeliveryContext = createContext(null)

function storedCity() {
  try {
    const v = localStorage.getItem(KEY)
    return CITIES.includes(v) ? v : 'ashgabat'
  } catch {
    return 'ashgabat'
  }
}

export function DeliveryProvider({ children }) {
  const [city, setCityState] = useState(storedCity)
  const setCity = useCallback((next) => {
    const v = CITIES.includes(next) ? next : 'ashgabat'
    setCityState(v)
    try { localStorage.setItem(KEY, v) } catch {}
  }, [])
  const sameDayCity = SAME_DAY_CITIES.includes(city)
  // A product can arrive today when it is in stock and the city allows it.
  const isSameDay = useCallback((p) => !!p?.inStock && sameDayCity, [sameDayCity])
  const value = useMemo(() => ({ city, setCity, sameDayCity, isSameDay }), [city, setCity, sameDayCity, isSameDay])
  return <DeliveryContext.Provider value={value}>{children}</DeliveryContext.Provider>
}

export function useDelivery() {
  return useContext(DeliveryContext)
}
