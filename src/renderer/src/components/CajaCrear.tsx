import { useEffect, useRef, useState } from 'react'
import {
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
function Menu({ etiqueta, activo, children, ancho }: { etiqueta: React.ReactNode; activo?: boolean; children: (cerrar: () => void) => React.ReactNode; ancho?: number }) {
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
      <button type="button" className={`cc-pastilla ${activo ? 'is-on' : ''} ${abierto ? 'is-abierto' : ''}`} onClick={() => setAbierto((v) => !v)}>
        {etiqueta} <Icon name="chevron" size={11} />
      </button>
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

export function CajaCrear({
  agentes,
  creando,
  estilo,
  onCrear,
  onConectar
}: {
  agentes: Agentes
  creando: boolean
  estilo: string
  onCrear: (p: PeticionCreacion) => void
  onConectar: () => void
}) {
  const [peticion, setPeticion] = useState('')
  const [formato, setFormato] = useState<FormatoCreacion>('vertical')
  const [duracion, setDuracion] = useState(30)
  const [adjuntos, setAdjuntos] = useState<string[]>([])
  const [referencia, setReferencia] = useState<string | null>(null)
  // Agente: trabaja con herramientas (plan → hacer → comprobar). Guiado: guion → voz → video.
  const puedeAgente = Boolean(agentes.activo && ['claude', 'antigravity', 'kimi', 'codex', 'opencode', 'gemini'].includes(agentes.activo.id))
  // Un solo modo: el agente. El paso a paso solo queda de respaldo para quien edita con una
  // llave de API (Gemini, DeepSeek, Grok), que no puede trabajar con herramientas.
  const enAgente = puedeAgente
  // La voz que narra (una de Gemini) o null = sin voz. Empieza con la última que usó, si tiene la voz conectada.
  const [voz, setVoz] = useState<string | null>(null)
  const [vozConectada, setVozConectada] = useState(false)
  const vozTocada = useRef(false)
  // Tras el plan: esperar el «Hazlo» (pregúntame antes) o empezar solo si no hay preguntas.
  const [directo, setDirecto] = useState(false)
  useEffect(() => {
    void window.recorte
      .vozEstado()
      .then((e) => {
        const hay = e.tieneClave || Boolean(e.google?.correo)
        setVozConectada(hay)
        if (hay && !vozTocada.current && e.vozGemini && VOCES_GEMINI.some((v) => v.id === e.vozGemini)) setVoz(e.vozGemini)
      })
      .catch(() => {})
    void window.recorte
      .preferenciasCargar()
      .then((p) => setDirecto(Boolean(p.crearDirecto)))
      .catch(() => {})
  }, [])
  const [falta, setFalta] = useState(false)
  // Quién lo hace: null = optimizado (el agente activo hace todo con su modelo de siempre).
  const [porPaso, setPorPaso] = useState(false)
  const [tGuion, setTGuion] = useState<EleccionTarea | null>(null)
  const [tVideo, setTVideo] = useState<EleccionTarea | null>(null)
  // Google Flow
  const [conFlow, setConFlow] = useState(false)
  const [conChatGPT, setConChatGPT] = useState(false)
  const [derechos, setDerechos] = useState(false)
  const [modeloImagen, setModeloImagen] = useState<string | null>(null)
  const [modeloVideo, setModeloVideo] = useState<string | null>(null)
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
    if (rutas.length) setAdjuntos((a) => [...a, ...rutas.filter((r) => !a.includes(r))].slice(0, 12))
  }

  async function elegirReferencia() {
    const ruta = await window.recorte.elegirReferencia()
    if (ruta) setReferencia(ruta)
  }

  function enviar() {
    if (!peticion.trim()) {
      setFalta(true)
      return
    }
    const tareas = porPaso && (tGuion || tVideo) ? { ...(tGuion ? { guion: tGuion } : {}), ...(tVideo ? { video: tVideo } : {}) } : undefined
    const imagenes = Boolean(modeloImagen) && (modeloImagen === MODELO_CHATGPT ? conChatGPT : conFlow)
    const videos = conFlow && Boolean(modeloVideo)
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
        ...(directo ? { directo: true } : {})
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
      <div className={`crear-caja cc ${falta ? 'is-falta' : ''}`}>
        <textarea
          autoFocus
          value={peticion}
          rows={3}
          placeholder="Qué video quieres… un reel de 30 segundos con 3 trucos para fotografiar comida"
          onChange={(e) => {
            setPeticion(e.target.value)
            setFalta(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enviar()
            }
          }}
        />
        {adjuntos.length > 0 && (
          <div className="crear-adjuntos">
            {adjuntos.map((r) => (
              <span key={r} className="crear-adjunto" title={r}>
                {r.split(/[\\/]/).pop()}
                <button aria-label="Quitar" onClick={() => setAdjuntos((a) => a.filter((x) => x !== r))}>
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
          <button type="button" className="cc-redondo" onClick={() => void adjuntar()} title="Tus fotos o clips para el video" aria-label="Adjuntar">
            <Icon name="paperclip" size={15} />
          </button>
          {enAgente && (
            <Menu ancho={340} activo={Boolean(tVideo)} etiqueta={<>{logoQuien(tVideo)} {corto(tVideo)}</>}>
              {(cerrar) => (
                <>
                  <span className="cc-grupo-nombre">Quién hace el video</span>
                  {opcionesTarea('video', tVideo, cerrar)}
                </>
              )}
            </Menu>
          )}
          {!enAgente && (
          <button
            type="button"
            className={`cc-redondo ${referencia ? 'is-on' : ''}`}
            onClick={() => void elegirReferencia()}
            title="Video de referencia: se analiza para copiar su edición; no entra en tu video"
            aria-label="Video de referencia"
          >
            <Icon name="film" size={15} />
          </button>
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

          <Menu etiqueta={<><Icon name="clock" size={13} /> {duracion} s</>}>
            {(cerrar) =>
              DURACIONES.map((d) => (
                <Opcion key={d} elegida={duracion === d} onClick={() => ((tocado.current = true), setDuracion(d), cerrar())} nota={d <= 15 ? 'un gancho' : d <= 30 ? 'un reel' : d <= 60 ? 'explicar algo' : 'contar a fondo'}>
                  {d} segundos
                </Opcion>
              ))
            }
          </Menu>

          {enAgente ? null : conFlow || conChatGPT ? (
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
                        ? 'ChatGPT hace las imágenes que pida el guion, una a la vez, con el modelo de imágenes de tu plan.'
                        : 'Hace las imágenes que pida el guion, con tus cuentas.'}
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
                    <p className="cc-nota">Hasta 3 clips para las escenas clave. Gastan puntos de Flow (se lee el costo exacto antes de generar).</p>
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
                          <Opcion key={v.id} elegida={voz === v.id} onClick={() => ((vozTocada.current = true), setVoz(v.id), void window.recorte.vozGuardar({ vozGemini: v.id }), cerrar())} nota={v.descripcion}>
                            {v.id}
                          </Opcion>
                        ))}
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
          <button
            type="button"
            className="cc-enviar"
            onClick={enviar}
            disabled={creando || !agentes.listo}
            title={agentes.listo ? 'Crear (Enter)' : 'Conecta un agente primero'}
            aria-label="Crear"
          >
            <Icon name={creando ? 'clock' : 'sparkles'} size={16} />
          </button>
        </div>
      </div>
      {falta && <p className="crear-error">Escribe qué video quieres para empezar.</p>}
      {enAgente && (
        <p className="cc-nota-modo">
          <Icon name="sparkles" size={12} /> Tu agente mira tus archivos, te propone un plan corto y lo hace paso a paso: lo ves avanzar en el chat y
          comprueba el resultado antes de entregarlo.
        </p>
      )}
      {!agentes.listo && agentes.cargado && (
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
