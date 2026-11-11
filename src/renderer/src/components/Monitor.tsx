import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'
import {
  ajustesDe,
  animacionCapa,
  capaNueva,
  TIPO_ARRASTRE_MEDIO,
  cambiarCapa,
  cambiarTexto,
  capasEn,
  FUENTES_TEXTO,
  textosEn,
  ubicar,
  VOLUMEN_SONIDO,
  zoomEn,
  type CapaTL,
  type SonidoTL,
  type Timeline
} from '../../../shared/timeline'
import { useMusica, useSincronizar, useTamano, useVoces, type FuentesVista, type Historial, type Reproductor } from '../hooks/timeline'
import type { Elegido } from './TimelineEditor'

/** Lo que se está moviendo en el monitor, antes de soltarlo: su sitio y su ancho. */
type Borrador = { tipo: 'capa' | 'texto'; id: string; x: number; y: number; ancho?: number } | null

/** A menos de esto del centro, se pega al centro (y se ve la guía). */
const IMAN = 0.02

/**
 * El monitor: la timeline sin renderizar. Dentro, un cuadro con la forma del video final donde
 * van las capas encima y los rótulos; se eligen con un clic y se mueven arrastrándolos (como en
 * la exportación, su sitio es una fracción del cuadro).
 */
export function Monitor({
  proyecto,
  timeline,
  reproductor,
  fuentes,
  medios,
  historial,
  elegido,
  onElegir
}: {
  proyecto: Project
  timeline: Timeline
  reproductor: Reproductor
  fuentes: FuentesVista
  /** Lo que dura cada medio (para validar las capas). */
  medios: Record<string, number>
  historial: Historial
  elegido: Elegido
  onElegir: (e: Elegido) => void
}) {
  const src = proyecto.demo ? undefined : mediaUrl(proyecto.id, proyecto.proxy ?? 'fuente')
  const enImagen = Boolean(reproductor.imagen)
  const rotulos = textosEn(timeline, reproductor.tiempo)
  const vacia = timeline.clips.length === 0
  const musicaRef = useMusica(timeline, reproductor, proyecto.transcript)
  const urlDe = useCallback((archivo: string) => mediaUrl(proyecto.id, archivo), [proyecto.id])
  const vocesRef = useVoces(timeline, reproductor, urlDe)
  const ubicado = ubicar(timeline, reproductor.tiempo)
  const clipActual = ubicado?.clip
  // Un clip mudo solo aporta imagen: su sonido va en las pistas de voz y música.
  useEffect(() => {
    if (reproductor.videoRef.current) reproductor.videoRef.current.muted = Boolean(clipActual?.mudo)
  }, [clipActual?.id, clipActual?.mudo, reproductor.videoRef])
  // Zoom, encuadre, acercamiento y color del clip bajo el cabezal; en el render son crop,
  // zoompan y eq de FFmpeg.
  const a = ajustesDe(clipActual)
  const largoClip = ubicado ? ubicado.fin - ubicado.inicio : 1
  const enClip = ubicado ? reproductor.tiempo - ubicado.inicio : 0
  const z = zoomEn(a, enClip / Math.max(0.01, largoClip))
  // El fundido de entrada: el clip aparece sobre negro (en el render, sobre el clip anterior).
  const fundido = clipActual?.fundido && ubicado && ubicado.indice > 0 ? Math.min(1, enClip / clipActual.fundido) : 1
  const estiloImagen: React.CSSProperties = {
    visibility: vacia ? 'hidden' : 'visible',
    transform: z !== 1 ? `scale(${z})` : undefined,
    transformOrigin: a.cx !== 0.5 || a.cy !== 0.5 ? `${a.cx * 100}% ${a.cy * 100}%` : undefined,
    opacity: fundido < 1 ? fundido : undefined,
    filter:
      a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1
        ? `brightness(${(1 + a.brillo * 1.5).toFixed(3)}) contrast(${a.contraste}) saturate(${a.saturacion})`
        : undefined
  }

  // El cuadro del video final dentro del monitor (el video se ve con object-fit: contain).
  const monitorRef = useRef<HTMLDivElement>(null)
  const tam = useTamano(monitorRef)
  const proporcion = (proyecto.source.width || 16) / (proyecto.source.height || 9)
  const cw = tam ? Math.min(tam.w, tam.h * proporcion) : 0
  const ch = cw / proporcion
  // El tamaño de letra sigue al de la exportación (una fracción del lado corto).
  const letra = Math.min(cw, ch) * (ch > cw ? 0.06 : 0.065) * 0.93

  const [borrador, setBorrador] = useState<Borrador>(null)
  const [guia, setGuia] = useState<{ v: boolean; h: boolean }>({ v: false, h: false })
  const capas = capasEn(timeline, reproductor.tiempo)
  const [soltando, setSoltando] = useState(false)

  /** Un medio de la biblioteca soltado sobre el monitor: queda encima, donde se soltó. */
  function soltar(e: React.DragEvent) {
    setSoltando(false)
    const fuente = e.dataTransfer.getData(TIPO_ARRASTRE_MEDIO)
    const f = fuentes[fuente]
    if (!fuente || fuente === 'principal' || !f) return
    e.preventDefault()
    const cuadro = (e.currentTarget as HTMLElement).querySelector('.monitor-cuadro')?.getBoundingClientRect()
    const x = cuadro ? Math.max(0, Math.min(1, (e.clientX - cuadro.left) / cuadro.width)) : 0.5
    const y = cuadro ? Math.max(0, Math.min(1, (e.clientY - cuadro.top) / cuadro.height)) : 0.5
    const r = capaNueva(timeline, fuente, f.tipo, reproductor.tiempo, medios, x, y)
    if (r.timeline === timeline) return
    historial.aplicar(r.timeline)
    onElegir({ tipo: 'capa', id: r.id })
  }

  /** Mueve una capa o un rótulo con el ratón (o cambia el ancho de la capa por su esquina). */
  function arrastrar(e: React.PointerEvent, tipo: 'capa' | 'texto', id: string, inicio: { x: number; y: number; ancho?: number }, modo: 'mover' | 'ancho' = 'mover') {
    if (e.button !== 0 || !cw) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const y0 = e.clientY
    let movido = false
    let ultimo: Borrador = null
    const calcular = (ev: PointerEvent): Borrador => {
      if (modo === 'ancho') {
        const ancho = Math.max(0.05, Math.min(1, (inicio.ancho ?? 0.3) + ((ev.clientX - x0) * 2) / cw))
        return { tipo, id, x: inicio.x, y: inicio.y, ancho }
      }
      let x = Math.max(0, Math.min(1, inicio.x + (ev.clientX - x0) / cw))
      let y = Math.max(0, Math.min(1, inicio.y + (ev.clientY - y0) / ch))
      const v = Math.abs(x - 0.5) < IMAN
      const h = Math.abs(y - 0.5) < IMAN
      if (v) x = 0.5
      if (h) y = 0.5
      setGuia({ v, h })
      return { tipo, id, x, y, ...(inicio.ancho !== undefined ? { ancho: inicio.ancho } : {}) }
    }
    const alMover = (ev: PointerEvent) => {
      if (!movido && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return
      movido = true
      ultimo = calcular(ev)
      setBorrador(ultimo)
    }
    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
      if (movido) ultimo = calcular(ev)
      setBorrador(null)
      setGuia({ v: false, h: false })
      if (movido && ultimo) {
        const b = ultimo
        historial.aplicar(
          tipo === 'capa'
            ? cambiarCapa(timeline, id, { x: b.x, y: b.y, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) }, medios)
            : cambiarTexto(timeline, id, { x: b.x, y: b.y })
        )
      }
      onElegir({ tipo, id })
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  return (
    <div
      className={`monitor ${soltando ? 'is-destino' : ''}`}
      ref={monitorRef}
      onClick={reproductor.alternar}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TIPO_ARRASTRE_MEDIO)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!soltando) setSoltando(true)
      }}
      onDragLeave={() => setSoltando(false)}
      onDrop={soltar}
    >
      {src ? (
        <>
          <video
            ref={reproductor.videoRef}
            preload="auto"
            style={{ ...estiloImagen, visibility: vacia || enImagen ? 'hidden' : 'visible' }}
            {...reproductor.eventos}
          />
          {enImagen && <img className="monitor-imagen" src={reproductor.imagen!} alt="" style={estiloImagen} />}
        </>
      ) : (
        <div className="monitor-vacio"><Icon name="play" size={28} /></div>
      )}
      {timeline.musica && !proyecto.demo && (
        <audio ref={musicaRef} src={mediaUrl(proyecto.id, timeline.musica.archivo)} preload="auto" loop />
      )}
      {timeline.voces?.length && !proyecto.demo ? <audio ref={vocesRef} preload="auto" /> : null}
      {!proyecto.demo &&
        (timeline.sonidos ?? []).map((s) => (
          <SonidoVista key={s.id} sonido={s} url={urlDe(s.archivo)} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} />
        ))}
      {cw > 0 && (
        <div className="monitor-cuadro" style={{ width: cw, height: ch, ['--rotulo' as string]: `${letra.toFixed(1)}px` }}>
          {capas.map((c) => {
            const f = fuentes[c.fuente]
            if (!f) return null
            const b = borrador?.tipo === 'capa' && borrador.id === c.id ? borrador : null
            const x = b?.x ?? c.x
            const y = b?.y ?? c.y
            const ancho = b?.ancho ?? c.ancho
            // La entrada (pop, fundido) se ve al reproducir; en pausa, la capa entera para poder editarla.
            const { escala, opacidad } = b || !reproductor.reproduciendo ? { escala: 1, opacidad: 1 } : animacionCapa(c, reproductor.tiempo - c.inicio)
            const elegida = elegido?.tipo === 'capa' && elegido.id === c.id
            return (
              <div
                key={c.id}
                className={`monitor-capa ${elegida ? 'is-elegida' : ''}`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${ancho * 100}%`,
                  transform: `translate(-50%, -50%) scale(${escala})`,
                  opacity: opacidad
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => arrastrar(e, 'capa', c.id, { x: c.x, y: c.y, ancho: c.ancho })}
              >
                {f.tipo === 'imagen' ? (
                  <img src={f.url} alt="" draggable={false} />
                ) : (
                  <CapaVideo capa={c} url={f.url} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} />
                )}
                {elegida && (
                  <span
                    className="monitor-capa-esquina"
                    title="Arrastra para cambiar el tamaño"
                    onPointerDown={(e) => arrastrar(e, 'capa', c.id, { x: c.x, y: c.y, ancho: c.ancho }, 'ancho')}
                  />
                )}
              </div>
            )
          })}
          {rotulos.map((r) => {
            const b = borrador?.tipo === 'texto' && borrador.id === r.id ? borrador : null
            const libre = b ?? (typeof r.x === 'number' && typeof r.y === 'number' ? { x: r.x, y: r.y } : null)
            const elegida = elegido?.tipo === 'texto' && elegido.id === r.id
            return (
              <span
                key={r.id}
                className={`monitor-rotulo ${libre ? 'libre' : r.posicion} ${r.sinCaja ? 'sin-caja' : ''} ${elegida ? 'is-elegida' : ''}`}
                style={{
                  ...(libre ? { left: `${libre.x * 100}%`, top: `${libre.y * 100}%` } : {}),
                  ...(r.tamano ? { fontSize: `calc(var(--rotulo) * ${r.tamano})` } : {}),
                  ...(r.color ? { color: r.color } : {}),
                  ...(r.caja && !r.sinCaja ? { background: r.caja } : {}),
                  ...(r.fuente && FUENTES_TEXTO[r.fuente]
                    ? { fontFamily: `"${FUENTES_TEXTO[r.fuente].familia}", Arial, sans-serif`, fontWeight: FUENTES_TEXTO[r.fuente].negrita ? 700 : 400 }
                    : {})
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  // Sin posición libre todavía: parte de donde se ve ahora.
                  let inicio = libre
                  if (!inicio) {
                    const caja = e.currentTarget.getBoundingClientRect()
                    const cuadro = e.currentTarget.parentElement!.getBoundingClientRect()
                    inicio = { x: (caja.left + caja.width / 2 - cuadro.left) / cuadro.width, y: (caja.top + caja.height / 2 - cuadro.top) / cuadro.height }
                  }
                  arrastrar(e, 'texto', r.id, inicio)
                }}
              >
                {r.texto}
              </span>
            )
          })}
          {guia.v && <span className="monitor-guia v" />}
          {guia.h && <span className="monitor-guia h" />}
        </div>
      )}
      {!reproductor.reproduciendo && src && !vacia && (
        <span className="monitor-play"><Icon name="play" size={26} /></span>
      )}
    </div>
  )
}

/** Una toma de apoyo encima: un video mudo que sigue al cabezal. */
function CapaVideo({ capa, url, tiempo, reproduciendo }: { capa: CapaTL; url: string; tiempo: number; reproduciendo: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useSincronizar(ref, (capa.desde ?? 0) + Math.max(0, tiempo - capa.inicio), reproduciendo)
  return <video ref={ref} src={url} muted preload="auto" />
}

/** Un efecto de sonido: suena solo en su tramo. */
function SonidoVista({ sonido, url, tiempo, reproduciendo }: { sonido: SonidoTL; url: string; tiempo: number; reproduciendo: boolean }) {
  const ref = useRef<HTMLAudioElement>(null)
  const dentro = tiempo >= sonido.inicio && tiempo < sonido.inicio + sonido.duracion
  useSincronizar(ref, dentro ? tiempo - sonido.inicio : null, reproduciendo, sonido.volumen ?? VOLUMEN_SONIDO)
  return <audio ref={ref} src={url} preload="auto" />
}
