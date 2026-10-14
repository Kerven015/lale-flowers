// Menu structure for the header mega menu, side menu and catalog.

// "By occasion" column. Each occasion lists the catalog products that fit it.
// Flowers added later in the admin panel still appear under their type.
export const OCCASIONS = [
  { key: 'birthday', label: 'occ.birthday', ids: [9, 14, 6, 11, 5, 12] },
  { key: 'love', label: 'occ.love', ids: [1, 2, 8, 4, 7, 16] },
  { key: 'wedding', label: 'occ.wedding', ids: [10, 3, 16, 4] },
  { key: 'congrats', label: 'occ.congrats', ids: [7, 12, 9, 6, 15, 11] },
  { key: 'thanks', label: 'occ.thanks', ids: [5, 6, 11, 15, 14] },
  { key: 'home', label: 'occ.home', ids: [13, 5, 15] },
]

// "By flower type" column = the existing catalog categories.
export const FLOWER_TYPES = [
  { key: 'roses', to: '/roses' },
  { key: 'tulips', to: '/tulips' },
  { key: 'bouquets', to: '/bouquets' },
  { key: 'gifts', to: '/gifts' },
  { key: 'plants', to: '/catalog?cat=plants' },
]

export const occasionByKey = (key) => OCCASIONS.find((o) => o.key === key) || null

// Delivery cities. Same-day delivery is only possible inside Ashgabat
// (see delivery texts: "2 hours in Ashgabat, 1 day to regions").
export const CITIES = ['ashgabat', 'arkadag', 'anew', 'mary', 'turkmenabat', 'dashoguz', 'balkanabat', 'turkmenbashi']
export const CITY_SHORTCUTS = ['ashgabat', 'arkadag', 'mary', 'turkmenabat']
export const SAME_DAY_CITIES = ['ashgabat']
