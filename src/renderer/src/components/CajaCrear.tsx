import { useEffect, useRef, useState } from 'react'
import {
  type AjustesCreacion,
  type Creacion,
  COSTO_CLIP,
  DURACIONES,
  MODELOS_AGENTE,
  type AgenteId,
  type EleccionTarea,
  type FormatoCreacion,
  type NivelModelo,
  type PeticionCreacion,
  VOCES_GEMINI
} from '../../../shared/creacion'
import { avisoRetiro, MODELO_CHATGPT, MODELOS_IMAGEN, modelosVideoVigentes } from '../../../shared/flow'
import { favorito } from '../../../shared/gustos'
import type { Agentes } from '../hooks/agentes'
import { Icon } from '../Icons'
import { ElegirModelo, nombreModelo } from './ElegirModelo'
import { LogoAgente, LogoProveedor } from './Logos'

/**
 * La caja de «Crear con IA»: la petición y, en una fila, todo lo que decide el video. Cada
 * botón abre su menú: quién lo hace (agente y modelo, juntos o por paso), formato, duración,
 * imágenes y clips de Google Flow (con su costo) y los derechos de tus fotos.
 */

const NIVELES: { id: NivelModelo; nombre: string; nota: string }[] = [
  { id: 'rapido', nombre: 'Rápido', nota: 'gasta menos' },
  { id: 'equilibrado', nombre: 'Equilibrado', nota: 'lo normal' },
  { id: 'maximo', nombre: 'Máximo', nota: 'piensa más' }
]

/** Un botón que abre un menú; se cierra al elegir o al hacer clic fuera. */
function Menu({
  etiqueta,
  activo,
  children,
  ancho,
  redondo,
  titulo
}: {
  etiqueta: React.ReactNode
  activo?: boolean
  children: (cerrar: () => void) => React.ReactNode
  ancho?: number
  /** Un botón redondo solo con icono (el «+»), sin la flecha de desplegar. */
  redondo?: boolean
  titulo?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', esc)
    }
  }, [abierto])
  return (
    <div className="cc-menu" ref={caja}>
      {redondo ? (
        <button type="button" className={`cc-redondo ${abierto ? 'is-on' : ''}`} onClick={() => setAbierto((v) => !v)} title={titulo} aria-label={titulo}>
          {etiqueta}
        </button>
      ) : (
        <button type="button" className={`cc-pastilla ${activo ? 'is-on' : ''} ${abierto ? 'is-abierto' : ''}`} onClick={() => setAbierto((v) => !v)}>
          {etiqueta} <Icon name="chevron" size={11} />
        </button>
      )}
      {abierto && (
        <div className="cc-panel" style={ancho ? { width: ancho } : undefined}>
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  )
}

function Opcion({ elegida, onClick, children, nota }: { elegida: boolean; onClick: () => void; children: React.ReactNode; nota?: string }) {
  return (
    <button type="button" className={`cc-opcion ${elegida ? 'is-elegida' : ''}`} onClick={onClick}>
      <span className="cc-opcion-texto">{children}</span>
      {nota && <span className="cc-opcion-nota">{nota}</span>}
      {elegida && <Icon name="check" size={13} />}
    </button>
  )
}

/**
 * La caja dentro del chat de una creación: las mismas herramientas, pero cada cambio vale
 * para el siguiente turno del agente (se guarda al elegirlo), el «+» añade material al
 * momento y, mientras el agente trabaja, el botón de enviar es el de parar.
 */
export interface CajaEnChat {
  creacion: Creacion
  ocupado: boolean
  onParar: () => void
  onEnviar: (texto: string) => void
  onAjustar: (ajustes: AjustesCreacion) => void
  onAdjuntar: (rutas: string[]) => void
  placeholder?: string
}

export function CajaCrear({
  agentes,
  creando,
  estilo,
  onCrear,
  onConectar,
  chat
}: {
  agentes: Agentes
  creando: boolean
  estilo: string
  onCrear?: (p: PeticionCreacion) => void
  onConectar: () => void
  chat?: CajaEnChat
}) {
  const c0 = chat?.creacion
  const [peticion, setPeticion] = useState('')
  const [formato, setFormato] = useState<FormatoCreacion>('vertical')
  const [duracion, setDuracion] = useState(30)
  const [adjuntos, setAdjuntos] = useState<string[]>([])
  // Las carpetas elegidas van en `adjuntos` (el proceso principal las recorre); aquí se marcan para verlas como carpeta.
  const [carpetas, setCarpetas] = useState<string[]>([])
  const [referencia, setReferencia] = useState<string | null>(null)
  // Agente: trabaja con herramientas (plan → hacer → comprobar). Guiado: guion → voz → video.
  const puedeAgente = Boolean(agentes.activo && ['claude', 'antigravity', 'kimi', 'codex', 'opencode', 'gemini'].includes(agentes.activo.id))
  // Un solo modo: el agente. El paso a paso solo queda de respaldo para quien edita con una
  // llave de API (Gemini, DeepSeek, Grok), que no puede trabajar con herramientas.
  const enAgente = puedeAgente
  // La voz que narra (una de Gemini) o null = sin voz. Empieza con la última que usó, si tiene la voz conectada.
  const [voz, setVoz] = useState<string | null>(c0?.vozElegida ?? null)
  const [vozConectada, setVozConectada] = useState(false)
  const vozTocada = useRef(false)
  // Oír una voz antes de elegirla: su muestra se genera la primera vez y después sale al momento.
  const [oyendo, setOyendo] = useState<string | null>(null)
  const [cargandoMuestra, setCargandoMuestra] = useState<string | null>(null)
  const [errorMuestra, setErrorMuestra] = useState<string | null>(null)
  const reproductor = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => reproductor.current?.pause(), [])
  async function oir(id: string) {
    reproductor.current?.pause()
    if (oyendo === id) {
      setOyendo(null)
      return
    }
    setErrorMuestra(null)
    setCargandoMuestra(id)
    try {
      const url = await window.recorte.vozMuestra(id)
      const audio = new Audio(url)
      reproductor.current = audio
      audio.onended = () => setOyendo((o) => (o === id ? null : o))
      setOyendo(id)
      await audio.play()
    } catch (error) {
      setOyendo(null)
      setErrorMuestra(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setCargandoMuestra(null)
    }
  }
  // Tras el plan: esperar el «Hazlo» (pregúntame antes) o empezar solo si no hay preguntas.
  const [directo, setDirecto] = useState(Boolean(c0?.directo))
  useEffect(() => {
    void window.recorte
      .vozEstado()
      .then((e) => {
        // Empieza siempre «Sin voz»: la voz se elige a propósito para cada video.
        setVozConectada(e.tieneClave || Boolean(e.google?.correo))
      })
      .catch(() => {})
    // En el chat manda lo que ya eligió para esta creación.
    if (chat) return
    void window.recorte
      .preferenciasCargar()
      .then((p) => setDirecto(Boolean(p.crearDirecto)))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [falta, setFalta] = useState(false)
  // Quién lo hace: null = optimizado (el agente activo hace todo con su modelo de siempre).
  const [porPaso, setPorPaso] = useState(false)
  const [tGuion, setTGuion] = useState<EleccionTarea | null>(null)
  const [tVideo, setTVideo] = useState<EleccionTarea | null>(c0?.tareas?.video ?? null)
  // Google Flow
  const [conFlow, setConFlow] = useState(false)
  const [conChatGPT, setConChatGPT] = useState(false)
  const [derechos, setDerechos] = useState(false)
  const [modeloImagen, setModeloImagen] = useState<string | null>(c0?.flow?.imagenes ? (c0.flow.modeloImagen ?? MODELOS_IMAGEN[0] ?? null) : null)
  const [modeloVideo, setModeloVideo] = useState<string | null>(c0?.flow?.videos ? (c0.flow.modeloVideo ?? null) : null)
  const tocado = useRef(false)

  // La caja empieza con lo que más usa (si ya lo usó varias veces y no tocó nada aún).
  useEffect(() => {
    void window.recorte
      .gustos()
      .then((g) => {
        if (tocado.current || !g.activo) return
        const f = favorito(g.usos.formato)
        const d = Number(favorito(g.usos.duracion))
        if (f === 'vertical' || f === 'horizontal') setFormato(f)
        if (DURACIONES.includes(d)) setDuracion(d)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    void window.recorte
      .chatgptEstado()
      .then((e) => setConChatGPT(e.conectado))
      .catch(() => {})
  }, [])

  useEffect(() => {
    void window.recorte
      .flowEstado()
      .then((e) => {
        setConFlow(e.cuentas.length > 0)
        setDerechos(e.derechos)
        // Sin Flow, Nano Banana no está: se empieza sin imágenes (o con ChatGPT, si lo elige).
        if (!e.cuentas.length) setModeloImagen((m) => (m && MODELOS_IMAGEN.includes(m) ? null : m))
      })
      .catch(() => {})
  }, [])

  const conectados = agentes.lista.filter((a) => a.conectado && a.instalado)
  const activo = agentes.activo
  const hayFotos = adjuntos.some((r) => /\.(jpe?g|png|webp|heic|heif|zip)$/i.test(r))

  async function adjuntar() {
    const rutas = await window.recorte.elegirAdjuntos()
    if (chat) {
      if (rutas.length) chat.onAdjuntar(rutas)
      return
    }
    if (rutas.length) setAdjuntos((a) => [...a, ...rutas.filter((r) => !a.includes(r))].slice(0, 12))
  }

  async function elegirCarpeta() {
    const ruta = await window.recorte.elegirCarpeta()
    if (!ruta) return
    if (chat) {
      chat.onAdjuntar([ruta])
      return
    }
    setCarpetas((c) => (c.includes(ruta) ? c : [...c, ruta]))
    setAdjuntos((a) => (a.includes(ruta) ? a : [...a, ruta]))
  }

  async function elegirReferencia() {
    const ruta = await window.recorte.elegirReferencia()
    if (ruta) setReferencia(ruta)
  }

  // En el chat, lo que cambia en la caja se guarda en la creación al elegirlo (vale para el siguiente turno).
  const ajustesVistos = useRef<string | null>(null)
  // Y si cambia desde fuera (el botón «Activar» de una sugerencia del agente), la caja lo refleja.
  const deFuera = JSON.stringify([c0?.vozElegida ?? null, c0?.flow ?? null, c0?.tareas?.video ?? null, Boolean(c0?.directo)])
  useEffect(() => {
    if (!c0) return
    setVoz(c0.vozElegida ?? null)
    setDirecto(Boolean(c0.directo))
    setTVideo(c0.tareas?.video ?? null)
    setModeloImagen(c0.flow?.imagenes ? (c0.flow.modeloImagen ?? MODELOS_IMAGEN[0] ?? null) : null)
    setModeloVideo(c0.flow?.videos ? (c0.flow.modeloVideo ?? null) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deFuera])
  useEffect(() => {
    if (!chat) return
    const imagenes = Boolean(modeloImagen) && (modeloImagen === MODELO_CHATGPT ? conChatGPT : conFlow)
    const videos = conFlow && Boolean(modeloVideo)
    const ajustes: AjustesCreacion = {
      vozElegida: voz && vozConectada ? voz : null,
      directo,
      flow: imagenes || videos ? { imagenes, videos, ...(imagenes && modeloImagen ? { modeloImagen } : {}), ...(modeloVideo ? { modeloVideo } : {}) } : null,
      tareas: tVideo ? { video: tVideo } : null
    }
    const clave = JSON.stringify(ajustes)
    // La primera vez solo se apunta: no se guarda nada que el usuario no tocó.
    if (ajustesVistos.current !== null && ajustesVistos.current !== clave) chat.onAjustar(ajustes)
    ajustesVistos.current = clave
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voz, vozConectada, directo, modeloImagen, modeloVideo, tVideo, conFlow, conChatGPT])

  function enviar() {
    if (chat) {
      if (!peticion.trim() || chat.ocupado) return
      chat.onEnviar(peticion.trim())
      setPeticion('')
      return
    }
    if (!onCrear) return
    if (!peticion.trim()) {
      setFalta(true)
      return
    }
    const tareas = porPaso && (tGuion || tVideo) ? { ...(tGuion ? { guion: tGuion } : {}), ...(tVideo ? { video: tVideo } : {}) } : undefined
    const imagenes = Boolean(modeloImagen) && (modeloImagen === MODELO_CHATGPT ? conChatGPT : conFlow)
    const videos = conFlow && Boolean(modeloVideo)
    const flow =
      imagenes || videos
        ? {
            flow: {
              imagenes,
              videos,
              ...(imagenes && modeloImagen ? { modeloImagen } : {}),
              ...(modeloVideo ? { modeloVideo } : {})
            }
          }
        : {}
    if (enAgente) {
      onCrear({
        peticion: peticion.trim(),
        estilo,
        formato,
        duracion,
        adjuntos,
        modo: 'agente',
        // En el agente solo hay una tarea: quien hace el video.
        ...(tVideo ? { tareas: { video: tVideo } } : {}),
        ...(voz && vozConectada ? { vozElegida: voz } : {}),
        ...(directo ? { directo: true } : {}),
        // Lo que puede pedir generar: imágenes (Flow o ChatGPT) y clips (Flow).
        ...flow
      })
      return
    }
    onCrear({
      peticion: peticion.trim(),
      estilo,
      formato,
      duracion,
      adjuntos,
      ...(referencia ? { referencia } : {}),
      tareas,
      ...(imagenes || videos
        ? {
            flow: {
              imagenes,
              videos,
              ...(imagenes && modeloImagen ? { modeloImagen } : {}),
              ...(modeloVideo ? { modeloVideo } : {})
            }
          }
        : {})
    })
  }

  /** «Claude · Sonnet»: el agente y el modelo de una tarea. */
  const nombreEleccion = (e: EleccionTarea | null): string => {
    if (!e) return activo ? `${activo.nombre}` : (agentes.apiActivo?.nombre ?? 'Tu agente')
    const a = agentes.lista.find((x) => x.id === e.agente)
    const modelo = nombreModelo(e) ?? (e.nivel ? MODELOS_AGENTE[e.agente]?.[e.nivel] : undefined)
    return `${a?.nombre ?? e.agente}${modelo ? ` · ${modelo}` : ''}`
  }

  /** La lista de agentes y modelos (con su esfuerzo) para una tarea. */
  function opcionesTarea(tarea: 'guion' | 'video', valor: EleccionTarea | null, cerrar: () => void) {
    const poner = tarea === 'guion' ? setTGuion : setTVideo
    return (
      <>
        <Opcion elegida={!valor} onClick={() => (poner(null), cerrar())} nota="su modelo de siempre">
          {activo ? <LogoAgente id={activo.id} size={18} /> : agentes.apiActivo ? <LogoProveedor id={agentes.apiActivo.id} size={18} /> : null}
          {activo?.nombre ?? agentes.apiActivo?.nombre ?? 'Tu agente activo'}
        </Opcion>
        {conectados.length ? (
          <ElegirModelo agentes={conectados} valor={valor} onElegir={poner} cerrar={cerrar} />
        ) : (
          <p className="cc-nota">Conecta agentes en Ajustes para elegir aquí su modelo.</p>
        )}
      </>
    )
  }

  /** Lo corto de una tarea para la pastilla: el modelo, o el agente si no tiene modelo elegido. */
  const corto = (e: EleccionTarea | null): string => {
    if (!e) return (activo?.nombre ?? agentes.apiActivo?.nombre ?? 'tu agente').replace(/ Code| CLI| · Google/g, '')
    return nombreModelo(e) ?? (e.nivel ? MODELOS_AGENTE[e.agente]?.[e.nivel] : undefined) ?? (agentes.lista.find((x) => x.id === e.agente)?.nombre ?? e.agente).replace(/ Code| CLI| · Google/g, '')
  }

  const logoQuien = (e: EleccionTarea | null) =>
    e ? <LogoAgente id={e.agente} size={16} /> : activo ? <LogoAgente id={activo.id} size={16} /> : agentes.apiActivo ? <LogoProveedor id={agentes.apiActivo.id} size={16} /> : <Icon name="sparkles" size={13} />

  return (
    <>
      <div className={`crear-caja cc ${falta ? 'is-falta' : ''} ${chat ? 'is-chat' : ''}`}>
        <textarea
          autoFocus
          value={peticion}
          rows={chat ? 2 : 3}
          placeholder={chat ? (chat.placeholder ?? 'Escríbele al agente…') : 'Qué video quieres… un reel con 3 trucos para fotografiar comida'}
          onChange={(e) => {
            setPeticion(e.target.value)
            setFalta(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && chat?.ocupado) {
              e.preventDefault()
              chat.onParar()
            } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enviar()
            }
          }}
        />
        {adjuntos.length > 0 && (
          <div className="crear-adjuntos">
            {adjuntos.map((r) => (
              <span key={r} className={`crear-adjunto ${carpetas.includes(r) ? 'is-carpeta' : ''}`} title={carpetas.includes(r) ? `${r} — el agente recibe todas sus fotos y videos` : r}>
                {carpetas.includes(r) && <Icon name="carpeta" size={12} />}
                {r.split(/[\\/]/).pop()}
                <button aria-label="Quitar" onClick={() => (setAdjuntos((a) => a.filter((x) => x !== r)), setCarpetas((c) => c.filter((x) => x !== r)))}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {referencia && (
          <div className="crear-adjuntos">
            <span className="crear-adjunto is-referencia" title={`${referencia} — Se analiza para copiar su edición; no entra en tu video.`}>
              <Icon name="film" size={11} /> Estilo de: {referencia.split(/[\\/]/).pop()}
              <button aria-label="Quitar la referencia" onClick={() => setReferencia(null)}>
                <Icon name="x" size={11} />
              </button>
            </span>
            <span className="tl-dim cc-nota-ref">Se analiza para copiar su edición; no entra en tu video.</span>
          </div>
        )}

        <div className="cc-fila">
          <Menu
            redondo
            etiqueta={<Icon name="plus" size={16} />}
            titulo="Añadir tu material"
            ancho={250}
          >
            {(cerrar) => (
              <>
                <Opcion elegida={false} onClick={() => (cerrar(), void adjuntar())} nota="fotos, videos, audios o .zip">
                  <Icon name="image" size={14} /> Archivos
                </Opcion>
                <Opcion elegida={false} onClick={() => (cerrar(), void elegirCarpeta())} nota="todo su material">
                  <Icon name="carpeta" size={14} /> Una carpeta
                </Opcion>
                {!enAgente && (
                  <Opcion elegida={Boolean(referencia)} onClick={() => (cerrar(), void elegirReferencia())} nota="copia su edición">
                    <Icon name="film" size={14} /> Video de referencia
                  </Opcion>
                )}
              </>
            )}
          </Menu>
          {enAgente && (
            <Menu ancho={560} activo={Boolean(tVideo)} etiqueta={<>{logoQuien(tVideo)} {corto(tVideo)}</>}>
              {(cerrar) =>
                conectados.length ? (
                  <ElegirModelo agentes={conectados} valor={tVideo ?? (activo ? { agente: activo.id } : null)} onElegir={setTVideo} cerrar={cerrar} />
                ) : (
                  <p className="cc-nota">Conecta un agente en Inicio para elegir quién hace el video.</p>
                )
              }
            </Menu>
          )}

          {!enAgente && (
          <Menu
            ancho={360}
            etiqueta={
              porPaso && (tGuion || tVideo) ? (
                <>
                  {logoQuien(tGuion)} Guion {corto(tGuion)} · Video {corto(tVideo)}
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={13} /> Optimizado
                </>
              )
            }
          >
            {(cerrar) => (
              <>
                <Opcion elegida={!porPaso} onClick={() => (setPorPaso(false), cerrar())} nota="lo mejor sin pensarlo">
                  <Icon name="sparkles" size={14} /> Optimizado: {activo?.nombre ?? agentes.apiActivo?.nombre ?? 'tu agente'} hace todo
                </Opcion>
                <Opcion elegida={porPaso} onClick={() => setPorPaso(true)} nota="elige agente y modelo">
                  <Icon name="sliders" size={14} /> Por paso
                </Opcion>
                {porPaso && (
                  <div className="cc-pasos">
                    <span className="cc-grupo-nombre">Guion</span>
                    <Menu ancho={340} etiqueta={<>{logoQuien(tGuion)} {nombreEleccion(tGuion)}</>}>{(c2) => opcionesTarea('guion', tGuion, c2)}</Menu>
                    <span className="cc-grupo-nombre">Video</span>
                    <Menu ancho={340} etiqueta={<>{logoQuien(tVideo)} {nombreEleccion(tVideo)}</>}>{(c2) => opcionesTarea('video', tVideo, c2)}</Menu>
                    <p className="cc-nota">Un modelo rápido para el guion y uno potente para el diseño suele dar buen video gastando menos.</p>
                  </div>
                )}
              </>
            )}
          </Menu>

          )}

          {!chat && (
          <div className="cc-segmento" role="radiogroup" aria-label="Formato">
            {(['vertical', 'horizontal'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={formato === f ? 'is-on' : ''}
                onClick={() => ((tocado.current = true), setFormato(f))}
                title={f === 'vertical' ? 'Vertical, para TikTok, Reels y Shorts' : 'Horizontal, para YouTube'}
              >
                {f === 'vertical' ? '9:16' : '16:9'}
              </button>
            ))}
          </div>
          )}


          {conFlow || conChatGPT ? (
            <>
              <Menu activo={Boolean(modeloImagen)} etiqueta={<><Icon name="image" size={13} /> {modeloImagen ?? 'Sin imágenes'}</>} ancho={280}>
                {(cerrar) => (
                  <>
                    <Opcion elegida={!modeloImagen} onClick={() => (setModeloImagen(null), cerrar())} nota="solo texto y formas">
                      Sin imágenes
                    </Opcion>
                    {conFlow && <span className="cc-grupo-nombre">Google Flow</span>}
                    {conFlow &&
                      MODELOS_IMAGEN.map((m) => (
                        <Opcion key={m} elegida={modeloImagen === m} onClick={() => (setModeloImagen(m), cerrar())} nota="gratis">
                          {m}
                        </Opcion>
                      ))}
                    <span className="cc-grupo-nombre">ChatGPT</span>
                    {conChatGPT ? (
                      <Opcion elegida={modeloImagen === MODELO_CHATGPT} onClick={() => (setModeloImagen(MODELO_CHATGPT), cerrar())} nota="con tu plan de ChatGPT">
                        {MODELO_CHATGPT}
                      </Opcion>
                    ) : (
                      <p className="cc-nota">Conecta «ChatGPT (Codex)» en Ajustes → Agentes para hacer imágenes con tu cuenta de ChatGPT.</p>
                    )}
                    <p className="cc-nota">
                      {modeloImagen === MODELO_CHATGPT
                        ? 'ChatGPT hace las imágenes que el agente necesite, una a la vez, con el modelo de imágenes de tu plan.'
                        : 'El agente pide las imágenes que necesite y Flow las hace con tus cuentas. Puede usar tus fotos de referencia.'}
                    </p>
                  </>
                )}
              </Menu>
              {conFlow && (
              <Menu activo={Boolean(modeloVideo)} etiqueta={<><Icon name="film" size={13} /> {modeloVideo ? modeloVideo.replace('Veo 3.1 - ', 'Veo ').replace(' Flash', '') : 'Sin clips'}</>} ancho={280}>
                {(cerrar) => (
                  <>
                    <Opcion elegida={!modeloVideo} onClick={() => (setModeloVideo(null), cerrar())} nota="no gasta créditos">
                      Sin clips
                    </Opcion>
                    {modelosVideoVigentes().map((m) => (
                      <Opcion
                        key={m}
                        elegida={modeloVideo === m}
                        onClick={() => (setModeloVideo(m), cerrar())}
                        nota={`${COSTO_CLIP[m] ?? '?'} puntos por clip${avisoRetiro(m) ? ` · ${avisoRetiro(m)}` : ''}`}
                      >
                        {m}
                      </Opcion>
                    ))}
                    <p className="cc-nota">El agente pide hasta 3 clips para los momentos clave. Gastan puntos de Flow (se lee el costo exacto antes de generar y no pasa del tope).</p>
                  </>
                )}
              </Menu>
              )}
              {conFlow && hayFotos && (
                <button
                  type="button"
                  className={`cc-pastilla ${derechos ? 'is-on' : 'is-aviso'}`}
                  title="Para que Flow use tus fotos como referencia, confirma que tienes sus derechos"
                  onClick={async () => {
                    const e = await window.recorte.flowAjustes({ derechos: !derechos })
                    setDerechos(e.derechos)
                  }}
                >
                  {derechos ? <><Icon name="check" size={12} /> Derechos confirmados</> : 'Confirmar derechos'}
                </button>
              )}
            </>
          ) : (
            <span className="cc-pastilla is-apagada" title="Conecta Google Flow en Ajustes para imágenes y clips generados">
              Imágenes y clips: conecta Google Flow
            </span>
          )}

          {enAgente && (
            <Menu ancho={300} activo={Boolean(voz && vozConectada)} etiqueta={<><Icon name="music" size={13} /> {voz && vozConectada ? `Voz ${voz}` : 'Sin voz'}</>}>
              {(cerrar) => (
                <>
                  <Opcion elegida={!voz || !vozConectada} onClick={() => ((vozTocada.current = true), setVoz(null), cerrar())} nota="solo música e imagen">
                    Sin voz
                  </Opcion>
                  {vozConectada ? (
                    <>
                      <span className="cc-grupo-nombre">Voces de Gemini</span>
                      <div className="cc-voces">
                        {VOCES_GEMINI.map((v) => (
                          <div key={v.id} className="cc-voz-fila">
                            <Opcion elegida={voz === v.id} onClick={() => ((vozTocada.current = true), setVoz(v.id), void window.recorte.vozGuardar({ vozGemini: v.id }), cerrar())} nota={v.descripcion}>
                              {v.id}
                            </Opcion>
                            <button
                              type="button"
                              className={`cc-oir ${oyendo === v.id ? 'is-sonando' : ''}`}
                              onClick={() => void oir(v.id)}
                              disabled={cargandoMuestra !== null && cargandoMuestra !== v.id}
                              title={oyendo === v.id ? 'Parar' : `Oír a ${v.id}`}
                              aria-label={oyendo === v.id ? 'Parar' : `Oír a ${v.id}`}
                            >
                              {cargandoMuestra === v.id ? <span className="cc-oir-cargando" /> : <Icon name={oyendo === v.id ? 'pause' : 'play'} size={12} />}
                            </button>
                          </div>
                        ))}
                        {errorMuestra && <p className="cc-nota crear-error">{errorMuestra}</p>}
                      </div>
                      <p className="cc-nota">El agente escribe lo que dice y Recorte lo narra con esta voz, frase por frase.</p>
                    </>
                  ) : (
                    <p className="cc-nota">
                      Para narrar con voz, conecta tu cuenta de Google o tu clave de AI Studio en Ajustes → Voz. Después eliges aquí la voz.
                    </p>
                  )}
                </>
              )}
            </Menu>
          )}
          {enAgente && (
            <Menu ancho={300} etiqueta={<><Icon name={directo ? 'play' : 'check'} size={13} /> {directo ? 'Hazlo directo' : 'Pregúntame antes'}</>}>
              {(cerrar) => (
                <>
                  <Opcion elegida={!directo} onClick={() => (setDirecto(false), void window.recorte.preferenciasGuardar({ crearDirecto: false }), cerrar())} nota="ves el plan y dices «Hazlo»">
                    Pregúntame antes
                  </Opcion>
                  <Opcion elegida={directo} onClick={() => (setDirecto(true), void window.recorte.preferenciasGuardar({ crearDirecto: true }), cerrar())} nota="empieza si no tiene dudas">
                    Hazlo directo
                  </Opcion>
                  <p className="cc-nota">En los dos casos ves sus pasos en el chat y puedes pararlo cuando quieras.</p>
                </>
              )}
            </Menu>
          )}

          <span className="tl-flex" />
          {chat?.ocupado ? (
            <button type="button" className="cc-enviar is-parar" onClick={chat.onParar} title="Parar al agente: deja de gastar al instante (Esc)" aria-label="Parar">
              <span className="chat-cuadro" />
            </button>
          ) : (
            <button
              type="button"
              className="cc-enviar"
              onClick={enviar}
              disabled={creando || !agentes.listo || (Boolean(chat) && !peticion.trim())}
              title={agentes.listo ? (chat ? 'Enviar (Enter)' : 'Crear (Enter)') : 'Conecta un agente primero'}
              aria-label={chat ? 'Enviar' : 'Crear'}
            >
              <Icon name={creando ? 'clock' : 'enviar'} size={18} />
            </button>
          )}
        </div>
      </div>
      {falta && <p className="crear-error">Escribe qué video quieres para empezar.</p>}
      {enAgente && !chat && (
        <p className="cc-nota-modo">
          <Icon name="sparkles" size={12} /> Tu agente mira tus archivos, te propone un plan corto y lo hace paso a paso: lo ves avanzar en el chat y
          comprueba el resultado antes de entregarlo.
        </p>
      )}
      {!agentes.listo && agentes.cargado && !chat && (
        <p className="crear-error">
          Conecta un agente para crear con IA: él escribe el guion y diseña el video.{' '}
          <button className="op-enlace en-linea" onClick={onConectar}>
            Conectar
          </button>
        </p>
      )}
    </>
  )
}
