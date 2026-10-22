// One icon set for the whole site: lucide-react line icons.
// Thin 1.5px stroke at every size, colour = currentColor (inherits the text
// or accent colour of whatever it sits in).
import {
  ArrowUpDown,
  Banknote,
  Bell,
  BellOff,
  ClipboardList,
  Copy,
  Percent,
  Settings,
  Inbox,
  KeyRound,
  RefreshCw,
  Users,
  Cake,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  CreditCard,
  Flower,
  Flower2,
  Gem,
  Gift,
  Globe,
  Heart,
  Info,
  ImagePlus,
  Italic,
  LayoutGrid,
  List,
  HeartHandshake,
  House,
  Instagram,
  Leaf,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  Palette,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Store,
  Sun,
  Moon,
  Tag,
  Trash2,
  Truck,
  User,
  Wallet,
  X,
  Zap,
} from 'lucide-react'

// Thin-line bouquet in the same style as the lucide icons (24×24 grid,
// round caps, currentColor stroke). lucide has no bouquet icon.
function Bouquet({ size = 24, strokeWidth = 1.5, absoluteStrokeWidth, className = '', ...rest }) {
  const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide lucide-bouquet ${className}`.trim()}
      {...rest}
    >
      <path d="M12 10.5c-2.1 0-3.4-1.6-3.4-3.7V2.8l1.7 1.3L12 2.5l1.7 1.6 1.7-1.3v4c0 2.1-1.3 3.7-3.4 3.7z" />
      <path d="M8 13.6c-2.6-.2-4.3-2-4.3-4.6 2.6.2 4.3 2 4.3 4.6z" />
      <path d="M16 13.6c2.6-.2 4.3-2 4.3-4.6-2.6.2-4.3 2-4.3 4.6z" />
      <path d="M12 10.5V14" />
      <path d="M7.5 14h9L12 22z" />
    </svg>
  )
}

const ICONS = {
  // commerce / account
  truck: Truck,
  store: Store,
  card: CreditCard,
  cash: Banknote,
  cart: ShoppingBag,
  heart: Heart,
  user: User,
  box: Package,
  gift: Gift,
  tag: Tag,
  lock: Lock,
  logout: LogOut,
  // flowers
  flower: Flower2,
  blossom: Flower,
  sprout: Sprout,
  leaf: Leaf,
  sparkles: Sparkles,
  gem: Gem,
  // contact
  phone: Phone,
  mail: Mail,
  pin: MapPin,
  clock: Clock,
  instagram: Instagram,
  message: MessageCircle,
  globe: Globe,
  // trust
  shield: ShieldCheck,
  smile: Smile,
  handshake: HeartHandshake,
  zap: Zap,
  // ui
  home: House,
  search: Search,
  close: X,
  check: Check,
  edit: Pencil,
  alert: CircleAlert,
  chevron: ChevronDown,
  prev: ChevronLeft,
  next: ChevronRight,
  imageAdd: ImagePlus,
  cake: Cake,
  grid: LayoutGrid,
  info: Info,
  wallet: Wallet,
  palette: Palette,
  packageCheck: PackageCheck,
  bouquet: Bouquet,
  bold: Bold,
  italic: Italic,
  list: List,
  sort: ArrowUpDown,
  filter: SlidersHorizontal,
  plus: Plus,
  trash: Trash2,
  star: Star,
  sun: Sun,
  moon: Moon,
  bell: Bell,
  bellOff: BellOff,
  orders: ClipboardList,
  copy: Copy,
  percent: Percent,
  settings: Settings,
  inbox: Inbox,
  key: KeyRound,
  refresh: RefreshCw,
  users: Users,
}

export default function Icon({ name, size = 18, strokeWidth = 1.5, className = '', ...rest }) {
  const Cmp = ICONS[name]
  if (!Cmp) return null
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={`ico ${className}`.trim()}
      data-icon={name}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  )
}
