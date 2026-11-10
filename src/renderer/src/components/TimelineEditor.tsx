import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ajustarClip,
  ajustesDe,
  anadirTexto,
  cambiarMusica,
  ponerMusica,
  LIMITES_TAMANO,
  FUENTES_TEXTO,
  MAX_FUNDIDO,
  fundirClip,
  type AjustesClip,
  type MusicaTL,
  borrarClip,
  borrarTexto,
  cambiarTexto,
  dividir,
  duplicarClip,
  duracionTimeline,
  DURACION_MINIMA,
  moverClip,
  puntosIman,
  recortarClip,
  tramos,
  vozEnTimeline,
  type PosicionTexto,
  type Timeline,
  borrarVoz,
  cambiarVoz,
  silenciarClip
} from '../../../shared/timeline'
import type { OpcionesExport } from '../../../shared/api'
import type { TranscriptSegment } from '../../../shared/types'
import type { Historial } from '../hooks/timeline'
import { Icon } from '../Icons'
import { InspectorVoz, type GenerarVoz } from './InspectorVoz'

/**
 * La timeline editable: regla, pista de video magnética, pista de textos y la voz
 * (la transcripción en tiempo de timeline). Todo cambio pasa por `historial.aplicar`,
 * así que todo se puede deshacer; mientras se arrastra, se enseña un borrador.
 */

export interface ControlExportar {
  activo: boolean
  pct: number
  hayTranscripcion: boolean
  hayArchivo: boolean
  /** El material ya es vertical: el formato «original» ya es 9:16. */
  vertical: boolean
  onExportar: (opciones: OpcionesExport) => void
  onAbrir: () => void
  /** Dónde va a quedar el MP4. */
  destino?: string
}

export type Elegido = { tipo: 'clip' | 'texto' | 'musica' | 'voz'; id: string } | null

const IMAN_PX = 8
const PASOS_REGLA = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200]

/** 75.4 → "1:15.4" */
export function tc(segundos: number, decimas = true): string {
  const s = Math.max(0, segundos)
  const min = Math.floor(s / 60)
  const resto = s - min * 60
  const entero = Math.floor(resto)
  const base = `${min}:${String(entero).padStart(2, '0')}`
  return decimas ? `${base}.${Math.floor((resto - entero) * 10)}` : base
}

function esCampoDeTexto(objetivo: EventTarget | null): boolean {
  const el = objetivo as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function TimelineEditor({
  timeline,
  duracionFuente,
  duracionDe,
  nombreDe,
  onAgregarClips,
  agregandoClips,
  transcript,
  tiempo,
  reproduciendo,
  onBuscar,
  onAlternar,
  historial,
  elegido,
  onElegir,
  exportar,
  importarMusica,
  generarVoz,
  onCambiarArchivo
}: {
  timeline: Timeline
  duracionFuente: number
  /** Lo que puede durar cada fuente (el video principal, otro video, una imagen). */
  duracionDe?: (fuente: string) => number
  nombreDe?: (fuente: string) => string
  /** Agrega varios videos o imágenes y los pone al final. */
  onAgregarClips?: () => void
  agregandoClips?: boolean
  transcript?: TranscriptSegment[]
  tiempo: number
  reproduciendo: boolean
  onBuscar: (t: number) => void
  onAlternar: () => void
  historial: Historial
  elegido: Elegido
  onElegir: (e: Elegido) => void
  exportar: ControlExportar
  /** Abre el selector de audio; devuelve la pista copiada al proyecto o null. */
  importarMusica: () => Promise<MusicaTL | null>
  /** Genera una frase de narración con una voz (sin agente); sin esto, la voz no se edita a mano. */
  generarVoz?: GenerarVoz
  /** Cambia el archivo del clip por otro que elija el usuario (otra foto, otro video). */
  onCambiarArchivo?: (clipId: string) => void
}) {
  const [nuevaVoz, setNuevaVoz] = useState(false)
  const [panelExportar, setPanelExportar] = useState(false)
  const [formato, setFormato] = useState<OpcionesExport['formato']>('original')
  const [subtitulos, setSubtitulos] = useState(false)
  const [borrador, setBorrador] = useState<Timeline | null>(null)
  const [insercion, setInsercion] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [, forzar] = useState(0)
  const [anchoVisible, setAnchoVisible] = useState(800)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lienzoRef = useRef<HTMLDivElement | null>(null)
  const textoRef = useRef<HTMLTextAreaElement | null>(null)
  const escribiendo = useRef(false)
  const anclaZoom = useRef<{ t: number; x: number } | null>(null)

  const tl = borrador ?? timeline
  const total = duracionTimeline(tl)
  // La escala no se encoge sola al recortar: saltaría todo bajo el ratón. Crece si la
  // timeline crece y vuelve a ajustarse con «Ajustar» o al cambiar de proyecto.
  const escala = useRef(Math.max(1, duracionTimeline(timeline)))
  escala.current = Math.max(escala.current, duracionTimeline(timeline), 1)
  const pps = (Math.max(120, anchoVisible - 40) / escala.current) * zoom
  const zoomMax = Math.max(1, escala.current / 2)
  const ancho = Math.max(anchoVisible, total * pps + 32)

  function ajustar() {
    escala.current = Math.max(1, duracionTimeline(timeline))
    setZoom(1)
    forzar((x) => x + 1) // refresca aunque el zoom ya fuera 1
  }
  const lista = useMemo(() => tramos(tl), [tl])
  const voz = useMemo(() => vozEnTimeline(tl, transcript), [tl, transcript])

  const clipElegido = elegido?.tipo === 'clip' ? lista.find((t) => t.clip.id === elegido.id) : undefined
  const textoElegido = elegido?.tipo === 'texto' ? tl.textos.find((x) => x.id === elegido.id) : undefined
  const musicaElegida = elegido?.tipo === 'musica' ? tl.musica : undefined
  const fraseElegida = elegido?.tipo === 'voz' ? tl.voces?.find((v) => v.id === elegido.id) : undefined
  // Elegir cualquier otra cosa cierra el «añadir voz».
  useEffect(() => {
    if (elegido) setNuevaVoz(false)
  }, [elegido])

  // Si lo elegido desaparece (deshacer, borrar), se suelta.
  useEffect(() => {
    if (elegido && !clipElegido && !textoElegido && !musicaElegida && !fraseElegida && !borrador) onElegir(null)
  }, [elegido, clipElegido, textoElegido, musicaElegida, fraseElegida, borrador, onElegir])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observador = new ResizeObserver(() => setAnchoVisible(el.clientWidth))
    observador.observe(el)
    setAnchoVisible(el.clientWidth)
    return () => observador.disconnect()
  }, [])

  // El zoom con la rueda deja quieto el segundo que está bajo el puntero.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const ancla = anclaZoom.current
    if (!el || !ancla) return
    el.scrollLeft = Math.max(0, ancla.t * pps - ancla.x)
    anclaZoom.current = null
  }, [pps])

  // Al reproducir con zoom, la vista sigue al cabezal.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !reproduciendo) return
    const x = tiempo * pps
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 40)
  }, [tiempo, pps, reproduciendo])

  function segundoEn(clientX: number): number {
    const caja = lienzoRef.current?.getBoundingClientRect()
    if (!caja) return 0
    return Math.max(0, (clientX - caja.left) / pps)
  }

  /** Imán: pega `t` al borde más cercano (o al cabezal) si está a menos de IMAN_PX. */
  function iman(t: number, puntos: number[]): number {
    let mejor = t
    let distancia = IMAN_PX / pps
    for (const p of [...puntos, tiempo]) {
      const d = Math.abs(p - t)
      if (d < distancia) {
        distancia = d
        mejor = p
      }
    }
    return mejor
  }

  /**
   * Arrastre genérico. `mover` recibe los segundos desplazados y devuelve el borrador;
   * al soltar se aplica como un solo paso. Sin desplazamiento, es un clic.
   */
  function arrastrar(
    e: React.PointerEvent,
    mover: (dx: number, ev: PointerEvent) => Timeline | null,
    alClic?: () => void
  ) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const x0 = e.clientX
    let movido = false
    let ultimo: Timeline | null = null

    const alMover = (ev: PointerEvent) => {
      if (!movido && Math.abs(ev.clientX - x0) < 3) return
      movido = true
      ultimo = mover((ev.clientX - x0) / pps, ev)
      setBorrador(ultimo)
    }
    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
      if (movido) ultimo = mover((ev.clientX - x0) / pps, ev)
      setBorrador(null)
      setInsercion(null)
      if (movido && ultimo) historial.aplicar(ultimo)
      else if (!movido) alClic?.()
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  // ===== Regla y fondo: mover el cabezal =====

  function arrastrarCabezal(e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    onBuscar(Math.min(total, segundoEn(e.clientX)))
    if (e.currentTarget.classList.contains('tl-carril')) onElegir(null)
    const alMover = (ev: PointerEvent) => onBuscar(Math.min(total, segundoEn(ev.clientX)))
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
    }
    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
  }

  // ===== Pista de video =====

  function arrastrarClip(e: React.PointerEvent, id: string) {
    onElegir({ tipo: 'clip', id })
    const base = timeline
    const otros = tramos(base).filter((t) => t.clip.id !== id)
    arrastrar(e, (_dx, ev) => {
      const t = segundoEn(ev.clientX)
      // El destino es cuántos de los otros clips quedan a la izquierda del puntero.
      let destino = 0
      let acumulado = 0
      for (const o of otros) {
        const largo = o.fin - o.inicio
        if (t > acumulado + largo / 2) destino += 1
        acumulado += largo
      }
      setInsercion(otros.slice(0, destino).reduce((s, o) => s + (o.fin - o.inicio), 0))
      return moverClip(base, id, destino)
    })
  }

  function recortar(e: React.PointerEvent, id: string, lado: 'entrada' | 'salida') {
    onElegir({ tipo: 'clip', id })
    const base = timeline
    const tramo = tramos(base).find((t) => t.clip.id === id)
    if (!tramo) return
    const puntos = puntosIman(base)
    arrastrar(e, (dx) => {
      const limite = duracionDe ? duracionDe(tramo.clip.fuente) : duracionFuente
      if (lado === 'entrada') return recortarClip(base, id, 'entrada', tramo.clip.entrada + dx, limite)
      // El borde derecho se pega al cabezal y a los bordes de los rótulos.
      const finTl = iman(tramo.fin + dx, puntos.filter((p) => p > tramo.inicio))
      return recortarClip(base, id, 'salida', tramo.clip.entrada + (finTl - tramo.inicio), limite)
    })
  }

  // ===== Pista de textos =====

  function arrastrarTexto(e: React.PointerEvent, id: string, modo: 'mover' | 'inicio' | 'fin') {
    onElegir({ tipo: 'texto', id })
    const base = timeline
    const x = base.textos.find((t) => t.id === id)
    if (!x) return
    const puntos = puntosIman(base, id)
    const fin = x.inicio + x.duracion
    arrastrar(
      e,
      (dx) => {
        if (modo === 'mover') {
          let inicio = x.inicio + dx
          const pegadoInicio = iman(inicio, puntos)
          const pegadoFin = iman(inicio + x.duracion, puntos)
          if (pegadoInicio !== inicio) inicio = pegadoInicio
          else if (pegadoFin !== inicio + x.duracion) inicio = pegadoFin - x.duracion
          return cambiarTexto(base, id, { inicio })
        }
        if (modo === 'inicio') {
          const inicio = Math.min(iman(x.inicio + dx, puntos), fin - DURACION_MINIMA)
          return cambiarTexto(base, id, { inicio, duracion: fin - inicio })
        }
        return cambiarTexto(base, id, { duracion: iman(fin + dx, puntos) - x.inicio })
      },
      undefined
    )
  }

  // ===== Narración: cada frase se mueve suelta =====

  function arrastrarFrase(e: React.PointerEvent, id: string) {
    onElegir({ tipo: 'voz', id })
    const base = timeline
    const v = base.voces?.find((x) => x.id === id)
    if (!v) return
    const puntos = puntosIman(base)
    arrastrar(e, (dx) => cambiarVoz(base, id, { inicio: iman(v.inicio + dx, puntos) }))
  }

  // ===== Acciones =====

  function accionDividir() {
    historial.aplicar(dividir(timeline, tiempo))
  }

  function accionBorrar() {
    if (!elegido) return
    if (elegido.tipo === 'clip') historial.aplicar(borrarClip(timeline, elegido.id))
    else if (elegido.tipo === 'musica') historial.aplicar(ponerMusica(timeline, undefined))
    else if (elegido.tipo === 'voz') historial.aplicar(borrarVoz(timeline, elegido.id))
    else historial.aplicar(borrarTexto(timeline, elegido.id))
    onElegir(null)
  }

  function accionTexto() {
    const { timeline: nueva, id } = anadirTexto(timeline, tiempo)
    if (nueva === timeline) return
    historial.aplicar(nueva)
    onElegir({ tipo: 'texto', id })
    requestAnimationFrame(() => textoRef.current?.select())
  }

  async function accionMusica() {
    const musica = await importarMusica()
    if (!musica) return
    // Si ya había música, se conservan su volumen y su ducking.
    const previa = timeline.musica
    historial.aplicar(ponerMusica(timeline, previa ? { ...musica, volumen: previa.volumen, ducking: previa.ducking } : musica))
    onElegir({ tipo: 'musica', id: 'musica' })
  }

  /** Deslizadores: el primer movimiento abre un paso de deshacer y los demás lo amplían. */
  const ajustando = useRef(false)
  function deslizar(nueva: Timeline) {
    if (ajustando.current) historial.reemplazar(nueva)
    else historial.aplicar(nueva)
    ajustando.current = true
  }
  const empezarAjuste = () => (ajustando.current = false)

  function ajustarImagen(cambio: AjustesClip) {
    if (clipElegido) deslizar(ajustarClip(timeline, clipElegido.clip.id, cambio))
  }

  function accionDuplicar() {
    if (elegido?.tipo === 'clip') historial.aplicar(duplicarClip(timeline, elegido.id))
  }

  // ===== Teclado =====

  const teclas = useRef<(e: KeyboardEvent) => void>(() => {})
  teclas.current = (e: KeyboardEvent) => {
    if (esCampoDeTexto(e.target)) return
    const ctrl = e.ctrlKey || e.metaKey
    const tecla = e.key.toLowerCase()
    if (ctrl && tecla === 'z' && !e.shiftKey) historial.deshacer()
    else if (ctrl && (tecla === 'y' || (tecla === 'z' && e.shiftKey))) historial.rehacer()
    else if (ctrl && tecla === 'd') accionDuplicar()
    else if (ctrl) return
    else if (e.key === ' ') {
      // Si un botón tenía el foco, Espacio también lo pulsaría: se le quita el foco.
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') (e.target as HTMLElement).blur()
      onAlternar()
    }
    else if (tecla === 's') accionDividir()
    else if (tecla === 't') accionTexto()
    else if (e.key === 'Delete' || e.key === 'Backspace') accionBorrar()
    else if (e.key === 'Escape') onElegir(null)
    else if (e.key === 'ArrowLeft') onBuscar(tiempo - (e.shiftKey ? 1 : 1 / 30))
    else if (e.key === 'ArrowRight') onBuscar(tiempo + (e.shiftKey ? 1 : 1 / 30))
    else if (e.key === 'Home') onBuscar(0)
    else if (e.key === 'End') onBuscar(total)
    else return
    e.preventDefault()
  }

  useEffect(() => {
    const oyente = (e: KeyboardEvent) => teclas.current(e)
    window.addEventListener('keydown', oyente)
    return () => window.removeEventListener('keydown', oyente)
  }, [])

  // ===== Zoom =====

  function rueda(e: React.WheelEvent<HTMLDivElement>) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const el = scrollRef.current
    if (!el) return
    const x = e.clientX - el.getBoundingClientRect().left
    anclaZoom.current = { t: (el.scrollLeft + x) / pps, x }
    setZoom((z) => Math.min(zoomMax, Math.max(1, z * (e.deltaY < 0 ? 1.25 : 0.8))))
  }

  const valorZoom = zoomMax > 1 ? Math.round((Math.log(zoom) / Math.log(zoomMax)) * 100) : 0

  // ===== Regla =====

  const paso = PASOS_REGLA.find((p) => p * pps >= 70) ?? PASOS_REGLA[PASOS_REGLA.length - 1]
  const marcas: number[] = []
  for (let t = 0; t <= total + 1e-6; t += paso) marcas.push(t)

  return (
    <div className="tl">
      <div className="tl-barra">
        <button className="tl-boton" onClick={onAlternar} title={reproduciendo ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'}>
          <Icon name={reproduciendo ? 'pause' : 'play'} size={16} />
        </button>
        <span className="tl-tc">
          {tc(tiempo)} <span>/ {tc(total)}</span>
        </span>
        <span className="tl-separador" />
        <button className="tl-boton" onClick={accionDividir} title="Dividir en el cabezal (S)" disabled={total <= 0}>
          <Icon name="scissors" size={16} /> Dividir
        </button>
        <button className="tl-boton" onClick={accionTexto} title="Añadir texto en el cabezal (T)" disabled={total <= 0}>
          <Icon name="type" size={16} /> Texto
        </button>
        {onAgregarClips && (
          <button className="tl-boton" onClick={onAgregarClips} disabled={agregandoClips} title="Agrega varios videos o imágenes al final de la timeline">
            <Icon name="plus" size={16} /> {agregandoClips ? 'Agregando…' : 'Clips'}
          </button>
        )}
        {generarVoz && (
          <button
            className="tl-boton"
            onClick={() => (onElegir(null), setNuevaVoz(true))}
            title="Añadir una frase de narración en el cabezal, con la voz que elijas"
            disabled={total <= 0}
          >
            <Icon name="sparkles" size={16} /> Voz
          </button>
        )}
        <button className="tl-boton" onClick={() => void accionMusica()} title="Poner música bajo la edición">
          <Icon name="music" size={16} /> Música
        </button>
        <button className="tl-boton" onClick={accionBorrar} title="Borrar lo elegido (Supr)" disabled={!elegido}>
          <Icon name="trash" size={16} />
        </button>
        <span className="tl-separador" />
        <button className="tl-boton" onClick={historial.deshacer} title="Deshacer (Ctrl+Z)" disabled={!historial.puedeDeshacer}>
          <Icon name="undo" size={16} />
        </button>
        <button className="tl-boton" onClick={historial.rehacer} title="Rehacer (Ctrl+Shift+Z)" disabled={!historial.puedeRehacer}>
          <Icon name="redo" size={16} />
        </button>
        <span className="tl-flex" />
        <label className="tl-zoom" title="Acercar (Ctrl+rueda)">
          <Icon name="search" size={14} />
          <input
            type="range"
            min={0}
            max={100}
            value={valorZoom}
            disabled={zoomMax <= 1}
            onChange={(e) => setZoom(Math.pow(zoomMax, Number(e.target.value) / 100))}
          />
        </label>
        <button className="tl-boton" onClick={ajustar} title="Ver toda la timeline">
          Ajustar
        </button>
        <span className="tl-separador" />
        <button
          className={`btn small ${panelExportar ? '' : 'primary'}`}
          onClick={() => setPanelExportar((v) => !v)}
          disabled={total <= 0 && !exportar.activo}
        >
          <Icon name="download" size={14} />
          {exportar.activo ? `Exportando ${Math.round(exportar.pct * 100)} %` : 'Exportar'}
        </button>
      </div>

      {panelExportar && (
        <div className="tl-exportar">
          <div className="chips">
            <button className={`chip ${formato === 'original' || exportar.vertical ? 'is-active' : ''}`} onClick={() => setFormato('original')}>
              {exportar.vertical ? 'Original (vertical)' : 'Original (horizontal)'}
            </button>
            {!exportar.vertical && (
              <button className={`chip ${formato === 'vertical' ? 'is-active' : ''}`} onClick={() => setFormato('vertical')}>
                Vertical 9:16, recortado al centro
              </button>
            )}
          </div>
          <label
            className={`tl-check ${exportar.hayTranscripcion ? '' : 'is-off'}`}
            title={exportar.hayTranscripcion ? undefined : 'Transcribe el video para poder quemar los subtítulos'}
          >
            <input
              type="checkbox"
              checked={subtitulos && exportar.hayTranscripcion}
              disabled={!exportar.hayTranscripcion}
              onChange={(e) => setSubtitulos(e.target.checked)}
            />
            Subtítulos de la voz
          </label>
          {exportar.destino && (
            <span className="tl-dim tl-destino" title={exportar.destino}>
              Se guarda en {exportar.destino}
            </span>
          )}
          <span className="tl-flex" />
          {exportar.activo && (
            <span className="tl-progreso">
              <span style={{ width: `${Math.round(exportar.pct * 100)}%` }} />
            </span>
          )}
          {exportar.hayArchivo && !exportar.activo && (
            <button className="btn small ghost" onClick={exportar.onAbrir}>
              <Icon name="folder" size={14} /> Ver el último
            </button>
          )}
          <button
            className="btn small primary"
            disabled={exportar.activo || total <= 0}
            onClick={() =>
              exportar.onExportar({
                formato: exportar.vertical ? 'original' : formato,
                subtitulos: subtitulos && exportar.hayTranscripcion
              })
            }
          >
            <Icon name="download" size={14} /> {exportar.activo ? 'Exportando…' : `Exportar MP4 · ${tc(total, false)}`}
          </button>
        </div>
      )}

      <div className="tl-cuerpo">
        <div className="tl-nombres">
          <span className="tl-nombre regla" />
          <span className="tl-nombre">Video</span>
          <span className="tl-nombre">Texto</span>
          <span className="tl-nombre">Voz</span>
          <span className="tl-nombre">Música</span>
        </div>

        <div className="tl-scroll" ref={scrollRef} onWheel={rueda}>
          <div className="tl-lienzo" ref={lienzoRef} style={{ width: ancho }}>
            <div className="tl-regla" onPointerDown={arrastrarCabezal}>
              {marcas.map((t) => (
                <span key={t} className="tl-marca" style={{ left: t * pps }}>
                  {tc(t, paso < 1)}
                </span>
              ))}
            </div>

            <div className="tl-carril video" onPointerDown={arrastrarCabezal}>
              {lista.length === 0 && <span className="tl-vacio">La timeline está vacía. Deshaz (Ctrl+Z) para recuperar el material.</span>}
              {lista.map((t) => {
                const anchoClip = (t.fin - t.inicio) * pps
                return (
                  <div
                    key={t.clip.id}
                    className={`tl-clip ${t.clip.fuente !== 'principal' ? 'otra-fuente' : ''} ${elegido?.id === t.clip.id ? 'is-elegido' : ''}`}
                    style={{ left: t.inicio * pps, width: anchoClip }}
                    onPointerDown={(e) => arrastrarClip(e, t.clip.id)}
                    title={`Clip ${t.indice + 1} · ${nombreDe ? nombreDe(t.clip.fuente) : 'fuente'} ${tc(t.clip.entrada)}–${tc(t.clip.salida)}`}
                  >
                    <span className="tl-asa izquierda" onPointerDown={(e) => recortar(e, t.clip.id, 'entrada')} />
                    {anchoClip > 46 && (
                      <span className="tl-clip-texto">
                        <b>{t.indice + 1}</b>
                        {anchoClip > 120 &&
                          (t.clip.fuente !== 'principal' && nombreDe ? <> {nombreDe(t.clip.fuente)}</> : <> {tc(t.clip.entrada, false)}–{tc(t.clip.salida, false)}</>)}
                      </span>
                    )}
                    {elegido?.id === t.clip.id && anchoClip > 30 && (
                      <button
                        className="tl-clip-quitar"
                        title="Quitar este clip (Supr)"
                        aria-label="Quitar este clip"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          accionBorrar()
                        }}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    )}
                    <span className="tl-asa derecha" onPointerDown={(e) => recortar(e, t.clip.id, 'salida')} />
                  </div>
                )
              })}
            </div>

            <div className="tl-carril texto" onPointerDown={arrastrarCabezal}>
              {tl.textos.map((x) => (
                <div
                  key={x.id}
                  className={`tl-rotulo ${elegido?.id === x.id ? 'is-elegido' : ''}`}
                  style={{ left: x.inicio * pps, width: Math.max(4, x.duracion * pps) }}
                  onPointerDown={(e) => arrastrarTexto(e, x.id, 'mover')}
                  onDoubleClick={() => textoRef.current?.select()}
                  title={x.texto}
                >
                  <span className="tl-asa izquierda" onPointerDown={(e) => arrastrarTexto(e, x.id, 'inicio')} />
                  <span className="tl-clip-texto">{x.texto || 'Texto vacío'}</span>
                  <span className="tl-asa derecha" onPointerDown={(e) => arrastrarTexto(e, x.id, 'fin')} />
                </div>
              ))}
            </div>

            <div className="tl-carril voz" onPointerDown={arrastrarCabezal}>
              {(tl.voces ?? []).map((v) => {
                const anchoFrase = v.duracion * pps
                return (
                  <div
                    key={v.id}
                    className={`tl-voz tl-frase ${elegido?.tipo === 'voz' && elegido.id === v.id ? 'is-elegido' : ''}`}
                    style={{ left: v.inicio * pps, width: Math.max(4, anchoFrase - 1) }}
                    title={v.texto || 'Narración'}
                    onPointerDown={(e) => arrastrarFrase(e, v.id)}
                  >
                    {anchoFrase > 30 && <span className="tl-clip-texto">{v.texto || 'Narración'}</span>}
                  </div>
                )
              })}
              {voz.length === 0 && !tl.voces?.length && (
                <span className="tl-vacio">{transcript?.length ? 'Sin voz en la edición.' : 'Transcribe el video para ver aquí lo que se dice.'}</span>
              )}
              {voz.map((v) => {
                const anchoVoz = (v.fin - v.inicio) * pps
                return (
                  <div
                    key={v.id}
                    className="tl-voz"
                    style={{ left: v.inicio * pps, width: Math.max(2, anchoVoz - 1) }}
                    title={v.texto}
                  >
                    {anchoVoz > 30 && <span className="tl-clip-texto">{v.texto}</span>}
                  </div>
                )
              })}
            </div>

            <div className="tl-carril musica" onPointerDown={arrastrarCabezal}>
              {tl.musica ? (
                <div
                  className={`tl-musica ${elegido?.tipo === 'musica' ? 'is-elegido' : ''}`}
                  style={{ left: 0, width: Math.max(4, total * pps) }}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onElegir({ tipo: 'musica', id: 'musica' })
                  }}
                  title={tl.musica.nombre}
                >
                  <span className="tl-clip-texto">
                    <Icon name="music" size={11} /> {tl.musica.nombre} · {Math.round(tl.musica.volumen * 100)} %
                    {tl.musica.ducking ? ' · baja con la voz' : ''}
                  </span>
                </div>
              ) : (
                <button
                  className="tl-vacio tl-vacio-boton"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void accionMusica()}
                >
                  + Añadir música
                </button>
              )}
            </div>

            {insercion !== null && <span className="tl-insercion" style={{ left: insercion * pps }} />}
            <span className="tl-cabezal" style={{ left: Math.min(tiempo, total) * pps }} />
          </div>
        </div>
      </div>

      <div className="tl-detalle">
        {clipElegido ? (
          <>
            <span>
              <b>Clip {clipElegido.indice + 1}</b> de {lista.length} · fuente {tc(clipElegido.clip.entrada)} → {tc(clipElegido.clip.salida)} ·{' '}
              {(clipElegido.fin - clipElegido.inicio).toFixed(1)} s
            </span>
            <span className="tl-flex" />
            <label className="tl-check" title="Sin su sonido: solo aporta imagen">
              <input
                type="checkbox"
                checked={Boolean(clipElegido.clip.mudo)}
                onChange={(e) => historial.aplicar(silenciarClip(timeline, clipElegido.clip.id, e.target.checked))}
              />
              Sin sonido
            </label>
            {onCambiarArchivo && (
              <button className="btn small ghost" onClick={() => onCambiarArchivo(clipElegido.clip.id)} title="Pone otra foto u otro video en este mismo lugar">
                <Icon name="image" size={14} /> Cambiar archivo
              </button>
            )}
            <button className="btn small ghost" onClick={accionDuplicar}>
              <Icon name="copy" size={14} /> Duplicar
            </button>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Borrar
            </button>
            <div className="tl-ajustes">
              {(
                [
                  ['zoom', 'Zoom', 1, 2, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                  ['brillo', 'Brillo', -0.3, 0.3, 0.01, (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`],
                  ['contraste', 'Contraste', 0.5, 1.8, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                  ['saturacion', 'Saturación', 0, 2, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                  ['cx', 'Centro ↔', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                  ['cy', 'Centro ↕', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)} %`],
                  ['acercar', 'Acercar despacio', 0, 0.3, 0.01, (v: number) => (v ? `+${Math.round(v * 100)} %` : 'no')]
                ] as const
              ).map(([clave, nombre, min, max, paso, formato]) => {
                const valor = ajustesDe(clipElegido.clip)[clave]
                return (
                  <label key={clave} className="tl-ajuste">
                    <span>
                      {nombre} <b>{formato(valor)}</b>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={paso}
                      value={valor}
                      onPointerDown={empezarAjuste}
                      onFocus={empezarAjuste}
                      onChange={(e) => ajustarImagen({ [clave]: Number(e.target.value) })}
                    />
                  </label>
                )
              })}
              <button
                className="btn small ghost"
                onClick={() => historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, { saturacion: 0, contraste: 1.15 }))}
              >
                B/N
              </button>
              <button
                className="btn small ghost"
                disabled={!clipElegido.clip.ajustes}
                onClick={() =>
                  historial.aplicar(ajustarClip(timeline, clipElegido.clip.id, { zoom: 1, brillo: 0, contraste: 1, saturacion: 1, cx: 0.5, cy: 0.5, acercar: 0 }))
                }
              >
                Restablecer
              </button>
              {clipElegido.indice > 0 && (
                <label className="tl-ajuste" title="Entra fundiéndose sobre el clip anterior">
                  <span>
                    Fundido <b>{clipElegido.clip.fundido ? `${clipElegido.clip.fundido.toFixed(1)} s` : 'corte'}</b>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={MAX_FUNDIDO}
                    step={0.05}
                    value={clipElegido.clip.fundido ?? 0}
                    onPointerDown={empezarAjuste}
                    onFocus={empezarAjuste}
                    onChange={(e) => deslizar(fundirClip(timeline, clipElegido.clip.id, Number(e.target.value)))}
                  />
                </label>
              )}
            </div>
          </>
        ) : musicaElegida ? (
          <>
            <Icon name="music" size={14} />
            <b className="tl-musica-nombre">{musicaElegida.nombre}</b>
            <label className="tl-ajuste en-linea">
              <span>
                Volumen <b>{Math.round(musicaElegida.volumen * 100)} %</b>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={musicaElegida.volumen}
                onPointerDown={empezarAjuste}
                onFocus={empezarAjuste}
                onChange={(e) => deslizar(cambiarMusica(timeline, { volumen: Number(e.target.value) }))}
              />
            </label>
            <label className="tl-check">
              <input
                type="checkbox"
                checked={musicaElegida.ducking}
                onChange={(e) => historial.aplicar(cambiarMusica(timeline, { ducking: e.target.checked }))}
              />
              Bajar cuando hay voz
            </label>
            <span className="tl-flex" />
            <button className="btn small ghost" onClick={() => void accionMusica()}>
              Cambiar
            </button>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </>
        ) : (fraseElegida || nuevaVoz) && generarVoz ? (
          <InspectorVoz
            frase={fraseElegida}
            timeline={timeline}
            tiempo={tiempo}
            historial={historial}
            generar={generarVoz}
            onElegir={(id) => (setNuevaVoz(false), onElegir(id ? { tipo: 'voz', id } : null))}
            onCerrar={() => setNuevaVoz(false)}
          />
        ) : textoElegido ? (
          <>
            <textarea
              ref={textoRef}
              className="tl-texto-input tl-texto-area"
              rows={Math.min(4, Math.max(1, textoElegido.texto.split('\n').length))}
              value={textoElegido.texto}
              placeholder="Escribe el rótulo (Enter para otra línea)"
              onFocus={() => (escribiendo.current = false)}
              onChange={(e) => {
                const nueva = cambiarTexto(timeline, textoElegido.id, { texto: e.target.value })
                // La primera tecla abre el paso de deshacer; las siguientes lo amplían.
                if (escribiendo.current) historial.reemplazar(nueva)
                else historial.aplicar(nueva)
                escribiendo.current = true
              }}
            />
            <select
              value={textoElegido.posicion}
              onChange={(e) =>
                historial.aplicar(cambiarTexto(timeline, textoElegido.id, { posicion: e.target.value as PosicionTexto }))
              }
            >
              <option value="arriba">Arriba</option>
              <option value="centro">Centro</option>
              <option value="abajo">Abajo</option>
            </select>
            <label className="tl-ajuste en-linea">
              <span>
                Tamaño <b>{Math.round((textoElegido.tamano ?? 1) * 100)} %</b>
              </span>
              <input
                type="range"
                min={LIMITES_TAMANO[0]}
                max={LIMITES_TAMANO[1]}
                step={0.05}
                value={textoElegido.tamano ?? 1}
                onPointerDown={empezarAjuste}
                onFocus={empezarAjuste}
                onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { tamano: Number(e.target.value) }))}
              />
            </label>
            <select
              value={textoElegido.fuente ?? 'normal'}
              title="La letra"
              onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { fuente: e.target.value }))}
            >
              {Object.entries(FUENTES_TEXTO).map(([clave, f]) => (
                <option key={clave} value={clave} style={{ fontFamily: f.familia }}>
                  {f.nombre}
                </option>
              ))}
            </select>
            <input
              type="color"
              className="tl-color"
              title="Color de la letra"
              value={textoElegido.color ?? '#ffffff'}
              onPointerDown={empezarAjuste}
              onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { color: e.target.value }))}
            />
            <label className="tl-check" title="Sin la caja oscura: solo la letra con su borde">
              <input
                type="checkbox"
                checked={!textoElegido.sinCaja}
                onChange={(e) => historial.aplicar(cambiarTexto(timeline, textoElegido.id, { sinCaja: !e.target.checked }))}
              />
              Caja
            </label>
            {!textoElegido.sinCaja && (
              <input
                type="color"
                className="tl-color"
                title="Color de la caja"
                value={textoElegido.caja ?? '#000000'}
                onPointerDown={empezarAjuste}
                onChange={(e) => deslizar(cambiarTexto(timeline, textoElegido.id, { caja: e.target.value }))}
              />
            )}
            <span className="tl-dim">
              {tc(textoElegido.inicio)} · {textoElegido.duracion.toFixed(1)} s
            </span>
            <button className="btn small ghost" onClick={accionBorrar}>
              <Icon name="trash" size={14} /> Borrar
            </button>
          </>
        ) : (
          <span className="tl-dim">
            Espacio reproduce · S divide · T añade texto · Supr borra · arrastra un clip para reordenarlo o sus bordes para
            recortarlo · Ctrl+Z deshace · Ctrl+rueda acerca
          </span>
        )}
      </div>
    </div>
  )
}
