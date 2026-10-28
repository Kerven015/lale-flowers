// Menu structure for the header mega menu, side menu and catalog.

// "By occasion" column, until the real list (admin → Menu) has loaded.
// ids = the original flowers shown under it (flowers never edited in the
// admin panel; migration 010 writes the same into the database).
export const OCCASIONS = [
  { key: 'birthday', label: 'occ.birthday', ids: [9, 14, 6, 11, 5, 12] },
  { key: 'love', label: 'occ.love', ids: [1, 2, 8, 4, 7, 16] },
  { key: 'wedding', label: 'occ.wedding', ids: [10, 3, 16, 4] },
  { key: 'congrats', label: 'occ.congrats', ids: [7, 12, 9, 6, 15, 11] },
  { key: 'thanks', label: 'occ.thanks', ids: [5, 6, 11, 15, 14] },
  { key: 'home', label: 'occ.home', ids: [13, 5, 15] },
]

// "By flower type" column. The real list (names, order) comes from the server
// (admin → Categories); this one is only used until it has loaded.
export const FLOWER_TYPES = [
  { key: 'roses', to: '/roses' },
  { key: 'tulips', to: '/tulips' },
  { key: 'bouquets', to: '/bouquets' },
  { key: 'gifts', to: '/gifts' },
  { key: 'plants', to: '/catalog?cat=plants' },
]

// The categories the shop came with keep their short addresses and icons;
// the ones the admin adds open at /category/<address>.
const CATEGORY_PATHS = { roses: '/roses', tulips: '/tulips', bouquets: '/bouquets', gifts: '/gifts', plants: '/catalog?cat=plants' }
const CATEGORY_ICONS = { roses: 'flower', tulips: 'blossom', bouquets: 'sparkles', gifts: 'gift', plants: 'sprout' }
export const categoryPath = (key) => CATEGORY_PATHS[key] || `/category/${key}`
export const occasionPath = (key) => `/catalog?occasion=${encodeURIComponent(key)}`
const OCCASION_ICONS = { birthday: 'cake', love: 'heart', wedding: 'gem', congrats: 'sparkles', thanks: 'handshake', home: 'home' }
export const occasionIcon = (key) => OCCASION_ICONS[key] || 'gift'
// icons used in the top menu bar for the shop's original categories
const MENU_CATEGORY_ICONS = { roses: 'blossom', bouquets: 'bouquet', gifts: 'gift' }
export const menuCategoryIcon = (key) => MENU_CATEGORY_ICONS[key] || categoryIcon(key)
// the top bar until the admin's list has loaded
export const DEFAULT_MENU = [
  { type: 'occasion', key: 'birthday' }, { type: 'occasion', key: 'love' },
  { type: 'category', key: 'roses' }, { type: 'category', key: 'bouquets' }, { type: 'category', key: 'gifts' },
]
export const categoryIcon = (key) => CATEGORY_ICONS[key] || 'tag'


// Delivery cities. Same-day delivery is only possible inside Ashgabat
// (see delivery texts: "2 hours in Ashgabat, 1 day to regions").
export const CITIES = ['ashgabat', 'arkadag', 'anew', 'mary', 'turkmenabat', 'dashoguz', 'balkanabat', 'turkmenbashi']
export const CITY_SHORTCUTS = ['ashgabat', 'arkadag', 'mary', 'turkmenabat']
export const SAME_DAY_CITIES = ['ashgabat']
