import { useCallback, useEffect, useRef, useState } from 'react'
import type { Project } from '../../../shared/types'
import { Icon } from '../Icons'
import { mediaUrl } from '../media'
import {
  ajustesDe,
  APARECER_S,
  pasoAnimacion,
  vistaTransicion,
  capaNueva,
  estadoCapa,
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
  type FiltrosTL,
  type SonidoTL,
  type TextoTL,
  type Timeline
} from '../../../shared/timeline'
import { useMusica, useSincronizar, useTamano, useVoces, type FuentesVista, type Historial, type Reproductor } from '../hooks/timeline'
import type { Elegido } from './TimelineEditor'

/** Lo que se está moviendo en el monitor, antes de soltarlo: su sitio y su ancho. */
type Borrador = { tipo: 'capa' | 'texto'; id: string; x: number; y: number; ancho?: number; fin?: boolean } | null

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
  // La transición de entrada: el clip entra sobre negro (en el render, sobre el clip anterior), con su tipo
  // (fundido, barrido, zoom, desenfoque, destello, círculo).
  const tr = clipActual?.fundido && ubicado && ubicado.indice > 0 && enClip < clipActual.fundido ? vistaTransicion(clipActual.transicion, enClip / clipActual.fundido) : null
  const fundido = tr ? tr.opacidad : 1
  const estiloImagen: React.CSSProperties = {
    visibility: vacia ? 'hidden' : 'visible',
    transform:
      z !== 1 || tr
        ? `${tr && (tr.x || tr.y) ? `translate(${(tr.x * 100).toFixed(2)}%, ${(tr.y * 100).toFixed(2)}%) ` : ''}scale(${(z * (tr?.escala ?? 1)).toFixed(4)})`
        : undefined,
    clipPath: tr?.circulo != null ? `circle(${(tr.circulo * 75).toFixed(2)}% at 50% 50%)` : undefined,
    transformOrigin: a.cx !== 0.5 || a.cy !== 0.5 ? `${a.cx * 100}% ${a.cy * 100}%` : undefined,
    opacity: fundido < 1 ? fundido : undefined,
    filter:
      tr?.desenfoque
        ? `blur(${tr.desenfoque.toFixed(1)}px) brightness(${(1 + a.brillo * 1.5).toFixed(3)}) contrast(${a.contraste}) saturate(${a.saturacion})`
        : a.brillo !== 0 || a.contraste !== 1 || a.saturacion !== 1
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
  function arrastrar(
    e: React.PointerEvent,
    tipo: 'capa' | 'texto',
    id: string,
    inicio: { x: number; y: number; ancho?: number },
    modo: 'mover' | 'ancho' = 'mover',
    /** Mueve dónde TERMINA una capa que se mueve (su silueta punteada). */
    fin = false
  ) {
    if (e.button !== 0 || !cw) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    const y0 = e.clientY
    let movido = false
    let ultimo: Borrador = null
    const calcular = (ev: PointerEvent): Borrador => {
      if (modo === 'ancho') {
        const ancho = Math.max(0.05, Math.min(fin ? 1.5 : 1, (inicio.ancho ?? 0.3) + ((ev.clientX - x0) * 2) / cw))
        return { tipo, id, x: inicio.x, y: inicio.y, ancho, fin }
      }
      // El final de un recorrido puede quedar fuera del cuadro (para salir volando).
      const [lo, hi] = fin ? [-0.5, 1.5] : [0, 1]
      let x = Math.max(lo, Math.min(hi, inicio.x + (ev.clientX - x0) / cw))
      let y = Math.max(lo, Math.min(hi, inicio.y + (ev.clientY - y0) / ch))
      const v = Math.abs(x - 0.5) < IMAN
      const h = Math.abs(y - 0.5) < IMAN
      if (v) x = 0.5
      if (h) y = 0.5
      setGuia({ v, h })
      return { tipo, id, x, y, ...(inicio.ancho !== undefined ? { ancho: inicio.ancho } : {}), fin }
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
        const capa = tipo === 'capa' ? timeline.capas?.find((c) => c.id === id) : undefined
        historial.aplicar(
          tipo === 'capa'
            ? b.fin && capa?.fin
              ? cambiarCapa(timeline, id, { fin: { ...capa.fin, x: b.x, y: b.y, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) } }, medios)
              : cambiarCapa(timeline, id, { x: b.x, y: b.y, ...(b.ancho !== undefined ? { ancho: b.ancho } : {}) }, medios)
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
            const elegida = elegido?.tipo === 'capa' && elegido.id === c.id
            // Elegida y en pausa, una capa que se mueve se ve en su sitio de INICIO (sólida) y en el
            // de FIN (silueta punteada), las dos para arrastrarlas. Si no, donde va en este momento.
            const editando = elegida && !reproductor.reproduciendo
            const b = borrador?.tipo === 'capa' && borrador.id === c.id ? borrador : null
            const e = editando ? estadoCapa(c, 0, false) : estadoCapa(c, reproductor.tiempo - c.inicio, reproductor.reproduciendo)
            const x = b && !b.fin ? b.x : e.x
            const y = b && !b.fin ? b.y : e.y
            const ancho = b && !b.fin ? (b.ancho ?? e.ancho) : e.ancho
            const fin = editando && c.fin ? { ...c.fin, ...(b?.fin ? { x: b.x, y: b.y, ancho: b.ancho ?? c.fin.ancho } : {}) } : null
            return (
              <div key={c.id} className="monitor-capa-grupo">
                {fin && (
                  <>
                    <svg className="monitor-recorrido" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <line x1={x * 100} y1={y * 100} x2={fin.x * 100} y2={fin.y * 100} />
                    </svg>
                    <div
                      className="monitor-capa is-fin"
                      title="Dónde termina: arrástrala"
                      style={{ left: `${fin.x * 100}%`, top: `${fin.y * 100}%`, width: `${fin.ancho * 100}%`, transform: `translate(-50%, -50%) rotate(${fin.giro}deg)` }}
                      onClick={(ev) => ev.stopPropagation()}
                      onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.fin!.x, y: c.fin!.y, ancho: c.fin!.ancho }, 'mover', true)}
                    >
                      {f.tipo === 'imagen' ? <img src={f.url} alt="" draggable={false} /> : <span className="monitor-capa-hueco" />}
                      <span
                        className="monitor-capa-esquina"
                        title="Arrastra para cambiar el tamaño final"
                        onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.fin!.x, y: c.fin!.y, ancho: c.fin!.ancho }, 'ancho', true)}
                      />
                    </div>
                  </>
                )}
              <div
                className={`monitor-capa ${elegida ? 'is-elegida' : ''}`}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${ancho * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${e.giro}deg) scale(${e.escala})`,
                  opacity: e.opacidad
                }}
                onClick={(ev) => ev.stopPropagation()}
                onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.x, y: c.y, ancho: c.ancho })}
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
                    onPointerDown={(ev) => arrastrar(ev, 'capa', c.id, { x: c.x, y: c.y, ancho: c.ancho }, 'ancho')}
                  />
                )}
              </div>
              </div>
            )
          })}
          {tr && tr.blanco > 0 && <div className="monitor-filtros" style={{ background: '#fff', opacity: tr.blanco }} aria-hidden />}
          {timeline.filtros && <FiltrosVista filtros={timeline.filtros} tiempo={reproductor.tiempo} reproduciendo={reproductor.reproduciendo} ancho={cw} alto={ch} />}
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
                    ? {
                        fontFamily: `"${FUENTES_TEXTO[r.fuente].familia}", Arial, sans-serif`,
                        fontWeight: FUENTES_TEXTO[r.fuente].negrita ? 700 : 400,
                        fontStyle: FUENTES_TEXTO[r.fuente].cursiva ? 'italic' : 'normal'
                      }
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
                {reproductor.reproduciendo && r.animacion ? <TextoAnimado texto={r} dt={reproductor.tiempo - r.inicio} /> : r.texto}
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

/**
 * Los filtros del video en el monitor, como en el MP4: la viñeta y la trama son degradados; el
 * grano y el polvo, un lienzo que cambia en cada cuadro al reproducir; el parpadeo, un velo que tiembla.
 */
function FiltrosVista({ filtros, tiempo, reproduciendo, ancho, alto }: { filtros: FiltrosTL; tiempo: number; reproduciendo: boolean; ancho: number; alto: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const { grano = 0, polvo = 0, trama = 0, vineta = 0, parpadeo = 0 } = filtros
  useEffect(() => {
    const cv = lienzo.current
    if (!cv || (!grano && !polvo)) return
    const w = Math.max(16, Math.round(ancho / 3))
    const h = Math.max(16, Math.round(alto / 3))
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')
    if (!ctx) return
    let cuadro = 0
    let vivo = true
    const pintar = () => {
      const img = ctx.createImageData(w, h)
      const d = img.data
      for (let i = 0; i < d.length; i += 4) {
        // Grano: gris al azar alrededor del medio (se mezcla en «overlay»); polvo: alguna mota blanca.
        const g = 128 + (Math.random() - 0.5) * 255 * grano
        const mota = polvo && Math.random() > 1 - 0.0016 * polvo
        const v = mota ? 255 : g
        d[i] = d[i + 1] = d[i + 2] = v
        d[i + 3] = mota ? 255 : grano ? 255 : 0
      }
      ctx.putImageData(img, 0, 0)
      // La raya vertical que salta de sitio, como en el MP4.
      if (polvo && cuadro % 7 > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillRect((cuadro * 97) % w, 0, 1, h)
      }
      cuadro++
    }
    pintar()
    if (!reproduciendo) return
    const id = window.setInterval(() => vivo && pintar(), 1000 / 24)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [grano, polvo, reproduciendo, ancho, alto])
  const brillo = parpadeo ? 0.045 * parpadeo * Math.sin(tiempo * 31) * Math.sin(tiempo * 7.3) : 0
  const punto = Math.max(2, ancho / 180)
  return (
    <div className="monitor-filtros" aria-hidden>
      {trama > 0 && (
        <div
          className="monitor-filtro"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.85) 30%, rgba(255,255,255,0.6) 62%)',
            backgroundSize: `${punto}px ${punto}px`,
            mixBlendMode: 'overlay',
            opacity: 0.45 * trama
          }}
        />
      )}
      {(grano > 0 || polvo > 0) && <canvas ref={lienzo} className="monitor-filtro" style={{ mixBlendMode: grano ? 'overlay' : 'screen', opacity: Math.min(1, 0.35 + 0.5 * Math.max(grano, polvo)) }} />}
      {vineta > 0 && (
        <div className="monitor-filtro" style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(70 - 30 * vineta)}%, rgba(0,0,0,${(0.9 * vineta).toFixed(2)}) 100%)` }} />
      )}
      {brillo !== 0 && <div className="monitor-filtro" style={{ background: brillo > 0 ? '#fff' : '#000', opacity: Math.abs(brillo) }} />}
    </div>
  )
}

/** Un rótulo que aparece palabra a palabra, letra a letra, con rebote o subiendo (como en el MP4). */
function TextoAnimado({ texto, dt }: { texto: TextoTL; dt: number }) {
  if (texto.animacion === 'pop' || texto.animacion === 'subir') {
    const e = texto.animacion === 'pop' ? (dt < 0.13 ? 0.45 + (dt / 0.13) * 0.72 : dt < 0.24 ? 1.17 - ((dt - 0.13) / 0.11) * 0.17 : 1) : 1
    const sube = texto.animacion === 'subir' ? Math.max(0, 1 - dt / 0.35) : 0
    const op = Math.min(1, dt / (texto.animacion === 'pop' ? 0.08 : 0.25))
    return <span style={{ display: 'inline-block', transform: `translateY(${(sube * 0.6).toFixed(3)}em) scale(${e.toFixed(3)})`, opacity: op }}>{texto.texto}</span>
  }
  const paso = pasoAnimacion(texto)
  const piezas = texto.animacion === 'palabras' ? texto.texto.split(/(\s+)/) : Array.from(texto.texto)
  let n = 0
  return (
    <>
      {piezas.map((x, i) => {
        if (!x || /^\s+$/.test(x)) return x
        const op = Math.max(0, Math.min(1, (dt - n++ * paso) / APARECER_S))
        return (
          <span key={i} style={{ opacity: op }}>
            {x}
          </span>
        )
      })}
    </>
  )
}
