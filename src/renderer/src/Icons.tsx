import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Film,
  Folder,
  Gift,
  Image,
  KeyRound,
  Layers,
  LogOut,
  Music,
  Palette,
  Paperclip,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Upload,
  X,
  type LucideIcon
} from 'lucide-react'

/**
 * Los iconos de la app, de Lucide (licencia ISC, uso comercial permitido): un solo
 * set dibujado con la misma retícula y el mismo trazo, para que ninguno desentone.
 * El nombre de cada uno es el de la app; si falta uno, se agrega aquí.
 */

const ICONOS = {
  scissors: Scissors,
  folder: Folder,
  palette: Palette,
  settings: Settings,
  upload: Upload,
  sparkles: Sparkles,
  play: Play,
  check: Check,
  x: X,
  film: Film,
  chevron: ChevronRight,
  sliders: SlidersHorizontal,
  clock: Clock,
  download: Download,
  plus: Plus,
  search: Search,
  layers: Layers,
  pause: Pause,
  undo: Undo2,
  redo: Redo2,
  type: Type,
  trash: Trash2,
  copy: Copy,
  music: Music,
  key: KeyRound,
  paperclip: Paperclip,
  image: Image,
  gift: Gift,
  alerta: TriangleAlert,
  'log-out': LogOut
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONOS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const Dibujo = ICONOS[name] ?? Sparkles
  return <Dibujo size={size} strokeWidth={size <= 14 ? 2 : 1.75} absoluteStrokeWidth={false} aria-hidden="true" focusable={false} />
}
