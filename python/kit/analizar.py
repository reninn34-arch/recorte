"""
Analiza un video toma por toma, en local y sin gastar nada: dónde corta, cómo se mueve la cámara en cada toma, qué
encuadre tiene, de dónde sale la imagen (grabada, gráfico o pantalla, foto con movimiento), cómo está de luz, color y
nitidez, si hay texto encima, y el sonido: el tempo de la música, si los cortes caen en el ritmo y si llevan un golpe
de sonido. Sirve para entender una referencia («edítalo como este») y para escoger las buenas de tus propias tomas.

Las ideas (separar en tomas, juntar pruebas medidas antes de opinar, decir «míralo» cuando no se sabe) vienen de
rea-video (https://github.com/JuneYaooo/rea-video, Apache 2.0, de JuneYaooo); este código es propio de Recorte.

Deja en la carpeta de salida, para leer por capas y gastar pocos tokens:
    ANALISIS.md   el resumen del video (empieza por aquí)
    tomas.md      una línea por toma
    tomas/        un fotograma de cada toma (toma-01.jpg…)
    analisis.json todo lo medido

    python analizar.py video.mp4 --salida analisis/ref [--ffmpeg …] [--ffprobe …]
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys

import numpy as np

try:
    import cv2
except Exception:  # Sin OpenCV se mide igual, salvo la cámara, las caras y el texto.
    cv2 = None

FPS_ANALISIS = 8
ANCHO_MOV = 192
ANCHO_FOTO = 640
MAX_TOMAS = 120
VERSION = 1


# ---------------------------------------------------------------------------
# Leer el video
# ---------------------------------------------------------------------------

def probar(ffprobe, ruta):
    r = subprocess.run([ffprobe, '-v', 'error', '-show_entries',
                        'format=duration:stream=codec_type,width,height,r_frame_rate:stream_tags=rotate:stream_side_data=rotation',
                        '-of', 'json', ruta], capture_output=True, text=True, encoding='utf-8', errors='replace')
    d = json.loads(r.stdout or '{}')
    v = next((s for s in d.get('streams', []) if s.get('codec_type') == 'video'), None)
    if not v:
        raise SystemExit('Ese archivo no tiene imagen.')
    w, h = int(v.get('width') or 0), int(v.get('height') or 0)
    giro = 0
    try:
        giro = int(float((v.get('tags') or {}).get('rotate') or 0))
    except ValueError:
        pass
    for sd in v.get('side_data_list') or []:
        if 'rotation' in sd:
            giro = int(float(sd['rotation']))
    if abs(giro) % 180 == 90:
        w, h = h, w
    try:
        a, b = (v.get('r_frame_rate') or '30/1').split('/')
        fps = float(a) / float(b or 1)
    except (ValueError, ZeroDivisionError):
        fps = 30.0
    return {'duracion': float((d.get('format') or {}).get('duration') or 0), 'ancho': w, 'alto': h, 'fps': round(fps, 2),
            'audio': any(s.get('codec_type') == 'audio' for s in d.get('streams', []))}


def cuadros(ffmpeg, ruta, ancho, alto):
    """Los cuadros a FPS_ANALISIS, pequeños y en RGB, de uno en uno (un video largo no llena la memoria)."""
    p = subprocess.Popen([ffmpeg, '-v', 'error', '-i', ruta, '-vf', f'fps={FPS_ANALISIS},scale={ancho}:{alto}',
                          '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    n = ancho * alto * 3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield np.frombuffer(b, np.uint8).reshape(alto, ancho, 3)
    finally:
        p.stdout.close()
        p.wait()


def foto(ffmpeg, ruta, t, ancho, alto):
    r = subprocess.run([ffmpeg, '-v', 'error', '-ss', f'{max(0.0, t):.3f}', '-i', ruta, '-frames:v', '1',
                        '-vf', f'scale={ancho}:{alto}', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True)
    n = ancho * alto * 3
    if len(r.stdout) < n:
        return None
    return np.frombuffer(r.stdout[:n], np.uint8).reshape(alto, ancho, 3)


def audio(ffmpeg, ruta, sr=22050):
    r = subprocess.run([ffmpeg, '-v', 'error', '-i', ruta, '-vn', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


# ---------------------------------------------------------------------------
# Medidas de la imagen
# ---------------------------------------------------------------------------

def movimiento(prev, nxt):
    """Cuánto se mueve la imagen entera de un cuadro al siguiente: (dx, dy) en anchos de cuadro, la escala (>1 es que
    se acerca), qué parte de los puntos sigue ese movimiento, y cuántos puntos había. None si no hay de dónde agarrarse."""
    if cv2 is None:
        return None
    p0 = cv2.goodFeaturesToTrack(prev, maxCorners=160, qualityLevel=0.01, minDistance=6)
    if p0 is None or len(p0) < 12:
        return None
    p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, nxt, p0, None, winSize=(15, 15), maxLevel=2)
    bien = st.reshape(-1) == 1
    if bien.sum() < 10:
        return None
    a, b = p0.reshape(-1, 2)[bien], p1.reshape(-1, 2)[bien]
    M, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.5)
    if M is None:
        return None
    escala = math.hypot(M[0, 0], M[1, 0])
    w = prev.shape[1]
    # El movimiento de la imagen alrededor del centro (el zoom desde el centro no cuenta como paneo).
    cx, cy = prev.shape[1] / 2, prev.shape[0] / 2
    dx = (M[0, 0] * cx + M[0, 1] * cy + M[0, 2]) - cx
    dy = (M[1, 0] * cx + M[1, 1] * cy + M[1, 2]) - cy
    return dx / w, dy / w, escala, float(inl.mean()) if inl is not None else 0.0, int(bien.sum())


def ruido(gris):
    """El grano de la imagen en las zonas lisas: alto en lo grabado con cámara, casi cero en gráficos y pantallas."""
    g = gris.astype(np.float32)
    if cv2 is not None:
        resto = g - cv2.GaussianBlur(g, (3, 3), 0)
        borde = cv2.GaussianBlur(np.abs(cv2.Sobel(g, cv2.CV_32F, 1, 0)) + np.abs(cv2.Sobel(g, cv2.CV_32F, 0, 1)), (9, 9), 0)
    else:
        suave = (g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] + 4 * g[1:-1, 1:-1]) / 8
        resto = np.zeros_like(g)
        resto[1:-1, 1:-1] = g[1:-1, 1:-1] - suave
        borde = np.zeros_like(g)
        borde[1:-1, 1:-1] = np.abs(g[1:-1, 2:] - g[1:-1, :-2]) + np.abs(g[2:, 1:-1] - g[:-2, 1:-1])
    liso = borde <= np.percentile(borde, 30)
    # Las zonas lisas que son de un solo color plano (un fondo de gráfico) dan 0 de verdad.
    return float(np.std(resto[liso])) if liso.any() else 0.0


def planitud(rgb):
    """Qué parte de la imagen ocupan sus 8 colores más repetidos: alta en gráficos, pantallas y fondos planos."""
    q = (rgb >> 3).astype(np.int32)
    claves = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    cuenta = np.bincount(claves.reshape(-1), minlength=1 << 15)
    return float(np.sort(cuenta)[-8:].sum() / claves.size)


def nitidez(gris):
    g = gris.astype(np.float32)
    if cv2 is not None:
        return float(cv2.Laplacian(g, cv2.CV_32F).var())
    lap = g[1:-1, 2:] + g[1:-1, :-2] + g[2:, 1:-1] + g[:-2, 1:-1] - 4 * g[1:-1, 1:-1]
    return float(lap.var())


_CASCADA = None
_OJOS = None


def caras(gris):
    """Las caras de frente: (x, y, ancho, alto) en fracciones del cuadro, la más grande primero. Solo cuenta las que
    tienen un ojo en su mitad de arriba (el detector solo confunde brazos, hojas o cajas con caras)."""
    global _CASCADA, _OJOS
    if cv2 is None:
        return []
    if _CASCADA is None:
        _CASCADA = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        _OJOS = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
    h, w = gris.shape
    lado = max(24, int(min(w, h) * 0.05))
    r = _CASCADA.detectMultiScale(gris, scaleFactor=1.12, minNeighbors=6, minSize=(lado, lado))
    lista = []
    for (x, y, cw, ch) in (r if len(r) else []):
        arriba = gris[y + ch // 8:y + ch // 2, x:x + cw]
        ojos = _OJOS.detectMultiScale(arriba, scaleFactor=1.1, minNeighbors=4, minSize=(max(6, cw // 10), max(6, cw // 10)))             if arriba.size else []
        if len(ojos):
            lista.append((x / w, y / h, cw / w, ch / h))
    return sorted(lista, key=lambda c: -c[3])


def texto_encima(gris):
    """Dónde hay renglones que parecen texto puesto encima (letras de alto contraste en fila): arriba, centro o abajo.
    Es una pista: confírmalo mirando el fotograma."""
    if cv2 is None:
        return []
    h, w = gris.shape
    grad = cv2.morphologyEx(gris, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    _, bn = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    if bn.mean() > 255 * 0.35:  # Demasiada textura: no se puede saber.
        return []
    unido = cv2.morphologyEx(bn, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (max(9, w // 40), 3)))
    cont, _ = cv2.findContours(unido, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    zonas = {}
    for c in cont:
        x, y, cw, ch = cv2.boundingRect(c)
        if ch < h * 0.012 or ch > h * 0.12 or cw < w * 0.12 or cw < ch * 2.5:
            continue
        lleno = bn[y:y + ch, x:x + cw].mean() / 255
        if not 0.12 < lleno < 0.75:
            continue
        # Las letras alternan claro y oscuro muchas veces a lo largo del renglón (dos bordes por trazo).
        fila = bn[y + ch // 2, x:x + cw] > 0
        if np.count_nonzero(fila[1:] != fila[:-1]) < max(10, 1.5 * cw / max(6, ch * 0.9)):
            continue
        centro = (y + ch / 2) / h
        zona = 'arriba' if centro < 0.33 else 'abajo' if centro > 0.66 else 'centro'
        zonas[zona] = zonas.get(zona, 0) + cw * ch
    return [z for z, _ in sorted(zonas.items(), key=lambda kv: -kv[1])]


def color_medio(rgb):
    m = rgb.reshape(-1, 3).astype(np.float32)
    media = m.mean(axis=0)
    mx, mn = m.max(axis=1), m.min(axis=1)
    sat = float(np.mean((mx - mn) / np.maximum(mx, 1)))
    calor = float(media[0] - media[2])
    return {'hex': '#%02x%02x%02x' % tuple(int(round(v)) for v in media), 'saturacion': round(sat, 2),
            'temperatura': 'cálida' if calor > 12 else 'fría' if calor < -12 else 'neutra'}


# ---------------------------------------------------------------------------
# El sonido
# ---------------------------------------------------------------------------

def sonido(x, sr=22050):
    """Tempo, golpes (inicios de nota o de sonido fuertes) y el volumen en el tiempo."""
    hop, win = 512, 1024
    if len(x) < win * 4:
        return None
    marcos = 1 + (len(x) - win) // hop
    ventana = np.hanning(win).astype(np.float32)
    flujo = np.zeros(marcos, np.float32)
    rms = np.zeros(marcos, np.float32)
    anterior = None
    for i0 in range(0, marcos, 2048):
        i1 = min(marcos, i0 + 2048)
        bloque = np.stack([x[i * hop:i * hop + win] for i in range(i0, i1)])
        rms[i0:i1] = np.sqrt(np.mean(bloque ** 2, axis=1))
        esp = np.log1p(np.abs(np.fft.rfft(bloque * ventana, axis=1)))
        dif = np.diff(esp, axis=0, prepend=esp[:1] if anterior is None else anterior[None])
        flujo[i0:i1] = np.maximum(0, dif).sum(axis=1)
        anterior = esp[-1]
    flujo[0] = 0
    z = (flujo - flujo.mean()) / (flujo.std() + 1e-9)
    paso = hop / sr
    distancia = max(1, int(0.12 / paso))
    picos = [i for i in range(1, len(z) - 1) if z[i] > 1.5 and z[i] == z[max(0, i - distancia):i + distancia + 1].max()]
    # El tempo: la autocorrelación del flujo entre 60 y 180 golpes por minuto, y qué tan marcado está.
    ac = np.correlate(z[:min(len(z), int(90 / paso))], z[:min(len(z), int(90 / paso))], 'full')
    ac = ac[len(ac) // 2:]
    lo, hi = int(60 / 180 / paso), int(60 / 60 / paso)
    tempo, marcado, rejilla = None, 0.0, []
    if hi < len(ac) and ac[0] > 0:
        periodo = lo + int(np.argmax(ac[lo:hi]))
        marcado = float(ac[periodo] / ac[0])
        # El pico afinado entre sus vecinos (el periodo en cuadros enteros da el tempo a saltos de ~2 golpes).
        fino = float(periodo)
        if 0 < periodo < len(ac) - 1:
            a_, b_, c_ = ac[periodo - 1], ac[periodo], ac[periodo + 1]
            den = a_ - 2 * b_ + c_
            if den < 0:
                fino = periodo + 0.5 * (a_ - c_) / den
        tempo = float(60 / (fino * paso))
        # La rejilla del ritmo: la fase donde más golpes caen.
        fases = [z[f::periodo].sum() for f in range(periodo)]
        f = int(np.argmax(fases))
        rejilla = [round((f + k * periodo) * paso, 3) for k in range(int((len(z) - f) / periodo) + 1)]
    db = 20 * np.log10(np.maximum(rms, 1e-5))
    return {'paso': paso, 'z': z, 'db': db, 'golpes': [round(i * paso, 3) for i in picos],
            'fuerza': [float(z[i]) for i in picos], 'tempo': round(tempo, 1) if tempo else None,
            'marcado': round(marcado, 2), 'rejilla': rejilla}


# ---------------------------------------------------------------------------
# Toma por toma
# ---------------------------------------------------------------------------

def _cortes(dif, hist, movs):
    """Los cuadros donde cambia la imagen: picos de la diferencia entre cuadros seguidos, al menos 0,4 s entre uno y otro.
    Un pico donde la imagen sigue a la anterior (casi todos sus puntos se movieron juntos) es la cámara moviéndose
    rápido, no un corte; un cambio grande de colores sí es corte aunque la diferencia no destaque."""
    if len(dif) < 3:
        return []
    d = np.array(dif)
    umbral = max(10.0, 2.4 * float(np.median(d)))
    cortes = []
    for i in range(len(d)):
        pico = d[i] > umbral and d[i] == d[max(0, i - 2):i + 3].max()
        m = movs[i]
        sigue = m is not None and m[3] >= 0.5 and m[4] >= 30 and 0.8 < m[2] < 1.25
        if (pico and not sigue and hist[i] > 0.12) or (hist[i] > 0.6 and d[i] > 8 and hist[i] == max(hist[max(0, i - 2):i + 3])):
            t = (i + 1) / FPS_ANALISIS
            if not cortes or t - cortes[-1] >= 0.4:
                cortes.append(t)
    return cortes


def histograma(c):
    q = (c >> 5).astype(np.int32)
    h = np.bincount(((q[..., 0] << 6) | (q[..., 1] << 3) | q[..., 2]).reshape(-1), minlength=512).astype(np.float32)
    return h / h.sum()


def camara(movs, duracion):
    """El movimiento de cámara de una toma a partir del movimiento de cada cuadro."""
    validos = [m for m in movs if m is not None]
    if len(validos) < max(2, 0.4 * len(movs)):
        return {'tipo': 'sin medir', 'detalle': 'poca textura para seguir (gráfico liso o muy oscuro)'}
    dx = np.array([m[0] for m in validos])
    dy = np.array([m[1] for m in validos])
    esc = np.array([m[2] for m in validos])
    total_x, total_y = float(dx.sum()), float(dy.sum())
    zoom = float(np.exp(np.log(esc).sum()))

    def temblor(v):
        if len(v) < 5:
            return 0.0
        suave = np.convolve(v, np.ones(5) / 5, mode='same')
        return float(np.std((v - suave)[2:-2]))

    tiembla = max(temblor(dx), temblor(dy))
    partes = []
    if zoom > 1.06:
        partes.append('acercar')
    elif zoom < 0.94:
        partes.append('alejar')
    # La imagen se va a la izquierda cuando la cámara gira a la derecha.
    if abs(total_x) > 0.12 and abs(total_x) >= abs(total_y):
        partes.append('paneo a la derecha' if total_x < 0 else 'paneo a la izquierda')
    elif abs(total_y) > 0.12:
        partes.append('sube' if total_y > 0 else 'baja')
    rapido = (abs(total_x) + abs(total_y)) / max(duracion, 0.2) > 0.9 or abs(math.log(max(zoom, 1e-3))) / max(duracion, 0.2) > 0.5
    if partes and rapido:
        partes.append('rápido')
    # Un movimiento perfectamente suave y sin temblor no lo hace una mano: es digital (zoom o paneo puesto en
    # edición, una foto con movimiento) o una cámara de grúa o de 3D.
    if tiembla > 0.006:
        partes.append('tiembla mucho' if tiembla > 0.014 else 'cámara en mano')
    elif partes and tiembla < 0.0012:
        partes.append('suave (digital o grúa)')
    tipo = partes[0] if partes else 'fija'
    return {'tipo': tipo, 'detalle': ', '.join(partes) if partes else 'fija', 'zoom': round(zoom, 3),
            'paneo': [round(total_x, 3), round(total_y, 3)], 'temblor': round(tiembla, 4),
            'sigue_plano': round(float(np.mean([m[3] for m in validos])), 2)}


def encuadre(lista):
    if not lista:
        return {'tipo': 'sin cara de frente', 'caras': 0}
    h = lista[0][3]
    tipo = 'primerísimo plano' if h >= 0.30 else 'primer plano' if h >= 0.16 else 'plano medio' if h >= 0.08 else 'plano general'
    x = lista[0][0] + lista[0][2] / 2
    return {'tipo': tipo, 'caras': len(lista), 'cara': round(h, 3),
            'posicion': 'izquierda' if x < 0.4 else 'derecha' if x > 0.6 else 'centro'}


def origen(r, cam, actividad, quieta):
    """De dónde sale la imagen, con las pruebas medidas. Lo que no se puede saber se dice («míralo»)."""
    pruebas = [f'grano {r["ruido"]:.1f}', f'colores planos {r["planitud"]:.0%}']
    if quieta:
        return 'imagen fija', pruebas + ['la imagen no cambia en toda la toma'], 'alta'
    if r['ruido'] < 0.9 and r['planitud'] > 0.45:
        return 'gráfico o pantalla', pruebas + ['sin grano y con colores planos'], 'media'
    suave = 'suave (digital o grúa)' in cam.get('detalle', '')
    if suave and cam.get('sigue_plano', 0) > 0.9 and r['ruido'] < 1.6:
        return 'foto con movimiento', pruebas + ['toda la imagen se mueve junta, sin temblor ni grano (o una grúa '
                                                 'o cámara 3D sobre algo quieto)'], 'media'
    if r['ruido'] >= 1.6 or 'cámara en mano' in cam.get('detalle', '') or 'tiembla' in cam.get('detalle', ''):
        return 'grabada', pruebas + (['se mueve como una cámara en mano'] if 'mano' in cam.get('detalle', '') else []), \
            'media' if r['ruido'] >= 1.6 else 'baja'
    return 'grabada o IA (míralo)', pruebas + ['poco grano: puede ser IA, 3D o un video muy comprimido'], 'baja'


def calidad(r, cam, tipo_origen):
    """Lo que estropea una toma propia (para escoger las buenas). En gráficos y pantallas lo oscuro o lo que se mueve
    es diseño, no un fallo."""
    if tipo_origen in ('gráfico o pantalla', 'imagen fija'):
        return []
    fallos = []
    if r['luz'] < 45:
        fallos.append('oscura')
    elif r['luz'] > 225:
        fallos.append('quemada')
    if r['quemado'] > 0.25:
        fallos.append('zonas quemadas')
    if r['nitidez'] < 40 and r['planitud'] < 0.45:
        fallos.append('borrosa')
    if 'tiembla mucho' in cam.get('detalle', ''):
        fallos.append('tiembla mucho')
    return fallos


def analizar(ruta, salida, ffmpeg='ffmpeg', ffprobe='ffprobe', progreso=None):
    info = probar(ffprobe, ruta)
    if not info['ancho'] or not info['alto']:
        raise SystemExit('No pude leer el tamaño del video.')
    am = ANCHO_MOV
    hm = max(2, int(round(am * info['alto'] / info['ancho'] / 2)) * 2)

    dif, hists, movs, luz, previo, previo_g, previo_h = [], [], [], [], None, None, None
    for i, c in enumerate(cuadros(ffmpeg, ruta, am, hm)):
        g = (c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114).astype(np.uint8)
        h = histograma(c)
        luz.append(float(g.mean()))
        if previo is not None:
            dif.append(float(np.abs(c.astype(np.int16) - previo.astype(np.int16)).mean()))
            hists.append(float(np.abs(h - previo_h).sum()))
            movs.append(movimiento(previo_g, g))
        previo, previo_g, previo_h = c, g, h
        if progreso and i % 80 == 0:
            progreso(min(0.6, 0.6 * i / max(1, info['duracion'] * FPS_ANALISIS)), 'Mirando el movimiento')
    n = len(luz)
    if n < 2:
        raise SystemExit('No pude leer los cuadros del video.')
    duracion = info['duracion'] or n / FPS_ANALISIS

    cortes = _cortes(dif, hists, movs)
    bordes = [0.0] + [t for t in cortes if 0.3 < t < duracion - 0.3] + [duracion]
    tramos = [(bordes[i], bordes[i + 1]) for i in range(len(bordes) - 1)]
    if len(tramos) > MAX_TOMAS:
        tramos = tramos[:MAX_TOMAS - 1] + [(tramos[MAX_TOMAS - 1][0], duracion)]

    snd = None
    if info['audio']:
        if progreso:
            progreso(0.62, 'Escuchando el sonido')
        snd = sonido(audio(ffmpeg, ruta))

    af = ANCHO_FOTO
    hf = max(2, int(round(af * info['alto'] / info['ancho'] / 2)) * 2)
    carpeta_tomas = os.path.join(salida, 'tomas')
    os.makedirs(carpeta_tomas, exist_ok=True)
    tomas = []
    for k, (a, b) in enumerate(tramos):
        if progreso and k % 4 == 0:
            progreso(0.65 + 0.33 * k / max(1, len(tramos)), f'Toma {k + 1} de {len(tramos)}')
        i0, i1 = int(a * FPS_ANALISIS), max(int(a * FPS_ANALISIS) + 1, int(b * FPS_ANALISIS))
        # Los movimientos de dentro de la toma (sin el salto del corte de entrada).
        m_toma = movs[i0:max(i0, i1 - 1)]
        d_toma = dif[i0:max(i0, i1 - 1)]
        actividad = float(np.median(d_toma)) if d_toma else 0.0
        quieta = bool(d_toma) and max(d_toma) < 0.6
        cam = camara(m_toma, b - a) if not quieta else {'tipo': 'fija', 'detalle': 'fija (no cambia nada)'}
        t_medio = a + (b - a) * 0.5
        rgb = foto(ffmpeg, ruta, t_medio, af, hf)
        r = {'ruido': 0.0, 'planitud': 0.0, 'nitidez': 0.0, 'luz': float(np.mean(luz[i0:i1] or [0])), 'quemado': 0.0}
        enc, texto, col = {'tipo': 'sin medir', 'caras': 0}, [], None
        archivo = None
        if rgb is not None:
            g = (rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114).astype(np.uint8)
            r.update(ruido=ruido(g), planitud=planitud(rgb), nitidez=nitidez(g), luz=float(g.mean()),
                     quemado=float((g > 250).mean()))
            enc = encuadre(caras(g))
            texto = texto_encima(g)
            col = color_medio(rgb)
            archivo = os.path.join(carpeta_tomas, f'toma-{k + 1:02d}.jpg')
            try:
                from PIL import Image
                Image.fromarray(rgb).save(archivo, quality=82)
            except Exception:
                if cv2 is not None:
                    cv2.imwrite(archivo, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 82])
                else:
                    archivo = None
        tipo_origen, pruebas, confianza = origen(r, cam, actividad, quieta)
        toma = {'n': k + 1, 'inicio': round(a, 2), 'fin': round(b, 2), 'duracion': round(b - a, 2),
                'camara': cam, 'encuadre': enc, 'origen': {'tipo': tipo_origen, 'confianza': confianza, 'pruebas': pruebas},
                'accion': 'mucha' if actividad > 9 else 'media' if actividad > 3 else 'poca',
                'luz': round(r['luz']), 'nitidez': round(r['nitidez']), 'grano': round(r['ruido'], 2),
                'color': col, 'texto': texto, 'fallos': calidad(r, cam, tipo_origen),
                'foto': os.path.relpath(archivo, salida).replace(os.sep, '/') if archivo else None}
        if snd:
            j0, j1 = int(a / snd['paso']), max(int(a / snd['paso']) + 1, int(b / snd['paso']))
            toma['volumen'] = round(float(np.percentile(snd['db'][j0:j1], 90)), 1) if j1 <= len(snd['db']) else None
        tomas.append(toma)

    # El sonido en los cortes: ¿caen en el ritmo?, ¿llevan un golpe (un whoosh, un pum)?
    ritmo = None
    if snd and len(tramos) > 1:
        cortes_ok = [t for t, _ in tramos[1:]]
        golpes = np.array(snd['golpes']) if snd['golpes'] else np.array([1e9])
        cerca = [float(np.min(np.abs(golpes - t))) for t in cortes_ok]
        en_golpe = sum(1 for d in cerca if d <= 0.09)
        # Lo que caería en un golpe por casualidad, con tantos golpes por segundo.
        azar = min(1.0, len(snd['golpes']) / max(duracion, 1) * 0.18)
        z = snd['z']
        fuerte = 0
        for t in cortes_ok:
            j = int(t / snd['paso'])
            ventana = z[max(0, j - int(0.12 / snd['paso'])):j + int(0.12 / snd['paso']) + 1]
            if len(ventana) and ventana.max() > 3.0:
                fuerte += 1
        ritmo = {'tempo': snd['tempo'], 'ritmo_marcado': snd['marcado'] >= 0.3, 'marcado': snd['marcado'],
                 'cortes_en_golpe': en_golpe, 'cortes': len(cortes_ok), 'por_azar': round(azar, 2),
                 'cortes_con_golpe_fuerte': fuerte,
                 'al_ritmo': len(cortes_ok) >= 3 and en_golpe / len(cortes_ok) >= max(0.6, azar + 0.25)}
        for k, toma in enumerate(tomas[1:]):
            toma['corte_en_golpe'] = cerca[k] <= 0.09

    resumen = resumir(info, tomas, ritmo, snd, duracion)
    datos = {'version': VERSION, 'archivo': os.path.basename(ruta), 'video': info, 'resumen': resumen, 'ritmo': ritmo,
             'golpes_sonido': snd['golpes'][:400] if snd else [], 'tomas': tomas}
    with open(os.path.join(salida, 'analisis.json'), 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=float)
    escribir_md(salida, datos)
    if progreso:
        progreso(1.0, 'Listo')
    return datos


# ---------------------------------------------------------------------------
# Resumen y lectura por capas
# ---------------------------------------------------------------------------

def _reparto(valores):
    total = len(valores) or 1
    cuenta = {}
    for v in valores:
        cuenta[v] = cuenta.get(v, 0) + 1
    return [{'que': k, 'tomas': c, 'parte': round(c / total, 2)} for k, c in sorted(cuenta.items(), key=lambda kv: -kv[1])]


def resumir(info, tomas, ritmo, snd, duracion):
    d = [t['duracion'] for t in tomas]
    fmt = info['ancho'] / max(1, info['alto'])
    formato = '9:16' if abs(fmt - 9 / 16) < 0.05 else '16:9' if abs(fmt - 16 / 9) < 0.08 else '1:1' if abs(fmt - 1) < 0.05 else \
        f'{info["ancho"]}x{info["alto"]}'
    zonas = [z for t in tomas for z in t['texto'][:1]]
    con_texto = sum(1 for t in tomas if t['texto'])
    malas = [t['n'] for t in tomas if t['fallos']]
    return {
        'duracion': round(duracion, 2), 'formato': formato, 'tomas': len(tomas),
        'toma_media': round(float(np.mean(d)), 2), 'toma_mediana': round(float(np.median(d)), 2),
        'toma_mas_larga': round(max(d), 2), 'toma_mas_corta': round(min(d), 2),
        'cortes_por_minuto': round((len(tomas) - 1) / max(duracion, 1) * 60, 1),
        'camara': _reparto([t['camara']['tipo'] for t in tomas]),
        'encuadre': _reparto([t['encuadre']['tipo'] for t in tomas]),
        'origen': _reparto([t['origen']['tipo'] for t in tomas]),
        'texto_encima': {'tomas': con_texto, 'zona': max(set(zonas), key=zonas.count) if zonas else None},
        'temperatura': _reparto([t['color']['temperatura'] for t in tomas if t.get('color')])[:1],
        'luz_media': round(float(np.mean([t['luz'] for t in tomas]))),
        'ritmo': ritmo, 'tomas_con_fallos': malas,
    }


def _pct(x):
    return f'{round(x * 100)} %'


def _linea_reparto(rep, n=4):
    return ', '.join(f"{r['que']} {_pct(r['parte'])}" for r in rep[:n])


def escribir_md(salida, datos):
    r, info = datos['resumen'], datos['video']
    ri = r['ritmo']
    lineas = [f"# Análisis de {datos['archivo']}", '',
              f"{r['duracion']} s · {r['formato']} ({info['ancho']}x{info['alto']}, {info['fps']} fps) · {r['tomas']} tomas · "
              f"{r['cortes_por_minuto']} cortes por minuto", '',
              '## El montaje', '',
              f"- Toma media {r['toma_media']} s (mediana {r['toma_mediana']} s); la más larga {r['toma_mas_larga']} s y la "
              f"más corta {r['toma_mas_corta']} s.",
              f"- Cámara: {_linea_reparto(r['camara'])}.",
              f"- Encuadre: {_linea_reparto(r['encuadre'])}.",
              f"- De dónde sale la imagen: {_linea_reparto(r['origen'])}. (Medido por grano, colores planos y movimiento: "
              f"lo de «míralo» hay que confirmarlo viendo su fotograma.)"]
    te = r['texto_encima']
    lineas.append(f"- Texto encima: en {te['tomas']} de {r['tomas']} tomas" + (f", sobre todo {te['zona']}." if te['zona'] else '.')
                  + ' (Pista: confírmalo en los fotogramas.)')
    if r['temperatura']:
        lineas.append(f"- Color: sobre todo {r['temperatura'][0]['que']}; luz media {r['luz_media']} de 255.")
    lineas += ['', '## El sonido', '']
    if ri:
        if ri['tempo'] and ri['ritmo_marcado']:
            lineas.append(f"- Música con ritmo marcado, unos {ri['tempo']} golpes por minuto.")
        elif ri['tempo']:
            lineas.append(f"- Sin un ritmo marcado (si hay música, es suave o la tapa la voz; tempo aproximado {ri['tempo']}).")
        lineas.append(f"- Cortes en un golpe del sonido: {ri['cortes_en_golpe']} de {ri['cortes']} (por casualidad serían "
                      f"~{_pct(ri['por_azar'])}). " + ('**Corta al ritmo.**' if ri['al_ritmo'] else 'No parece cortar al ritmo.'))
        lineas.append(f"- Cortes con un golpe fuerte de sonido (whoosh, pum, efecto): {ri['cortes_con_golpe_fuerte']} de {ri['cortes']}.")
    elif info['audio']:
        lineas.append('- Tiene sonido, pero es demasiado corto o tiene una sola toma para medir el ritmo de los cortes.')
    else:
        lineas.append('- No tiene sonido.')
    if r['tomas_con_fallos']:
        lineas += ['', '## Tomas con fallos', '',
                   '- ' + ', '.join(f"{t['n']} ({', '.join(t['fallos'])})" for t in datos['tomas'] if t['fallos'])]
    lineas += ['', '## Para seguir', '',
               '- `tomas.md`: una línea por toma (tiempo, cámara, encuadre, origen, color, texto, sonido).',
               '- `tomas/toma-NN.jpg`: el fotograma del medio de cada toma. Míralo antes de decidir algo de esa toma.',
               '- `analisis.json`: todas las medidas.', '']
    with open(os.path.join(salida, 'ANALISIS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lineas))

    filas = ['# Tomas', '', 'n | tiempo | cámara | encuadre | origen | luz y color | texto | sonido | fallos | foto', '---|---|---|---|---|---|---|---|---|---']
    for t in datos['tomas']:
        col = t.get('color') or {}
        son = []
        if t.get('corte_en_golpe'):
            son.append('corte en golpe')
        if t.get('volumen') is not None:
            son.append(f"{t['volumen']} dB")
        filas.append(' | '.join([
            str(t['n']), f"{t['inicio']:.2f}–{t['fin']:.2f} ({t['duracion']:.1f} s)", t['camara']['detalle'],
            t['encuadre']['tipo'] + (f" ({t['encuadre']['posicion']})" if t['encuadre'].get('posicion') else ''),
            t['origen']['tipo'], f"luz {t['luz']} · {col.get('temperatura', '?')} {col.get('hex', '')}",
            ', '.join(t['texto']) or '—', ', '.join(son) or '—', ', '.join(t['fallos']) or '—', t['foto'] or '—']))
    with open(os.path.join(salida, 'tomas.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(filas) + '\n')


def breve(datos):
    """Lo que se imprime: el resumen y dónde está lo demás (sin las tomas, que van en tomas.md)."""
    return {'archivo': datos['archivo'], 'resumen': datos['resumen'], 'leer': ['ANALISIS.md', 'tomas.md', 'tomas/']}


def main():
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding='utf-8')
        except Exception:
            pass
    p = argparse.ArgumentParser(description='Analiza un video toma por toma.')
    p.add_argument('video')
    p.add_argument('--salida', required=True)
    p.add_argument('--ffmpeg', default=os.environ.get('RECORTE_FFMPEG') or shutil.which('ffmpeg') or 'ffmpeg')
    p.add_argument('--ffprobe', default=os.environ.get('RECORTE_FFPROBE') or shutil.which('ffprobe') or 'ffprobe')
    p.add_argument('--progreso', action='store_true', help='escribe «PROGRESO <0-1> <texto>» en stderr')
    x = p.parse_args()
    if not os.path.isfile(x.video):
        raise SystemExit(f'No existe: {x.video}')
    os.makedirs(x.salida, exist_ok=True)

    def prog(v, texto):
        if x.progreso:
            print(f'PROGRESO {v:.3f} {texto}', file=sys.stderr, flush=True)

    datos = analizar(x.video, x.salida, x.ffmpeg, x.ffprobe, prog)
    print(json.dumps(breve(datos), ensure_ascii=False, default=float))


if __name__ == '__main__':
    main()
