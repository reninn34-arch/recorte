import type { EstadoAgente, ProveedorApi } from '../../../shared/api'
import antigravity from '../assets/logos/antigravity-color.svg?raw'
import claude from '../assets/logos/claude.svg?raw'
import deepseek from '../assets/logos/deepseek.svg?raw'
import ffmpeg from '../assets/logos/ffmpeg.svg?raw'
import gemini from '../assets/logos/gemini-color.svg?raw'
import grok from '../assets/logos/grok.svg?raw'
import kimi from '../assets/logos/kimi.svg?raw'
import node from '../assets/logos/nodedotjs.svg?raw'
import openai from '../assets/logos/openai.svg?raw'
import opencode from '../assets/logos/opencode.svg?raw'
import python from '../assets/logos/python.svg?raw'

/**
 * Los logos oficiales de cada servicio (Lobe Icons, MIT, y Simple Icons, CC0; ver
 * `assets/logos/LICENCIAS.md`), sobre el fondo de su marca. Los SVG son archivos locales de
 * la app, no contenido externo: se insertan tal cual para poder pintarlos con `color`.
 */

interface Marca {
  svg: string
  fondo: string
  color: string
  borde?: boolean
  /** Qué parte del cuadro ocupa el logo. */
  escala?: number
}

const MARCAS: Record<string, Marca> = {
  claude: { svg: claude, fondo: '#d97757', color: '#ffffff' },
  codex: { svg: openai, fondo: '#000000', color: '#ffffff', borde: true },
  gemini: { svg: gemini, fondo: '#131314', color: '#ffffff', borde: true },
  'gemini-api': { svg: gemini, fondo: '#131314', color: '#ffffff', borde: true },
  kimi: { svg: kimi, fondo: '#000000', color: '#ffffff', borde: true },
  opencode: { svg: opencode, fondo: '#ffffff', color: '#0a0a0a', escala: 0.5 },
  antigravity: { svg: antigravity, fondo: '#0e0f13', color: '#ffffff', borde: true },
  deepseek: { svg: deepseek, fondo: '#4d6bfe', color: '#ffffff' },
  grok: { svg: grok, fondo: '#000000', color: '#ffffff', borde: true },
  ffmpeg: { svg: ffmpeg, fondo: '#007808', color: '#ffffff', escala: 0.56 },
  python: { svg: python, fondo: '#20232a', color: '#ffd43b', borde: true, escala: 0.56 },
  node: { svg: node, fondo: '#20232a', color: '#5fa04e', borde: true, escala: 0.56 }
}

function Logo({ marca, size }: { marca: Marca; size: number }) {
  return (
    <span
      className="logo-agente"
      aria-hidden="true"
      style={
        {
          width: size,
          height: size,
          borderRadius: size * 0.26,
          background: marca.fondo,
          color: marca.color,
          border: marca.borde ? '1px solid #2e2e2e' : undefined,
          '--logo-escala': `${Math.round((marca.escala ?? 0.62) * 100)}%`
        } as React.CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: marca.svg }}
    />
  )
}

export function LogoAgente({ id, size = 36 }: { id: EstadoAgente['id']; size?: number }) {
  return <Logo marca={MARCAS[id] ?? MARCAS.claude} size={size} />
}

/** Los proveedores con llave de API (sin programa que instalar). */
export function LogoProveedor({ id, size = 36 }: { id: ProveedorApi['id']; size?: number }) {
  return <Logo marca={MARCAS[id] ?? MARCAS.gemini} size={size} />
}

/** Las herramientas de video de Ajustes. */
export function LogoHerramienta({ id, size = 36 }: { id: 'ffmpeg' | 'python' | 'node'; size?: number }) {
  return <Logo marca={MARCAS[id]} size={size} />
}

export const PLAN_DE: Record<EstadoAgente['id'], string> = {
  claude: 'Tu plan Claude Pro o Max',
  codex: 'Tu cuenta de ChatGPT',
  gemini: 'Tu llave de AI Studio (gratis) o tu cuenta de Google',
  kimi: 'Tu membresía de Kimi',
  opencode: 'Tu cuenta de OpenCode · modelos gratis con límites',
  antigravity: 'Tu cuenta de Google · los modelos de Antigravity'
}
