// Escena de referencia del estilo Escenario con foco: «El faro», un cuento en tres cuadros en un teatrito de juguete.
// La sala está a oscuras: solo hay lámparas de teatro, cada una con su luz y su haz visible en el aire (con humo y
// polvo que solo se ven dentro del haz, y que se corta donde toca algo). Todo lo del cuento es cartón grueso pintado:
// recortes con canto, que entran por ranuras del piso o bajan colgados de varas, y se cambian a la vista.
// Lo reutilizable para cualquier cuento (lámparas con haz, polvo, telón, tablas, recortes, varas, ranuras, atril)
// va arriba; el cuento del faro, en construir().
import * as THREE from 'three'
import { U } from './escenario.js'
import { DURACION, T, CARTELES } from './guion.js'
export { DURACION }

export const ACABADO = { tono: 'cine', exposicion: 1.05, brillo: 0.3, umbral: 1.15, vineta: 0.45, grano: 0.018, fov: 30, obturador: 0.4, fondo: '#010102', saturacion: 1.05 }

// ---- medidas del teatro (la boca del escenario mide 9 de ancho y 5 de alto; el fondo es -z)
export const BOCA = { z: 0.45, media: 5.0, alto: 5.0 }
const CAPA = { cielo: -3.3, sol: -3.0, olaAtras: -2.7, nubes: -2.35, lluvia: -2.15, faro: -1.9, olaMedio: -1.6, barco: -1.35, farero: -1.15, olaFrente: -0.9, atril: 1.15 }

// ---------------------------------------------------------------------------------------------------------------
// LÁMPARAS CON HAZ. Cada lámpara es un foco de verdad (ilumina y da sombra) y un cono que dibuja el haz en el aire.
// El haz se calcula por píxel: el rayo de la cámara cruza el cono, se suma la luz que el humo devuelve en cada tramo,
// y se corta donde la cámara ve algo sólido (con la profundidad de la escena) o donde la boca del escenario tapa la
// lámpara. Así el haz termina justo en la mancha de luz que deja en el decorado.
// ---------------------------------------------------------------------------------------------------------------
const HUMO = 0.35 // qué tan cargado está el aire (uno para todos los haces)
const VS_HAZ = 'varying vec3 vMundo; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vMundo = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }'
const HUMO_GLSL = `
  float rz(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  float rv(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(rz(i), rz(i + vec3(1,0,0)), f.x), mix(rz(i + vec3(0,1,0)), rz(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(rz(i + vec3(0,0,1)), rz(i + vec3(1,0,1)), f.x), mix(rz(i + vec3(0,1,1)), rz(i + vec3(1,1,1)), f.x), f.y), f.z); }
  // humo que se arrastra despacio: nunca parejo
  float humo(vec3 p, float t){ return 0.35 + 0.9 * rv(p * 0.55 + vec3(0.09, 0.04, -0.06) * t) + 0.45 * rv(p * 1.7 + vec3(-0.12, 0.07, 0.1) * t); }
  // la boca del escenario tapa la luz que viene de la sala: un punto detrás de ella recibe luz solo si la línea a la
  // lámpara pasa por la abertura
  uniform vec3 uBoca;
  float boca(vec3 p, vec3 a){
    float da = a.z - uBoca.x, dp = p.z - uBoca.x; if (da * dp >= 0.0) return 1.0;
    vec3 q = mix(a, p, da / (da - dp));
    return smoothstep(-0.05, 0.25, uBoca.y - abs(q.x)) * smoothstep(-0.05, 0.25, uBoca.z - q.y);
  }`
const FS_HAZ = `
  uniform vec3 uA, uD, uCol; uniform float uCosE, uCosI, uIni, uFin, uT, uSem;
  uniform sampler2D uProf; uniform mat4 uInv; uniform vec2 uRes;
  varying vec3 vMundo;
  ${HUMO_GLSL}
  void main(){
    vec3 o = cameraPosition, d = normalize(vMundo - o), co = o - uA;
    float dd = dot(d, uD), cd = dot(co, uD), k2 = uCosE * uCosE;
    // el rayo contra el cono (dos raíces); nos quedamos con el tramo del lado que alumbra
    float a = dd * dd - k2, b = dd * cd - dot(d, co) * k2, c = cd * cd - dot(co, co) * k2, disc = b * b - a * c;
    if (disc <= 0.0 || abs(a) < 1e-6) discard;
    float s = sqrt(disc), r1 = (-b - s) / a, r2 = (-b + s) / a, t0, t1;
    if (a < 0.0) { t0 = min(r1, r2); t1 = max(r1, r2); if (cd + dd * 0.5 * (t0 + t1) < 0.0) discard; }
    else if (dd > 0.0) { t0 = max(r1, r2); t1 = 1e5; } else { t0 = -1e5; t1 = min(r1, r2); }
    // empieza en la lente y termina en su alcance
    float hI = (uIni - cd) / dd, hF = (uFin - cd) / dd;
    t0 = max(t0, min(hI, hF)); t1 = min(t1, max(hI, hF));
    // ...o en lo primero sólido que ve la cámara
    vec2 uv = gl_FragCoord.xy / uRes;
    vec4 v = uInv * vec4(uv * 2.0 - 1.0, texture2D(uProf, uv).x * 2.0 - 1.0, 1.0);
    t1 = min(t1, length(v.xyz / v.w));
    t0 = max(t0, 0.0);
    if (t1 <= t0) discard;
    const int PASOS = 28;
    float dt = (t1 - t0) / float(PASOS), j = fract(sin(dot(gl_FragCoord.xy, vec2(41.37, 289.13)) + uSem) * 15731.743), suma = 0.0;
    for (int i = 0; i < PASOS; i++) {
      vec3 p = o + d * (t0 + (float(i) + j) * dt), q = p - uA;
      float h = dot(q, uD);
      float borde = smoothstep(uCosE, uCosI, h / length(q));
      float lejos = pow(uIni / h, 1.4);
      suma += borde * lejos * humo(p, uT) * boca(p, uA);
    }
    float hacia = 0.7 + 0.8 * pow(0.5 - 0.5 * dd, 2.0); // el humo devuelve más luz hacia adelante
    gl_FragColor = vec4(uCol * suma * dt * hacia, 1.0);
  }`
// un cono unitario: vértice en el origen, abre hacia +y
const CONO = (() => { const g = new THREE.ConeGeometry(1, 1, 48, 1, true); g.translate(0, -0.5, 0); g.rotateX(Math.PI); return g })()
const Y = new THREE.Vector3(0, 1, 0)

/** El equipo de luces de un teatro: lámparas con haz, la pasada de profundidad que corta los haces y el polvo. */
export function equipoDeLuces(E) {
  const { scene } = E
  const lamps = []
  const comun = { uBoca: { value: new THREE.Vector3(BOCA.z, BOCA.media, BOCA.alto) }, uProf: { value: null }, uInv: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) } }
  // la pasada de profundidad: justo antes de dibujar los haces, la escena sólida se dibuja otra vez (solo profundidad)
  // desde la misma cámara. La dispara una malla invisible que se dibuja antes que los haces.
  let rt = null, dentro = false
  const soloProf = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
  const sonda = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)), new THREE.MeshBasicMaterial({ transparent: true, colorWrite: false, depthWrite: false, depthTest: false }))
  sonda.frustumCulled = false; sonda.renderOrder = 8
  scene.add(sonda)
  const ocultar = []
  sonda.onBeforeRender = (renderer, sc, cam) => {
    if (dentro) return
    dentro = true
    const actual = renderer.getRenderTarget(), w = actual ? actual.width : renderer.domElement.width, h = actual ? actual.height : renderer.domElement.height
    if (!rt || rt.width !== w || rt.height !== h) {
      rt?.dispose()
      rt = new THREE.WebGLRenderTarget(w, h, { depthTexture: new THREE.DepthTexture(w, h), minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
      comun.uProf.value = rt.depthTexture
      comun.uRes.value.set(w, h)
    }
    const vis = ocultar.filter((o) => o.visible); vis.forEach((o) => (o.visible = false)); sonda.visible = false
    const sombras = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false
    sc.overrideMaterial = soloProf
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cam)
    sc.overrideMaterial = null; renderer.shadowMap.autoUpdate = sombras
    vis.forEach((o) => (o.visible = true)); sonda.visible = true
    renderer.setRenderTarget(actual)
    comun.uInv.value.copy(cam.projectionMatrix).invert()
    dentro = false
  }

  /** lampara({ desde, potencia, angulo, penumbra, lente, haz (cuánto se ve el haz), polvo, suave, mapa, sombra }). */
  function lampara(op) {
    const L = { op, nivel: 0, color: new THREE.Color('#fff'), A: new THREE.Vector3(), D: new THREE.Vector3(0, -1, 0), cosE: 1, cosI: 1, ini: 1 }
    L.luz = E.foco({ desde: op.desde, hacia: [0, 0, 0], potencia: 0, angulo: op.angulo, penumbra: op.penumbra, suave: op.suave ?? 0.1, mapa: op.mapa ?? 1024, cerca: 0.5, lejos: 45, sombra: op.sombra, sesgo: -0.0006 })
    L.u = { ...comun, uA: { value: L.A }, uD: { value: L.D }, uCol: { value: new THREE.Color() }, uCosE: { value: 1 }, uCosI: { value: 1 }, uIni: { value: 1 }, uFin: { value: 40 }, uT: { value: 0 }, uSem: { value: 0 } }
    L.haz = new THREE.Mesh(CONO, new THREE.ShaderMaterial({ vertexShader: VS_HAZ, fragmentShader: FS_HAZ, uniforms: L.u, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide }))
    L.haz.frustumCulled = false; L.haz.renderOrder = 10
    scene.add(L.haz); ocultar.push(L.haz)
    const d = new THREE.Vector3(), tmp = new THREE.Vector3()
    /** apunta(hacia, nivel 0..1, { color, angulo, desde, alcance (cuánto sigue el haz después del punto) }) */
    L.apunta = (hacia, nivel, q = {}) => {
      const desde = q.desde || op.desde, ang = q.angulo ?? op.angulo, lente = op.lente ?? 0.15
      if (q.color) L.color.set(q.color)
      d.set(hacia[0] - desde[0], hacia[1] - desde[1], hacia[2] - desde[2]).normalize()
      const atras = lente / Math.tan(ang) // el vértice del cono queda detrás de la lente
      L.A.set(desde[0], desde[1], desde[2]).addScaledVector(d, -atras); L.D.copy(d); L.nivel = nivel
      L.cosE = Math.cos(ang); L.cosI = Math.cos(ang * (1 - op.penumbra))
      L.luz.position.copy(L.A); L.luz.target.position.set(...hacia); L.luz.angle = ang; L.luz.color.copy(L.color); L.luz.intensity = op.potencia * nivel
      const u = L.u
      u.uCosE.value = L.cosE; u.uCosI.value = L.cosI; u.uIni.value = atras
      u.uCol.value.copy(L.color).multiplyScalar(nivel * (op.haz ?? 1) * HUMO)
      const largo = q.alcance == null ? 40 : tmp.set(...hacia).sub(L.A).length() + q.alcance
      u.uFin.value = largo
      const r = largo * Math.tan(ang) * 1.05
      L.haz.position.copy(L.A); L.haz.quaternion.setFromUnitVectors(Y, d); L.haz.scale.set(r, largo, r); L.haz.visible = nivel > 0.002
    }
    lamps.push(L)
    return L
  }

  // el polvo: motas que solo se ven donde pasa un haz
  let polvo = null
  function hacerPolvo(n = 2600, caja = [-6, 6, 0.1, 6.5, -3, 6]) {
    const N = lamps.length, r = U.azar(7), pos = new Float32Array(n * 3), sem = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) { pos.set([r.rango(caja[0], caja[1]), r.rango(caja[2], caja[3]), r.rango(caja[4], caja[5])], i * 3); sem.set([r(), r(), r(), r()], i * 4) }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSem', new THREE.BufferAttribute(sem, 4))
    const u = { uT: { value: 0 }, uPx: { value: 900 }, uA: { value: lamps.map(() => new THREE.Vector3()) }, uD: { value: lamps.map(() => new THREE.Vector3()) }, uC: { value: lamps.map(() => new THREE.Color()) }, uK: { value: lamps.map(() => new THREE.Vector3()) }, uBoca: comun.uBoca }
    polvo = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: u, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      vertexShader: `uniform float uT, uPx; uniform vec3 uA[${N}], uD[${N}], uC[${N}], uK[${N}]; attribute vec4 aSem; varying vec3 vC;
        ${HUMO_GLSL}
        void main(){
          vec3 p = position + vec3(sin(uT * 0.3 + aSem.x * 6.28) * 0.2 + uT * 0.03, uT * (0.015 + 0.03 * aSem.y) + sin(uT * 0.45 + aSem.z * 6.28) * 0.05, cos(uT * 0.25 + aSem.w * 6.28) * 0.18);
          vec3 c = vec3(0.0);
          for (int i = 0; i < ${N}; i++) { vec3 q = p - uA[i]; float h = dot(q, uD[i]); if (h > uK[i].z) c += uC[i] * smoothstep(uK[i].x, uK[i].y, h / length(q)) * pow(uK[i].z / h, 1.4) * boca(p, uA[i]); }
          vC = c * (0.2 + 0.8 * pow(abs(sin(uT * (0.7 + 2.0 * aSem.y) + aSem.x * 37.0)), 8.0)); // la mota gira y destella
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv; gl_PointSize = (0.012 + 0.01 * aSem.z) * uPx / -mv.z;
        }`,
      fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.1, d), 1.0); }',
    }))
    polvo.frustumCulled = false; polvo.renderOrder = 11
    scene.add(polvo); ocultar.push(polvo)
    return polvo
  }
  /** Cada cuadro: el tiempo del humo y el polvo, al final del alActualizar. */
  function mover(t, alto) {
    lamps.forEach((L, i) => {
      L.u.uT.value = t; L.u.uSem.value = (t * 613 + i * 17) % 53
      if (polvo) { const u = polvo.material.uniforms; u.uA.value[i].copy(L.A); u.uD.value[i].copy(L.D); u.uC.value[i].copy(L.color).multiplyScalar(L.nivel * (L.op.polvo ?? 1) * 4); u.uK.value[i].set(L.cosE, L.cosI, L.u.uIni.value) }
    })
    if (polvo) { polvo.material.uniforms.uT.value = t; polvo.material.uniforms.uPx.value = alto / (2 * Math.tan(30 * Math.PI / 360)) }
  }
  return { lampara, hacerPolvo, mover, lamps }
}

// ---------------------------------------------------------------------------------------------------------------
// RECORTES DE CARTÓN. Un recorte es una lista de piezas en unidades de cartón (y hacia arriba, el pie en y = 0):
//   { pts, color, tinta?, corta? }   un contorno relleno: se pinta Y se corta del cartón (corta: false = solo pintura)
//   { linea, ancho, color }          una línea pintada
//   { pinta(ctx) }                   pintura libre
// carton() pinta la lista en un lienzo (gouache plano, línea de tinta, grano de papel) y extruye los mismos contornos
// en un cartón grueso con su canto de cartón crudo: la silueta es geometría de verdad, da sombra y corta los haces.
// ---------------------------------------------------------------------------------------------------------------
const TINTA = '#24170f', CRUDO = '#d9c9a6'
export const elipse = (cx, cy, rx, ry = rx, n = 28, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (Math.abs(a1 - a0 - Math.PI * 2) < 1e-6 ? n : n - 1); return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] })
export const caja2 = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
/** Suaviza un polígono cortándole las esquinas (Chaikin). */
export const suavizar = (pts, veces = 2) => { for (let k = 0; k < veces; k++) { const o = []; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; o.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]) }); pts = o } return pts }
/** Una línea con grosor (para mástiles, rayos, trazos de lluvia). */
export const cinta = (linea, ancho) => { const iz = [], de = []; linea.forEach((p, i) => { const a = linea[Math.max(0, i - 1)], b = linea[Math.min(linea.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, h = (typeof ancho === 'function' ? ancho(i / (linea.length - 1)) : ancho) / 2; iz.push([p[0] - (dy / l) * h, p[1] + (dx / l) * h]); de.unshift([p[0] + (dy / l) * h, p[1] - (dx / l) * h]) }); return iz.concat(de) }

const madera = new THREE.MeshStandardMaterial({ color: '#7d5532', roughness: 0.7 }), acero = new THREE.MeshStandardMaterial({ color: '#8d9096', roughness: 0.4, metalness: 0.7 })
const cantoMat = new THREE.MeshStandardMaterial({ color: CRUDO, roughness: 0.95 })
export function carton(piezas, op = {}) {
  const cortes = piezas.filter((p) => p.pts && p.corta !== false), m = 0.04
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of cortes) for (const [x, y] of p.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  x0 -= m; y0 -= m; x1 += m; y1 += m
  const w = x1 - x0, h = y1 - y0, px = Math.min(op.px ?? 240, 3600 / w, 3600 / h), grueso = op.grueso ?? 0.045
  const tex = U.lienzo(Math.ceil(w * px), Math.ceil(h * px), (c, W, H) => {
    c.fillStyle = CRUDO; c.fillRect(0, 0, W, H)
    c.setTransform(px, 0, 0, -px, -x0 * px, y1 * px)
    c.lineJoin = c.lineCap = 'round'
    for (const p of piezas) {
      if (p.pinta) { c.save(); p.pinta(c); c.restore(); continue }
      if (p.linea) { c.beginPath(); p.linea.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = p.color || TINTA; c.lineWidth = p.ancho || 0.012; c.stroke(); continue }
      if (!p.color) continue
      c.beginPath(); p.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath()
      c.fillStyle = p.color; c.fill()
      if (p.tinta !== 0) { c.strokeStyle = TINTA; c.lineWidth = p.tinta || 0.013; c.stroke() }
    }
    c.setTransform(1, 0, 0, 1, 0, 0)
    const r = U.azar(op.semilla ?? 3) // grano del papel sobre la pintura
    for (let i = 0; i < (W * H) / 240; i++) { c.fillStyle = r.prob(0.5) ? `rgba(255,246,222,${r.rango(0.02, 0.07)})` : `rgba(45,28,12,${r.rango(0.02, 0.07)})`; c.fillRect(r.rango(0, W), r.rango(0, H), r.rango(1, 3.5), r.rango(1, 3.5)) }
  })
  const v2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y))
  const geo = new THREE.ExtrudeGeometry(cortes.map((p) => new THREE.Shape(v2(p.pts))), { depth: grueso, bevelEnabled: false, curveSegments: 1 })
  geo.translate(0, 0, -grueso / 2)
  const uv = geo.attributes.uv, pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / w, (pos.getY(i) - y0) / h)
  const malla = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), cantoMat]) // caras pintadas, canto crudo
  malla.castShadow = malla.receiveShadow = true
  malla.userData.caja = { x0, y0, x1, y1 }
  return malla
}
/** Colgado de varas desde arriba: puntos del cartón donde van las varas. */
const varaGeo = new THREE.CylinderGeometry(0.012, 0.012, 12, 6).translate(0, 6, 0)
export function colgado(scene, malla, z, varas) { const g = new THREE.Group(); g.position.z = z; g.add(malla); for (const [x, y] of varas) { const v = new THREE.Mesh(varaGeo, acero); v.position.set(x, y, -0.03); g.add(v) } scene.add(g); return g }
/** Parado en un patín de madera dentro de una ranura del piso, empujado desde un costado por un alambre largo. */
export function enRanura(scene, malla, z, lado, anchoPatin) {
  const g = new THREE.Group(); g.position.z = z; malla.position.y = 0.05; g.add(malla)
  const patin = new THREE.Mesh(new THREE.BoxGeometry(anchoPatin, 0.05, 0.13), madera); patin.position.y = 0.03; patin.castShadow = patin.receiveShadow = true; g.add(patin)
  const alambre = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 14, 6).rotateZ(Math.PI / 2), acero); alambre.position.set(lado * (7 + anchoPatin / 2), 0.035, 0); g.add(alambre)
  g.userData.carton = malla
  scene.add(g)
  return g
}

// ---------------------------------------------------------------------------------------------------------------
// EL TEATRO: tablas barnizadas, cortinas de terciopelo con galón dorado y flecos, bambalina, marco y fondo negro.
// ---------------------------------------------------------------------------------------------------------------
function terciopeloTex() {
  return U.lienzo(512, 1024, (c, w, h) => {
    c.fillStyle = '#6c0a16'; c.fillRect(0, 0, w, h)
    const r = U.azar(3)
    for (let i = 0; i < 1100; i++) { c.fillStyle = `rgba(${r.prob(0.5) ? '35,0,6' : '200,50,60'},${r.rango(0.02, 0.07)})`; c.fillRect(r.rango(0, w), 0, r.rango(1, 3), h) } // el pelo corre de arriba abajo
    const g = c.createLinearGradient(0, h * 0.92, 0, h * 0.96); g.addColorStop(0, '#6b4a14'); g.addColorStop(0.35, '#e3b44e'); g.addColorStop(0.7, '#c4922e'); g.addColorStop(1, '#5a3d0e')
    c.fillStyle = g; c.fillRect(0, h * 0.92, w, h * 0.04) // galón dorado
    for (let x = 0; x < w; x += 7) { c.fillStyle = r.prob(0.5) ? '#d6a032' : '#a7731c'; c.fillRect(x, h * 0.96, 4, h * 0.04) } // flecos
  }, { repetir: [4, 1] })
}
function terciopelo(map) {
  const m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color('#e3303c'), sheenRoughness: 0.4, side: THREE.DoubleSide })
  // un resplandor tibio propio del paño (las luces de sala de un teatro nunca lo dejan negro del todo)
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float borde = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
        reflectedLight.directDiffuse += vec3(1.0, 0.7, 0.55) * 0.14 * material.diffuseColor * (0.6 + 2.2 * borde); }`)
  }
  return m
}
/** Una cortina recogida a un lado: tela con pliegues hondos que cuelga de arriba y arrastra un poco abajo. */
function cortina(lado, mat) {
  const ancho = 2.0, alto = 7.2, g = new THREE.PlaneGeometry(ancho, alto, 140, 24), p = g.attributes.position, r = U.azar(lado + 4)
  const amp = Array.from({ length: 14 }, () => r.rango(0.75, 1.25))
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = x / ancho + 0.5, v = y / alto + 0.5, k = u * 11, a = U.mezcla(amp[Math.floor(k)], amp[Math.min(13, Math.floor(k) + 1)], k % 1)
    const z = 0.13 * a * (Math.sin(k * Math.PI * 2) + 0.25 * Math.sin(k * Math.PI * 4 + 1 + v * 2)) * (0.8 + 0.4 * (1 - v))
    const recoge = (1 - v) ** 2 * 0.35 * u // abajo se junta hacia el costado (está recogida)
    p.setXYZ(i, lado * (BOCA.media + 0.25 - (1 - u) * ancho * 0.68 + recoge), y + alto / 2, z)
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; m.position.z = BOCA.z - 0.2
  return m
}
function teatro(scene) {
  // las tablas: largas, de distinto largo, con clavos y rayones de años de decorados; barniz satinado
  const tablas = U.lienzo(1024, 1024, (c, w, h) => {
    const r = U.azar(21), N = 14, pw = w / N
    for (let k = 0; k < N; k++) {
      let y = -r.rango(0, h * 0.6)
      while (y < h) { const L = r.rango(h * 0.45, h * 0.9), tono = r.rango(0.75, 1.15); c.fillStyle = `rgb(${66 * tono | 0},${40 * tono | 0},${24 * tono | 0})`; c.fillRect(k * pw, y, pw, L); for (let i = 0; i < 24; i++) { c.fillStyle = `rgba(${r.prob(0.5) ? '20,10,4' : '125,88,52'},${r.rango(0.04, 0.12)})`; c.fillRect(k * pw + r.rango(0, pw), y, r.rango(0.6, 2), L) } c.fillStyle = 'rgba(8,5,3,0.9)'; c.fillRect(k * pw, y + L - 2, pw, 2.5); y += L }
      c.fillStyle = 'rgba(6,4,2,0.95)'; c.fillRect(k * pw - 1, 0, 2.2, h)
    }
    for (let i = 0; i < 400; i++) { const x = r.rango(0, w), y = r.rango(0, h), l = r.rango(10, 80), a = r.rango(-0.5, 0.5); c.strokeStyle = `rgba(160,118,74,${r.rango(0.03, 0.12)})`; c.lineWidth = r.rango(0.6, 3); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * l, y + Math.cos(a) * l); c.stroke() }
  }, { repetir: [5, 2.5] })
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshStandardMaterial({ map: tablas, roughness: 0.62 }))
  piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0, -1.0); piso.receiveShadow = true; scene.add(piso)
  // el canto del escenario hacia la sala y el foso
  const frente = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 0.3), new THREE.MeshStandardMaterial({ color: '#160a07', roughness: 0.7 })); frente.position.set(0, -0.6, 4.4); scene.add(frente)
  // ranuras del piso
  const ranura = new THREE.MeshBasicMaterial({ color: '#060403' })
  for (const z of [CAPA.olaAtras, CAPA.faro, CAPA.olaMedio, CAPA.barco, CAPA.farero, CAPA.olaFrente]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 0.04).rotateX(-Math.PI / 2), ranura); m.position.set(0, 0.004, z); scene.add(m) }
  // fondo y costados de terciopelo negro: se tragan la luz
  const negro = new THREE.MeshStandardMaterial({ color: '#030203', roughness: 1 })
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), negro); fondo.position.set(0, 7, -4.2); fondo.receiveShadow = true; scene.add(fondo)
  // el marco del escenario (la boca), oscuro con una moldura dorada
  const marcoMat = new THREE.MeshStandardMaterial({ color: '#1a0c08', roughness: 0.55 }), oro = new THREE.MeshStandardMaterial({ color: '#c99a4a', roughness: 0.32, metalness: 0.85 })
  for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 0.5), marcoMat); col.position.set(s * (BOCA.media + 1.5), 4.5, BOCA.z + 0.25); col.castShadow = col.receiveShadow = true; scene.add(col); const mo = new THREE.Mesh(new THREE.BoxGeometry(0.1, BOCA.alto + 1.4, 0.1), oro); mo.position.set(s * (BOCA.media + 0.03), (BOCA.alto + 1.4) / 2, BOCA.z + 0.52); scene.add(mo) }
  const dintel = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.5), marcoMat); dintel.position.set(0, BOCA.alto + 1.4 + 1.5, BOCA.z + 0.25); scene.add(dintel)
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(2 * BOCA.media + 0.16, 0.1, 0.1), oro); moldura.position.set(0, BOCA.alto + 1.4, BOCA.z + 0.52); scene.add(moldura)
  // la bambalina: una franja plisada de terciopelo con galón y flecos
  const tex = terciopeloTex(), mat = terciopelo(tex)
  const bt = tex.clone(); bt.repeat.set(7, 0.32); bt.offset.y = 0.68; bt.needsUpdate = true
  const g = new THREE.PlaneGeometry(2 * BOCA.media + 2.6, 1.5, 240, 6), p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.06 * Math.sin(x * 7.5) + 0.025 * Math.sin(x * 19 + 1.1)); if (y < -0.6) p.setY(i, y + 0.06 * Math.cos(x * 7.5)) }
  g.computeVertexNormals()
  const bamb = new THREE.Mesh(g, terciopelo(bt)); bamb.position.set(0, BOCA.alto + 0.75, BOCA.z - 0.05); bamb.castShadow = true; scene.add(bamb)
  // las cortinas recogidas a los lados
  const cortinas = [-1, 1].map((s) => { const c = cortina(s, mat); scene.add(c); return c })
  // la sala: respaldos de butacas en silueta abajo, fuera de foco
  const butaca = new THREE.MeshStandardMaterial({ color: '#1c0709', roughness: 0.7 }), sombra = new THREE.MeshStandardMaterial({ color: '#050304', roughness: 1 }), ra = U.azar(13)
  for (let i = -8; i <= 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.2), butaca); b.position.set(i * 0.92, -0.2, 6.4); scene.add(b); if (ra.prob(0.55)) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), sombra); c.position.set(i * 0.92 + ra.rango(-0.1, 0.1), 0.48, 6.45); c.scale.y = 1.15; scene.add(c) } }
  return { cortinas }
}

/** El atril con sus tarjetas: un lugar en rojo y una o dos líneas. La de adelante se tira para mostrar la siguiente. */
function atril(scene, carteles, fuente) {
  const A = { x: 3.4, ancho: 2.6, alto: 1.25, y: 0.32 }, PX = 360
  const g = new THREE.Group(); g.position.set(A.x, 0, CAPA.atril); g.rotation.x = -0.1; scene.add(g)
  for (const s of [-1, 1]) { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.9, 0.05), madera); pata.position.set(s * 1.08, 0.93, -0.06); pata.rotation.z = -s * 0.07; pata.castShadow = true; g.add(pata) }
  const repisa = new THREE.Mesh(new THREE.BoxGeometry(A.ancho + 0.2, 0.05, 0.14), madera); repisa.position.set(0, A.y - 0.03, 0.03); repisa.castShadow = true; g.add(repisa)
  const borde = new THREE.MeshStandardMaterial({ color: '#d7cba9', roughness: 0.9 })
  const tarjetas = carteles.map((k, i) => {
    const tex = U.lienzo(A.ancho * PX, Math.round(A.alto * PX), (c, W, H) => {
      c.fillStyle = '#ebe1c8'; c.fillRect(0, 0, W, H)
      const r = U.azar(70 + i); for (let j = 0; j < 2400; j++) { c.fillStyle = r.prob(0.5) ? `rgba(255,250,235,${r.rango(0.03, 0.08)})` : `rgba(60,40,15,${r.rango(0.02, 0.06)})`; c.fillRect(r.rango(0, W), r.rango(0, H), r.rango(1, 4), r.rango(1, 4)) }
      c.strokeStyle = '#161210'; c.lineWidth = 6; c.strokeRect(18, 18, W - 36, H - 36); c.lineWidth = 2; c.strokeRect(30, 30, W - 60, H - 60)
      c.textAlign = 'center'; c.fillStyle = '#93201a'; c.font = fuente(700, 58); c.letterSpacing = '6px'; c.fillText(k.lugar, W / 2 + 3, 104); c.letterSpacing = '0px'
      c.fillRect(W / 2 - 64, 124, 128, 5)
      c.fillStyle = '#161210'
      k.lineas.forEach((l, n) => { let tam = 130; c.font = fuente(500, tam); const ancho = c.measureText(l).width; if (ancho > W - 120) { tam *= (W - 120) / ancho; c.font = fuente(500, tam) } c.fillText(l, W / 2, [270, 405][n]) })
    })
    const m = new THREE.Mesh(new THREE.BoxGeometry(A.ancho, A.alto, 0.014), [borde, borde, borde, borde, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), borde])
    m.position.set(0, A.y + A.alto / 2, 0.02 * (carteles.length - i)); m.castShadow = m.receiveShadow = true; g.add(m)
    return m
  })
  return { g, tarjetas, centro: [A.x, A.y + A.alto / 2, CAPA.atril] }
}

// ---------------------------------------------------------------------------------------------------------------
// EL CUENTO DEL FARO
// ---------------------------------------------------------------------------------------------------------------
const AZUL = ['#1e4f7a', '#2b6a92', '#3f86a8'], PIEL = '#e2b088'
function olaArte(ancho, alto, color, semilla, cresta = true) {
  const N = U.ruido(semilla), xs = Array.from({ length: Math.round(ancho * 5) + 1 }, (_, i) => -ancho / 2 + i / 5)
  const borde = xs.map((x) => [x, alto * (0.75 + 0.18 * Math.sin(x * 2.4 + semilla) + 0.1 * N.n2(x * 0.7, semilla))])
  const it = [{ pts: [[-ancho / 2, 0], ...borde, [ancho / 2, 0]], color, tinta: 0.014 }]
  if (cresta) it.push({ pinta(c) { c.beginPath(); borde.forEach(([x, y], i) => (i ? c.lineTo(x, y - 0.05) : c.moveTo(x, y - 0.05))); c.strokeStyle = 'rgba(235,245,250,0.55)'; c.lineWidth = 0.05; c.stroke(); for (let k = 0; k < ancho * 3; k++) { const x = -ancho / 2 + k / 3 + 0.1, y = alto * 0.45 + 0.12 * Math.sin(k * 1.7); c.beginPath(); c.arc(x, y, 0.12, 0.2, Math.PI - 0.2); c.strokeStyle = 'rgba(10,25,45,0.35)'; c.lineWidth = 0.02; c.stroke() } } })
  return it
}
function faroArte() {
  const it = []
  it.push({ pts: suavizar([[-1.25, 0], [1.2, 0], [1.05, 0.5], [0.6, 0.85], [-0.5, 0.9], [-1.05, 0.55]], 2), color: '#5d5146' }) // la roca
  it.push({ pinta(c) { c.fillStyle = 'rgba(30,22,16,0.35)'; for (const [x, y, r] of [[-0.6, 0.35, 0.18], [0.3, 0.25, 0.22], [0.75, 0.55, 0.12]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill() } } })
  const torre = [[-0.42, 0.75], [0.42, 0.75], [0.3, 3.0], [-0.3, 3.0]]
  it.push({ pts: torre, color: '#f2e8d4' })
  it.push({ pinta(c) { c.save(); c.beginPath(); torre.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.clip(); c.fillStyle = '#c23b2e'; for (const y of [1.1, 1.85, 2.6]) c.fillRect(-1, y, 2, 0.38); c.restore() } })
  it.push({ pts: caja2(-0.12, 0.75, 0.12, 1.15), color: '#5a3a24', corta: false }) // puerta
  it.push({ pts: caja2(-0.45, 3.0, 0.45, 3.1), color: '#2b2b30' }) // balcón
  it.push({ pts: caja2(-0.24, 3.1, 0.24, 3.55), color: '#f7d36a' }) // la linterna (vidrio)
  it.push({ linea: [[-0.08, 3.1], [-0.08, 3.55]], ancho: 0.02 }, { linea: [[0.08, 3.1], [0.08, 3.55]], ancho: 0.02 })
  it.push({ pts: [[-0.32, 3.55], [0.32, 3.55], [0, 3.95]], color: '#c23b2e' })
  it.push({ pts: caja2(-0.5, 0.55, -1.6, 0.68), color: '#6a4a2c' }) // el muelle
  it.push({ pts: caja2(-1.45, 0, -1.37, 0.6), color: '#4b331e' }, { pts: caja2(-0.85, 0, -0.77, 0.6), color: '#4b331e' })
  return it
}
function fareroArte(levanta = 0) {
  const it = [], s = 1
  it.push({ pts: suavizar([[-0.15, 0], [0.15, 0], [0.17, 0.55], [0.1, 0.72], [-0.1, 0.72], [-0.17, 0.55]], 1), color: '#2f4a6e' }) // capote
  it.push({ pts: caja2(-0.1, 0, -0.03, 0.12), color: '#1a1410' }, { pts: caja2(0.03, 0, 0.1, 0.12), color: '#1a1410' })
  it.push({ pts: elipse(0, 0.86, 0.13, 0.14, 20), color: PIEL })
  it.push({ pts: elipse(0.0, 0.8, 0.12, 0.08, 16, Math.PI, Math.PI * 2), color: '#ece6da', corta: false, tinta: 0.006 }) // barba
  it.push({ pts: [[-0.17, 0.92], [0.17, 0.92], [0.12, 1.06], [-0.12, 1.06]], color: '#e0b43a' }) // sombrero de agua
  it.push({ pts: elipse(0.05, 0.89, 0.016, 0.02, 8), color: TINTA, corta: false, tinta: 0 })
  const ay = 0.5 + 0.35 * levanta, ax = 0.27 + 0.05 * levanta
  it.push({ pts: cinta([[0.1, 0.62], [ax, ay]], 0.07), color: '#2f4a6e' }) // brazo
  it.push({ pts: caja2(ax - 0.07, ay - 0.2, ax + 0.07, ay - 0.04), color: '#f2c14e' }, { pts: caja2(ax - 0.05, ay - 0.04, ax + 0.05, ay), color: '#2b2b30' }) // farol
  return place(it, s)
}
const place = (it, s) => it.map((p) => ({ ...p, pts: p.pts?.map(([x, y]) => [x * s, y * s]), linea: p.linea?.map(([x, y]) => [x * s, y * s]) }))
function barcoArte() {
  const it = []
  it.push({ pts: [[-0.85, 0.35], [0.95, 0.35], [0.7, 0], [-0.6, 0]], color: '#b8432f' }) // casco
  it.push({ pts: caja2(-0.85, 0.3, 0.95, 0.38), color: '#f2e8d4' })
  it.push({ pts: caja2(-0.45, 0.38, 0.05, 0.75), color: '#f2e8d4' }, { pts: caja2(-0.38, 0.5, -0.22, 0.64), color: '#f7d36a', corta: false }, { pts: caja2(-0.15, 0.5, 0.0, 0.64), color: '#f7d36a', corta: false })
  it.push({ pts: [[-0.5, 0.75], [0.1, 0.75], [-0.2, 0.86]], color: '#2f4a6e' })
  it.push({ pts: cinta([[0.4, 0.38], [0.4, 1.55]], 0.045), color: '#5a3a24' }) // mástil
  it.push({ pts: [[0.42, 1.5], [0.85, 1.38], [0.42, 1.26]], color: '#f2c14e' }) // banderín
  it.push({ pts: [[0.44, 1.2], [0.9, 0.45], [0.44, 0.45]], color: '#efe6cf' }) // vela
  return it
}
function nubeArte(ancho, semilla, color = '#3c4552') {
  const r = U.azar(semilla), pts = []
  for (let i = 0; i <= 24; i++) { const a = Math.PI - (i / 24) * Math.PI; pts.push([Math.cos(a) * ancho / 2, 0.35 + Math.max(0, Math.sin(a)) * (0.5 + 0.35 * r()) * ancho * 0.28]) }
  pts.push([ancho / 2, 0.1], [-ancho / 2, 0.1])
  return [{ pts: suavizar(pts, 2), color }, { pinta(c) { c.fillStyle = 'rgba(255,255,255,0.08)'; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(-ancho / 3 + k * ancho / 6, 0.5, ancho * 0.1, 0.12, 0, 0, 7); c.fill() } } }]
}
function lluviaArte(ancho, semilla) {
  const r = U.azar(semilla), it = [{ pts: caja2(-ancho / 2, 2.9, ancho / 2, 2.98), color: '#59616d' }]
  for (let x = -ancho / 2 + 0.1; x < ancho / 2; x += 0.22) { const y1 = 2.9, y0 = r.rango(0.4, 1.6); it.push({ pts: cinta([[x, y1], [x - 0.25 * (y1 - y0) / 2.5, y0]], 0.025), color: '#9fb6c8', tinta: 0 }) }
  return it
}
function rayoArte() { return [{ pts: [[0, 2.2], [0.35, 2.2], [0.12, 1.35], [0.42, 1.35], [-0.2, 0], [0.02, 1.05], [-0.28, 1.05]], color: '#ffe66b' }] }
function solArte() { const it = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; it.push({ pts: [[Math.cos(a - 0.1) * 0.62, 0.9 + Math.sin(a - 0.1) * 0.62], [Math.cos(a) * 0.95, 0.9 + Math.sin(a) * 0.95], [Math.cos(a + 0.1) * 0.62, 0.9 + Math.sin(a + 0.1) * 0.62]], color: '#f5a23a' }) } it.push({ pts: elipse(0, 0.9, 0.62, 0.62, 40), color: '#f7c94a' }); return it }
function lunaArte() { return [{ pts: elipse(0, 0.5, 0.4, 0.4, 40), color: '#f1e6c4' }, { pinta(c) { c.fillStyle = 'rgba(150,135,100,0.45)'; for (const [x, y, r] of [[-0.12, 0.6, 0.08], [0.1, 0.42, 0.06], [0.15, 0.68, 0.045], [-0.05, 0.32, 0.05]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill() } } }] }

export async function construir(E) {
  const { scene } = E
  const F = await U.fuente('Oswald', 500); await U.fuente('Oswald', 700)
  const fuente = (peso, px) => `${peso} ${px}px "Oswald"`
  teatro(scene)
  const luces = equipoDeLuces(E)

  // ---- el telón de fondo: un cielo pintado de noche, iluminado desde abajo por la fila de luces de horizonte
  const cielo = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ roughness: 1, map: U.lienzo(1400, 700, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#0b1830'); g.addColorStop(0.6, '#1f3d66'); g.addColorStop(1, '#6c8fb0'); c.fillStyle = g; c.fillRect(0, 0, w, h)
    const r = U.azar(8); for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,248,220,${r.rango(0.3, 0.9)})`; c.beginPath(); c.arc(r.rango(0, w), r.rango(0, h * 0.6), r.rango(0.8, 2.4), 0, 7); c.fill() }
    for (let i = 0; i < 8; i++) { const x = r.rango(0, w), y = r.rango(h * 0.2, h * 0.6); for (let k = 0; k < 12; k++) { c.fillStyle = `rgba(200,215,235,${r.rango(0.03, 0.08)})`; c.beginPath(); c.ellipse(x + r.rango(-120, 120), y + r.rango(-8, 8), r.rango(60, 160), r.rango(6, 16), 0, 0, 7); c.fill() } }
    for (let i = 0; i < (w * h) / 300; i++) { c.fillStyle = r.prob(0.5) ? `rgba(255,244,220,${r.rango(0.02, 0.05)})` : `rgba(10,15,30,${r.rango(0.02, 0.05)})`; c.fillRect(r.rango(0, w), r.rango(0, h), 2, 2) }
  }) }))
  cielo.material.emissiveMap = U.lienzo(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2b2f6a'); g.addColorStop(0.45, '#c86a7a'); g.addColorStop(0.8, '#ffb070'); g.addColorStop(1, '#ffd9a0'); c.fillStyle = g; c.fillRect(0, 0, w, h) })
  cielo.material.emissive.set('#ffffff'); cielo.material.emissiveIntensity = 0
  cielo.position.set(0, 3.2, CAPA.cielo); cielo.receiveShadow = false; scene.add(cielo)
  const horizonte = [-5, -2.5, 0, 2.5, 5].map((x) => { const l = new THREE.PointLight('#ffffff', 0, 7, 1.4); l.position.set(x, 0.7, CAPA.cielo + 0.4); scene.add(l); return l })

  // ---- el decorado
  const olas = [[CAPA.olaAtras, 16, 1.25, AZUL[0], 11], [CAPA.olaMedio, 17, 0.95, AZUL[1], 12], [CAPA.olaFrente, 18, 0.6, AZUL[2], 13]].map(([z, an, al, col, s], i) => { const m = carton(olaArte(an, al, col, s), { semilla: s }); m.position.z = z; scene.add(m); return { m, i } })
  const faro = carton(faroArte(), { semilla: 4, px: 280 }); faro.position.set(-3.1, 0, CAPA.faro); scene.add(faro)
  const LINTERNA = [-3.1, 3.33, CAPA.faro + 0.05]
  const brilloLinterna = new THREE.PointLight('#ffd27a', 0, 3, 1.6); brilloLinterna.position.set(LINTERNA[0], LINTERNA[1], LINTERNA[2] + 0.25); scene.add(brilloLinterna)
  const farero = enRanura(scene, carton(fareroArte(0), { semilla: 6, px: 420 }), CAPA.farero, -1, 0.5)
  const fareroSaluda = carton(fareroArte(1), { semilla: 6, px: 420 }); fareroSaluda.visible = false; fareroSaluda.position.y = 0.05; farero.add(fareroSaluda)
  const barco = enRanura(scene, carton(barcoArte(), { semilla: 9, px: 300 }), CAPA.barco, 1, 1.4)
  const nubes = [[-1.5, 5.2, 21], [2.0, 4.6, 22], [0.4, 3.6, 23]].map(([x, an, s], i) => { const g = colgado(scene, carton(nubeArte(an, s, ['#3a4350', '#465061', '#2f3742'][i]), { semilla: s }), CAPA.nubes - i * 0.05, [[-an * 0.3, 0.9], [an * 0.3, 0.9]]); g.userData.x = x; g.userData.y = [3.55, 3.9, 4.25][i]; return g })
  const lluvias = [-2.5, 0.8, 3.6].map((x, i) => { const g = colgado(scene, carton(lluviaArte(2.6, 30 + i), { semilla: 30 + i, grueso: 0.02 }), CAPA.lluvia - i * 0.04, [[0, 2.94]]); g.userData.x = x; return g })
  const rayo = colgado(scene, carton(rayoArte(), { semilla: 40 }), CAPA.lluvia + 0.1, [[0.2, 2.2]]); rayo.position.x = 1.3
  const sol = colgado(scene, carton(solArte(), { semilla: 41 }), CAPA.sol, [[0, 1.6]]); sol.position.x = 1.6
  const luna = colgado(scene, carton(lunaArte(), { semilla: 42 }), CAPA.sol + 0.05, [[0, 0.9]]); luna.position.set(2.6, 3.4, CAPA.sol + 0.05)
  const { tarjetas, centro: ATRIL } = atril(scene, CARTELES, fuente)

  // ---- las luces del teatro
  const sigue = luces.lampara({ desde: [-5.5, 7.2, 12], potencia: 1500, angulo: 0.085, penumbra: 0.5, lente: 0.16, haz: 0.7, suave: 0.12 })
  const banos = [-1, 1].map((s) => luces.lampara({ desde: [s * 5.8, 5.8, 10.5], potencia: 900, angulo: 0.48, penumbra: 0.85, lente: 0.2, haz: 0.06, polvo: 0.15, suave: 0.16, mapa: 2048 }))
  const cenital = luces.lampara({ desde: [0.4, 8.8, -0.6], potencia: 1400, angulo: 0.2, penumbra: 0.6, lente: 0.14, haz: 2.0, suave: 0.06 })
  const especial = luces.lampara({ desde: [1.4, 6.4, 11], potencia: 900, angulo: 0.13, penumbra: 0.45, lente: 0.14, haz: 0.12, polvo: 0.3, suave: 0.1 })
  const faroLuz = luces.lampara({ desde: LINTERNA, potencia: 260, angulo: 0.09, penumbra: 0.5, lente: 0.1, haz: 3.0, polvo: 0.6, suave: 0.04, mapa: 1024 })
  luces.hacerPolvo()

  // ---- el libro de apuntes: dónde está todo en el segundo t
  const C = { ambar: '#ffc58a', tibio: '#ffe0bc', noche: '#7d9dde', tormenta: '#7fb6b0', alba: '#ffb07a', blanco: '#f3f0ea', dorado: '#ffd27a' }
  const col = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()
  const tr = U.tramo, cu = U.curva
  const cam = {
    pos: U.camino([[0, [-0.6, 2.75, 11.4]], [3.6, [-0.1, 2.8, 11.8]], [7.4, [0.3, 2.85, 11.6]], [DURACION + 0.5, [0.45, 3.0, 10.9]]]),
    mira: U.camino([[0, [-0.7, 2.45, -1.2]], [3.6, [-0.1, 2.5, -1.2]], [7.4, [0.2, 2.5, -1.2]], [DURACION + 0.5, [0.15, 2.45, -1.2]]]),
  }
  const ola = (i, t) => Math.sin(t * (1.1 + i * 0.25) + i * 1.7) * (0.04 + 0.08 * U.suave(T.tormenta, T.tormenta + 1, t) * (1 - U.suave(T.amanece, T.amanece + 1.2, t)))

  E.alActualizar((t) => {
    // compuesto en 16:9; en un cuadro más angosto (4:3, vertical) la cámara se aleja para que entre todo el escenario
    const lejos = Math.max(1, (16 / 9) / (E.W / E.H)), m = cam.mira(t), p = cam.pos(t)
    E.camara(p.map((v, k) => m[k] + (v - m[k]) * lejos), m)
    E.enfoque([0, 2, -1.3], 0.012)
    const tormenta = U.suave(T.tormenta, T.tormenta + 0.9, t) * (1 - U.suave(T.amanece, T.amanece + 1.0, t)), alba = U.suave(T.amanece, T.amanece + 1.6, t)

    // las olas se mecen (más en la tormenta)
    olas.forEach(({ m, i }) => { m.position.x = Math.sin(t * 0.4 + i) * 0.15 + (i - 1) * 0.3; m.position.y = ola(i, t) - 0.02 })
    // el farero: entra por su ranura hasta la puerta, y al final levanta el farol
    const fx = U.mezcla(-7.5, -2.45, tr(t, T.farero[0], T.farero[1], cu.entraSale))
    const vel = (U.mezcla(-7.5, -2.45, tr(t + 0.02, T.farero[0], T.farero[1], cu.entraSale)) - fx) / 0.02
    farero.position.x = fx; farero.userData.carton.rotation.z = -0.02 * vel * Math.sin(t * 16)
    const saluda = t > T.saluda; farero.userData.carton.visible = !saluda; fareroSaluda.visible = saluda
    fareroSaluda.rotation.z = saluda ? Math.sin((t - T.saluda) * 9) * 0.05 * Math.exp(-(t - T.saluda) * 1.5) : 0
    // el barco: entra entre las olas, se sacude con la tormenta y va al muelle
    const bx = t < T.vuelve[0] ? U.mezcla(8, 1.4, tr(t, T.barco[0], T.barco[1], cu.sale)) : U.mezcla(1.4, -1.75, tr(t, T.vuelve[0], T.vuelve[1], cu.entraSale))
    barco.position.x = bx; barco.position.y = 0.12 + ola(1, t + 0.4) * 1.6
    barco.userData.carton.rotation.z = Math.sin(t * 2.1) * (0.05 + 0.13 * tormenta)
    // las nubes y la lluvia bajan colgadas; el rayo cae en cada trueno; al amanecer suben todas
    nubes.forEach((g, i) => { const baja = cu.saleAtras(tr(t, T.tormenta + i * 0.12, T.tormenta + 0.8 + i * 0.12), 1.2), sube = tr(t, T.amanece + i * 0.1, T.amanece + 0.9 + i * 0.1, cu.entra); g.position.set(g.userData.x + Math.sin(t * 0.5 + i) * 0.12, g.userData.y + 5 * (1 - baja) + 5.5 * sube, g.position.z); g.rotation.z = Math.sin(t * 0.8 + i) * 0.02 })
    lluvias.forEach((g, i) => { const baja = tr(t, T.lluvia + i * 0.1, T.lluvia + 0.6 + i * 0.1, cu.sale), sube = tr(t, T.amanece, T.amanece + 0.8, cu.entra); g.position.set(g.userData.x + Math.sin(t * 7 + i) * 0.04, 6 * (1 - baja) + 6 * sube, g.position.z) })
    const flash = Math.max(...T.rayos.map((r) => (t >= r ? Math.exp(-(t - r) * 9) * (1 + 0.6 * Math.sin((t - r) * 60)) : 0)))
    rayo.visible = T.rayos.some((r) => t >= r && t < r + 0.22); rayo.position.y = 2.0; rayo.position.x = t > T.rayos[1] ? -0.6 : 1.3
    // la luna se va, el sol sube por detrás de las olas
    luna.position.y = 3.4 + 6 * tr(t, T.amanece - 0.2, T.amanece + 0.7, cu.entra)
    sol.position.y = U.mezcla(-1.4, 1.35, tr(t, T.sol[0], T.sol[1], cu.sale))
    // el atril: la tarjeta de adelante se tira a la derecha
    tarjetas.forEach((m, i) => { m.position.x = i < 2 ? 4.5 * tr(t, T.cartel[i], T.cartel[i] + 0.5, cu.entra) : 0 })

    // ---- la luz: cada lámpara sigue la acción y toma el color de la escena
    const enBarco = U.suave(T.barco[0] + 0.2, T.barco[0] + 1.2, t)
    const sobreFarero = [farero.position.x, 0.75, CAPA.farero], sobreBarco = [barco.position.x, 0.75, CAPA.barco]
    sigue.apunta(sobreFarero.map((v, k) => U.mezcla(v, sobreBarco[k], enBarco)), (0.35 + 0.65 * U.suave(T.farero[0], T.farero[0] + 0.4, t)) * (1 - 0.5 * Math.sin(Math.PI * U.limitar((t - T.barco[0]) / 1.2))), { color: col(C.tibio, C.blanco, enBarco), angulo: 0.085, alcance: 1.2 })
    const lavado = U.mezcla(U.mezcla(0.55, 0.3, tormenta), 0.62, alba), tono = col(col(C.noche, C.tormenta, tormenta), C.alba, alba)
    banos.forEach((L, i) => L.apunta([(i ? -1 : 1) * 1.6, 1.8, -1.6], lavado * (1 + 1.6 * flash), { color: flash > 0.2 ? C.blanco : tono }))
    cenital.apunta([0.3, 0.2, -1.4], U.mezcla(0.55, 0.25, tormenta) * (1 + alba * 0.4) + flash * 2.5, { color: flash > 0.2 ? C.blanco : col(col(C.ambar, C.tormenta, tormenta), C.dorado, alba), alcance: 1.0 })
    especial.apunta(ATRIL, 0.6, { color: C.tibio })
    // el faro: se enciende, gira barriendo el mar, se detiene sobre el barco y lo acompaña hasta el muelle
    const enc = U.suave(T.enciende, T.enciende + 0.25, t)
    const giro = (t - T.enciende) * 1.6, barrido = [LINTERNA[0] + Math.sin(giro) * 7, 0.6 + 0.4 * Math.cos(giro * 0.5), LINTERNA[2] + Math.cos(giro) * 4.5 + 2]
    const fija = U.suave(T.encuentra - 0.35, T.encuentra + 0.15, t), destino = [barco.position.x + 0.2, 0.9, CAPA.barco]
    faroLuz.apunta(barrido.map((v, k) => U.mezcla(v, destino[k], fija)), enc * (1 - 0.6 * alba * U.suave(T.vuelve[1], T.vuelve[1] + 1, t)), { color: C.dorado })
    brilloLinterna.intensity = 6 * enc
    horizonte.forEach((l) => { l.intensity = U.mezcla(U.mezcla(2.2, 1.0, tormenta), 6, alba) + 4 * flash; l.color.set(flash > 0.2 ? C.blanco : col(col('#6c8fd8', '#5f9a96', tormenta), '#ff9a62', alba)) })
    cielo.material.emissiveIntensity = 0.55 * alba
    luces.mover(t, 1080)
  })
}
