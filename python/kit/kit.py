"""El kit de Recorte para el modo agente: piezas probadas para no programar el video desde cero.

Uso (desde la carpeta de trabajo):
  python kit/kit.py golpes <audio-o-video> [--n 16]          los golpes de la música (segundos) y el tempo
  python kit/kit.py hoja <video> [--n 12] [--salida ruta]     una hoja de fotogramas para revisar
  python kit/kit.py encuadre <foto> [--zoom 1.3 --cx .5 --cy .5] [--ancho 1080 --alto 1920]
                                                              cómo queda una foto a pantalla completa
  python kit/kit.py armar <receta.json> [--prueba 0.5,3,8]    hace el video (o solo esos fotogramas)
  python kit/kit.py recortar <imagen> [--salida x.png]       quita un fondo liso: un PNG con transparencia para una capa

La receta está explicada en kit/RECETA.md. Todo sale en una sola pasada: los fotogramas se dibujan con
NumPy y Pillow y van por tubería a FFmpeg, con la música recortada y su fundido.
"""
import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys

import numpy as np

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # El Python de Recorte trae NumPy y OpenCV; Pillow se instala la primera vez.
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'pillow'], check=True)
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

def _rutas():
    # Recorte deja junto al kit las rutas de su FFmpeg (puede no estar en el PATH del agente).
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rutas.json'), encoding='utf-8-sig') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


_R = _rutas()
FFMPEG = os.environ.get('RECORTE_FFMPEG') or _R.get('ffmpeg') or shutil.which('ffmpeg') or 'ffmpeg'
FFPROBE = os.environ.get('RECORTE_FFPROBE') or _R.get('ffprobe') or shutil.which('ffprobe') or 'ffprobe'


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    return 3 * x * x - 2 * x * x * x


def tramo(t, a, b):
    if b <= a:
        return 1.0 if t >= a else 0.0
    return min(1.0, max(0.0, (t - a) / (b - a)))


def color(c, defecto=(245, 242, 236)):
    if not c:
        return defecto
    if isinstance(c, (list, tuple)):
        return tuple(int(x) for x in c[:3])
    c = str(c).lstrip('#')
    if len(c) == 3:
        c = ''.join(x * 2 for x in c)
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


FUENTES = {
    'fina': ['segoeuil.ttf', 'segoeuisl.ttf', 'HelveticaNeue.ttc', 'DejaVuSans-ExtraLight.ttf', 'arial.ttf'],
    'normal': ['segoeui.ttf', 'Helvetica.ttc', 'DejaVuSans.ttf', 'arial.ttf'],
    'negrita': ['segoeuib.ttf', 'arialbd.ttf', 'Helvetica.ttc', 'DejaVuSans-Bold.ttf'],
    'gruesa': ['seguibl.ttf', 'ariblk.ttf', 'segoeuib.ttf', 'DejaVuSans-Bold.ttf'],
    # Serif de revista: «serif» recta y «cursiva» inclinada (los títulos elegantes de un documental).
    # Las de documental vienen con Recorte (Playfair Display y Anton, licencia OFL): kit/fuentes.
    'serif': ['PlayfairDisplay-Bold.ttf', 'georgiab.ttf', 'palab.ttf', 'timesbd.ttf', 'DejaVuSerif-Bold.ttf'],
    'cursiva': ['PlayfairDisplay-BoldItalic.ttf', 'georgiaz.ttf', 'palabi.ttf', 'timesbi.ttf', 'DejaVuSerif-BoldItalic.ttf'],
    'titular': ['Anton-Regular.ttf', 'impact.ttf', 'ariblk.ttf', 'DejaVuSans-Bold.ttf'],
    'impacto': ['impact.ttf', 'ariblk.ttf', 'DejaVuSans-Bold.ttf'],
}
CARPETAS_FUENTES = [os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fuentes'),
                    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'fuentes'),
                    os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts'), '/System/Library/Fonts', '/Library/Fonts',
                    '/usr/share/fonts/truetype/dejavu', os.path.expanduser('~/.fonts')]
_fuentes = {}


def fuente(estilo, tam):
    clave = (estilo, tam)
    if clave in _fuentes:
        return _fuentes[clave]
    candidatos = [estilo] if estilo and os.path.isfile(str(estilo)) else []
    for n in FUENTES.get(estilo, FUENTES['normal']):
        candidatos += [os.path.join(c, n) for c in CARPETAS_FUENTES]
    f = None
    for ruta in candidatos:
        if os.path.isfile(ruta):
            try:
                f = ImageFont.truetype(ruta, tam)
                break
            except OSError:
                pass
    if f is None:
        f = ImageFont.load_default(size=tam)
    _fuentes[clave] = f
    return f


def abrir_foto(ruta):
    im = Image.open(ruta)
    try:
        from PIL import ImageOps
        im = ImageOps.exif_transpose(im)
    except Exception:
        pass
    return im.convert('RGB')


def encuadrar(im, ancho, alto, zoom=1.0, cx=0.5, cy=0.5):
    """La foto cubriendo ancho×alto, ampliada `zoom` veces y centrada en (cx, cy) de la foto."""
    esc = max(ancho / im.width, alto / im.height) * max(1.0, float(zoom))
    cw, ch = ancho / esc, alto / esc
    x0 = min(max(0, cx * im.width - cw / 2), im.width - cw)
    y0 = min(max(0, cy * im.height - ch / 2), im.height - ch)
    return im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch))).resize((ancho, alto), Image.LANCZOS)


def caber(im, ancho, alto):
    """La foto entera, en su proporción, cabiendo en ancho×alto."""
    esc = min(ancho / im.width, alto / im.height)
    return im.resize((max(1, round(im.width * esc)), max(1, round(im.height * esc))), Image.LANCZOS)


def tapar(im, zonas):
    """Desenfoca fuerte las zonas (fracciones x0, y0, x1, y1 de la foto) con bordes suaves."""
    if not zonas:
        return im
    w, h = im.size
    borroso = im.filter(ImageFilter.GaussianBlur(max(w, h) / 40))
    mascara = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mascara)
    for z in zonas:
        d.rounded_rectangle((z[0] * w, z[1] * h, z[2] * w, z[3] * h), radius=int(0.05 * w), fill=255)
    return Image.composite(borroso, im, mascara.filter(ImageFilter.GaussianBlur(w / 60)))


def barrido(arr, p, fuerza=0.55, ancho=0.09, angulo=0.35):
    """Franja de luz diagonal en la posición p (0 entra por la izquierda, 1 sale por la derecha)."""
    if p <= -0.2 or p >= 1.2:
        return arr
    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h:4, 0:w:4].astype(np.float32)  # a un cuarto: la luz es suave
    u = ((xx / w) + angulo * (yy / h)) / (1 + angulo)
    luz = np.exp(-((u - p) / ancho) ** 2) * fuerza + np.exp(-((u - p + 0.05) / (ancho * 0.25)) ** 2) * fuerza * 0.5
    luz = np.clip(luz, 0, 1)
    luz = np.repeat(np.repeat(luz, 4, axis=0), 4, axis=1)[:h, :w, None]
    return arr + (255 - arr) * luz


def texto_centrado(d, cx, y, txt, f, col, espacio=0):
    anchos = [d.textlength(c, font=f) for c in txt] if espacio else None
    total = (sum(anchos) + espacio * (len(txt) - 1)) if espacio else d.textlength(txt, font=f)
    x = cx - total / 2
    if espacio:
        for c, a in zip(txt, anchos):
            d.text((x, y), c, font=f, fill=col)
            x += a + espacio
    else:
        d.text((x, y), txt, font=f, fill=col)


def probar(ruta):
    r = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', ruta],
                       capture_output=True, text=True)
    d = json.loads(r.stdout or '{}')
    v = next((s for s in d.get('streams', []) if s.get('codec_type') == 'video'), {})
    return {'duracion': float(d.get('format', {}).get('duration') or 0), 'ancho': v.get('width'), 'alto': v.get('height'),
            'audio': any(s.get('codec_type') == 'audio' for s in d.get('streams', []))}


# ---------------------------------------------------------------------------
# Las piezas de la receta
# ---------------------------------------------------------------------------

class Lienzo:
    def __init__(self, r):
        self.W = int(r.get('ancho', 1080))
        self.H = int(r.get('alto', 1920))
        self.fps = int(r.get('fps', 30))
        self.fondo = color(r.get('fondo'), (14, 18, 16))
        self.texto = color(r.get('color_texto'), (245, 242, 236))
        self.acento = color(r.get('color_acento'), (212, 175, 90))
        self.fuente = r.get('fuente', 'fina')
        self.transicion = float(r.get('transicion', 0.22))
        self.base = os.path.dirname(os.path.abspath(r['_ruta']))
        self.subs = leer_subtitulos(r.get('subtitulos'), self)
        self.capas = leer_capas(r.get('capas'), self)
        self.filtros = {k: min(1.0, max(0.0, float(v))) for k, v in (r.get('filtros') or {}).items()
                        if k in ('grano', 'polvo', 'trama', 'vineta', 'parpadeo') and isinstance(v, (int, float)) and v > 0}
        self._f = {}

    def ruta(self, p):
        return p if os.path.isabs(p) else os.path.join(self.base, p)


def leer_subtitulos(s, L):
    """La pista de subtítulos de la receta: frases con sus segundos y un estilo para todas.

    Van en la receta (no quemados con un script aparte) para que el usuario los edite uno a uno
    en el editor de Recorte, con su letra, su color y su caja.
    """
    if not isinstance(s, dict):
        return None
    frases = []
    for f in s.get('frases') or []:
        try:
            texto = str(f.get('texto', '')).strip()
            desde, hasta = float(f['desde']), float(f['hasta'])
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
        if texto and hasta > desde:
            frases.append({'texto': texto, 'desde': desde, 'hasta': hasta})
    if not frases:
        return None
    caja = s.get('caja', '#000000')
    return {
        'frases': sorted(frases, key=lambda x: x['desde']),
        'fuente': s.get('fuente', L.fuente),
        'tam': int(s.get('tam', L.W * 0.058)),
        'color': color(s.get('color'), (255, 255, 255)),
        'caja': color(caja) if caja else None,
        'pos': min(0.95, max(0.05, float(s.get('pos', 0.78)))),
    }


def subtitulo(lienzo, L, t):
    """Dibuja la frase de subtítulo que toca en `t`, partida en líneas que caben, con su caja."""
    s = L.subs
    if not s:
        return lienzo
    fr = next((x for x in s['frases'] if x['desde'] <= t < x['hasta']), None)
    if not fr:
        return lienzo
    f = fuente(s['fuente'], s['tam'])
    capa = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    lineas, actual = [], ''
    for w in fr['texto'].split():
        prueba = (actual + ' ' + w).strip()
        if actual and d.textlength(prueba, font=f) > L.W * 0.84:
            lineas.append(actual)
            actual = w
        else:
            actual = prueba
    if actual:
        lineas.append(actual)
    sube, baja = f.getmetrics()
    pad = s['tam'] * 0.32
    alto = int(sube + baja + pad * 0.9)
    y0 = L.H * s['pos'] - alto * len(lineas) / 2
    for i, ln in enumerate(lineas):
        ancho = d.textlength(ln, font=f)
        x = (L.W - ancho) / 2
        y = y0 + i * alto
        if s['caja']:
            d.rounded_rectangle((x - pad, y - pad * 0.35, x + ancho + pad, y + sube + baja + pad * 0.35), radius=pad * 0.6, fill=s['caja'] + (235,))
            d.text((x, y), ln, font=f, fill=s['color'])
        else:
            d.text((x, y), ln, font=f, fill=s['color'], stroke_width=max(2, s['tam'] // 14), stroke_fill=(0, 0, 0))
    lienzo.alpha_composite(capa)
    return lienzo


def sonido_incluido(nombre):
    """La ruta de un efecto de sonido que trae Recorte (`whoosh`, `pop`, `pop-alto`, `ding`, `caching`)."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sonidos', f'{nombre}.wav')


def leer_capas(lista, L):
    """Imágenes encima del video (logos, íconos, sellos): cada una con su sitio, su ancho y su entrada.

    Van en la receta (no pegadas con un script aparte) para que en el editor de Recorte queden en la
    pista «Encima» y el usuario las mueva, las agrande o las quite.
    """
    capas = []
    for i, c in enumerate(lista or []):
        try:
            ruta = L.ruta(c['archivo'])
            desde, hasta = float(c['desde']), float(c['hasta'])
        except (KeyError, TypeError, ValueError):
            raise SystemExit(f'Capa {i + 1}: necesita "archivo", "desde" y "hasta".')
        if not os.path.isfile(ruta):
            raise SystemExit(f'Capa {i + 1}: no encuentro «{c["archivo"]}».')
        ext = os.path.splitext(ruta)[1].lower()
        if ext not in ('.png', '.jpg', '.jpeg', '.webp', '.webm', '.mp4', '.mov'):
            raise SystemExit(f'Capa {i + 1}: una imagen (png, jpg, webp) o un video (webm con transparencia, mp4).')
        if hasta <= desde:
            continue
        video = VideoCapa(ruta, L) if ext in ('.webm', '.mp4', '.mov') else None
        im = video.cuadro(0) if video else Image.open(ruta).convert('RGBA')
        ancho = min(2.0, max(0.05, float(c.get('ancho', 0.3))))
        w = max(1, round(L.W * ancho))
        h = max(1, round(im.height * w / im.width))
        entrada = c.get('entrada', 'pop')
        fin = c.get('fin') if isinstance(c.get('fin'), dict) else None
        x, y, giro = min(1.0, max(0.0, float(c.get('x', 0.5)))), min(1.0, max(0.0, float(c.get('y', 0.5)))), float(c.get('giro', 0))
        capas.append({
            'archivo': c['archivo'],
            # La imagen al tamaño más grande que llegue a tener (crece sin perder nitidez).
            'im': im.resize((max(w, round(L.W * float(fin.get('ancho', ancho)))) if fin else w,
                             max(1, round(im.height * (max(w, round(L.W * float(fin.get('ancho', ancho)))) if fin else w) / im.width))), Image.LANCZOS),
            'desde': desde, 'hasta': hasta, 'x': x, 'y': y, 'ancho': ancho, 'giro': giro,
            'fin': {'x': float(fin.get('x', x)), 'y': float(fin.get('y', y)), 'ancho': float(fin.get('ancho', ancho)),
                    'giro': float(fin.get('giro', giro))} if fin else None,
            'entrada': entrada if entrada in ('pop', 'fundido', 'ninguna', 'izquierda', 'derecha', 'arriba', 'abajo') else 'pop',
            'video': video, 'desde_video': float(c.get('inicio', 0)),
            # Animar una imagen recortada (respirar, balanceo, ondear, flotar, humo), sin gastar créditos.
            'animada': (animacion_capa(im.resize((max(w, round(L.W * float(fin.get('ancho', ancho)))) if fin else w,
                                           max(1, round(im.height * (max(w, round(L.W * float(fin.get('ancho', ancho)))) if fin else w) / im.width))), Image.LANCZOS),
                                *((c['animar'], 0.5) if isinstance(c.get('animar'), (str, list)) else (c['animar'].get('tipo'), c['animar'].get('fuerza', 0.5))),
                                c['animar'] if isinstance(c.get('animar'), dict) else None)
                        if c.get('animar') and not video else None),
            # Escena 2.5D: a qué distancia está (0 pegada al fondo, 1 muy cerca); sin ella, fija en la pantalla.
            'profundidad': min(1.0, max(0.0, float(c['profundidad']))) if isinstance(c.get('profundidad'), (int, float)) else None,
            'desenfoque': min(1.0, max(0.0, float(c.get('desenfoque') or 0))),
            'base': None,
        })
    return capas


# ---------------------------------------------------------------------------
# Animar una imagen recortada (como el «Puppet» o las deformaciones de After Effects, sin gastar créditos)
# ---------------------------------------------------------------------------

TIPOS_ANIMAR = ('respirar', 'balanceo', 'ondear', 'flotar', 'humo')
# Lo que dura un ciclo: todo vuelve a como empezó, así el bucle no se nota.
CICLO_S = 4.0


class Animada:
    """Una imagen RGBA que se deforma suavemente con el tiempo. Se le deja margen alrededor para que el
    movimiento no se corte en los bordes. `fuerza` de 0 a 1 (0.5 es natural)."""

    def __init__(self, im, tipo, fuerza=0.5):
        import cv2
        self.cv2 = cv2
        self.tipo = tipo if tipo in TIPOS_ANIMAR else 'respirar'
        self.f = max(0.0, min(1.5, float(fuerza)))
        m = 0.08
        w, h = im.size
        self.mx, self.my = round(w * m), round(h * m)
        base = Image.new('RGBA', (w + 2 * self.mx, h + 2 * self.my), (0, 0, 0, 0))
        base.paste(im, (self.mx, self.my))
        self.a = np.asarray(base, dtype=np.uint8)
        H, W = self.a.shape[:2]
        self.W, self.H, self.w, self.h = W, H, w, h
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        self.xx, self.yy = xx, yy
        # Coordenadas dentro de la imagen: u de 0 (izquierda) a 1, v de 0 (arriba) a 1 (abajo, los pies).
        self.u = (xx - self.mx) / max(1, w)
        self.v = (yy - self.my) / max(1, h)

    def cuadro(self, t):
        cv2 = self.cv2
        f, w, h = self.f, self.w, self.h
        fase = 2 * math.pi * (t % CICLO_S) / CICLO_S
        sx, sy = self.xx.copy(), self.yy.copy()
        luz = None
        arriba = np.clip(1 - self.v, 0, 1)  # 1 en la cabeza, 0 en los pies
        if self.tipo == 'respirar':
            # El cuerpo se estira hacia arriba al inspirar (los pies no se mueven) y se ensancha un poco el pecho.
            k = math.sin(fase)
            sy += 0.014 * f * h * k * arriba
            pecho = np.exp(-((self.v - 0.35) / 0.18) ** 2)
            sx += 0.006 * f * w * k * pecho * (0.5 - self.u) * 2
        elif self.tipo == 'balanceo':
            # Se mece desde los pies, más arriba más (como alguien de pie que cambia el peso).
            sx += 0.022 * f * w * math.sin(fase) * arriba ** 1.5
            sy += 0.004 * f * h * math.sin(2 * fase) * arriba
        elif self.tipo == 'ondear':
            # Ondea desde el asta (a la izquierda): la onda corre hacia la derecha y crece con la distancia.
            onda = 2 * math.pi * (self.u / 0.55) - 2 * fase
            lejos = np.clip(self.u, 0, 1)
            sy += 0.035 * f * h * np.sin(onda) * lejos
            sx += 0.010 * f * w * np.cos(onda) * lejos
            luz = 1 + 0.14 * f * np.cos(onda) * lejos
        elif self.tipo == 'flotar':
            sy += 0.025 * f * h * math.sin(fase)
            sx += 0.006 * f * w * math.sin(fase * 0.5 + 1)
        elif self.tipo == 'humo':
            # Se agita y sube: ondas lentas que se cruzan, más arriba más.
            sx += 0.03 * f * w * np.sin(2 * math.pi * self.v / 0.4 + fase) * np.sin(2 * math.pi * self.u / 0.7 + fase) * (0.4 + arriba)
            sy += 0.02 * f * h * np.sin(2 * math.pi * self.u / 0.5 - fase) * (0.3 + arriba)
        out = cv2.remap(self.a, sx, sy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        if luz is not None:
            rgb = out[..., :3].astype(np.float32) * luz[..., None]
            out = np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), out[..., 3]])
        return Image.fromarray(out, 'RGBA')


def animacion_capa(im, tipo, fuerza=0.5, extra=None):
    """La animación de una capa: deformación (respirar, ondear…) o marioneta por huesos (hablar, saludar…)."""
    if isinstance(tipo, list) or tipo in GESTOS:
        e = extra or {}
        return Marioneta(im, tipo, fuerza, e.get('puntos'), e.get('lado'))
    return Animada(im, tipo, fuerza)


def animar_imagen(ruta, tipo, fuerza=0.5, salida=None, duracion=CICLO_S, fps=30, puntos=None, lado=None):
    """La imagen recortada, animada en bucle (un WebM con transparencia): para usarla como capa en el editor."""
    im = Image.open(ruta).convert('RGBA')
    # Hasta 1080 de lado: suficiente para una capa y rápido de animar.
    if max(im.size) > 1080:
        im.thumbnail((1080, 1080), Image.LANCZOS)
    marioneta = isinstance(tipo, list) or tipo in GESTOS
    an = Marioneta(im, tipo, fuerza, puntos, lado) if marioneta else Animada(im, tipo, fuerza)
    W, H = an.W - an.W % 2, an.H - an.H % 2
    salida = salida or os.path.splitext(ruta)[0] + f'-{an.gesto if marioneta else an.tipo}{"-secuencia" if isinstance(tipo, list) else ""}.webm'
    escribe = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                                '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '26', '-row-mt', '1', '-auto-alt-ref', '0',
                                salida], stdin=subprocess.PIPE)
    n = max(1, round(duracion * fps))
    for i in range(n):
        escribe.stdin.write(np.asarray(an.cuadro(i / fps), dtype=np.uint8)[:H, :W].tobytes())
    escribe.stdin.close()
    if escribe.wait() != 0:
        raise SystemExit('No pude escribir la animación.')
    return {'archivo': salida, 'ancho': W, 'alto': H, 'tipo': an.gesto if marioneta else an.tipo, 'duracion': round(n / fps, 2),
            # El margen que se le dejó a cada lado (fracción del ancho) y cuánto más ancha es la capa que la imagen:
            # un 16 % al deformar; con la marioneta depende del gesto (un brazo que saluda necesita sitio).
            'margen': round(an.mx / an.w, 4) if marioneta else 0.08, 'escala': round(W / an.w, 4),
            **({'avisos': an.avisos} if marioneta and an.avisos else {})}


# >>> marioneta
# ---------------------------------------------------------------------------
# Marioneta: el personaje recortado se mueve por huesos (como el «Puppet» o Duik de After Effects), sin créditos
# ---------------------------------------------------------------------------

# DWPose (cuerpo, cara y manos, 133 puntos), local. Se baja una vez.
MODELO_POSE = ('dwpose-ll-ucoco-384.onnx', 'https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ll_ucoco_384.onnx', 134399116)
GESTOS = ('hablar', 'asentir', 'ladear', 'saludar', 'senalar', 'peso', 'explicar')
# Los puntos del cuerpo que usa (los del formato COCO).
PUNTOS = {'nariz': 0, 'ojo_i': 1, 'ojo_d': 2, 'oreja_i': 3, 'oreja_d': 4, 'hombro_i': 5, 'hombro_d': 6, 'codo_i': 7, 'codo_d': 8,
          'muneca_i': 9, 'muneca_d': 10, 'cadera_i': 11, 'cadera_d': 12, 'rodilla_i': 13, 'rodilla_d': 14, 'tobillo_i': 15,
          'tobillo_d': 16}
# Los gestos que levantan un brazo: la imagen necesita margen a los lados del largo del brazo para que no se corte.
GESTOS_BRAZO = ('saludar', 'senalar', 'explicar')


def esqueleto(im):
    """Los puntos del cuerpo de una persona recortada (RGBA), en píxeles, con su confianza (0 a 1); y la
    punta de cada mano (de los puntos de los dedos)."""
    import cv2
    sesion = sesion_modelo(MODELO_POSE, 'para ver el esqueleto de los personajes')
    a = np.asarray(im.convert('RGBA'), dtype=np.float32)
    al = a[..., 3:4] / 255
    ys, xs = np.nonzero(a[..., 3] > 128)
    if not len(xs):
        raise SystemExit('La imagen no tiene a nadie: hace falta una persona recortada (sin fondo).')
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    w, h = (xs.max() - xs.min()) * 1.25 + 1, (ys.max() - ys.min()) * 1.25 + 1
    W, H = 288, 384
    if w / h > W / H:
        h = w * H / W
    else:
        w = h * W / H
    # Sobre gris neutro (el modelo conoce fotos, no transparencias).
    rgb = a[..., :3] * al + 127 * (1 - al)
    M = np.array([[W / w, 0, W / 2 - cx * W / w], [0, H / h, H / 2 - cy * H / h]], np.float32)
    x = cv2.warpAffine(rgb, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(127, 127, 127))
    x = (x - np.array([123.675, 116.28, 103.53])) / np.array([58.395, 57.12, 57.375])
    sx, sy = sesion.run(None, {sesion.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})
    px, py = sx[0].argmax(1) / 2, sy[0].argmax(1) / 2
    conf = np.minimum(sx[0].max(1), sy[0].max(1))
    kx, ky = (px - M[0, 2]) / M[0, 0], (py - M[1, 2]) / M[1, 1]
    puntos = {n: (float(kx[i]), float(ky[i]), float(conf[i])) for n, i in PUNTOS.items()}
    # La punta de cada mano: el promedio de los dedos que se ven (91–111 izquierda, 112–132 derecha).
    for lado, ini in (('i', 91), ('d', 112)):
        sel = [j for j in range(ini, ini + 21) if conf[j] > 0.3]
        if len(sel) >= 5:
            puntos[f'mano_{lado}'] = (float(np.mean(kx[sel])), float(np.mean(ky[sel])), float(np.mean(conf[sel])))
    return puntos


def _mezclar_poses(a, b, k):
    """Una pose entre dos (k de 0 = la primera a 1 = la segunda): giros y ajustes de cada hueso."""
    ga, ea = a
    gb, eb = b
    g = {n: ga.get(n, 0.0) + (gb.get(n, 0.0) - ga.get(n, 0.0)) * k for n in set(ga) | set(gb)}
    neutro = {'sx': 1.0, 'sy': 1.0, 'dx': 0.0, 'dy': 0.0}
    e = {}
    for n in set(ea) | set(eb):
        x, y = ea.get(n, {}), eb.get(n, {})
        e[n] = {c: x.get(c, v) + (y.get(c, v) - x.get(c, v)) * k for c, v in neutro.items()}
    return g, e


def _rot(ang, px, py, sx=1.0, sy=1.0, dx=0.0, dy=0.0):
    """Matriz 3×3: escala y giro (grados, a favor del reloj en pantalla) alrededor de (px, py), y luego un desplazamiento."""
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c * sx, -s * sy, px - (c * sx) * px + s * sy * py + dx],
                     [s * sx, c * sy, py - s * sx * px - (c * sy) * py + dy],
                     [0, 0, 1]], dtype=np.float64)


def _dentro(p, poligono):
    """Si el punto p cae dentro del polígono (lista de puntos)."""
    import cv2
    return cv2.pointPolygonTest(np.array(poligono, np.float32), (float(p[0]), float(p[1])), False) >= 0


class Marioneta:
    """Una persona recortada que se mueve por huesos: la cabeza asiente o se ladea, los brazos saludan o
    señalan, el cuerpo respira y cambia el peso de un pie al otro. Cada píxel sigue a sus huesos con pesos
    suaves que van por dentro de la silueta (la mano no se queda pegada a la cadera). `puntos` corrige o
    da el esqueleto ({"hombro_d": [x, y], …} en fracción de la imagen); si no, lo detecta un modelo local."""

    def __init__(self, im, gesto='hablar', fuerza=0.5, puntos=None, lado=None):
        import cv2
        self.cv2 = cv2
        # Un gesto, o una secuencia de gestos en la misma capa: [{"tipo": "hablar", "hasta": 1.2}, {"tipo": "senalar"}]
        # («hasta», en segundos desde que aparece la capa; el último sigue hasta el final). Pasa de uno a otro suave.
        lista = gesto if isinstance(gesto, list) else [{'tipo': gesto}]
        self.secuencia = []
        for x in lista:
            x = x if isinstance(x, dict) else {'tipo': x}
            self.secuencia.append({'tipo': x.get('tipo') if x.get('tipo') in GESTOS else 'hablar',
                                   'hasta': float(x['hasta']) if isinstance(x.get('hasta'), (int, float)) else None,
                                   'fuerza': max(0.0, min(1.5, float(x.get('fuerza', fuerza)))), 'lado': x.get('lado', lado)})
        if not self.secuencia:
            self.secuencia = [{'tipo': 'hablar', 'hasta': None, 'fuerza': float(fuerza), 'lado': lado}]
        self.gesto = self.secuencia[0]['tipo']
        self.f = self.secuencia[0]['fuerza']
        w, h = im.size
        # El esqueleto, en píxeles de la imagen.
        det = esqueleto(im) if not puntos or len(puntos) < 8 else {}
        P0 = {n: np.array([x, y]) for n, (x, y, c) in det.items() if c > 0.3}
        for n, v in (puntos or {}).items():
            if isinstance(v, (list, tuple)) and len(v) >= 2:
                P0[n] = np.array([float(v[0]) * w, float(v[1]) * h])
        # El margen alrededor: con un gesto de brazo, lo que mide el brazo (estirado no se sale); si no, poco.
        brazo = max([np.linalg.norm(P0[f'mano_{l}' if f'mano_{l}' in P0 else f'muneca_{l}'] - P0[f'hombro_{l}'])
                     for l in ('i', 'd') if f'hombro_{l}' in P0 and (f'mano_{l}' in P0 or f'muneca_{l}' in P0)] or [0.3 * h])
        if any(x['tipo'] in GESTOS_BRAZO for x in self.secuencia):
            hombros_x = [P0[f'hombro_{l}'][0] for l in ('i', 'd') if f'hombro_{l}' in P0] or [w / 2]
            sobra = max(brazo * 1.12 - min(hombros_x), brazo * 1.12 - (w - max(hombros_x)), 0.1 * w)
            hombro_y = min([P0[f'hombro_{l}'][1] for l in ('i', 'd') if f'hombro_{l}' in P0] or [0.25 * h])
            self.mx, self.my = round(sobra), round(max(0.06 * h, brazo * 1.05 - hombro_y))
        else:
            self.mx, self.my = round(0.12 * w), round(0.06 * h)
        base = Image.new('RGBA', (w + 2 * self.mx, h + 2 * self.my), (0, 0, 0, 0))
        base.paste(im, (self.mx, self.my))
        self.W, self.H, self.w, self.h = base.width, base.height, w, h
        a = np.asarray(base, dtype=np.float32)
        self.alfa = a[..., 3] / 255
        # El color se extiende un poco fuera de la silueta: al deformar, el borde no se ensucia de negro.
        pre = a[..., :3] * self.alfa[..., None]
        bp, ba = cv2.GaussianBlur(pre, (0, 0), 6), cv2.GaussianBlur(self.alfa, (0, 0), 6)[..., None]
        relleno = bp / np.maximum(ba, 1e-4)
        k = np.clip(self.alfa * 4, 0, 1)[..., None]
        self.rgb = (a[..., :3] * k + relleno * (1 - k)).astype(np.float32)
        # El esqueleto en píxeles del lienzo con margen.
        P = {n: v + np.array([self.mx, self.my]) for n, v in P0.items()}
        if not all(n in P for n in ('hombro_i', 'hombro_d')):
            raise SystemExit('No encuentro los hombros del personaje: usa una persona de frente, entera o de medio cuerpo.')
        cuello_base = (P['hombro_i'] + P['hombro_d']) / 2
        cara = [P[n] for n in ('nariz', 'ojo_i', 'ojo_d', 'oreja_i', 'oreja_d') if n in P]
        cabeza = np.mean(cara, axis=0) if cara else cuello_base - np.array([0, 0.6 * np.linalg.norm(P['hombro_i'] - P['hombro_d'])])
        P['cuello'] = cuello_base + 0.3 * (cabeza - cuello_base)
        P['cabeza'] = cabeza + 0.6 * (cabeza - P['cuello'])
        caderas = [P[n] for n in ('cadera_i', 'cadera_d') if n in P]
        P['pelvis'] = np.mean(caderas, axis=0) if caderas else cuello_base + np.array([0, 1.6 * np.linalg.norm(P['hombro_i'] - P['hombro_d'])])
        for lado_ in ('i', 'd'):
            # La mano: hasta la punta de los dedos, o un poco más allá de la muñeca.
            if f'muneca_{lado_}' in P and f'mano_{lado_}' not in P and f'codo_{lado_}' in P:
                P[f'mano_{lado_}'] = P[f'muneca_{lado_}'] + 0.35 * (P[f'muneca_{lado_}'] - P[f'codo_{lado_}'])
        self.P = P
        self.ancho_hombros = float(np.linalg.norm(P['hombro_i'] - P['hombro_d']))
        # Los huesos: (nombre, de, a, padre). El orden es el de dibujo: lo de atrás primero, los brazos al final.
        huesos = [('torso', 'pelvis', 'cuello', None), ('cabeza', 'cuello', 'cabeza', 'torso')]
        for l in ('i', 'd'):
            if f'rodilla_{l}' in P and f'cadera_{l}' in P:
                huesos.append((f'muslo_{l}', f'cadera_{l}', f'rodilla_{l}', None))
                if f'tobillo_{l}' in P:
                    huesos.append((f'pierna_{l}', f'rodilla_{l}', f'tobillo_{l}', f'muslo_{l}'))
        for l in ('i', 'd'):
            if f'codo_{l}' in P:
                huesos.append((f'brazo_{l}', f'hombro_{l}', f'codo_{l}', 'torso'))
                if f'mano_{l}' in P:
                    huesos.append((f'antebrazo_{l}', f'codo_{l}', f'mano_{l}', f'brazo_{l}'))
        self.huesos = huesos
        # Por dónde pasa cada hueso para repartir los pesos: el tronco también por sus costados (hombro → cadera)
        # y la cintura; así el costado del saco no se va con el brazo.
        self.segmentos = {n: [(P[a], P[b])] for n, a, b, _ in huesos}
        for l in ('i', 'd'):
            if f'cadera_{l}' in P:
                self.segmentos['torso'].append((P[f'hombro_{l}'] + 0.15 * (P['cuello'] - P[f'hombro_{l}']), P[f'cadera_{l}']))
        if 'cadera_i' in P and 'cadera_d' in P:
            self.segmentos['torso'].append((P['cadera_i'], P['cadera_d']))
        # Un brazo está libre si el codo y la muñeca quedan fuera del tronco (si no, va cruzado delante del cuerpo
        # y moverlo dejaría un hueco): los gestos con brazo solo usan los libres.
        tronco = [P[n] for n in ('hombro_i', 'hombro_d', 'cadera_d', 'cadera_i') if n in P]
        self.libres = []
        for l in ('i', 'd'):
            if f'antebrazo_{l}' in [b[0] for b in huesos]:
                pts = [P[f'codo_{l}'], P.get(f'muneca_{l}', P[f'mano_{l}'])]
                if len(tronco) < 4 or not any(_dentro(p, tronco) for p in pts):
                    self.libres.append(l)
        # El lado que hace el gesto: el que se pida, si no el de la derecha de la pantalla (si está libre).
        derecha_pantalla = 'i' if P['hombro_i'][0] > P['hombro_d'][0] else 'd'
        def elegir(lado_):
            quiero = {'izquierda': 'd' if derecha_pantalla == 'i' else 'i', 'derecha': derecha_pantalla}.get(lado_ or '', derecha_pantalla)
            return quiero if quiero in self.libres else (self.libres[0] if self.libres else None)
        self.lado = elegir(lado)
        self.avisos = []
        for x in self.secuencia:
            x['lado'] = elegir(x['lado'])
            if x['tipo'] in GESTOS_BRAZO and not x['lado']:
                self.avisos.append(f'Con los brazos pegados o cruzados delante del cuerpo no puede «{x["tipo"]}»: hace «hablar».')
                x['tipo'] = 'hablar'
        self.gesto = self.secuencia[0]['tipo']
        self._pesos()

    def _pesos(self):
        """El peso de cada hueso en cada píxel, por la distancia por DENTRO de la silueta a cada hueso."""
        cv2 = self.cv2
        k = 220 / max(self.W, self.H)
        cw, ch = max(8, round(self.W * k)), max(8, round(self.H * k))
        masc = (cv2.resize(self.alfa, (cw, ch), interpolation=cv2.INTER_AREA) > 0.2).astype(np.uint8)
        masc = cv2.dilate(masc, np.ones((3, 3), np.uint8))
        crucero = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], np.uint8)
        dists = []
        yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
        for nombre, a, b, _ in self.huesos:
            sem = np.zeros((ch, cw), np.uint8)
            for pa, pb in self.segmentos[nombre]:
                cv2.line(sem, tuple(int(round(v)) for v in pa * k), tuple(int(round(v)) for v in pb * k), 1, 1)
            d = np.full((ch, cw), np.inf, np.float32)
            frente = sem.copy()
            d[frente > 0] = 0
            # Distancia geodésica aproximada: crece paso a paso, solo por dentro de la silueta.
            paso = 0
            while frente.any() and paso < 400:
                paso += 1
                nuevo = cv2.dilate(frente, crucero) & masc
                nuevo[np.isfinite(d)] = 0
                if not nuevo.any():
                    break
                d[nuevo > 0] = paso
                frente = nuevo
            # Fuera de la silueta (o donde no llegó): la distancia en línea recta, más lejos.
            recta = np.full((ch, cw), np.inf, np.float32)
            for pa, pb in self.segmentos[nombre]:
                pa, pb = pa * k, pb * k
                v = pb - pa
                t = np.clip(((xx - pa[0]) * v[0] + (yy - pa[1]) * v[1]) / max(1e-6, float(v @ v)), 0, 1)
                recta = np.minimum(recta, np.hypot(xx - (pa[0] + t * v[0]), yy - (pa[1] + t * v[1])))
            d = np.where(np.isfinite(d), d, recta * 1.5 + 4)
            dists.append(d)
        s = self.ancho_hombros * k
        w = np.stack([(d / max(1.0, s) + 0.05) ** -7 for d in dists])
        # Dentro del tronco (entre hombros y caderas) los brazos no se llevan nada: si un brazo se roza con el
        # costado, al levantarlo deja el saco entero en vez de un hueco.
        # El tronco: de hombro a hombro y hacia abajo, recto, hasta un poco más allá de las caderas (el saco cuelga
        # de los hombros, más ancho que la cadera).
        tronco = []
        if all(n in self.P for n in ('hombro_i', 'hombro_d', 'cadera_i', 'cadera_d')):
            hi, hd = self.P['hombro_i'], self.P['hombro_d']
            baja = (self.P['cadera_i'][1] + self.P['cadera_d'][1]) / 2 + 0.25 * ((self.P['cadera_i'][1] + self.P['cadera_d'][1]) / 2 - (hi[1] + hd[1]) / 2)
            hacia = lambda p: p + 0.06 * (self.P['cuello'] - p)
            tronco = [hacia(hi) * k, hacia(hd) * k, np.array([hacia(hd)[0], baja]) * k, np.array([hacia(hi)[0], baja]) * k]
        if len(tronco) == 4:
            dentro = np.zeros((ch, cw), np.uint8)
            cv2.fillPoly(dentro, [np.round(np.array(tronco)).astype(np.int32)], 1)
            dentro = cv2.GaussianBlur(dentro.astype(np.float32), (5, 5), 0)
            for i, (n, *_r) in enumerate(self.huesos):
                if n.startswith(('brazo', 'antebrazo')):
                    w[i] *= 1 - dentro
        w /= w.sum(0, keepdims=True)
        # A tamaño completo, y por la transparencia: lo que cada hueso «lleva» de la imagen.
        self.peso = [cv2.resize(x.astype(np.float32), (self.W, self.H), interpolation=cv2.INTER_LINEAR) * self.alfa for x in w]
        self.yy, self.xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32)

    def _angulo_reposo(self, a, b):
        """Hacia dónde apunta un hueso en reposo: grados, 0 = hacia abajo, a favor del reloj en pantalla."""
        v = self.P[b] - self.P[a]
        return math.degrees(math.atan2(-v[0], v[1]))

    def _hacia(self, hueso, abs_deg, padre_deg=0.0):
        """El giro que lleva un hueso a apuntar a `abs_deg` (0 abajo, a favor del reloj), sabiendo cuánto giró su padre."""
        a, b = {h[0]: (h[1], h[2]) for h in self.huesos}[hueso]
        g = abs_deg - self._angulo_reposo(a, b) - padre_deg
        return (g + 180) % 360 - 180

    def poses(self, t):
        """Los giros (grados) y ajustes de cada hueso en el segundo t. Con una secuencia de gestos, el de ese
        momento; al cambiar de gesto, 0,4 s de paso suave del anterior al siguiente."""
        sec = self.secuencia
        if len(sec) == 1 and sec[0]['hasta'] is None:
            return self._pose(sec[0]['tipo'], t, None, sec[0]['lado'], sec[0]['fuerza'])
        inicio = 0.0
        for i, x in enumerate(sec):
            fin = x['hasta'] if x['hasta'] is not None and i < len(sec) - 1 else float('inf')
            if t < fin or i == len(sec) - 1:
                ahora = self._pose(x['tipo'], t, t - inicio, x['lado'], x['fuerza'])
                if i == 0 or t - inicio >= 0.4:
                    return ahora
                p = sec[i - 1]
                antes = self._pose(p['tipo'], t, t - inicio_previo, p['lado'], p['fuerza'])
                return _mezclar_poses(antes, ahora, ease_in_out((t - inicio) / 0.4))
            inicio_previo, inicio = inicio, fin
        return self._pose(sec[-1]['tipo'], t, t - inicio, sec[-1]['lado'], sec[-1]['fuerza'])

    def _pose(self, gesto, t, local, lado, f):
        """La pose de un gesto en el segundo t (`local`: segundos desde que empezó ese gesto en una secuencia; sin
        él, el gesto va en bucle de CICLO_S)."""
        fase = 2 * math.pi * (t % CICLO_S) / CICLO_S
        g = {}
        extra = {}
        # Siempre: respira (el pecho sube y los hombros con él) y la cabeza no está nunca del todo quieta.
        resp = math.sin(fase * 2)
        extra['torso'] = {'sy': 1 + 0.008 * f * resp}
        g['cabeza'] = 1.2 * f * math.sin(fase + 0.7)
        for l in ('i', 'd'):
            g[f'brazo_{l}'] = 0.8 * f * resp * (1 if l == 'i' else -1)
        # Hacia fuera para cada brazo (en pantalla): el de la izquierda gira a favor del reloj.
        fuera = {l: (1 if self.P[f'hombro_{l}'][0] < self.P['cuello'][0] else -1) for l in ('i', 'd')}
        if gesto == 'hablar':
            # Como alguien que cuenta algo: la cabeza acompaña las frases (se ladea, asiente un poco), el tronco se
            # mece y las manos suben y bajan con lo que dice. Se tiene que notar en un plano entero.
            g['cabeza'] += 6 * f * (math.sin(fase * 2 + 0.3) + 0.5 * math.sin(fase * 5 + 1.1))
            golpe = max(0.0, math.sin(fase * 4)) ** 2
            extra['cabeza'] = {'dy': 0.04 * f * self.ancho_hombros * golpe, 'sy': 1 - 0.025 * f * golpe}
            g['torso'] = 2.4 * f * math.sin(fase)
            for l in self.libres:
                mano = 0.5 + 0.5 * math.sin(fase * 3 + (0 if l == 'i' else 2))
                g[f'brazo_{l}'] = g.get(f'brazo_{l}', 0) + 6 * f * fuera[l] * mano
                g[f'antebrazo_{l}'] = 22 * f * fuera[l] * mano
        elif gesto == 'asentir':
            # De perfil no se puede: en 2D, asentir es bajar la cabeza y acortarla un poco, dos veces por ciclo.
            k = max(0.0, math.sin(fase * 2)) ** 2
            extra['cabeza'] = {'dy': 0.06 * f * self.ancho_hombros * k, 'sy': 1 - 0.05 * f * k}
        elif gesto == 'ladear':
            g['cabeza'] += 9 * f * ease_in_out(min(1, 0.5 + 0.5 * math.sin(fase))) - 4 * f
            g['torso'] = -1.5 * f * math.sin(fase)
        elif gesto == 'peso':
            # El peso de un pie al otro: el tronco se mece desde la cadera y la cabeza compensa.
            g['torso'] = 3 * f * math.sin(fase)
            g['cabeza'] -= 2.2 * f * math.sin(fase)
            extra['torso']['dx'] = 0.03 * f * self.ancho_hombros * math.sin(fase)
        elif gesto in ('saludar', 'senalar', 'explicar'):
            l = lado or self.lado
            fu = fuera[l]
            if local is None:
                # En bucle: sube en 0,7 s, aguanta y baja al final del ciclo (vuelve a empezar quieto).
                ct = t % CICLO_S
                sube = ease_in_out(tramo(ct, 0.15, 0.85)) * (1 - ease_in_out(tramo(ct, CICLO_S - 0.9, CICLO_S - 0.15)))
            else:
                # En una secuencia: sube nada más empezar el gesto (0,5 s) y se queda arriba.
                sube = ease_in_out(tramo(local, 0.05, 0.55))
            if gesto == 'saludar':
                brazo = self._hacia(f'brazo_{l}', fu * (40 + 25 * f))
                g[f'brazo_{l}'] = g.get(f'brazo_{l}', 0) + brazo * sube
                ante = self._hacia(f'antebrazo_{l}', fu * (150 + 15 * math.sin(fase * 6)), brazo) * sube
                g[f'antebrazo_{l}'] = ante
                g['cabeza'] += 3 * f * sube * fu
            elif gesto == 'senalar':
                brazo = self._hacia(f'brazo_{l}', fu * (50 + 12 * f))
                g[f'brazo_{l}'] = g.get(f'brazo_{l}', 0) + brazo * sube
                g[f'antebrazo_{l}'] = self._hacia(f'antebrazo_{l}', fu * (68 + 12 * f), brazo) * sube
                g['cabeza'] += 4 * f * sube * fu
            else:
                # Explicar: los antebrazos libres suben al frente y se mueven como al hablar con las manos.
                for m in self.libres:
                    fm = fuera[m]
                    ante = fm * (35 + 20 * f + 12 * math.sin(fase * 3 + (0 if m == l else 1.6)))
                    g[f'brazo_{m}'] = g.get(f'brazo_{m}', 0) + self._hacia(f'brazo_{m}', fm * 12) * sube
                    g[f'antebrazo_{m}'] = self._hacia(f'antebrazo_{m}', ante, self._hacia(f'brazo_{m}', fm * 12) * sube) * sube
                g['cabeza'] += 2.5 * f * math.sin(fase * 2)
        return g, extra

    def transformaciones(self, t):
        """La matriz de cada hueso (de la imagen en reposo a la pose del momento t), padres primero."""
        giros, extra = self.poses(t)
        T = {}
        for nombre, a, b, padre in self.huesos:
            e = extra.get(nombre, {})
            local = _rot(giros.get(nombre, 0.0), *self.P[a], e.get('sx', 1.0), e.get('sy', 1.0), e.get('dx', 0.0), e.get('dy', 0.0))
            T[nombre] = (T[padre] @ local) if padre in T else local
        return T

    def cuadro(self, t):
        cv2 = self.cv2
        T = self.transformaciones(t)
        quietos, moviles = [], []
        for i, (nombre, *_r) in enumerate(self.huesos):
            (quietos if np.allclose(T[nombre], np.eye(3), atol=1e-4) else moviles).append((i, nombre))
        rgb_acc = np.zeros((self.H, self.W, 3), np.float32)
        a_acc = np.zeros((self.H, self.W), np.float32)
        total = np.zeros((self.H, self.W), np.float32)
        capas = []
        if quietos:
            p = sum(self.peso[i] for i, _ in quietos)
            capas.append((min(i for i, _ in quietos), self.rgb, p))
        for i, nombre in moviles:
            inv = np.linalg.inv(T[nombre])
            mx = (inv[0, 0] * self.xx + inv[0, 1] * self.yy + inv[0, 2]).astype(np.float32)
            my = (inv[1, 0] * self.xx + inv[1, 1] * self.yy + inv[1, 2]).astype(np.float32)
            col = cv2.remap(self.rgb, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            p = cv2.remap(self.peso[i], mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            capas.append((i, col, p))
        # Cada hueso es una capa: lo de delante (los brazos, al final) tapa lo de atrás; la opacidad es la suma.
        for _, col, p in sorted(capas, key=lambda x: x[0]):
            rgb_acc = col * p[..., None] + rgb_acc * (1 - p[..., None])
            a_acc = p + a_acc * (1 - p)
            total += p
        rgb = rgb_acc / np.maximum(a_acc, 1e-4)[..., None]
        alfa = np.clip(total, 0, 1)
        return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alfa * 255]).astype(np.uint8), 'RGBA')

    def dibujo(self):
        """La imagen con el esqueleto encima, para revisar que los huesos están bien puestos."""
        d = Image.new('RGBA', (self.W, self.H), (70, 70, 70, 255))
        d.alpha_composite(Image.fromarray(np.dstack([self.rgb, self.alfa * 255]).astype(np.uint8), 'RGBA'))
        g = ImageDraw.Draw(d)
        r = max(3, round(self.ancho_hombros / 30))
        for nombre, a, b, _ in self.huesos:
            col = (255, 80, 60) if nombre.startswith(('brazo', 'antebrazo')) else (60, 200, 255)
            g.line([tuple(self.P[a]), tuple(self.P[b])], fill=col, width=r)
            for p in (self.P[a], self.P[b]):
                g.ellipse((p[0] - r * 1.4, p[1] - r * 1.4, p[0] + r * 1.4, p[1] + r * 1.4), fill=(255, 255, 255))
        return d.crop((self.mx, self.my, self.mx + self.w, self.my + self.h))


def info_esqueleto(ruta, salida=None):
    """Para revisar una marioneta antes de usarla: el esqueleto dibujado, los puntos y qué gestos puede hacer."""
    im = Image.open(ruta).convert('RGBA')
    if max(im.size) > 1080:
        im.thumbnail((1080, 1080), Image.LANCZOS)
    m = Marioneta(im, 'hablar')
    salida = salida or os.path.splitext(ruta)[0] + '-esqueleto.png'
    m.dibujo().convert('RGB').save(salida)
    puntos = {n: [round((p[0] - m.mx) / m.w, 3), round((p[1] - m.my) / m.h, 3)] for n, p in m.P.items()}
    con_brazo = ['saludar', 'senalar', 'explicar'] if m.libres else []
    return {'dibujo': salida, 'puntos': puntos, 'brazos_libres': len(m.libres),
            'gestos': ['hablar', 'asentir', 'ladear', 'peso'] + con_brazo,
            **({'aviso': 'Los brazos van pegados o cruzados delante del cuerpo: solo cabeza, respiración y peso. Para '
                         'saludar o señalar, genera al personaje con los brazos separados del cuerpo.'} if not m.libres else {})}
# <<< marioneta


class VideoCapa:
    """Un video encima (un personaje recortado que se mueve): lee sus cuadros en orden, con su transparencia
    si es un WebM con canal alfa, y vuelve a empezar si la capa dura más que el clip."""

    def __init__(self, ruta, L):
        self.ruta, self.L = ruta, L
        r = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,codec_name',
                            '-show_entries', 'format=duration', '-of', 'json', ruta], capture_output=True, text=True)
        d = json.loads(r.stdout or '{}')
        st = (d.get('streams') or [{}])[0]
        self.w, self.h = int(st.get('width', 0)), int(st.get('height', 0))
        self.dur = max(0.1, float((d.get('format') or {}).get('duration') or 1))
        self.vp9 = st.get('codec_name') == 'vp9'
        # A lo más del ancho del cuadro (más grande no gana nada y gasta memoria).
        if self.w > L.W:
            self.h, self.w = round(self.h * L.W / self.w), L.W
        self.h += self.h % 2
        self.proc, self.leido, self.ultimo = None, -1, None

    def _abrir(self, desde):
        if self.proc:
            self.proc.kill()
        # El decodificador de libvpx es el que entrega el canal alfa de un WebM.
        orden = [FFMPEG, '-v', 'error', *(['-c:v', 'libvpx-vp9'] if self.vp9 else []), '-ss', f'{desde:.3f}', '-i', self.ruta,
                 '-vf', f'fps={self.L.fps},scale={self.w}:{self.h}', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']
        self.proc = subprocess.Popen(orden, stdout=subprocess.PIPE)
        self.leido = round(desde * self.L.fps) - 1

    def cuadro(self, t):
        n = round((t % self.dur) * self.L.fps)
        if self.proc is None or n < self.leido or n > self.leido + self.L.fps * 2:
            self._abrir(n / self.L.fps)
        tam = self.w * self.h * 4
        while self.leido < n:
            datos = self.proc.stdout.read(tam)
            if len(datos) < tam:
                break
            self.ultimo = Image.frombytes('RGBA', (self.w, self.h), datos)
            self.leido += 1
        return self.ultimo or Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))


def pegar_suave(lienzo, im, cx, cy, ancho, giro=0.0, alfa=1.0):
    """Pega `im` (RGBA) centrada en (cx, cy), con `ancho` píxeles y girada `giro` grados (a favor del
    reloj), todo con decimales: una capa que se mueve o crece despacio no tiembla."""
    s = ancho / im.width
    if s <= 0:
        return
    ang = math.radians(giro)
    co, si = math.cos(ang), math.sin(ang)
    hw, hh = ancho / 2, im.height * s / 2
    ex, ey = abs(hw * co) + abs(hh * si), abs(hw * si) + abs(hh * co)
    x0, y0 = math.floor(cx - ex) - 1, math.floor(cy - ey) - 1
    bw, bh = math.ceil(cx + ex) + 2 - x0, math.ceil(cy + ey) + 2 - y0
    # De cada píxel de la caja al de la imagen: deshacer el giro y la escala.
    dx, dy = x0 - cx, y0 - cy
    datos = (co / s, si / s, (dx * co + dy * si) / s + im.width / 2,
             -si / s, co / s, (-dx * si + dy * co) / s + im.height / 2)
    pieza = im.transform((bw, bh), Image.AFFINE, datos, resample=Image.BICUBIC)
    if alfa < 0.999:
        pieza.putalpha(pieza.getchannel('A').point(lambda a: round(a * alfa)))
    # Lo que cae fuera del cuadro se recorta (alpha_composite no acepta posiciones negativas).
    ix, iy = max(0, -x0), max(0, -y0)
    if ix >= bw or iy >= bh or x0 >= lienzo.width or y0 >= lienzo.height:
        return
    pieza = pieza.crop((ix, iy, min(bw, lienzo.width - x0), min(bh, lienzo.height - y0)))
    lienzo.alpha_composite(pieza, (x0 + ix, y0 + iy))


# Escena 2.5D (igual que en el editor): una capa muy cercana (profundidad 1) se mueve 1 + PARALAJE veces
# lo que el fondo; el desenfoque más fuerte es esta fracción del ancho del cuadro.
PARALAJE = 1.5
DESENFOQUE_MAX = 0.012
# Cámara en mano: cuánto se mueve el encuadre (fracción del cuadro con temblor 1) y el zoom de más que le deja sitio.
TEMBLOR_AMPLITUD = 0.007
TEMBLOR_ZOOM = 0.04


def vaiven(s):
    """El vaivén de la cámara en mano en el segundo `s`, de -1 a 1 en cada eje (igual que en el editor)."""
    P = 2 * math.pi
    return (0.6 * math.sin(P * 0.53 * s) + 0.3 * math.sin(P * 1.37 * s + 1.3) + 0.1 * math.sin(P * 3.1 * s + 2.1),
            0.6 * math.sin(P * 0.41 * s + 0.7) + 0.3 * math.sin(P * 1.13 * s + 2.4) + 0.1 * math.sin(P * 2.7 * s + 0.4))


def desenfoque_de_campo(m, p):
    """Con profundidad de campo en una foto («campo» y «foco»), cuánto se desenfoca lo que está a la profundidad p."""
    campo = float(m.get('campo') or 0)
    return min(1.0, campo * abs(p - float(m.get('foco', 0.5))) * 1.5) if campo > 0 else 0.0


def ventana_fraccion(foto, t):
    """La ventana de una foto en `t` en fracción de su imagen (igual para dos fotos de la misma imagen)."""
    x0, y0, cw, ch = foto.ventana_en(t)
    iw, ih = foto.img.size
    return x0 / iw, y0 / ih, cw / iw, ch / ih


def paralaje(c, t, x, y, ancho, momentos=None):
    """Dónde se ve una capa con profundidad: la cámara de la foto de debajo (su encuadre, acercamiento y
    paneo) va del encuadre de cuando apareció la capa al de ahora, y la capa hace lo mismo multiplicado
    por su cercanía. Así un paisaje hecho de recortes se siente con distancia. Si la escena sigue con otra
    foto de la MISMA imagen (otro encuadre), la capa sigue a esa: el fondo cambia de toma y ella con él."""
    base = c.get('base')
    if c.get('profundidad') is None or base is None:
        return x, y, ancho
    ahora = base
    if momentos:
        otra = foto_de_fondo(momentos, t)
        if otra is not None and otra is not base and otra.m.get('archivo') == base.m.get('archivo'):
            ahora = otra
    def mover(a, b, f, x, y, ancho):
        A = a[2] / b[2]
        bx, by = (a[0] - b[0]) / b[2], (a[1] - b[1]) / b[3]
        return x + f * (A * x + bx - x), y + f * (A * y + by - y), ancho * A ** f

    m = 1 + PARALAJE * c['profundidad']
    r = ventana_fraccion(base, c['desde'])
    k = ventana_fraccion(ahora, t)
    if ahora is base:
        return mover(r, k, m, x, y, ancho)
    # Corte a otro encuadre de la misma escena: la capa se recoloca calzada con el fondo al empezar la toma (sin
    # multiplicar el salto) y luego se mueve con paralaje.
    s = ventana_fraccion(ahora, ahora.desde)
    return mover(s, k, m, *mover(r, s, 1, x, y, ancho))


def desenfocar(c, im, ancho_px, L, fija):
    """La capa fuera de foco, con margen transparente para que el borde se difumine sin cortarse."""
    if not c.get('desenfoque'):
        return im, ancho_px
    if fija and c.get('_borrosa'):
        return c['_borrosa']
    sigma = c['desenfoque'] * DESENFOQUE_MAX * L.W * im.width / max(1.0, ancho_px)
    mg = max(1, math.ceil(sigma * 3))
    lienzo = Image.new('RGBA', (im.width + 2 * mg, im.height + 2 * mg), (0, 0, 0, 0))
    lienzo.paste(im, (mg, mg))
    # Con el color premultiplicado, para que el borde no se ensucie de negro.
    a = np.asarray(lienzo, dtype=np.float32)
    al = a[..., 3:4] / 255
    pre = Image.fromarray(np.clip(np.dstack([a[..., :3] * al, a[..., 3:4]]), 0, 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(sigma))
    b = np.asarray(pre, dtype=np.float32)
    rgb = b[..., :3] / np.maximum(b[..., 3:4] / 255, 1e-3)
    sale = Image.fromarray(np.clip(np.dstack([rgb, b[..., 3:4]]), 0, 255).astype(np.uint8), 'RGBA')
    r = (sale, ancho_px * lienzo.width / im.width)
    if fija:
        c['_borrosa'] = r
    return r


def foto_de_fondo(momentos, t):
    """La foto que se ve de fondo en `t` (la última que empezó): su cámara es la de la escena."""
    base = None
    for m in momentos:
        if isinstance(m, Foto) and m.desde <= t + 1e-3:
            base = m
    return base


def estado_capa(c, dt):
    """Dónde está una capa `dt` s después de aparecer: igual que estadoCapa del editor (recorrido suave
    hasta `fin` y entrada desde un lado en 0,45 s)."""
    f = c['fin']
    p = ease_in_out(tramo(dt, 0, max(0.1, c['hasta'] - c['desde']))) if f else 0
    x = c['x'] + (f['x'] - c['x']) * p if f else c['x']
    y = c['y'] + (f['y'] - c['y']) * p if f else c['y']
    ancho = c['ancho'] + (f['ancho'] - c['ancho']) * p if f else c['ancho']
    giro = c['giro'] + (f['giro'] - c['giro']) * p if f else c['giro']
    k = 1 - (1 - tramo(dt, 0, 0.45)) ** 3
    lado = {'izquierda': ('x', -ancho / 2 - 0.02), 'derecha': ('x', 1 + ancho / 2 + 0.02), 'arriba': ('y', -0.35), 'abajo': ('y', 1.35)}.get(c['entrada'])
    if lado and lado[0] == 'x':
        x = lado[1] + (x - lado[1]) * k
    elif lado:
        y = lado[1] + (y - lado[1]) * k
    return x, y, ancho, giro


def aplicar_filtros(lienzo, L, t):
    """Los filtros de todo el video (como los del editor): trama de imprenta, polvo, grano, viñeta y
    parpadeo. Van encima de la escena y las capas, y debajo de los subtítulos."""
    f = L.filtros
    if not f:
        return lienzo
    a = np.asarray(lienzo.convert('RGB'), dtype=np.float32)
    cache = L._f
    if f.get('trama'):
        if 'trama' not in cache:
            k = 2 * math.pi / max(3, L.W / 180)
            yy, xx = np.mgrid[0:L.H, 0:L.W].astype(np.float32)
            cache['trama'] = (0.5 + 0.5 * np.sin(xx * k) * np.sin(yy * k))[..., None]
        b = cache['trama']
        # Mezcla «overlay», como en el MP4.
        sup = np.where(a < 128, 2 * a * b, 255 - 2 * (255 - a) * (1 - b))
        a = a + (sup - a) * 0.45 * f['trama']
    if f.get('polvo'):
        rng = np.random.default_rng(int(t * L.fps) + 3)
        w3, h3 = max(16, L.W // 3), max(16, L.H // 3)
        motas = (rng.random((h3, w3)) > 1 - 0.0016 * f['polvo']).astype(np.float32) * 255
        n = int(round(t * L.fps))
        if n % 7 > 4:
            motas[:, (n * 97) % w3] = np.maximum(motas[:, (n * 97) % w3], 170)
        motas = np.asarray(Image.fromarray(motas.astype(np.uint8)).resize((L.W, L.H), Image.BILINEAR), dtype=np.float32)[..., None]
        sup = 255 - (255 - a) * (255 - motas) / 255
        a = a + (sup - a) * 0.7 * f['polvo']
    if f.get('grano'):
        rng = np.random.default_rng(int(t * L.fps) * 7 + 1)
        ruido = rng.standard_normal((L.H // 2 + 1, L.W // 2 + 1)).astype(np.float32)
        ruido = np.repeat(np.repeat(ruido, 2, axis=0), 2, axis=1)[:L.H, :L.W, None]
        a = a + ruido * 30 * f['grano'] * 0.6
    if f.get('vineta'):
        if 'vineta' not in cache:
            yy, xx = np.mgrid[0:L.H, 0:L.W].astype(np.float32)
            r = np.sqrt(((xx / L.W - 0.5) * 2) ** 2 + ((yy / L.H - 0.5) * 2) ** 2) / math.sqrt(2)
            cache['vineta'] = r[..., None]
        ang = 0.2 + 0.6 * f['vineta']
        a = a * np.clip(1 - (cache['vineta'] * ang * 1.6) ** 2, 0, 1)
    if f.get('parpadeo'):
        a = a + 255 * 0.045 * f['parpadeo'] * math.sin(t * 31) * math.sin(t * 7.3)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')


def capas_encima(lienzo, L, t):
    """Dibuja las capas visibles en `t`. El «pop» rebota como en el editor (45 % → 117 % → 100 % en 0,24 s)."""
    for c in L.capas:
        if not (c['desde'] <= t < c['hasta']):
            continue
        dt = t - c['desde']
        x, y, ancho, giro = estado_capa(c, dt)
        x, y, ancho = paralaje(c, t, x, y, ancho, getattr(L, 'momentos', None))
        escala, alfa = ancho / c['ancho'], 1.0
        if c['entrada'] == 'pop':
            escala *= pop(dt)
            alfa = min(1.0, dt / 0.08)
        elif c['entrada'] == 'fundido':
            alfa = min(1.0, dt / 0.35)
        alfa *= 1 - tramo(t, c['hasta'] - 0.12, c['hasta'])
        if alfa <= 0.01:
            continue
        if c['video']:
            im, ancho_px = c['video'].cuadro(c['desde_video'] + dt), L.W * c['ancho'] * escala
        elif c['animada']:
            # La animada trae margen alrededor: se agranda en la misma proporción para que la imagen mida lo mismo.
            an = c['animada']
            im, ancho_px = an.cuadro(dt), L.W * c['ancho'] * escala * an.W / an.w
        else:
            im, ancho_px = c['im'], L.W * c['ancho'] * escala
        if c.get('desenfoque'):
            fija = not c['video'] and not c['animada']
            im, factor = desenfocar(c, im, L.W * c['ancho'], L, fija)
            ancho_px *= factor / (L.W * c['ancho'])
        pegar_suave(lienzo, im, L.W * x, L.H * y, ancho_px, giro, alfa)
    return lienzo


class Momento:
    """Algo que se ve entre `desde` y `hasta`. Lo que va después en la lista se dibuja encima."""

    def __init__(self, m, L):
        self.m, self.L = m, L
        self.desde = float(m.get('desde', 0))
        self.hasta = float(m.get('hasta', self.desde + 2))
        # Con una transición con movimiento (barrido, zoom…), su entrada dura más que un fundido.
        self.tipo_entrada = m.get('transicion') if m.get('transicion') in TRANSICIONES_KIT else None
        self.entra = float(m.get('entra', 0.45 if self.tipo_entrada and self.tipo_entrada != 'fundido' else L.transicion))

    def visible(self, t):
        # Se queda un poco más para que lo siguiente entre encima sin dejar un hueco (un barrido lo empuja 0,45 s).
        return self.desde - 1e-6 <= t < self.hasta + max(self.L.transicion, 0.5)

    def opacidad(self, t):
        return ease_in_out(tramo(t, self.desde, self.desde + self.entra)) if self.entra > 0 else 1.0

    def rotulo(self, capa, t):
        txt = self.m.get('rotulo')
        if not txt:
            return
        k = ease_out(tramo(t, self.desde + 0.06, self.desde + 0.32)) * (1 - tramo(t, self.hasta - 0.12, self.hasta))
        if k <= 0.01:
            return
        L = self.L
        f = fuente(self.m.get('fuente_rotulo', L.fuente), int(self.m.get('tam_rotulo', L.W * 0.104)))
        y = L.H * (0.105 if self.m.get('rotulo_pos', 'arriba') == 'arriba' else 0.82) + (1 - k) * 18
        col = color(self.m.get('color_rotulo'), L.texto) + (round(255 * k),)
        # Primero una sombra suave (para leerse sobre cualquier foto) y encima el texto.
        sombra = Image.new('RGBA', capa.size, (0, 0, 0, 0))
        texto_centrado(ImageDraw.Draw(sombra), L.W / 2, y + 3, txt, f, (0, 0, 0, round(120 * k)))
        capa.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(8)))
        texto_centrado(ImageDraw.Draw(capa), L.W / 2, y, txt, f, col)


def ventana(iw, ih, W, H, zoom, cx, cy):
    """La parte de una imagen (x0, y0, ancho, alto, con decimales) que llena W×H con ese zoom y centro."""
    esc = max(W / iw, H / ih) * max(1.0, zoom)
    cw, ch = W / esc, H / esc
    x0 = min(max(0.0, cx * iw - cw / 2), iw - cw)
    y0 = min(max(0.0, cy * ih - ch / 2), ih - ch)
    return x0, y0, cw, ch


def recorte_suave(im, W, H, x0, y0, cw, ch):
    """Esa parte de la imagen llevada a W×H con posición y escala con decimales: sin el temblor de
    redondear a píxeles enteros en cada cuadro (un acercamiento lento o un paneo quedan como de cámara)."""
    return im.transform((W, H), Image.AFFINE, (cw / W, 0, x0, 0, ch / H, y0), resample=Image.BICUBIC)


class Foto(Momento):
    """Una foto a pantalla completa, encuadrada, con acercamiento lento, rótulo y brillo opcional.
    Con `camara` ({"zoom", "cx", "cy"}) la cámara va del `encuadre` a ese otro encuadre, suave: un paneo
    o un acercamiento a un detalle. Todo con decimales, sin temblor."""

    def __init__(self, m, L):
        super().__init__(m, L)
        im = tapar(abrir_foto(L.ruta(m['archivo'])), m.get('tapar'))
        e = m.get('encuadre') or {}
        cam = m.get('camara') if isinstance(m.get('camara'), dict) else None
        self.ini = (float(e.get('zoom', 1)), float(e.get('cx', 0.5)), float(e.get('cy', 0.5)))
        self.fin = (float(cam.get('zoom', self.ini[0])), float(cam.get('cx', self.ini[1])), float(cam.get('cy', self.ini[2]))) if cam else None
        self.margen = 1.06 if m.get('acercar', True) and not cam else 1.0
        # Cámara en mano (0 a 1) y profundidad de campo (el fondo está a profundidad 0).
        self.temblor = min(1.0, max(0.0, float(m.get('temblor') or 0)))
        self.borroso = desenfoque_de_campo(m, 0)
        # La foto, al tamaño justo para el zoom más grande (más grande no gana nitidez y es más lenta).
        zmax = max(self.ini[0], self.fin[0] if self.fin else 0) * self.margen * (1 + TEMBLOR_ZOOM * self.temblor)
        esc = max(L.W / im.width, L.H / im.height) * zmax
        if esc < 1:
            im = im.resize((max(1, round(im.width * esc)), max(1, round(im.height * esc))), Image.LANCZOS)
        self.img = im

    def ventana_en(self, t):
        """La parte de la foto que se ve en `t` (x0, y0, ancho, alto en píxeles de la foto, con decimales)."""
        L = self.L
        p = tramo(t, self.desde, self.hasta)
        if self.fin:
            k = ease_in_out(p)
            zoom, cx, cy = (a + (b - a) * k for a, b in zip(self.ini, self.fin))
        else:
            zoom, cx, cy = self.ini
            zoom *= 1 + (self.margen - 1) * ease_out(p)
        if not self.temblor:
            return ventana(self.img.width, self.img.height, L.W, L.H, zoom, cx, cy)
        # La cámara en mano: un poco de zoom de más para tener sitio y el encuadre que va y viene.
        x0, y0, cw, ch = ventana(self.img.width, self.img.height, L.W, L.H, zoom * (1 + TEMBLOR_ZOOM * self.temblor), cx, cy)
        vx, vy = vaiven(min(max(0.0, t - self.desde), self.hasta - self.desde))
        x0 = min(max(0.0, x0 + TEMBLOR_AMPLITUD * self.temblor * vx * cw), self.img.width - cw)
        y0 = min(max(0.0, y0 + TEMBLOR_AMPLITUD * self.temblor * vy * ch), self.img.height - ch)
        return x0, y0, cw, ch

    def cuadro(self, t):
        L = self.L
        im = recorte_suave(self.img, L.W, L.H, *self.ventana_en(t))
        if self.borroso > 0.005:
            im = im.filter(ImageFilter.GaussianBlur(self.borroso * DESENFOQUE_MAX * L.W))
        a = np.asarray(im, dtype=np.float32)
        if self.m.get('brillo'):
            a = barrido(a, (t - self.desde - 0.15) / 0.8 * 1.4 - 0.2)
        capa = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
        self.rotulo(capa, t)
        return capa


class Video(Momento):
    """Un tramo de video a pantalla completa (cubre el cuadro), con rótulo opcional."""

    def __init__(self, m, L):
        super().__init__(m, L)
        e = m.get('encuadre') or {}
        dur = self.hasta + L.transicion - self.desde
        filtro = (f"fps={L.fps},scale={L.W}:{L.H}:force_original_aspect_ratio=increase,"
                  f"crop={L.W}:{L.H}:(iw-{L.W})*{e.get('cx', 0.5)}:(ih-{L.H})*{e.get('cy', 0.5)},format=rgb24")
        self.proc = subprocess.Popen([FFMPEG, '-v', 'error', '-ss', str(m.get('inicio', 0)), '-t', f'{dur:.3f}', '-i', L.ruta(m['archivo']),
                                      '-vf', filtro, '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
        self.leidos = 0
        self.ultimo = Image.new('RGB', (L.W, L.H), L.fondo)

    def cuadro(self, t):
        L = self.L
        quiero = int((t - self.desde) * L.fps)
        while self.leidos <= quiero:
            datos = self.proc.stdout.read(L.W * L.H * 3)
            if len(datos) < L.W * L.H * 3:
                break  # se acabó el tramo: se queda el último cuadro
            self.ultimo = Image.frombytes('RGB', (L.W, L.H), datos)
            self.leidos += 1
        capa = self.ultimo.convert('RGBA')
        self.rotulo(capa, t)
        return capa


class Comparar(Momento):
    """Antes y después: «deslizar» (una línea que destapa el después), «lado» o «arriba»."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.modo = m.get('modo', 'deslizar')
        e = m.get('encuadre') or {}
        a, d = abrir_foto(L.ruta(m['antes'])), abrir_foto(L.ruta(m['despues']))
        if self.modo == 'deslizar':
            self.a = encuadrar(a, L.W, L.H, e.get('zoom', 1), e.get('cx', .5), e.get('cy', .5))
            self.d = encuadrar(d, L.W, L.H, e.get('zoom', 1), e.get('cx', .5), e.get('cy', .5))
        elif self.modo == 'lado':
            self.a, self.d = encuadrar(a, L.W // 2, L.H), encuadrar(d, L.W - L.W // 2, L.H)
        else:
            self.a, self.d = encuadrar(a, L.W, L.H // 2), encuadrar(d, L.W, L.H - L.H // 2)
        self.rotulos = m.get('rotulos', ['Antes', 'Después'])

    def cuadro(self, t):
        L = self.L
        lienzo = Image.new('RGB', (L.W, L.H), L.fondo)
        if self.modo == 'deslizar':
            p = ease_in_out(tramo(t, self.desde + 0.3, self.desde + 0.3 + (self.hasta - self.desde) * 0.55))
            x = round(L.W * p)
            lienzo.paste(self.a, (0, 0))
            if x > 0:
                lienzo.paste(self.d.crop((0, 0, x, L.H)), (0, 0))
            a = np.asarray(lienzo, dtype=np.float32)
            if self.m.get('brillo') and p >= 1:
                a = barrido(a, (t - self.desde - 0.3 - (self.hasta - self.desde) * 0.55) / 0.8 * 1.4 - 0.2)
            lienzo = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
            d = ImageDraw.Draw(lienzo)
            if 0 < x < L.W:
                d.rectangle((x - 2, 0, x + 2, L.H), fill=L.acento)
            f = fuente(L.fuente, int(L.W * 0.07))
            y = L.H * 0.06
            if x < L.W * 0.85:
                d.text((L.W - d.textlength(self.rotulos[0], font=f) - L.W * 0.06, y), self.rotulos[0], font=f, fill=L.texto)
            if x > L.W * 0.15:
                d.text((L.W * 0.06, y), self.rotulos[1], font=f, fill=L.texto)
        else:
            lado = self.modo == 'lado'
            lienzo.paste(self.a, (0, 0))
            lienzo.paste(self.d, (L.W // 2, 0) if lado else (0, L.H // 2))
            a = np.asarray(lienzo, dtype=np.float32)
            if self.m.get('brillo'):
                parte = a[:, L.W // 2:] if lado else a[L.H // 2:]
                parte[:] = barrido(parte, (t - self.desde - 0.3) / 0.8 * 1.4 - 0.2)
            lienzo = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
            d = ImageDraw.Draw(lienzo)
            d.rectangle((L.W // 2 - 2, 0, L.W // 2 + 2, L.H) if lado else (0, L.H // 2 - 2, L.W, L.H // 2 + 2), fill=L.acento)
            f = fuente(L.fuente, int(L.W * (0.06 if lado else 0.07)))
            for i, (cx, y) in enumerate([(L.W / 4, L.H * 0.05), (L.W * 3 / 4, L.H * 0.05)] if lado else [(L.W / 2, L.H * 0.04), (L.W / 2, L.H * 0.54)]):
                texto_centrado(d, cx, y, self.rotulos[i], f, L.texto)
        return lienzo.convert('RGBA')


class Collage(Momento):
    """Varias fotos enteras en rejilla, con su rótulo debajo, entrando escalonadas."""

    def __init__(self, m, L):
        super().__init__(m, L)
        fotos = m['fotos']
        self.cols = int(m.get('columnas', 3))
        filas = math.ceil(len(fotos) / self.cols)
        hueco = int(L.W * 0.025)
        self.cw = (L.W - hueco * (self.cols + 1)) // self.cols
        alto_rotulo = int(L.W * 0.06) if m.get('rotulos') else 0
        self.ch = min(int(self.cw * 1.4), (int(L.H * 0.8) - filas * alto_rotulo) // filas - hueco)
        self.alto_rotulo = alto_rotulo
        zonas = m.get('tapar') or {}
        self.fotos = [caber(tapar(abrir_foto(L.ruta(f)), zonas.get(str(i))), self.cw, self.ch) for i, f in enumerate(fotos)]
        total = filas * (self.ch + alto_rotulo + hueco)
        self.y0 = (L.H - total) // 2
        self.hueco = hueco

    def cuadro(self, t):
        L = self.L
        capa = Image.new('RGBA', (L.W, L.H), L.fondo + (255,))
        d = ImageDraw.Draw(capa)
        rotulos = self.m.get('rotulos') or []
        brillo = set(self.m.get('brillo') or [])
        f = fuente(L.fuente, int(L.W * 0.04))
        for i, im in enumerate(self.fotos):
            fila, col = divmod(i, self.cols)
            e = ease_out(tramo(t, self.desde + i * 0.07, self.desde + i * 0.07 + 0.45))
            if e <= 0:
                continue
            x = self.hueco + col * (self.cw + self.hueco) + (self.cw - im.width) // 2
            y = self.y0 + fila * (self.ch + self.alto_rotulo + self.hueco) + (self.ch - im.height) + round((1 - e) * 50)
            a = np.asarray(im, dtype=np.float32)
            if i in brillo:
                a = barrido(a, (t - self.desde - 0.35) / 0.8 * 1.4 - 0.2, fuerza=0.5)
            pieza = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
            pieza.putalpha(round(255 * e))
            capa.alpha_composite(pieza, (x, y))
            if i < len(rotulos) and rotulos[i]:
                col_txt = L.texto + (round(255 * e),)
                texto_centrado(d, self.hueco + col * (self.cw + self.hueco) + self.cw / 2, y + im.height + 8, rotulos[i], f, col_txt)
        return capa


class Texto(Momento):
    """Una frase en líneas, entrando escalonada; `destacar` agranda una línea con el color de acento.
    Con `oscurecer` (0 a 1) oscurece y desenfoca lo que hay debajo en vez de tapar con fondo."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.entra = 0  # la frase entra línea a línea, sin fundido de conjunto

    def cuadro(self, t, debajo=None):
        L = self.L
        oscurecer = self.m.get('oscurecer')
        if oscurecer is not None and debajo is not None:
            k = ease_in_out(tramo(t, self.desde, self.desde + 0.6))
            base = debajo.convert('RGB')
            if k > 0.02:
                base = base.filter(ImageFilter.GaussianBlur(10 * k))
            a = np.asarray(base, dtype=np.float32) * (1 - float(oscurecer) * k)
            capa = Image.fromarray(a.astype(np.uint8)).convert('RGBA')
        else:
            capa = Image.new('RGBA', (L.W, L.H), L.fondo + (255,))
        lineas = self.m.get('lineas') or []
        destacar = self.m.get('destacar')
        tams = [int(L.W * (0.12 if i == destacar else 0.054)) for i in range(len(lineas))]
        alto = sum(int(s * 1.45) for s in tams)
        y = L.H * float(self.m.get('y', 0.5)) - alto / 2
        texto = Image.new('RGBA', (L.W, L.H), (0, 0, 0, 0))
        d = ImageDraw.Draw(texto)
        for i, (txt, s) in enumerate(zip(lineas, tams)):
            k = ease_out(tramo(t, self.desde + 0.4 + i * 0.18, self.desde + 0.95 + i * 0.18))
            if k > 0.01:
                f = fuente('normal' if i == destacar else L.fuente, s)
                col = (L.acento if i == destacar else L.texto) + (round(255 * k),)
                texto_centrado(d, L.W / 2, y + (1 - k) * 30, txt, f, col, espacio=0 if i == destacar else int(s * 0.18))
            y += int(s * 1.45)
        k = ease_out(tramo(t, self.desde + 1.0, self.desde + 1.6))
        if k > 0 and destacar is not None:
            d.line((L.W / 2 - L.W * 0.15 * k, y + 8, L.W / 2 + L.W * 0.15 * k, y + 8), fill=L.acento + (255,), width=3)
        if self.m.get('brillo', True):
            a = np.asarray(texto, dtype=np.float32)
            hay = a[..., 3:4] > 20
            for t0 in (self.desde + 0.95, self.desde + 1.9):
                p = (t - t0) / 0.9 * 1.4 - 0.2
                if -0.2 < p < 1.2:
                    yy, xx = np.mgrid[0:L.H, 0:L.W].astype(np.float32)
                    u = ((xx / L.W) + 0.35 * (yy / L.H)) / 1.35
                    luz = np.exp(-((u - p) / 0.06) ** 2)[..., None]
                    a[..., :3] = np.where(hay, a[..., :3] + (255 - a[..., :3]) * luz, a[..., :3])
            texto = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
        capa.alpha_composite(texto)
        return capa


# ---------------------------------------------------------------------------
# Piezas encima (títulos, etiquetas, palabras) y piezas de documental (objeto, apiladas)
# ---------------------------------------------------------------------------

def coef_perspectiva(destino, origen):
    """Los 8 coeficientes de PIL para llevar los 4 puntos `destino` (salida) a `origen` (entrada)."""
    a, b = [], []
    for (x, y), (X, Y) in zip(destino, origen):
        a.append([x, y, 1, 0, 0, 0, -X * x, -X * y])
        b.append(X)
        a.append([0, 0, 0, x, y, 1, -Y * x, -Y * y])
        b.append(Y)
    return np.linalg.solve(np.array(a, dtype=np.float64), np.array(b, dtype=np.float64)).tolist()


def pop(dt):
    """El rebote de entrada (45 % → 117 % → 100 % en 0,24 s), el mismo de las capas del editor."""
    if dt < 0:
        return 0.0
    return 0.45 + dt / 0.13 * 0.72 if dt < 0.13 else (1.17 - (dt - 0.13) / 0.11 * 0.17 if dt < 0.24 else 1.0)


def con_sombra(capa, texto, fuerza=140, radio=10, baja=4):
    """Pega `texto` (RGBA) en `capa` con una sombra suave debajo, para leerse sobre cualquier imagen."""
    caja = texto.getchannel('A').getbbox()
    if not caja:
        return
    # Solo la zona con texto (más el desenfoque): desenfocar el cuadro entero en cada fotograma es lento.
    m = radio * 3 + baja
    x0, y0 = max(0, caja[0] - m), max(0, caja[1] - m)
    x1, y1 = min(texto.width, caja[2] + m), min(texto.height, caja[3] + m)
    trozo = texto.crop((x0, y0, x1, y1))
    if fuerza > 0:
        sombra = Image.new('RGBA', trozo.size, (0, 0, 0, 0))
        sombra.putalpha(trozo.getchannel('A').point(lambda a: round(a * fuerza / 255)))
        capa.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(radio)), (x0, min(capa.height - 1, y0 + baja)))
    capa.alpha_composite(trozo, (x0, y0))


_GRANO = {}


def grano(capa, fuerza=0.22):
    """Textura de imprenta sobre lo que tenga color en `capa` (RGBA): letras gastadas, no planas."""
    clave = capa.size
    if clave not in _GRANO:
        rng = np.random.default_rng(7)
        ruido = rng.random((capa.size[1] // 2 + 1, capa.size[0] // 2 + 1)).astype(np.float32)
        ruido = np.repeat(np.repeat(ruido, 2, axis=0), 2, axis=1)[:capa.size[1], :capa.size[0]]
        _GRANO[clave] = ruido[..., None]
    a = np.asarray(capa, dtype=np.float32).copy()
    a[..., :3] *= 1 - fuerza * 0.35 + fuerza * 0.35 * _GRANO[clave]
    a[..., 3:4] *= (1 - fuerza * 0.35) + fuerza * 0.35 * (_GRANO[clave] > 0.12)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def lineas_titulo(m, L):
    """Las líneas de un título: cada una con su texto, letra, tamaño (fracción del ancho) y color."""
    out = []
    for i, x in enumerate(m.get('lineas') or []):
        if isinstance(x, str):
            x = {'texto': x}
        txt = str(x.get('texto', '')).strip()
        if not txt:
            continue
        tam = float(x.get('tam', 0.06))
        estilo = x.get('fuente', m.get('fuente', L.fuente))
        f = fuente(estilo, max(8, int(L.W * tam)))
        # Si no cabe, la línea se encoge hasta el 90 % del ancho.
        ancho = ImageDraw.Draw(Image.new('L', (1, 1))).textlength(txt, font=f)
        if ancho > L.W * 0.9:
            f = fuente(estilo, max(8, int(L.W * tam * L.W * 0.9 / ancho)))
        out.append({'texto': txt, 'f': f, 'color': color(x.get('color'), L.texto)})
    return out


class Encima(Momento):
    """Algo que se dibuja ENCIMA de lo que ya hay (no tapa la escena): títulos, etiquetas, palabras."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.entra = 0

    def visible(self, t):
        return self.desde - 1e-6 <= t < self.hasta

    def salida(self, t):
        return 1 - tramo(t, self.hasta - 0.15, self.hasta)

    def cuadro(self, t, debajo=None):
        capa = (debajo if debajo is not None else Image.new('RGBA', (self.L.W, self.L.H), self.L.fondo + (255,))).copy()
        if capa.mode != 'RGBA':
            capa = capa.convert('RGBA')
        k = self.salida(t)
        if k > 0.01:
            self.dibujar(capa, t, k)
        return capa


class Titulo(Encima):
    """Un título de varias líneas, cada una con su letra, tamaño y color (p. ej. una pregunta pequeña
    en blanco y una palabra enorme en serif cursiva roja). Entra línea a línea («subir»), letra a letra
    («maquina») o rebotando («pop»); `subrayado` traza una raya bajo la última línea; `grano` la gasta."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.lineas = lineas_titulo(m, L)
        d = ImageDraw.Draw(Image.new('L', (1, 1)))
        for ln in self.lineas:
            sube, baja = ln['f'].getmetrics()
            ln['alto'] = sube + baja
            ln['ancho'] = d.textlength(ln['texto'], font=ln['f'])
        self.alto = sum(ln['alto'] * 1.08 for ln in self.lineas)

    def dibujar(self, capa, t, k):
        L, m = self.L, self.m
        if m.get('oscurecer'):
            o = float(m['oscurecer']) * ease_in_out(tramo(t, self.desde, self.desde + 0.4)) * k
            capa.alpha_composite(Image.new('RGBA', capa.size, (0, 0, 0, round(255 * o))))
        cx, cy = L.W * float(m.get('x', 0.5)), L.H * float(m.get('y', 0.5))
        entrada = m.get('entrada', 'subir')
        texto = Image.new('RGBA', capa.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(texto)
        y = cy - self.alto / 2
        for i, ln in enumerate(self.lineas):
            t0 = self.desde + i * float(m.get('paso', 0.14))
            x = cx - ln['ancho'] / 2
            if entrada == 'maquina':
                n = int(len(ln['texto']) * tramo(t, t0, t0 + max(0.2, len(ln['texto']) * 0.035)))
                if n:
                    d.text((x, y), ln['texto'][:n], font=ln['f'], fill=ln['color'] + (round(255 * k),))
            elif entrada == 'palabras':
                # Palabra a palabra, cada una fundiéndose a su tiempo (como «What if… Fear… could be…»).
                palabras = ln['texto'].split(' ')
                paso = min(0.22, 1.4 / max(1, len(palabras)))
                px = x
                for j, w in enumerate(palabras):
                    e = tramo(t, t0 + j * paso, t0 + j * paso + 0.15)
                    if e > 0.01:
                        d.text((px, y), w, font=ln['f'], fill=ln['color'] + (round(255 * e * k),))
                    px += d.textlength(w + ' ', font=ln['f'])
            elif entrada == 'pop':
                e = pop(t - t0)
                if e > 0:
                    pieza = Image.new('RGBA', (int(ln['ancho']) + 8, ln['alto'] + 8), (0, 0, 0, 0))
                    ImageDraw.Draw(pieza).text((4, 4), ln['texto'], font=ln['f'], fill=ln['color'] + (round(255 * k),))
                    pieza = pieza.resize((max(1, round(pieza.width * e)), max(1, round(pieza.height * e))), Image.BILINEAR)
                    texto.alpha_composite(pieza, (round(cx - pieza.width / 2), round(y + ln['alto'] / 2 - pieza.height / 2)))
            else:
                e = ease_out(tramo(t, t0, t0 + 0.45))
                if e > 0.01:
                    d.text((x, y + (1 - e) * L.H * 0.025), ln['texto'], font=ln['f'], fill=ln['color'] + (round(255 * e * k),))
            y += ln['alto'] * 1.08
        if m.get('subrayado') and self.lineas:
            ult = self.lineas[-1]
            t0 = self.desde + len(self.lineas) * float(m.get('paso', 0.14)) + 0.15
            e = ease_out(tramo(t, t0, t0 + 0.4))
            if e > 0:
                media = ult['ancho'] / 2 * e
                grueso = max(3, int(L.W * 0.008))
                d.rectangle((cx - media, y + grueso, cx + media, y + grueso * 2), fill=color(m['subrayado'], L.acento) + (round(255 * k),))
        if m.get('grano'):
            texto = grano(texto)
        con_sombra(capa, texto, fuerza=0 if m.get('sombra') is False else 150, radio=max(4, L.W // 110))


class Etiqueta(Encima):
    """La tira de color con un nombre, como un recorte de papel pegado encima (entra con un «pop»)."""

    def __init__(self, m, L):
        super().__init__(m, L)
        f = fuente(m.get('fuente', 'gruesa'), max(8, int(L.W * float(m.get('tam', 0.05)))))
        txt = str(m.get('texto', '')).strip()
        d = ImageDraw.Draw(Image.new('L', (1, 1)))
        ancho = int(d.textlength(txt, font=f))
        sube, baja = f.getmetrics()
        px, py = int(f.size * 0.55), int(f.size * 0.32)
        w, h = ancho + px * 2, sube + baja + py * 2
        pieza = Image.new('RGBA', (w + 20, h + 20), (0, 0, 0, 0))
        dp = ImageDraw.Draw(pieza)
        # Bordes de papel recortado: los lados con pequeños dientes al azar (siempre los mismos).
        rng = np.random.default_rng(len(txt) * 31 + 5)
        arriba = [(10 + x, 10 + rng.uniform(0, 4)) for x in np.linspace(0, w, 14)]
        abajo = [(10 + x, 10 + h - rng.uniform(0, 4)) for x in np.linspace(w, 0, 14)]
        dp.polygon(arriba + abajo, fill=color(m.get('fondo'), (255, 214, 10)) + (255,))
        dp.text((10 + px, 10 + py), txt, font=f, fill=color(m.get('color'), (17, 17, 17)) + (255,))
        self.pieza = pieza.rotate(float(m.get('giro', -4)), resample=Image.BICUBIC, expand=True)

    def dibujar(self, capa, t, k):
        e = pop(t - self.desde)
        if e <= 0:
            return
        L = self.L
        im = self.pieza.resize((max(1, round(self.pieza.width * e)), max(1, round(self.pieza.height * e))), Image.BILINEAR)
        if k < 0.999:
            im.putalpha(im.getchannel('A').point(lambda a: round(a * k)))
        x = round(L.W * float(self.m.get('x', 0.5)) - im.width / 2)
        y = round(L.H * float(self.m.get('y', 0.5)) - im.height / 2)
        lienzo = Image.new('RGBA', capa.size, (0, 0, 0, 0))
        lienzo.paste(im, (x, y), im)
        con_sombra(capa, lienzo, fuerza=110, radio=8, baja=6)


# Dónde caen las palabras sueltas si la receta no lo dice (centro de cada una, en fracciones).
SITIOS_PALABRAS = [(0.3, 0.3), (0.68, 0.24), (0.5, 0.42), (0.24, 0.55), (0.72, 0.5), (0.42, 0.66), (0.66, 0.74), (0.3, 0.8),
                   (0.55, 0.18), (0.8, 0.62)]


def sitios_palabras(m):
    dados = m.get('posiciones') or []
    return [tuple(dados[i]) if i < len(dados) else SITIOS_PALABRAS[i % len(SITIOS_PALABRAS)] for i in range(len(m.get('palabras') or []))]


class Palabras(Encima):
    """Palabras sueltas que aparecen una a una en distintos sitios y flotan despacio (fear… isolation…).
    `destacar`: índices que van más grandes y en el color de acento."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.palabras = [str(x) for x in (m.get('palabras') or [])]
        self.sitios = sitios_palabras(m)
        n = max(1, len(self.palabras))
        self.paso = float(m.get('paso', min(0.4, max(0.12, (self.hasta - self.desde - 0.6) / n))))
        destacar = set(m.get('destacar') or [])
        tam = float(m.get('tam', 0.05))
        self.estilos = [(fuente(m.get('fuente', L.fuente), int(L.W * tam * (1.5 if i in destacar else 1))),
                         L.acento if i in destacar else color(m.get('color'), L.texto)) for i in range(n)]

    def dibujar(self, capa, t, k):
        L = self.L
        texto = Image.new('RGBA', capa.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(texto)
        for i, w in enumerate(self.palabras):
            t0 = self.desde + i * self.paso
            e = ease_out(tramo(t, t0, t0 + 0.35))
            if e <= 0.01:
                continue
            f, col = self.estilos[i]
            x, y = self.sitios[i]
            deriva = (t - t0) * L.H * 0.008
            ancho = d.textlength(w, font=f)
            d.text((L.W * x - ancho / 2, L.H * y - f.size / 2 - deriva + (1 - e) * 14), w, font=f, fill=col + (round(255 * e * k),))
        con_sombra(capa, texto, fuerza=150, radio=max(4, L.W // 120))


def fondo_de(m, L, clave='fondo'):
    """El fondo de una pieza: una imagen que cubre el cuadro o un color liso."""
    f = m.get(clave)
    if isinstance(f, str) and not f.startswith('#') and os.path.isfile(L.ruta(f)):
        return encuadrar(abrir_foto(L.ruta(f)), L.W, L.H)
    return Image.new('RGB', (L.W, L.H), color(f, L.fondo))


def foco_de(L, cx=0.5, fuerza=0.7):
    """Un cono de luz desde arriba y lo demás en penumbra (como una obra colgada bajo su lámpara)."""
    yy, xx = np.mgrid[0:L.H:2, 0:L.W:2].astype(np.float32)
    u, v = xx / L.W - cx, yy / L.H
    ancho = 0.12 + v * 0.42
    cono = np.exp(-(u / ancho) ** 2 * 2.2) * np.clip(1.15 - v * 0.75, 0, 1)
    luz = 1 - fuerza + fuerza * np.clip(cono * 1.25, 0, 1.25)
    luz = np.repeat(np.repeat(luz, 2, axis=0), 2, axis=1)[:L.H, :L.W]
    return luz[..., None]


class Objeto(Momento):
    """Una pieza (un cuadro, un cohete, un producto) presentada como en un museo: con marco, sombra,
    bajo un foco y entrando con un giro 3D que se asienta. Sobre `fondo` (imagen o color)."""

    def __init__(self, m, L):
        super().__init__(m, L)
        im = abrir_foto(L.ruta(m['archivo'])).convert('RGBA')
        ancho = round(L.W * float(m.get('ancho', 0.62)))
        im = im.resize((ancho, max(1, round(im.height * ancho / im.width))), Image.LANCZOS)
        marco = m.get('marco', True)
        if marco:
            g = max(6, ancho // 30)
            con = Image.new('RGBA', (im.width + g * 2, im.height + g * 2), color(marco if isinstance(marco, str) else None, (176, 132, 62)) + (255,))
            ImageDraw.Draw(con).rectangle((g // 2, g // 2, con.width - g // 2 - 1, con.height - g // 2 - 1), outline=(60, 40, 20, 255), width=max(2, g // 4))
            con.paste(im, (g, g))
            im = con
        self.pieza = im
        self.fondo = fondo_de(m, L)
        self.luz = foco_de(L, float(m.get('x', 0.5))) if m.get('foco', True) else None
        self.giro = float(m.get('giro', 38))
        self.giro_final = float(m.get('giro_final', 0))

    def cuadro(self, t):
        L, m = self.L, self.m
        p = tramo(t, self.desde, self.desde + float(m.get('entrada', 1.1)))
        ang = math.radians(self.giro_final + (self.giro - self.giro_final) * (1 - ease_out(p)))
        # Al final se acerca un poco (como una cámara que respira).
        escala = (0.88 + 0.12 * ease_out(p)) * (1 + 0.04 * tramo(t, self.desde, self.hasta))
        w, h = self.pieza.width * escala, self.pieza.height * escala
        dist = w * 2.2
        esquinas = []
        for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
            z = x * math.sin(ang)
            f = dist / (dist + z)
            esquinas.append((x * math.cos(ang) * f, y * f))
        x0, y0 = min(e[0] for e in esquinas), min(e[1] for e in esquinas)
        x1, y1 = max(e[0] for e in esquinas), max(e[1] for e in esquinas)
        bw, bh = max(1, int(x1 - x0) + 2), max(1, int(y1 - y0) + 2)
        destino = [(e[0] - x0, e[1] - y0) for e in esquinas]
        origen = [(0, 0), (self.pieza.width, 0), (self.pieza.width, self.pieza.height), (0, self.pieza.height)]
        lienzo = self.fondo.copy().convert('RGBA')
        cx, cy = L.W * float(m.get('x', 0.5)), L.H * float(m.get('y', 0.47))
        # La parte decimal de la posición va dentro de la deformación (así no salta de píxel en píxel).
        fx, fy = (cx - (x1 - x0) / 2) % 1, (cy - (y1 - y0) / 2) % 1
        pieza = self.pieza.transform((bw, bh), Image.PERSPECTIVE, coef_perspectiva([(d[0] + fx, d[1] + fy) for d in destino], origen), Image.BICUBIC)
        pos = (math.floor(cx - (x1 - x0) / 2), math.floor(cy - (y1 - y0) / 2))
        sombra = Image.new('RGBA', (bw + 80, bh + 80), (0, 0, 0, 0))
        sombra.paste(Image.new('RGBA', (bw, bh), (0, 0, 0, 170)), (40, 40), pieza)
        lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(22)), (pos[0] - 40 + 10, pos[1] - 40 + 24))
        lienzo.alpha_composite(pieza, pos)
        if self.luz is not None:
            a = np.asarray(lienzo.convert('RGB'), dtype=np.float32) * self.luz
            lienzo = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
        if m.get('brillo'):
            a = barrido(np.asarray(lienzo.convert('RGB'), dtype=np.float32), (t - self.desde - 1.0) / 0.9 * 1.4 - 0.2, fuerza=0.35)
            lienzo = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGBA')
        self.rotulo(lienzo, t)
        return lienzo


class Apiladas(Momento):
    """Fotos impresas (con su borde blanco) que caen una sobre otra, cada una algo girada.
    `gris`: en blanco y negro, como archivo. Sobre `fondo` (imagen o color)."""

    def __init__(self, m, L):
        super().__init__(m, L)
        self.fondo = fondo_de(m, L)
        if m.get('oscurecer_fondo'):
            a = np.asarray(self.fondo, dtype=np.float32) * (1 - float(m['oscurecer_fondo']))
            self.fondo = Image.fromarray(a.astype(np.uint8))
        rng = np.random.default_rng(11)
        ancho = round(L.W * float(m.get('ancho', 0.66)))
        self.fotos = []
        for f in m.get('fotos') or []:
            im = abrir_foto(L.ruta(f))
            if m.get('gris', True):
                im = im.convert('L').convert('RGB')
            im = caber(im, ancho, round(L.H * 0.42))
            b = max(6, ancho // 28)
            impresa = Image.new('RGBA', (im.width + b * 2, im.height + b * 2), (244, 241, 234, 255))
            impresa.paste(im, (b, b))
            self.fotos.append({'im': impresa, 'giro': float(rng.uniform(-11, 11)),
                               'dx': float(rng.uniform(-0.07, 0.07)), 'dy': float(rng.uniform(-0.05, 0.05))})
        n = max(1, len(self.fotos))
        self.paso = float(m.get('paso', min(0.5, max(0.18, (self.hasta - self.desde - 0.5) / n))))

    def cuadro(self, t):
        L = self.L
        lienzo = self.fondo.copy().convert('RGBA')
        for i, f in enumerate(self.fotos):
            t0 = self.desde + i * self.paso
            e = ease_out(tramo(t, t0, t0 + 0.35))
            if e <= 0:
                continue
            escala = 1.25 - 0.25 * e
            giro = f['giro'] + (1 - e) * 14
            im = f['im'].resize((round(f['im'].width * escala), round(f['im'].height * escala)), Image.BILINEAR).rotate(giro, Image.BICUBIC, expand=True)
            if e < 1:
                im.putalpha(im.getchannel('A').point(lambda a: round(a * min(1, e * 2))))
            cx = L.W * (0.5 + f['dx'])
            cy = L.H * (0.47 + f['dy']) - (1 - e) * L.H * 0.12
            pos = (round(cx - im.width / 2), round(cy - im.height / 2))
            sombra = Image.new('RGBA', im.size, (0, 0, 0, 0))
            sombra.putalpha(im.getchannel('A').point(lambda a: round(a * 0.55)))
            lienzo.alpha_composite(sombra.filter(ImageFilter.GaussianBlur(14)), (pos[0] + 8, pos[1] + 14))
            lienzo.alpha_composite(im, pos)
        self.rotulo(lienzo, t)
        return lienzo


PIEZAS = {'foto': Foto, 'video': Video, 'comparar': Comparar, 'collage': Collage, 'texto': Texto,
          'objeto': Objeto, 'apiladas': Apiladas, 'titulo': Titulo, 'etiqueta': Etiqueta, 'palabras': Palabras}


# ---------------------------------------------------------------------------
# Armar
# ---------------------------------------------------------------------------

def cargar(ruta):
    with open(ruta, encoding='utf-8-sig') as f:
        r = json.load(f)
    r['_ruta'] = ruta
    L = Lienzo(r)
    momentos = []
    for i, m in enumerate(r.get('momentos', [])):
        tipo = m.get('tipo')
        if tipo not in PIEZAS:
            raise SystemExit(f'Momento {i + 1}: tipo «{tipo}» no existe (usa: {", ".join(PIEZAS)}).')
        for clave in ('archivo', 'antes', 'despues'):
            if clave in m and not os.path.isfile(L.ruta(m[clave])):
                raise SystemExit(f'Momento {i + 1}: no encuentro «{m[clave]}».')
        for f in (m.get('fotos') or []) if tipo == 'apiladas' else []:
            if not os.path.isfile(L.ruta(f)):
                raise SystemExit(f'Momento {i + 1}: no encuentro «{f}».')
        momentos.append(PIEZAS[tipo](m, L))
    # Las capas con profundidad siguen a la cámara de la foto que tienen debajo al aparecer (y a las que siguen
    # con la misma imagen).
    L.momentos = momentos
    for c in L.capas:
        if c['profundidad'] is not None:
            c['base'] = foto_de_fondo(momentos, c['desde'])
            # Con profundidad de campo en esa foto, lo que está lejos del foco se desenfoca.
            if c['base'] is not None:
                c['desenfoque'] = min(1.0, c['desenfoque'] + desenfoque_de_campo(c['base'].m, c['profundidad']))
    fin = max([m.hasta for m in momentos] or [1.0])
    dur = float(r.get('duracion', fin))
    return r, L, momentos, dur


TRANSICIONES_KIT = ('fundido', 'barrido-izquierda', 'barrido-derecha', 'barrido-arriba', 'barrido-abajo', 'zoom', 'desenfoque',
                    'destello', 'circulo')


def transicion(lienzo, capa, tipo, k, L, dk=0.0):
    """Cómo entra `capa` sobre `lienzo` (k de 0 a 1), igual que las transiciones del editor (xfade de FFmpeg).
    `dk`: lo que avanza k en un cuadro (para el desenfoque de movimiento de los barridos)."""
    capa = capa if capa.mode == 'RGBA' else capa.convert('RGBA')
    e = 1 - (1 - k) ** 3
    if tipo and tipo.startswith('barrido-'):
        # Empuja: lo de antes sale por un lado y lo nuevo entra por el otro. Como un paneo rápido de cámara,
        # con desenfoque de movimiento: varias posiciones dentro del mismo cuadro, promediadas.
        dx = {'barrido-izquierda': -1, 'barrido-derecha': 1}.get(tipo, 0)
        dy = {'barrido-arriba': -1, 'barrido-abajo': 1}.get(tipo, 0)

        def empuje(ee):
            out = Image.new('RGBA', lienzo.size, (0, 0, 0, 255))
            ox, oy = round(dx * ee * L.W), round(dy * ee * L.H)
            out.paste(lienzo, (ox, oy))
            out.paste(capa, (ox - dx * L.W, oy - dy * L.H))
            return out

        if dk <= 0:
            return empuje(e)
        muestras = [1 - (1 - max(0.0, k - dk * f)) ** 3 for f in (0.0, 0.25, 0.5, 0.75)]
        if abs(muestras[0] - muestras[-1]) * max(L.W, L.H) < 3:
            return empuje(e)
        suma = np.zeros((L.H, L.W, 4), dtype=np.float32)
        for ee in muestras:
            suma += np.asarray(empuje(ee), dtype=np.float32)
        return Image.fromarray((suma / len(muestras)).astype(np.uint8), 'RGBA')
    if tipo == 'zoom':
        # Lo de antes se acerca mientras se funde con lo nuevo.
        s = 1 + 0.35 * e
        w, h = round(L.W / s), round(L.H / s)
        viejo = lienzo.crop(((L.W - w) // 2, (L.H - h) // 2, (L.W - w) // 2 + w, (L.H - h) // 2 + h)).resize(lienzo.size, Image.BILINEAR)
        return Image.blend(viejo, capa, k)
    if tipo == 'desenfoque':
        r = 18 * (1 - abs(2 * k - 1))
        mezcla = Image.blend(lienzo, capa, k)
        return mezcla.filter(ImageFilter.GaussianBlur(r)) if r > 0.5 else mezcla
    if tipo == 'destello':
        blanco = Image.new('RGBA', lienzo.size, (255, 255, 255, 255))
        return Image.blend(lienzo, blanco, min(1, k * 2)) if k < 0.5 else Image.blend(blanco, capa, (k - 0.5) * 2)
    if tipo == 'circulo':
        mascara = Image.new('L', lienzo.size, 0)
        r = e * math.hypot(L.W, L.H) / 2
        ImageDraw.Draw(mascara).ellipse((L.W / 2 - r, L.H / 2 - r, L.W / 2 + r, L.H / 2 + r), fill=255)
        return Image.composite(capa, lienzo, mascara)
    return Image.blend(lienzo, capa, k)


def cuadro(L, momentos, t, dur, fundido_final):
    lienzo = Image.new('RGBA', (L.W, L.H), L.fondo + (255,))
    for m in momentos:
        if not m.visible(t):
            continue
        capa = m.cuadro(t, lienzo) if isinstance(m, (Texto, Encima)) else m.cuadro(t)
        tipo = getattr(m, 'tipo_entrada', None)
        k = tramo(t, m.desde, m.desde + m.entra) if tipo and m.entra > 0 else m.opacidad(t)
        if k >= 0.999:
            lienzo = capa if capa.mode == 'RGBA' else capa.convert('RGBA')
        elif k > 0.001:
            lienzo = transicion(lienzo, capa, tipo, k, L, 1 / (L.fps * max(0.05, m.entra))) if tipo else Image.blend(lienzo, capa, k)
    if lienzo.mode != 'RGBA':
        lienzo = lienzo.convert('RGBA')
    lienzo = capas_encima(lienzo, L, t)
    lienzo = aplicar_filtros(lienzo, L, t)
    lienzo = subtitulo(lienzo, L, t)
    if fundido_final > 0:
        k = tramo(t, dur - fundido_final, dur)
        if k > 0:
            lienzo = Image.blend(lienzo, Image.new('RGBA', lienzo.size, (0, 0, 0, 255)), k)
    return lienzo.convert('RGB')


def _palabras(t):
    import re
    return [w for w in re.findall(r"[a-záéíóúüñ0-9]+", str(t).lower()) if len(w) > 2]


def avisos_escena(r, L, momentos):
    """Dos cosas que en la v4 se vieron mal: una foto que es un fondo casi vacío (una pared, un haz de luz) sin
    nada encima un buen rato, y un texto donde se mueven los brazos de una marioneta (el brazo lo tapa)."""
    import cv2
    avisos = []
    # Lo que va encima en cada momento: títulos, etiquetas, palabras, textos, objetos y capas.
    encima = [(m.desde, m.hasta) for m in momentos if m.m.get('tipo') in ('titulo', 'etiqueta', 'palabras', 'texto', 'objeto', 'apiladas')]
    encima += [(c['desde'], c['hasta']) for c in L.capas if c['ancho'] >= 0.12]
    for i, m in enumerate(momentos):
        if not isinstance(m, Foto):
            continue
        g = cv2.resize(np.asarray(m.img.convert('L'), dtype=np.float32), (135, 240), interpolation=cv2.INTER_AREA)
        if float(np.abs(cv2.Laplacian(g, cv2.CV_32F)).mean()) >= 4.5:
            continue
        # Cuánto rato de este momento no tiene nada encima (a pasos de 0,1 s).
        vacio = [t for t in np.arange(m.desde, m.hasta, 0.1) if not any(a <= t < b for a, b in encima)]
        if len(vacio) * 0.1 >= 0.4:
            avisos.append(f'Momento {i + 1} ({m.desde:.1f}–{m.hasta:.1f} s): «{os.path.basename(m.m.get("archivo", ""))}» es un fondo casi vacío '
                          f'y no tiene nada encima entre {vacio[0]:.1f} y {vacio[-1] + 0.1:.1f} s: se ve un cuadro vacío. Pon un título, '
                          'una pieza o una capa encima en todo el momento, o usa una foto con sujeto.')
    # Textos donde se mueven los brazos de una marioneta que saluda, señala o explica.
    for j, c in enumerate(L.capas):
        an = c.get('animada')
        if not isinstance(an, Marioneta) or an.gesto not in GESTOS_BRAZO:
            continue
        # Por dónde pasan los brazos: lo que la animación cubre en algún momento y en reposo no (unos cuadros del ciclo).
        reposo = an.alfa > 0.5
        paso = np.zeros_like(reposo)
        for t in np.arange(0.4, CICLO_S, 0.45):
            paso |= (np.asarray(an.cuadro(float(t)).getchannel('A')) > 128) & ~reposo
        ys, xs = np.nonzero(paso)
        if len(xs) < 50:
            continue
        # De píxeles de la animación a fracciones del cuadro (la capa va centrada en x, y con su ancho de animación).
        ancho_px = L.W * c['ancho'] * an.W / an.w
        k = ancho_px / an.W
        a_x = lambda px: (L.W * c['x'] + (px - an.W / 2) * k) / L.W
        a_y = lambda py: (L.H * c['y'] + (py - an.H / 2) * k) / L.H
        zona = (a_x(np.percentile(xs, 1)) - 0.05, a_y(np.percentile(ys, 1)) - 0.04, a_x(np.percentile(xs, 99)) + 0.05, a_y(np.percentile(ys, 99)) + 0.04)
        # El brazo que sale del cuadro (la persona está muy a un lado para su gesto).
        fuera_x = a_x(np.percentile(xs, 99.5)) > 1.0 or a_x(np.percentile(xs, 0.5)) < 0.0
        if fuera_x or a_y(np.percentile(ys, 0.5)) < 0.0:
            avisos.append(f'Capa {j + 1} («{an.gesto}»): el brazo sale del cuadro al hacer el gesto. Acerca la persona al centro '
                          '(su "x"), hazla un poco más pequeña o que el gesto vaya hacia el otro lado ("lado").')
        for i, m in enumerate(momentos):
            d = m.m
            if m.hasta <= c['desde'] or m.desde >= c['hasta']:
                continue
            sitios = []
            if d.get('tipo') == 'palabras':
                sitios = list(zip(d.get('palabras') or [], sitios_palabras(d)))
            elif d.get('tipo') in ('titulo', 'etiqueta'):
                sitios = [(d.get('texto') or ' '.join(str(x if isinstance(x, str) else x.get('texto', '')) for x in d.get('lineas') or []),
                           (float(d.get('x', 0.5)), float(d.get('y', 0.5))))]
            for texto, (x, y) in sitios:
                if zona[0] < x < zona[2] and zona[1] < y < zona[3]:
                    avisos.append(f'Momento {i + 1}: «{str(texto)[:30]}» (x {x:.2f}, y {y:.2f}) cae donde se mueven los brazos de la '
                                  f'persona de la capa {j + 1} («{an.gesto}»): el brazo lo tapa. Ponlo por encima de su cabeza o '
                                  f'fuera de x {zona[0]:.2f}–{zona[2]:.2f}.')
    avisos += avisos_tapados(L, momentos)
    # Un video que es casi todo fotos planas (sin capas con profundidad ni personajes animados) se ve barato.
    fotos = [m for m in momentos if isinstance(m, Foto)]
    total_fotos = sum(m.hasta - m.desde for m in fotos)
    vivas = [(c['desde'], c['hasta']) for c in L.capas if c.get('profundidad') is not None or c.get('animada') or c.get('video')]
    if total_fotos > 12 and len(fotos) >= 5:
        con_vida = sum(0.1 for m in fotos for t in np.arange(m.desde, m.hasta, 0.1) if any(a <= t < b for a, b in vivas))
        if con_vida / total_fotos < 0.3:
            avisos.append(f'El video es casi todo fotos planas: solo el {round(100 * con_vida / total_fotos)} % de las fotos tiene capas '
                          'con profundidad o un personaje animado. En las escenas con personas usa `kit.py escena <imagen>` (la persona '
                          'recortada y animada delante de su escenario en 3D); deja como foto sola solo objetos y detalles.')
    # La misma imagen en dos capas seguidas que vuelve a entrar con fundido o pop: parpadea en el corte.
    for j, c in enumerate(L.capas):
        for k2, d in enumerate(L.capas):
            if (k2 != j and d['archivo'] == c['archivo'] and abs(d['desde'] - c['hasta']) < 0.08 and d['entrada'] in ('fundido', 'pop')):
                avisos.append(f'Capas {j + 1} y {k2 + 1}: la misma imagen sigue en otra capa que vuelve a entrar con «{d["entrada"]}» a los '
                              f'{d["desde"]:.1f} s: parpadea. Si es para cambiar de gesto, usa UNA capa con "animar": [{{"tipo": "hablar", '
                              '"hasta": 1.2}, {"tipo": "senalar"}] (pasa de un gesto a otro sin cortar); si no, "entrada": "ninguna".')
    return avisos


def avisos_tapados(L, momentos):
    """Una capa que en algún momento tapa un texto (una etiqueta, un título, una palabra): con la cámara, el paralaje o
    su recorrido se mueve y puede acabar encima. Se mira cada 0,2 s si la parte visible de la capa cae sobre el texto."""
    avisos = []
    textos = []
    for i, m in enumerate(momentos):
        d = m.m
        if d.get('tipo') == 'palabras':
            for p, (x, y) in zip(d.get('palabras') or [], sitios_palabras(d)):
                textos.append((i, str(p), x, y, m.desde, m.hasta))
        elif d.get('tipo') in ('titulo', 'etiqueta'):
            t = d.get('texto') or ' '.join(str(x if isinstance(x, str) else x.get('texto', '')) for x in d.get('lineas') or [])
            textos.append((i, t, float(d.get('x', 0.5)), float(d.get('y', 0.5)), m.desde, m.hasta))
    if not textos:
        return avisos
    vistos = set()
    for j, c in enumerate(L.capas):
        an = c.get('animada')
        im = c['im'] if not c['video'] else None
        if im is None:
            continue
        alfa = np.asarray(im.getchannel('A'))
        ih, iw = alfa.shape
        for (i, texto, x, y, a, b) in textos:
            if (i, j) in vistos:
                continue
            for t in np.arange(max(a, c['desde']) + 0.3, min(b, c['hasta']), 0.2):
                cx, cy, ancho, giro = estado_capa(c, t - c['desde'])
                cx, cy, ancho = paralaje(c, t, cx, cy, ancho, getattr(L, 'momentos', None))
                # El punto del texto (y un poco a cada lado), en la imagen de la capa (sin contar su margen de animación).
                k = iw / (L.W * ancho)
                tocado = False
                # El texto ocupa algo de alto y de ancho: se miran su centro, sus lados y su parte de arriba y de abajo.
                for dx, dy in ((-0.06, 0.0), (0.0, 0.0), (0.06, 0.0), (-0.04, 0.018), (0.04, 0.018), (0.0, -0.018)):
                    px = ((x + dx) - cx) * L.W * k + iw / 2
                    py = ((y + dy) - cy) * L.H * k + ih / 2
                    if 0 <= px < iw and 0 <= py < ih and alfa[int(py), int(px)] > 128:
                        tocado = True
                        break
                if tocado:
                    vistos.add((i, j))
                    avisos.append(f'Capa {j + 1} ({os.path.basename(c.get("archivo", "") or "")}) tapa «{texto[:30]}» (momento {i + 1}) '
                                  f'hacia los {t:.1f} s: con la cámara o su recorrido acaba encima. Aparta el texto o la capa, o '
                                  'baja su profundidad.')
                    break
    return avisos


def avisos_receta(r, L, momentos):
    """Lo que suele salir mal y se ve feo: un texto que repite lo que dice el subtítulo (dos veces lo
    mismo, arriba y abajo) y algo encima en la franja de los subtítulos (una etiqueta tapada)."""
    avisos = avisos_escena(r, L, momentos)
    subs = (L.subs or {}).get('frases') or []
    if not subs:
        return avisos
    pos = L.subs['pos']
    # Dos líneas de subtítulo más media etiqueta o título por cada lado.
    alto = 2 * L.subs['tam'] * 1.35 / L.H
    franja = (pos - alto / 2 - 0.07, pos + alto / 2 + 0.08)

    def frases_en(a, b):
        return [f for f in subs if f['desde'] < b and f['hasta'] > a]

    def repite(texto, a, b):
        ws = _palabras(texto)
        if len(ws) < 3:
            return False
        dichas = set(w for f in frases_en(a - 0.5, b + 0.5) for w in _palabras(f['texto']))
        return sum(w in dichas for w in ws) / len(ws) >= 0.6

    for i, m in enumerate(momentos):
        d = m.m
        textos = []
        if d.get('rotulo'):
            textos.append(d['rotulo'])
        if d.get('tipo') == 'titulo':
            textos += [x if isinstance(x, str) else x.get('texto', '') for x in d.get('lineas') or []]
        if d.get('tipo') == 'texto':
            textos += d.get('lineas') or []
        for t in textos:
            if repite(t, m.desde, m.hasta):
                avisos.append(f'Momento {i + 1} ({m.desde:.1f} s): «{str(t)[:50]}» repite lo que dice el subtítulo. Quítalo o déjalo en 1–3 '
                              'palabras clave con diseño: el mismo texto arriba y abajo se ve doble.')
        y = None
        if d.get('tipo') in ('etiqueta', 'titulo'):
            y = float(d.get('y', 0.5))
        if y is not None and franja[0] < y < franja[1] and frases_en(m.desde, m.hasta):
            avisos.append(f'Momento {i + 1} ({m.desde:.1f} s): la {d.get("tipo")} está en la franja de los subtítulos (y {y:.2f}): '
                          f'súbela por encima de y {franja[0] - 0.05:.2f} para que no se tapen.')
    for j, c in enumerate(L.capas):
        ys = [c['y']] + ([c['fin']['y']] if c['fin'] else [])
        if any(franja[0] < y < franja[1] for y in ys) and c['ancho'] < 0.35 and frases_en(c['desde'], c['hasta']):
            avisos.append(f'Capa {j + 1} ({c["desde"]:.1f} s): está en la franja de los subtítulos; muévela para que no se tapen.')
    return avisos


# ---------------------------------------------------------------------------
# Render quirúrgico: en un cambio, solo se vuelven a dibujar los segundos que cambiaron
# ---------------------------------------------------------------------------

# Lo de la receta que cambia la imagen entera (si cambia, se rehace todo).
_GLOBAL_EXCLUIR = ('momentos', 'capas', 'subtitulos', 'voz', 'musica', 'sonidos', 'salida', 'preset', 'crf', '_ruta')
_CLAVES_ARCHIVO = ('archivo', 'antes', 'despues', 'fondo', 'fotos')


def _firmar(x, L):
    """Una pieza de la receta con la huella de sus archivos (si se rehace una imagen con el mismo nombre, cuenta como cambio)."""
    if not isinstance(x, dict):
        return x
    f = dict(x)
    for k in _CLAVES_ARCHIVO:
        v = x.get(k)
        for p in (v if isinstance(v, list) else [v]):
            if isinstance(p, str) and not p.startswith('#'):
                try:
                    st = os.stat(L.ruta(p))
                    f[f'_{k}_{p}'] = [st.st_size, int(st.st_mtime)]
                except OSError:
                    pass
    return f


def huella_receta(r, L):
    """Lo que define la imagen del video, para comparar con el render anterior."""
    subs = dict(r.get('subtitulos') or {})
    frases = subs.pop('frases', []) or []
    return {
        'global': json.dumps({k: v for k, v in r.items() if k not in _GLOBAL_EXCLUIR} | {'_subs': subs}, sort_keys=True, ensure_ascii=False),
        'momentos': [json.dumps(_firmar(m, L), sort_keys=True, ensure_ascii=False) for m in r.get('momentos') or []],
        'capas': [json.dumps(_firmar(c, L), sort_keys=True, ensure_ascii=False) for c in r.get('capas') or []],
        'frases': [json.dumps(f, sort_keys=True, ensure_ascii=False) for f in frases],
    }


def tramos_cambiados(antes, ahora, transicion):
    """Los segundos que hay que volver a dibujar: los de cada pieza que está en una receta y no en la otra (con lo que
    dura su transición). None si cambió algo de todo el video (tamaño, filtros, letra de los subtítulos…)."""
    if antes.get('global') != ahora.get('global'):
        return None
    tramos = []
    for clave, extra in (('momentos', max(transicion, 0.5) + 0.15), ('capas', 0.15), ('frases', 0.15)):
        a, b = antes.get(clave) or [], ahora.get(clave) or []
        for x in [m for m in a if m not in b] + [m for m in b if m not in a]:
            d = json.loads(x)
            try:
                desde, hasta = float(d.get('desde', d.get('en', 0))), float(d.get('hasta', d.get('desde', 0)))
            except (TypeError, ValueError):
                return None
            tramos.append((max(0.0, desde - 0.15), hasta + extra))
    tramos.sort()
    juntos = []
    for a, b in tramos:
        if juntos and a <= juntos[-1][1] + 0.3:
            juntos[-1] = (juntos[-1][0], max(juntos[-1][1], b))
        else:
            juntos.append((a, b))
    return juntos


def memoria_render(base, receta):
    """Dónde se recuerda el último render de una receta: una memoria por receta (la copia «limpia» que Recorte arma
    para el editor, con otra receta, no pisa la del video)."""
    nombre = os.path.splitext(os.path.basename(receta))[0]
    return os.path.join(base, 'salida', '.ultimo-render.json' if nombre == 'receta' else f'.ultimo-render-{nombre}.json')


def armar(ruta, prueba=None, todo=False):
    r, L, momentos, dur = cargar(ruta)
    avisos = avisos_receta(r, L, momentos)
    fundido_final = float(r.get('fundido_final', 0.5))
    revision = os.path.join(L.base, 'revision')
    os.makedirs(revision, exist_ok=True)
    if prueba:
        # Solo unos fotogramas, para mirar antes del render (segundos, no minutos).
        rutas = []
        hay_video = any(isinstance(m, Video) for m in momentos)
        for i, t in enumerate(sorted(prueba)):
            # Los momentos de video leen en orden: si hay video, cada fotograma suelto los vuelve a abrir.
            if hay_video and i:
                for m in momentos:
                    if isinstance(m, Video):
                        m.proc.kill()
                _, L, momentos, dur = cargar(ruta)
            p = os.path.join(revision, f'prueba-{t:05.2f}.jpg')
            cuadro(L, momentos, t, dur, fundido_final).save(p, quality=88)
            rutas.append(os.path.relpath(p, L.base))
        for m in momentos:
            if isinstance(m, Video):
                m.proc.kill()
        print(json.dumps({'pruebas': rutas, **({'avisos': avisos} if avisos else {})}, ensure_ascii=False))
        return
    salida = L.ruta(r.get('salida', 'salida/final.mp4'))
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    # El audio: la música (una) y la voz (una frase por archivo, cada una en su segundo).
    entrada_audio, filtro_audio, partes, pistas = [], [], [], []
    musica = r.get('musica')
    frases = r.get('voz') or []
    if musica:
        desde, hasta = float(musica.get('desde', 0)), musica.get('hasta')
        en = float(musica.get('en', 0))
        fade = float(musica.get('fundido', 0.2))
        # Con voz encima, la música baja sola si la receta no dice otra cosa.
        vol = float(musica.get('volumen', 0.25 if frases else 1))
        fin = (float(hasta) - desde) if hasta is not None else dur - en
        entrada_audio += ['-i', L.ruta(musica['archivo'])]
        n = len(entrada_audio) // 2
        partes.append(f'[{n}:a]aresample=48000,atrim={desde}:{desde + fin},asetpts=PTS-STARTPTS,volume={vol},'
                      f'afade=t=out:st={max(0, fin - fade):.3f}:d={fade},adelay={int(en * 1000)}:all=1[m]')
        pistas.append('[m]')
    for i, f in enumerate(frases):
        entrada_audio += ['-i', L.ruta(f['archivo'])]
        n = len(entrada_audio) // 2
        partes.append(f'[{n}:a]aresample=48000,aformat=channel_layouts=stereo,volume={float(f.get("volumen", 1))},'
                      f'adelay={int(float(f.get("en", 0)) * 1000)}:all=1[v{i}]')
        pistas.append(f'[v{i}]')
    # Los efectos de sonido: uno de los que trae Recorte (`"sonido": "pop"`) o un archivo, en su segundo.
    for i, s in enumerate(r.get('sonidos') or []):
        ruta = sonido_incluido(s['sonido']) if s.get('sonido') else L.ruta(s.get('archivo', ''))
        if not os.path.isfile(ruta):
            raise SystemExit(f'Sonido {i + 1}: no encuentro «{s.get("sonido") or s.get("archivo")}».')
        entrada_audio += ['-i', ruta]
        n = len(entrada_audio) // 2
        partes.append(f'[{n}:a]aresample=48000,aformat=channel_layouts=stereo,volume={float(s.get("volumen", 0.6))},'
                      f'adelay={int(float(s.get("en", 0)) * 1000)}:all=1[s{i}]')
        pistas.append(f'[s{i}]')
    if pistas:
        mezcla = (f'{"".join(pistas)}amix=inputs={len(pistas)}:normalize=0:dropout_transition=0,apad[a]'
                  if len(pistas) > 1 else f'{pistas[0]}apad[a]')
        filtro_audio = ['-filter_complex', ';'.join(partes + [mezcla]),
                        '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k', '-shortest']
    orden = [FFMPEG, '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{L.W}x{L.H}', '-r', str(L.fps), '-i', '-',
             *entrada_audio, *filtro_audio,
             '-vf', 'format=yuv420p', '-c:v', 'libx264', '-preset', r.get('preset', 'veryfast'), '-crf', str(r.get('crf', 16)),
             '-movflags', '+faststart', salida]
    # Render quirúrgico: si hay un render anterior de esta misma receta con otros cambios, solo se vuelven a dibujar los
    # segundos que cambiaron; el resto se copia de aquel video (minutos en vez de media hora).
    memoria = memoria_render(L.base, ruta)
    huella = huella_receta(r, L)
    anterior, rehacer = None, None
    if not todo:
        try:
            with open(memoria, encoding='utf-8') as f:
                m = json.load(f)
            previo = L.ruta(m['salida'])
            if (os.path.isfile(previo) and os.path.abspath(previo) != os.path.abspath(salida) and m.get('ancho') == L.W
                    and m.get('alto') == L.H and m.get('fps') == L.fps):
                rehacer = tramos_cambiados(m.get('huella') or {}, huella, L.transicion)
                if rehacer is not None and sum(b - a for a, b in rehacer) < dur * 0.7:
                    anterior = previo
        except (OSError, ValueError, KeyError):
            anterior = None
    lector = None
    if anterior:
        lector = subprocess.Popen([FFMPEG, '-v', 'error', '-i', anterior, '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                                   '-vf', f'scale={L.W}:{L.H}', '-'], stdout=subprocess.PIPE)
        print(f'render quirúrgico: rehago {", ".join(f"{a:.1f}–{b:.1f} s" for a, b in rehacer) or "nada"}; '
              f'el resto sale de {os.path.relpath(anterior, L.base)}', file=sys.stderr, flush=True)
    ff = subprocess.Popen(orden, stdin=subprocess.PIPE)
    total = int(round(dur * L.fps))
    tam = L.W * L.H * 3
    dibujados = 0
    for i in range(total):
        t = i / L.fps
        viejo = lector.stdout.read(tam) if lector else b''
        if lector and len(viejo) == tam and not any(a <= t < b for a, b in rehacer):
            ff.stdin.write(viejo)
        else:
            ff.stdin.write(np.asarray(cuadro(L, momentos, t, dur, fundido_final), dtype=np.uint8).tobytes())
            dibujados += 1
        if i % (L.fps * 2) == 0:
            print(f'cuadro {i}/{total}', file=sys.stderr, flush=True)
    if lector:
        lector.kill()
    ff.stdin.close()
    if ff.wait() != 0:
        raise SystemExit('FFmpeg falló al codificar.')
    for m in momentos:
        if isinstance(m, Video):
            m.proc.kill()
    hoja_ruta = hoja(salida, 12, os.path.join(revision, 'hoja-final.jpg'))
    info = probar(salida)
    try:
        with open(memoria, 'w', encoding='utf-8') as f:
            json.dump({'salida': os.path.relpath(salida, L.base), 'ancho': L.W, 'alto': L.H, 'fps': L.fps, 'huella': huella}, f, ensure_ascii=False)
    except OSError:
        pass
    print(json.dumps({'salida': os.path.relpath(salida, L.base), 'duracion': round(info['duracion'], 2), 'ancho': info['ancho'],
                      'alto': info['alto'], 'audio': info['audio'], 'hoja': os.path.relpath(hoja_ruta, L.base),
                      'dibujados': f'{dibujados} de {total} cuadros' + (' (el resto, del render anterior)' if anterior else ''),
                      **({'avisos': avisos} if avisos else {})}, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Medir y revisar
# ---------------------------------------------------------------------------

def golpes(ruta, n=16):
    """Los golpes más marcados de la música (inicio de notas fuertes), con el tempo estimado."""
    r = subprocess.run([FFMPEG, '-v', 'error', '-i', ruta, '-vn', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], capture_output=True)
    x = np.frombuffer(r.stdout, dtype=np.float32)
    if not len(x):
        raise SystemExit('No hay audio en ese archivo.')
    sr, hop, win = 22050, 512, 1024
    marcos = 1 + max(0, (len(x) - win) // hop)
    ventana = np.hanning(win).astype(np.float32)
    espectro = np.abs(np.fft.rfft(np.stack([x[i * hop:i * hop + win] * ventana for i in range(marcos)]), axis=1))
    flujo = np.maximum(0, np.diff(np.log1p(espectro), axis=0)).sum(axis=1)
    flujo = (flujo - flujo.mean()) / (flujo.std() + 1e-9)
    tiempos = (np.arange(len(flujo)) + 1) * hop / sr
    distancia = int(0.25 * sr / hop)
    picos = [i for i in range(1, len(flujo) - 1) if flujo[i] > 1.0 and flujo[i] == flujo[max(0, i - distancia):i + distancia + 1].max()]
    fuertes = sorted(sorted(picos, key=lambda i: -flujo[i])[:n])
    # Tempo: la autocorrelación del flujo entre 60 y 180 golpes por minuto.
    ac = np.correlate(flujo, flujo, 'full')[len(flujo) - 1:]
    lo, hi = int(60 / 180 * sr / hop), int(60 / 60 * sr / hop)
    periodo = lo + int(np.argmax(ac[lo:hi])) if hi < len(ac) else 0
    print(json.dumps({'duracion': round(len(x) / sr, 2), 'tempo': round(60 * sr / hop / periodo, 1) if periodo else None,
                      'golpes': [round(float(tiempos[i]), 2) for i in fuertes],
                      'fuerza': [round(float(flujo[i]), 1) for i in fuertes]}, ensure_ascii=False))


def hoja(video, n=12, salida=None):
    info = probar(video)
    salida = salida or os.path.join('revision', 'hoja.jpg')
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    fps = max(0.05, n / max(0.5, info['duracion']))
    columnas = 6 if n > 6 else n
    filas = math.ceil(n / columnas)
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-i', video, '-vf', f'fps={fps:.4f},scale=240:-2,tile={columnas}x{filas}:padding=4:color=white',
                    '-frames:v', '1', '-q:v', '4', salida], check=True)
    return salida


def vista_encuadre(foto, zoom, cx, cy, ancho, alto):
    im = encuadrar(abrir_foto(foto), ancho, alto, zoom, cx, cy)
    os.makedirs('revision', exist_ok=True)
    salida = os.path.join('revision', f'encuadre-{os.path.splitext(os.path.basename(foto))[0]}.jpg')
    im.resize((ancho // 3, alto // 3)).save(salida, quality=85)
    print(json.dumps({'vista': salida}, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Recortes: quitar un fondo liso (para usar personas y objetos como capas)
# ---------------------------------------------------------------------------

# Lo que se añade al pedir una imagen «para recortar»: el sujeto solo, sobre verde croma liso.
PARA_RECORTAR = (' Aislado sobre un fondo verde croma liso y uniforme (#00B140), sin degradados, sin sombras ni suelo en el '
                 'fondo, el sujeto entero dentro del encuadre con un poco de margen, sin texto.')


# El modelo para quitar el fondo de cualquier foto: ISNet (DIS, Apache 2.0), el que usa rembg. Se baja una vez.
MODELO_FONDO = ('isnet-general-use.onnx', 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx', 178648008)


def carpeta_modelos():
    """Donde viven los modelos: la de Recorte (la misma para el editor y para el agente)."""
    if _R.get('modelos'):
        return _R['modelos']
    base = os.environ.get('APPDATA') or os.path.join(os.path.expanduser('~'), '.config')
    return os.path.join(base, 'recorte', 'modelos')


def modelo_fondo():
    """La sesión del modelo de fondos (lo baja y prepara onnxruntime la primera vez)."""
    return sesion_modelo(MODELO_FONDO, 'para quitar fondos')


# Depth Anything V2 (pequeño): cuánto de cerca está cada píxel de una foto, sin gastar créditos.
MODELO_PROFUNDIDAD = ('depth-anything-v2-small.onnx',
                      'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx', 99060839)


def sesion_modelo(modelo, para):
    """La sesión de un modelo ONNX del kit: lo baja la primera vez (y prepara onnxruntime)."""
    try:
        import onnxruntime as ort
    except ImportError:
        print('Preparando el quitafondos (una vez)…', file=sys.stderr, flush=True)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', 'onnxruntime'], check=True)
        import onnxruntime as ort
    nombre, url, tam = modelo
    ruta = os.path.join(carpeta_modelos(), nombre)
    if not os.path.isfile(ruta) or os.path.getsize(ruta) != tam:
        import urllib.request
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        temporal = ruta + '.bajando'
        print(f'Bajando el modelo {para} ({tam // 1_000_000} MB, una sola vez)…', file=sys.stderr, flush=True)
        with urllib.request.urlopen(url, timeout=60) as r, open(temporal, 'wb') as f:
            hecho, aviso = 0, 0
            while True:
                trozo = r.read(1 << 20)
                if not trozo:
                    break
                f.write(trozo)
                hecho += len(trozo)
                if hecho - aviso > tam // 10:
                    aviso = hecho
                    print(f'  {hecho * 100 // tam} %', file=sys.stderr, flush=True)
        if os.path.getsize(temporal) != tam:
            os.remove(temporal)
            raise SystemExit(f'El modelo {para} no se bajó entero. Revisa la conexión y vuelve a probar.')
        os.replace(temporal, ruta)
    return ort.InferenceSession(ruta, providers=['CPUExecutionProvider'])


def mascara_modelo(im):
    """La silueta del sujeto principal de una foto (0 a 1), con el modelo: personas, objetos, animales."""
    sesion = modelo_fondo()
    a = np.asarray(im.convert('RGB').resize((1024, 1024), Image.LANCZOS), dtype=np.float32)
    a = a / max(float(a.max()), 1e-6)
    a = (a - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / 1.0
    entrada = a.transpose(2, 0, 1)[None].astype(np.float32)
    salida = sesion.run(None, {sesion.get_inputs()[0].name: entrada})[0][0, 0]
    salida = (salida - salida.min()) / max(float(salida.max() - salida.min()), 1e-6)
    m = Image.fromarray((salida * 255).astype(np.uint8), 'L').resize(im.size, Image.LANCZOS)
    m = np.asarray(m, dtype=np.float32) / 255
    # Lo dudoso, decidido: sin zonas a medias (humo, reflejos) que dejan ver el fondo a través del sujeto,
    # pero con la orilla suave (un par de píxeles) para que no se vea recortado a tijera.
    duro = np.clip((m - 0.35) / 0.3, 0, 1)
    import cv2
    r = max(1, round(min(im.size) / 600))
    return cv2.GaussianBlur(duro.astype(np.float32), (2 * r + 1, 2 * r + 1), 0)


def profundidad_foto(im):
    """Lo cerca que está cada píxel de la foto, de 0 (lo más lejano) a 1 (lo más cercano)."""
    sesion = sesion_modelo(MODELO_PROFUNDIDAD, 'para ver la profundidad de las fotos')
    w, h = im.size
    k = 518 / min(w, h)
    # El modelo trabaja en múltiplos de 14 (sus parches).
    tw, th = max(14, round(w * k / 14) * 14), max(14, round(h * k / 14) * 14)
    a = np.asarray(im.convert('RGB').resize((tw, th), Image.BICUBIC), dtype=np.float32) / 255
    a = (a - np.array([0.485, 0.456, 0.406], dtype=np.float32)) / np.array([0.229, 0.224, 0.225], dtype=np.float32)
    salida = sesion.run(None, {sesion.get_inputs()[0].name: a.transpose(2, 0, 1)[None].astype(np.float32)})[0]
    d = np.asarray(salida, dtype=np.float32).reshape(salida.shape[-2], salida.shape[-1])
    lo, hi = np.percentile(d, 1), np.percentile(d, 99)
    d = np.clip((d - lo) / max(float(hi - lo), 1e-6), 0, 1)
    import cv2
    return cv2.resize(d, (w, h), interpolation=cv2.INTER_CUBIC).clip(0, 1)


def rellenar(rgb, hueco):
    """Rellena lo que queda tapado (`hueco`, 0/1) con lo que hay alrededor: lo que se descubre al moverse la cámara.
    El hueco se agranda bastante (que no quede el contorno de lo que tapaba, que se vería como un fantasma) y el
    relleno se suaviza: un color de ambiente sin formas, que al asomar por un borde no llama la atención."""
    import cv2
    h, w = hueco.shape
    k = min(1.0, 360 / max(w, h))
    cw, ch = max(1, round(w * k)), max(1, round(h * k))
    chico = cv2.resize(rgb, (cw, ch), interpolation=cv2.INTER_AREA)
    m = (cv2.resize(hueco.astype(np.float32), (cw, ch), interpolation=cv2.INTER_AREA) > 0.02).astype(np.uint8) * 255
    g = max(3, round(min(cw, ch) * 0.025)) * 2 + 1
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g)))
    lleno = cv2.inpaint(chico, m, max(5, g), cv2.INPAINT_NS)
    lleno = cv2.GaussianBlur(lleno, (0, 0), max(2.0, g / 3))
    lleno = cv2.resize(lleno, (w, h), interpolation=cv2.INTER_CUBIC)
    suave = cv2.resize(cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), g / 4), (w, h), interpolation=cv2.INTER_LINEAR)[..., None]
    return (rgb * (1 - suave) + lleno * suave).astype(np.uint8)


# Lo que se le agrega a cada plano por lado (fracción del ancho), para que su orilla no asome al moverse.
MARGEN_PLANO = 0.15


def separar(ruta, planos=3, salida=None):
    """Parte una foto en planos por distancia (escena 2.5D): el más lejano entero (con lo de delante
    rellenado) para usarlo de fondo y cada plano más cercano como PNG sin fondo, con su profundidad."""
    import cv2
    planos = max(2, min(5, int(planos)))
    im = Image.open(ruta).convert('RGB')
    if max(im.size) > 2048:
        im.thumbnail((2048, 2048), Image.LANCZOS)
    rgb = np.asarray(im, dtype=np.uint8)
    d = profundidad_foto(im)
    # Los cortes entre planos: agrupa las distancias (k-medias) y corta a medio camino entre grupos. Por partes
    # iguales no sirve: el cielo, todo a la misma distancia, se queda con medio plano y los demás vacíos.
    import cv2
    muestra = d.reshape(-1, 1)[:: max(1, d.size // 60000)].astype(np.float32)
    _, _, centros = cv2.kmeans(muestra, planos, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 1e-4), 4,
                               cv2.KMEANS_PP_CENTERS)
    c = sorted(float(x) for x in centros.ravel())
    cortes = [(c[i] + c[i + 1]) / 2 for i in range(planos - 1)]
    base = salida or os.path.splitext(ruta)[0]
    r = max(1, round(min(im.size) / 400))
    hechos = []
    for i in range(planos):
        cerca = d >= cortes[i] if i < planos - 1 else np.zeros_like(d, dtype=bool)
        # Lo que tapa este plano (lo más cercano), rellenado: es lo que se descubre al moverse.
        color = rellenar(rgb, cerca.astype(np.float32)) if cerca.any() else rgb
        if i == 0:
            alfa = np.ones_like(d, dtype=np.float32)
        else:
            dentro = (d >= cortes[i - 1]).astype(np.float32)
            # Un poco más ancho que su silueta (con el color rellenado), para que al moverse no deje rendija.
            dentro = cv2.dilate(dentro, np.ones((2 * r + 1, 2 * r + 1), np.uint8))
            # Borde suave (el mapa de profundidad es más basto que la foto: un corte duro se vería escalonado).
            alfa = cv2.GaussianBlur(dentro, (4 * r + 1, 4 * r + 1), 0)
        archivo = f'{base}-plano{i + 1}.png'
        rgba = np.dstack([color, (alfa * 255).astype(np.uint8)])
        if i > 0:
            # Un margen alrededor que prolonga el borde y se va difuminando: al moverse con paralaje (más que el fondo),
            # su orilla no entra en el cuadro y lo que asoma es un color sin formas. La capa va más ancha (`ancho_capa`).
            mg = round(im.width * MARGEN_PLANO)
            ext = cv2.copyMakeBorder(rgba, mg, mg, mg, mg, cv2.BORDER_REPLICATE).astype(np.float32)
            bor = cv2.GaussianBlur(ext, (0, 0), mg / 2.5)
            hh, ww = ext.shape[:2]
            yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
            fuera = np.maximum(np.maximum(mg - xx, xx - (ww - 1 - mg)), np.maximum(mg - yy, yy - (hh - 1 - mg)))
            w = np.clip(fuera / mg, 0, 1)[..., None] ** 0.5
            rgba = np.clip(ext * (1 - w) + bor * w, 0, 255).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(archivo)
        # La profundidad que se le sugiere: el más lejano es el fondo (0); el más cercano, 0.4 (los planos de una sola
        # foto no aguantan mucho paralaje: detrás solo hay relleno).
        hechos.append({'archivo': archivo, 'profundidad': round(0.4 * i / (planos - 1), 2)})
    mapa = f'{base}-profundidad.png'
    Image.fromarray((d * 255).astype(np.uint8), 'L').save(mapa)
    extra = round((1 + 2 * MARGEN_PLANO) * 1000) / 1000
    return {'fondo': hechos[0]['archivo'], 'planos': hechos[1:], 'mapa': mapa, 'ancho': im.width, 'alto': im.height,
            'ancho_capa': extra,
            'uso': f'el fondo como foto con "encuadre" {{"zoom": Z, "cx": 0.5, "cy": 0.5}} y su "camara"; cada plano como capa '
                   f'x 0.5, y 0.5, "ancho" Z × {extra} (traen margen alrededor; la foto en vertical como el video), con su '
                   'profundidad y "entrada": "ninguna". Puedes cortar a otro encuadre de la MISMA foto (otra foto con otro '
                   '"encuadre"): las capas la siguen calzadas. Movimientos CORTOS (cx o cy no más de 0.08 en una toma, zoom no '
                   'más de 0.15): detrás de cada plano solo hay relleno.'}


def guardar_recorte(rgb, alfa, salida, extra):
    """El PNG con transparencia, recortado a lo que se ve (con 2 px de margen)."""
    h, w = alfa.shape
    ys, xs = np.where(alfa > 0.03)
    if not len(ys):
        raise SystemExit('No encontré ningún sujeto en la imagen.')
    m = 2
    y0, y1, x0, x1 = max(0, ys.min() - m), min(h, ys.max() + m + 1), max(0, xs.min() - m), min(w, xs.max() + m + 1)
    rgba = np.dstack([rgb, alfa * 255]).clip(0, 255).astype(np.uint8)
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA').save(salida, optimize=True)
    return {'archivo': salida, 'ancho': int(x1 - x0), 'alto': int(y1 - y0), **extra}


def recortar(ruta, salida=None, tolerancia=None, modo='auto'):
    """Quita el fondo de una imagen y la deja en un PNG con transparencia, recortado al sujeto.

    - Fondo liso (verde croma, blanco o un color): es fondo lo que se parece al color de los bordes Y toca los
      bordes, así no se agujerea un sujeto que tenga ese color por dentro. Borde suave y sin halo verde. Rápido.
    - Cualquier otra foto (una sala, la calle): con el modelo ISNet, que encuentra al sujeto principal.
    `modo`: «auto» (liso si el fondo lo es; si no, el modelo), «liso» o «modelo».
    """
    import cv2
    im = abrir_foto(ruta)
    salida = salida or os.path.splitext(ruta)[0] + '-recorte.png'
    if modo == 'modelo':
        alfa = mascara_modelo(im)
        return guardar_recorte(np.asarray(im, dtype=np.float32), alfa, salida, {'metodo': 'modelo', 'quitado': round(float(1 - alfa.mean()), 3)})
    a = np.asarray(im, dtype=np.uint8)
    h, w = a.shape[:2]
    lab = cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32)
    g = max(2, min(h, w) // 100)
    borde = np.concatenate([lab[:g].reshape(-1, 3), lab[-g:].reshape(-1, 3), lab[:, :g].reshape(-1, 3), lab[:, -g:].reshape(-1, 3)])
    fondo = np.median(borde, axis=0)
    dist = np.linalg.norm(lab - fondo, axis=2)
    dist_borde = np.linalg.norm(borde - fondo, axis=1)
    tol = float(tolerancia) if tolerancia else max(14.0, float(np.percentile(dist_borde, 92)) * 1.6 + 6)
    # Un fondo liso es parejo en todo el borde; si no lo es (una foto de una sala, la calle), el modelo.
    if float(np.percentile(dist_borde, 70)) > 30 or float(np.percentile(dist_borde, 95)) > 55:
        if modo == 'liso':
            raise SystemExit('Esta imagen no tiene un fondo liso. Quita «--liso» para usar el modelo, o pide la imagen '
                             '«para recortar» (kit.py imagen … --recorte).')
        return recortar(ruta, salida, modo='modelo')
    r_, g_, b_ = (float(x) for x in cv2.cvtColor(np.uint8([[fondo]]), cv2.COLOR_LAB2RGB)[0, 0])
    if g_ > r_ + 40 and g_ > b_ + 40:
        return recortar_croma(a, (r_, g_, b_), salida)
    parecido = (dist < tol).astype(np.uint8)
    _, etiquetas = cv2.connectedComponents(parecido, connectivity=4)
    en_borde = np.unique(np.concatenate([etiquetas[0], etiquetas[-1], etiquetas[:, 0], etiquetas[:, -1]]))
    en_borde = en_borde[en_borde != 0]
    es_fondo = np.isin(etiquetas, en_borde) & (parecido > 0)
    # Lo que quede suelto y diminuto dentro del fondo (motas del croma) también es fondo.
    es_fondo = cv2.morphologyEx(es_fondo.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)) > 0
    quitado = float(es_fondo.mean())
    if quitado < 0.04 or quitado > 0.985:
        if quitado <= 0.985 and modo == 'auto':
            return recortar(ruta, salida, modo='modelo')
        raise SystemExit(f'No encontré un fondo que quitar (salía el {quitado * 100:.0f} % de la imagen).')
    # Borde suave: en la franja que toca el fondo, la transparencia sigue a cuánto se parece al fondo.
    franja = cv2.dilate(es_fondo.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    suave = np.clip((dist - tol * 0.75) / (tol * 0.9), 0, 1)
    alfa = np.where(es_fondo, 0.0, np.where(franja, suave, 1.0))
    alfa = cv2.GaussianBlur(alfa.astype(np.float32), (3, 3), 0)
    rgb = a.astype(np.float32)
    r_, g_, b_ = (float(x) for x in cv2.cvtColor(np.uint8([[fondo]]), cv2.COLOR_LAB2RGB)[0, 0])
    if g_ > r_ + 40 and g_ > b_ + 40:
        # Sin halo verde: en el borde, el verde no pasa del mayor de rojo y azul.
        tope = np.maximum(rgb[..., 0], rgb[..., 2])
        borde_suave = (alfa < 0.98)[..., None] | franja[..., None]
        rgb[..., 1] = np.where(borde_suave[..., 0], np.minimum(rgb[..., 1], tope), rgb[..., 1])
    return guardar_recorte(rgb, alfa, salida, {'metodo': 'liso', 'fondo': '#%02x%02x%02x' % (round(r_), round(g_), round(b_)), 'quitado': round(quitado, 3)})


def croma_rgba(a, fondo):
    """La clave de croma de un cuadro (array RGB): devuelve el color limpio y la transparencia (0 a 1)."""
    import cv2
    rgb = a.astype(np.float32)
    bg = np.array(fondo, dtype=np.float32)
    dif_fondo = max(1.0, bg[1] - max(bg[0], bg[2]))
    dif = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    alfa = 1 - np.clip((dif - dif_fondo * 0.22) / (dif_fondo * 0.40), 0, 1)
    alfa = cv2.morphologyEx(alfa, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    alfa = np.minimum(alfa, cv2.erode(alfa, np.ones((3, 3), np.uint8)) * 0.5 + alfa * 0.5)
    alfa = cv2.GaussianBlur(alfa, (3, 3), 0)
    k = alfa[..., None]
    medio = (k > 0.02) & (k < 0.98)
    rgb = np.where(medio, np.clip((rgb - (1 - k) * bg) / np.maximum(k, 0.05), 0, 255), rgb)
    tope = np.maximum(rgb[..., 0], rgb[..., 2])
    reflejo = (rgb[..., 1] > tope + 6) & ((alfa < 0.999) | (dif > dif_fondo * 0.12))
    rgb[..., 1] = np.where(reflejo, tope + np.clip((rgb[..., 1] - tope) * 0.15, 0, 6), rgb[..., 1])
    return rgb, alfa


def recortar_video(ruta, salida=None):
    """Quita el verde croma de un clip (un personaje que se mueve, pedido sobre verde) y lo deja en un WebM
    con transparencia (VP9 con canal alfa): se usa como capa encima, en el kit y en el editor."""
    info = probar(ruta)
    w, h = int(info['ancho']), int(info['alto'])
    if w > 1080:
        h, w = round(h * 1080 / w), 1080
    w -= w % 2
    h -= h % 2
    salida = salida or os.path.splitext(ruta)[0] + '-recorte.webm'
    lee = subprocess.Popen([FFMPEG, '-v', 'error', '-i', ruta, '-vf', f'scale={w}:{h}', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE)
    r = subprocess.run([FFPROBE, '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', ruta],
                       capture_output=True, text=True)
    fps = (r.stdout.strip() or '24/1').split(',')[0]
    escribe = subprocess.Popen([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-r', fps, '-i', '-',
                                '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '28', '-row-mt', '1',
                                '-auto-alt-ref', '0', salida], stdin=subprocess.PIPE)
    fondo, n, visible = None, 0, 0.0
    while True:
        datos = lee.stdout.read(w * h * 3)
        if len(datos) < w * h * 3:
            break
        a = np.frombuffer(datos, np.uint8).reshape(h, w, 3)
        if fondo is None:
            # El color del croma, del borde del primer cuadro.
            g = max(2, min(h, w) // 100)
            borde = np.concatenate([a[:g].reshape(-1, 3), a[-g:].reshape(-1, 3), a[:, :g].reshape(-1, 3), a[:, -g:].reshape(-1, 3)])
            fondo = tuple(float(x) for x in np.median(borde, axis=0))
            if not (fondo[1] > fondo[0] + 40 and fondo[1] > fondo[2] + 40):
                lee.kill()
                escribe.kill()
                raise SystemExit('Este clip no está sobre verde croma: pídelo con «--recorte» para poder quitarle el fondo.')
        rgb, alfa = croma_rgba(a, fondo)
        visible = max(visible, float(alfa.mean())) if n else float(alfa.mean())
        escribe.stdin.write(np.dstack([rgb, alfa * 255]).clip(0, 255).astype(np.uint8).tobytes())
        n += 1
    escribe.stdin.close()
    if escribe.wait() != 0 or not n:
        raise SystemExit('No pude escribir el clip sin fondo.')
    if visible < 0.01:
        os.remove(salida)
        raise SystemExit('No quedó nada al quitar el verde: el clip no tiene un sujeto sobre el croma.')
    return {'archivo': salida, 'ancho': w, 'alto': h, 'cuadros': n}


def recortar_croma(a, fondo, salida):
    """Verde croma, como lo hacen los programas de efectos: la transparencia sale de cuánto domina el verde
    en cada píxel (clave por diferencia de color). Así el humo y el pelo quedan semitransparentes y sin verde,
    y los huecos (entre los brazos, bajo una pierna) se vacían. Después se «desmezcla» el color del borde
    (se le quita la parte de verde que traía) y se le baja el verde que sobre."""
    import cv2
    rgb = a.astype(np.float32)
    bg = np.array(fondo, dtype=np.float32)
    dif_fondo = max(1.0, bg[1] - max(bg[0], bg[2]))
    dif = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
    # Menos de un 22 % del verde del fondo: sujeto opaco; más de un 62 %: fondo. En medio, a medias.
    alfa = 1 - np.clip((dif - dif_fondo * 0.22) / (dif_fondo * 0.40), 0, 1)
    # Motas sueltas del fondo fuera; el borde, un píxel más adentro (sin aro verde).
    alfa = cv2.morphologyEx(alfa, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    alfa = np.minimum(alfa, cv2.erode(alfa, np.ones((3, 3), np.uint8)) * 0.5 + alfa * 0.5)
    alfa = cv2.GaussianBlur(alfa, (3, 3), 0)
    quitado = float((alfa < 0.5).mean())
    if quitado < 0.04 or quitado > 0.985:
        raise SystemExit(f'No encontré un fondo que quitar (salía el {quitado * 100:.0f} % de la imagen).')
    # Desmezclar: lo semitransparente era sujeto + fondo verde; se queda solo con el sujeto.
    k = alfa[..., None]
    medio = (k > 0.02) & (k < 0.98)
    limpio = np.clip((rgb - (1 - k) * bg) / np.maximum(k, 0.05), 0, 255)
    rgb = np.where(medio, limpio, rgb)
    # Y donde aún sobre verde (reflejos del croma en el sujeto), el verde no pasa del mayor de rojo y azul.
    tope = np.maximum(rgb[..., 0], rgb[..., 2])
    reflejo = (rgb[..., 1] > tope + 6) & ((alfa < 0.999) | (dif > dif_fondo * 0.12))
    rgb[..., 1] = np.where(reflejo, tope + np.clip((rgb[..., 1] - tope) * 0.15, 0, 6), rgb[..., 1])
    return guardar_recorte(rgb, alfa, salida, {'metodo': 'croma', 'fondo': '#%02x%02x%02x' % tuple(round(x) for x in fondo), 'quitado': round(quitado, 3)})


def pedir_a_recorte(buzon, datos, espera, que, imprimir=True):
    """Deja un pedido en `<trabajo>/<buzon>/` y espera a que Recorte lo atienda (él tiene las cuentas del usuario).

    Devuelve la respuesta; si no salió, termina con el motivo, para que el agente siga sin ello y lo diga.
    """
    import time
    import uuid
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    carpeta = os.path.join(base, buzon)
    os.makedirs(carpeta, exist_ok=True)
    ident = uuid.uuid4().hex[:8]
    temporal = os.path.join(carpeta, f'_pedido-{ident}.tmp')
    with open(temporal, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False)
    os.replace(temporal, os.path.join(carpeta, f'pedido-{ident}.json'))
    respuesta = os.path.join(carpeta, f'respuesta-{ident}.json')
    limite = time.time() + espera
    while time.time() < limite:
        if os.path.exists(respuesta):
            time.sleep(0.2)
            with open(respuesta, encoding='utf-8-sig') as f:
                r = json.load(f)
            if imprimir or not r.get('ok'):
                print(json.dumps(r, ensure_ascii=False))
            if not r.get('ok'):
                raise SystemExit(r.get('error') or f'Recorte no pudo generar {que}.')
            return r
        time.sleep(1)
    raise SystemExit(f'Recorte no respondió al pedido de {que}. Sigue sin ello y dilo en el resumen.')


def _trabajo():
    """La carpeta de trabajo (la que tiene kit/ dentro)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _memoria(nombre):
    ruta = os.path.join(_trabajo(), nombre)
    try:
        with open(ruta, encoding='utf-8') as f:
            return ruta, json.load(f)
    except (OSError, ValueError):
        return ruta, {}


def _guardar_memoria(ruta, datos):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)


def voz(archivo, espera=900, nueva=False):
    """Pide a Recorte la narración con la voz que eligió el usuario: una frase por línea del archivo.

    Devuelve cada frase con su archivo y lo que dura, para poner cada momento en su frase. Las frases que ya se
    generaron antes (el mismo texto) se reutilizan sin volver a gastar cuota: solo se piden las nuevas o cambiadas.
    Con `nueva`, se piden todas otra vez (si el usuario cambió de voz).
    """
    with open(archivo, encoding='utf-8-sig') as f:
        frases = [l.strip() for l in f if l.strip()]
    if not frases:
        raise SystemExit('El archivo no tiene frases (una por línea).')
    ruta, memoria = _memoria(os.path.join('voz', '.frases.json'))
    hechas = {} if nueva else {t: e for t, e in memoria.items() if os.path.isfile(os.path.join(_trabajo(), e.get('archivo', '')))}
    faltan = [t for t in frases if t not in hechas]
    voz_elegida = next((e.get('voz') for e in hechas.values() if e.get('voz')), None)
    if faltan:
        r = pedir_a_recorte('voz', {'frases': faltan}, espera, 'la voz', imprimir=False)
        voz_elegida = r.get('voz') or voz_elegida
        for f in r.get('frases') or []:
            hechas[f['texto']] = {**f, 'voz': r.get('voz')}
            memoria[f['texto']] = {**f, 'voz': r.get('voz')}
        _guardar_memoria(ruta, memoria)
    salida = [{k: v for k, v in hechas[t].items() if k != 'voz'} for t in frases if t in hechas]
    print(json.dumps({'ok': True, 'voz': voz_elegida, 'frases': salida, 'total': round(sum(f['duracion'] for f in salida), 2),
                      'nuevas': len(faltan), 'reutilizadas': len(frases) - len(faltan)}, ensure_ascii=False))


def medio(tipo, prompt, referencias, espera, para_recortar=False, nuevo=False):
    """Pide a Recorte una imagen o un clip generado (Google Flow o ChatGPT, con las cuentas del usuario).

    Las referencias (fotos de entrada/ o de medios/) hacen que lo generado se parezca a ellas. Devuelve el archivo en medios/.
    Con `para_recortar` (solo imágenes) la pide sobre verde croma y le quita el fondo: devuelve también `recorte`, el PNG
    con transparencia listo para usar como capa.
    """
    if not prompt.strip():
        raise SystemExit('Describe qué generar.')
    # Lo mismo pedido otra vez (mismo texto, mismas referencias): se reutiliza lo que ya se generó, sin gastar.
    import hashlib
    firma_refs = []
    for ref in referencias or []:
        try:
            st = os.stat(ref)
            firma_refs.append([ref, st.st_size, int(st.st_mtime)])
        except OSError:
            firma_refs.append([ref])
    clave = hashlib.sha1(json.dumps([tipo, prompt.strip(), bool(para_recortar), firma_refs], ensure_ascii=False).encode()).hexdigest()[:16]
    ruta_mem, memoria = _memoria(os.path.join('medios', '.generados.json'))
    previo = memoria.get(clave)
    if previo and not nuevo:
        existe = lambda p: bool(p) and (os.path.isfile(p) or os.path.isfile(os.path.join(_trabajo(), p)))
        if existe(previo.get('archivo')) and (not para_recortar or existe(previo.get('recorte'))):
            print(json.dumps({**previo, 'reutilizado': True,
                              'nota': 'Ya lo habías generado con este mismo pedido: no se volvió a generar ni gastó. Usa --nuevo para otra versión.'},
                             ensure_ascii=False))
            return
    r = pedir_a_recorte('medios', {'tipo': tipo, 'prompt': prompt + (PARA_RECORTAR if para_recortar else ''), 'referencias': referencias or []},
                        espera, 'la imagen' if tipo == 'imagen' else 'el clip', imprimir=not para_recortar)
    if not para_recortar:
        memoria[clave] = {k: v for k, v in r.items() if k not in ('creditos',)}
        _guardar_memoria(ruta_mem, memoria)
    if para_recortar:
        base = os.path.join('medios', os.path.basename(r['archivo'])) if not os.path.isabs(r['archivo']) else r['archivo']
        ruta = r['archivo'] if os.path.isfile(r['archivo']) else base
        try:
            hecho = recortar_video(ruta) if tipo == 'clip' else recortar(ruta)
            r['recorte'] = os.path.relpath(hecho['archivo']).replace('\\', '/')
            r['recorte_tam'] = [hecho['ancho'], hecho['alto']]
        except SystemExit as e:
            r['recorte_error'] = str(e)
        if r.get('recorte'):
            memoria[clave] = {k: v for k, v in r.items() if k not in ('creditos',)}
            _guardar_memoria(ruta_mem, memoria)
        print(json.dumps(r, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Revisar como un editor: hojas, comparación con la referencia, cortes y medidas
# ---------------------------------------------------------------------------

LISTA_REVISION = [
    'Cuadros vacíos, grises o negros sin querer (un fondo sin nada encima, una transición que deja un hueco).',
    'Textos: ¿alguno repite lo que dice el subtítulo?, ¿alguno queda tapado (por un brazo, una capa, el subtítulo) o '
    'cortado por el borde?, ¿se leen?',
    'Recortes: amplía los bordes de cada persona u objeto recortado: ¿quedan restos de verde, halos, siluetas fantasma '
    'o trozos de fondo?',
    'Movimiento (tiras de los cortes): ¿algo tiembla, salta, se descuadra en un corte o deja una estela?',
    'Ritmo: ¿cada cuánto cambia la imagen frente a la referencia (cortes por segundo)?, ¿hay tramos donde la misma '
    'imagen dura demasiado?',
    'Estilo frente a la referencia: letras, tamaños, colores, filtros, cómo entran las cosas, la jerarquía.',
    'Cada momento tiene un sujeto claro y se entiende qué cuenta.',
    'El pedido: repasa CADA cosa que pidió el usuario y comprueba en los cuadros que está hecha.',
]


def _cuadros(video, fps, ancho=180):
    """Los cuadros de un video a `fps`, en gris y en color pequeño (para medir), con su segundo."""
    info = probar(video)
    alto = round(ancho * info['alto'] / max(1, info['ancho']) / 2) * 2
    p = subprocess.run([FFMPEG, '-v', 'error', '-i', video, '-vf', f'fps={fps},scale={ancho}:{alto}', '-f', 'rawvideo',
                        '-pix_fmt', 'rgb24', '-'], capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8)
    n = a.size // (ancho * alto * 3)
    return a[:n * ancho * alto * 3].reshape(n, alto, ancho, 3), info


def _cortes(video):
    """Los segundos donde cambia la imagen (cambios de plano, también con fundidos o barridos): picos de la diferencia
    entre cuadros seguidos (a 8 por segundo), al menos 0,4 s entre uno y otro."""
    p = subprocess.run([FFMPEG, '-v', 'error', '-i', video, '-vf', 'fps=8,scale=96:170', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                       capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8)
    n = a.size // (96 * 170 * 3)
    if n < 3:
        return []
    a = a[:n * 96 * 170 * 3].reshape(n, 170, 96, 3).astype(np.float32)
    d = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2, 3))
    umbral = max(10.0, 2.2 * float(np.median(d)))
    cortes = []
    for i in range(len(d)):
        if d[i] > umbral and d[i] == d[max(0, i - 2):i + 3].max():
            t = (i + 1) / 8
            if not cortes or t - cortes[-1] >= 0.4:
                cortes.append(round(t, 3))
    return cortes


def _a_proposito(receta):
    """Los segundos de las transiciones de la receta (destellos, fundidos, barridos…): ahí un salto de luz o un cuadro
    con poco detalle es lo que se quiso, no un fallo."""
    try:
        with open(receta, encoding='utf-8-sig') as f:
            r = json.load(f)
    except (OSError, ValueError):
        return []
    base = float(r.get('transicion', 0.3))
    return [(float(m['desde']) - 0.15, float(m['desde']) + float(m.get('entra', base)) + 0.35)
            for m in r.get('momentos') or [] if isinstance(m.get('desde'), (int, float))]


def revisar(video, referencia=None, salida=None, receta=None):
    """Mira un video como lo haría un editor: hojas para el ritmo, la referencia al lado, tiras de cada corte para
    el movimiento y medidas (cortes por segundo, tramos vacíos, destellos). Deja las imágenes en revision/ y un
    informe con lo que hay que mirar en cada una."""
    import cv2
    carpeta = salida or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(video))) if os.path.basename(
        os.path.dirname(os.path.abspath(video))) == 'salida' else os.path.dirname(os.path.abspath(video)), 'revision')
    os.makedirs(carpeta, exist_ok=True)
    rutas = {}
    cuadros, info = _cuadros(video, 4)
    dur = info['duracion']
    # 1. El ritmo: dos cuadros por segundo, una fila cada 5 s.
    rutas['ritmo'] = os.path.join(carpeta, 'revisar-ritmo.jpg')
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', video, '-vf', f'fps=2,scale=160:-2,tile=10x{max(1, math.ceil(dur / 5))}',
                    '-frames:v', '1', rutas['ritmo']], check=False)
    # 2. Los cortes: una tira de 7 cuadros (a 12 por segundo) alrededor de cada cambio de plano.
    cortes = _cortes(video)
    elegidos = cortes[:16]
    if elegidos:
        filas = []
        for t in elegidos:
            p = subprocess.run([FFMPEG, '-v', 'error', '-ss', f'{max(0, t - 0.25):.3f}', '-t', '0.6', '-i', video, '-vf',
                                'fps=12,scale=120:-2', '-frames:v', '7', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True)
            h = round(120 * info['alto'] / info['ancho'] / 2) * 2
            a = np.frombuffer(p.stdout, np.uint8)
            n = a.size // (120 * h * 3)
            if n:
                tira = a[:n * 120 * h * 3].reshape(n, h, 120, 3)
                fila = np.zeros((h, 120 * 7, 3), np.uint8)
                for i in range(n):
                    fila[:, i * 120:(i + 1) * 120] = tira[i]
                filas.append(fila)
        if filas:
            rutas['cortes'] = os.path.join(carpeta, 'revisar-cortes.jpg')
            Image.fromarray(np.vstack(filas)).save(rutas['cortes'], quality=85)
    # 3. Medidas: tramos casi vacíos (mucho menos detalle que lo normal del video) y destellos (saltos de luz).
    gris = np.stack([cv2.cvtColor(c, cv2.COLOR_RGB2GRAY) for c in cuadros]).astype(np.float32) if len(cuadros) else np.zeros((0, 1, 1))
    franja = slice(0, int(gris.shape[1] * 0.68)) if len(gris) else slice(0, 1)
    detalle = np.array([np.abs(cv2.Laplacian(g[franja], cv2.CV_32F)).mean() for g in gris]) if len(gris) else np.zeros(0)
    vacios = []
    if len(detalle):
        # Casi vacío: poco detalle Y casi sin contraste (un fondo oscuro con un título grande o un objeto no lo es).
        contraste = np.array([g[franja].std() for g in gris])
        bajo = (detalle < np.median(detalle) * 0.4) & (contraste < 22)
        i = 0
        while i < len(bajo):
            if bajo[i]:
                j = i
                while j < len(bajo) and bajo[j]:
                    j += 1
                if (j - i) / 4 >= 0.5:
                    vacios.append([round(i / 4, 2), round(j / 4, 2)])
                i = j
            else:
                i += 1
    luz = gris.mean(axis=(1, 2)) if len(gris) else np.zeros(0)
    destellos = [round(i / 4, 2) for i in range(1, len(luz) - 1) if abs(luz[i] - luz[i - 1]) > 55 and abs(luz[i] - luz[i + 1]) > 55]
    # Lo que cae en una transición de la receta (un destello, un fundido) es a propósito: no se avisa.
    if receta is None:
        cerca = os.path.join(os.path.dirname(carpeta), 'receta.json')
        receta = cerca if os.path.isfile(cerca) else None
    intencion = _a_proposito(receta) if receta else []
    if intencion:
        destellos = [t for t in destellos if not any(a <= t <= b for a, b in intencion)]
        vacios = [v for v in vacios if not any(a <= v[0] and v[1] <= b + 0.25 for a, b in intencion)]
    resumen = {'video': video, 'duracion': round(dur, 2), 'cortes': len(cortes),
               'cortes_por_segundo': round(len(cortes) / max(dur, 0.1), 2),
               'plano_mas_largo': round(max(np.diff([0.0] + cortes + [dur])) if dur else 0, 2),
               'tramos_casi_vacios': vacios, 'destellos': destellos}
    # 4. La referencia: su ritmo y, al lado, el video en las mismas posiciones.
    if referencia and os.path.isfile(referencia):
        rc = _cortes(referencia)
        rd = probar(referencia)['duracion']
        resumen['referencia'] = {'cortes_por_segundo': round(len(rc) / max(rd, 0.1), 2),
                                 'plano_mas_largo': round(max(np.diff([0.0] + rc + [rd])) if rd else 0, 2)}
        pares = []
        for k in range(8):
            f = (k + 0.5) / 8
            fila = []
            for v, d in ((video, dur), (referencia, rd)):
                p = subprocess.run([FFMPEG, '-v', 'error', '-ss', f'{f * d:.2f}', '-i', v, '-frames:v', '1', '-vf', 'scale=200:356:force_original_aspect_ratio=decrease,pad=200:356:(ow-iw)/2:(oh-ih)/2',
                                    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True)
                fila.append(np.frombuffer(p.stdout, np.uint8)[:200 * 356 * 3].reshape(356, 200, 3) if len(p.stdout) >= 200 * 356 * 3 else np.zeros((356, 200, 3), np.uint8))
            pares.append(np.hstack([fila[0], np.full((356, 6, 3), 255, np.uint8), fila[1]]))
        rutas['referencia'] = os.path.join(carpeta, 'revisar-referencia.jpg')
        Image.fromarray(np.vstack([np.hstack(pares[:4]), np.hstack(pares[4:])])).save(rutas['referencia'], quality=85)
    resumen['imagenes'] = {k: os.path.relpath(v) for k, v in rutas.items()}
    avisos = []
    if vacios:
        avisos.append('Tramos casi vacíos en ' + ', '.join(f'{a}–{b} s' for a, b in vacios) + ': mira si es a propósito.')
    if destellos:
        avisos.append('Saltos bruscos de luz (un cuadro negro o blanco suelto) en ' + ', '.join(f'{t} s' for t in destellos) + '.')
    ref = resumen.get('referencia')
    if ref and resumen['cortes_por_segundo'] < ref['cortes_por_segundo'] * 0.75:
        avisos.append(f"Ritmo: {resumen['cortes_por_segundo']} cortes/s frente a {ref['cortes_por_segundo']} de la referencia: va más lento.")
    if not ref and dur > 15 and (resumen['cortes_por_segundo'] < 0.4 or resumen['plano_mas_largo'] > 4.5):
        avisos.append(f"Ritmo (sin referencia): {resumen['cortes_por_segundo']} cambios de imagen por segundo y el plano más largo dura "
                      f"{resumen['plano_mas_largo']} s. En un video para redes se espera un cambio cada 1–2 s: parte las escenas largas "
                      'en dos o tres momentos (otro encuadre, un detalle, un título encima) si no es un estilo lento a propósito.')
    if ref and resumen['plano_mas_largo'] > ref['plano_mas_largo'] * 1.5 and resumen['plano_mas_largo'] > 2.5:
        avisos.append(f"El plano más largo dura {resumen['plano_mas_largo']} s (en la referencia, {ref['plano_mas_largo']} s).")
    resumen['avisos'] = avisos
    resumen['mira'] = LISTA_REVISION
    with open(os.path.join(carpeta, 'revisar.md'), 'w', encoding='utf-8') as f:
        f.write('# Revisión de ' + os.path.basename(video) + '\n\n')
        f.write('Imágenes: ' + ', '.join(f'{k}: {os.path.relpath(v, carpeta)}' for k, v in rutas.items()) + '\n')
        f.write('(ritmo: cada fila son 5 s, cada cuadro 0,5 s · cortes: una fila por cambio de plano, 7 cuadros seguidos · '
                'referencia: tu video a la izquierda y la referencia a la derecha, en las mismas posiciones)\n\n')
        f.write('Medidas: ' + json.dumps({k: v for k, v in resumen.items() if k not in ('mira', 'imagenes', 'avisos')}, ensure_ascii=False) + '\n\n')
        f.write('Avisos:\n' + ''.join(f'- {a}\n' for a in avisos or ['ninguno']) + '\nMira y responde, uno por uno:\n')
        f.write(''.join(f'{i + 1}. {x}\n' for i, x in enumerate(LISTA_REVISION)))
    return resumen


def _normal(t):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', str(t).lower()) if unicodedata.category(c) != 'Mn')


def donde(receta, consulta):
    """Encuentra en la receta lo que nombra el usuario («la bandera», «el título 2002», «cuando dice órbita»): cada
    pieza con su tipo, sus segundos y su texto o archivo, y saca su cuadro del último render a revision/."""
    with open(receta, encoding='utf-8-sig') as f:
        r = json.load(f)
    base = os.path.dirname(os.path.abspath(receta))
    palabras = [w for w in re.findall(r'\w+', _normal(consulta)) if len(w) > 2]
    if not palabras:
        raise SystemExit('Dime qué buscar (una palabra del texto, del archivo o de lo que se dice).')
    hallados = []

    def mira(donde_, i, d, desde, hasta):
        texto = ' '.join(str(d.get(k, '')) for k in ('archivo', 'texto', 'rotulo', 'tipo', 'animar', 'sonido'))
        for k in ('lineas', 'palabras', 'fotos'):
            for x in d.get(k) or []:
                texto += ' ' + (x if isinstance(x, str) else str(x.get('texto', '')) if isinstance(x, dict) else '')
        n = _normal(texto)
        tino = sum(w in n for w in palabras)
        if tino:
            hallados.append({'donde': donde_, 'n': i + 1, 'tipo': d.get('tipo', donde_[:-1]), 'desde': desde, 'hasta': hasta,
                             'que': texto.strip()[:90], 'coincide': tino})

    for i, m in enumerate(r.get('momentos') or []):
        mira('momentos', i, m, m.get('desde'), m.get('hasta'))
    for i, c in enumerate(r.get('capas') or []):
        mira('capas', i, c, c.get('desde'), c.get('hasta'))
    for i, s in enumerate((r.get('subtitulos') or {}).get('frases') or []):
        mira('subtitulos', i, s, s.get('desde'), s.get('hasta'))
    hallados.sort(key=lambda h: (-h['coincide'], h['desde'] or 0))
    # El cuadro de cada una en el último render (si lo hay), para verla antes de tocarla.
    try:
        with open(memoria_render(base, receta), encoding='utf-8') as f:
            video = os.path.join(base, json.load(f)['salida'])
    except (OSError, ValueError, KeyError):
        video = None
    if video and os.path.isfile(video):
        os.makedirs(os.path.join(base, 'revision'), exist_ok=True)
        for k, h in enumerate(hallados[:6]):
            try:
                t = (float(h['desde']) + float(h['hasta'])) / 2
            except (TypeError, ValueError):
                continue
            ruta = os.path.join(base, 'revision', f'donde-{k + 1}.jpg')
            subprocess.run([FFMPEG, '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1', '-vf', 'scale=360:-2', ruta], check=False)
            if os.path.isfile(ruta):
                h['cuadro'] = os.path.relpath(ruta, base)
    return {'buscado': consulta, 'hallados': hallados[:12], **({} if hallados else {'nota': 'No lo encuentro en la receta: mira revision/revisar-ritmo.jpg para ubicarlo por la imagen.'})}


# ---------------------------------------------------------------------------
# Escena viva: una imagen plana → fondo limpio en planos + el personaje recortado y animado
# ---------------------------------------------------------------------------

SIN_PERSONA = ('Edita esta imagen: déjala EXACTAMENTE igual (mismo encuadre, misma cámara, misma luz, mismos colores, mismo '
               'estilo y mismos objetos en el mismo sitio) pero SIN {quien}: el lugar vacío, con lo que había detrás '
               'completado de forma natural. No añadas nada nuevo ni muevas nada.')


def _generar_silencioso(prompt, referencias, espera=420):
    """Pide una imagen a Recorte (con la memoria de lo ya generado) y devuelve su ruta, o None si no se pudo."""
    import hashlib
    firma = []
    for ref in referencias:
        try:
            st = os.stat(ref)
            firma.append([ref, st.st_size, int(st.st_mtime)])
        except OSError:
            firma.append([ref])
    clave = hashlib.sha1(json.dumps(['imagen', prompt.strip(), False, firma], ensure_ascii=False).encode()).hexdigest()[:16]
    ruta_mem, memoria = _memoria(os.path.join('medios', '.generados.json'))
    previo = memoria.get(clave)
    if previo:
        p = previo.get('archivo')
        for x in (p, os.path.join(_trabajo(), p or '')):
            if p and os.path.isfile(x):
                return x
    try:
        r = pedir_a_recorte('medios', {'tipo': 'imagen', 'prompt': prompt, 'referencias': referencias}, espera, 'la imagen', imprimir=False)
    except SystemExit:
        return None
    memoria[clave] = {k: v for k, v in r.items() if k not in ('creditos',)}
    _guardar_memoria(ruta_mem, memoria)
    p = r.get('archivo')
    for x in (p, os.path.join(_trabajo(), p or '')):
        if p and os.path.isfile(x):
            return x
    return None


def escena(ruta, salida=None, planos=2, zoom=1.15, limpio=None, sin_flow=False, gesto=None):
    """Convierte una imagen plana en una escena viva, como en un documental hecho a mano:
    1. recorta al personaje principal (el modelo de fondos, ayudado por el esqueleto si es una persona),
    2. consigue el fondo limpio, SIN la persona: lo pide a Recorte (la misma imagen editada; no gasta créditos) o, si no
       se puede, rellena el hueco,
    3. parte ese fondo en planos por distancia,
    4. si es una persona, mira su esqueleto para la marioneta,
    y devuelve el trozo de receta listo: la foto de fondo con su cámara, los planos con su profundidad y el personaje como
    capa con su gesto, todo calzado como en la imagen original (para una foto con "encuadre" zoom `zoom`, centrada)."""
    import cv2
    im = abrir_foto(ruta)
    if max(im.size) > 2048:
        im.thumbnail((2048, 2048), Image.LANCZOS)
    w, h = im.size
    base = salida or os.path.splitext(ruta)[0]
    rgb = np.asarray(im, dtype=np.float32)
    alfa = mascara_modelo(im)
    # ¿Es una persona? Con el esqueleto: si lo hay, el recorte se queda con lo que está unido a ella.
    persona = False
    puntos = {}
    try:
        tmp = Image.fromarray(np.dstack([rgb, alfa * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
        puntos = esqueleto(tmp)
        persona = sum(1 for n in ('hombro_i', 'hombro_d', 'cadera_i', 'cadera_d', 'nariz') if puntos.get(n, (0, 0, 0))[2] > 0.4) >= 3
    except SystemExit:
        persona = False
    if persona:
        xs = [p[0] for p in puntos.values() if p[2] > 0.3]
        ys = [p[1] for p in puntos.values() if p[2] > 0.3]
        caja = np.zeros((h, w), np.uint8)
        mx, my = (max(xs) - min(xs)) * 0.35 + w * 0.03, (max(ys) - min(ys)) * 0.15 + h * 0.03
        cv2.rectangle(caja, (int(min(xs) - mx), int(min(ys) - my * 2)), (int(max(xs) + mx), int(max(ys) + my)), 1, -1)
        n, etiquetas = cv2.connectedComponents((alfa > 0.5).astype(np.uint8))
        dentro = set(np.unique(etiquetas[(caja > 0) & (alfa > 0.5)])) - {0}
        alfa = alfa * np.isin(etiquetas, list(dentro)).astype(np.float32) if dentro else alfa
    if float((alfa > 0.5).mean()) < 0.01:
        raise SystemExit('No encontré a nadie ni nada destacado que separar en esta imagen.')
    recorte = guardar_recorte(rgb, alfa, f'{base}-personaje.png', {})
    ys_, xs_ = np.nonzero(alfa > 0.03)
    x0, x1, y0, y1 = xs_.min(), xs_.max() + 1, ys_.min(), ys_.max() + 1
    # El fondo limpio: lo pedido a Recorte, el que se dio o, si no, rellenando el hueco.
    metodo = 'dado'
    if not limpio and not sin_flow:
        quien = 'la persona' if persona else 'el sujeto principal'
        limpio = _generar_silencioso(SIN_PERSONA.format(quien=quien), [ruta])
        metodo = 'generado' if limpio else 'relleno'
    if limpio and os.path.isfile(limpio):
        plato = abrir_foto(limpio).resize((w, h), Image.LANCZOS)
    else:
        metodo = 'relleno'
        g = max(9, round(min(w, h) * 0.02)) | 1
        hueco = cv2.dilate((alfa > 0.1).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (g, g))).astype(np.float32)
        plato = Image.fromarray(rellenar(rgb.astype(np.uint8), hueco))
    ruta_plato = f'{base}-fondo.png'
    plato.save(ruta_plato)
    capas = []
    fondo = ruta_plato
    extra = 1.0
    if planos and planos >= 2:
        partes = separar(ruta_plato, planos, f'{base}-fondo')
        fondo = partes['fondo']
        extra = partes['ancho_capa']
        for p in partes['planos']:
            capas.append({'archivo': p['archivo'], 'x': 0.5, 'y': 0.5, 'ancho': round(zoom * extra, 3), 'entrada': 'ninguna',
                          'profundidad': p['profundidad']})
    # El personaje en su sitio: su centro y su ancho en la imagen, llevados al cuadro con el zoom de la foto.
    cx, cy = (x0 + x1) / 2 / w, (y0 + y1) / 2 / h
    pers = {'archivo': recorte['archivo'], 'x': round(0.5 + (cx - 0.5) * zoom, 3), 'y': round(0.5 + (cy - 0.5) * zoom, 3),
            'ancho': round((x1 - x0) / w * zoom, 3), 'entrada': 'ninguna', 'profundidad': 0.45 if capas else 0.3}
    libres = 0
    if persona:
        try:
            info = info_esqueleto(recorte['archivo'])
            libres = info['brazos_libres']
        except SystemExit:
            info = None
        # Por defecto, «peso» (el cuerpo se mece, los brazos quietos): vale para quien trabaja, mira o posa. «hablar» es para
        # quien cuenta algo a cámara; con lo que tiene en las manos, moverlas lo arrastra.
        pers['animar'] = gesto or 'peso'
    capas.append(pers)
    momento = {'tipo': 'foto', 'archivo': fondo, 'encuadre': {'zoom': zoom, 'cx': 0.5, 'cy': 0.5},
               'camara': {'zoom': round(zoom + 0.08, 3), 'cx': 0.5, 'cy': 0.5}}
    avisos = []
    if metodo == 'relleno':
        avisos.append('No pude pedir el fondo sin la persona: rellené el hueco (borroso). Muévelo poco o pon otra pieza delante; '
                      'si puedes, pídelo con kit.py imagen "…sin la persona…" --ref <imagen> y pásalo con --limpio.')
    if persona and not libres:
        avisos.append('Sus brazos van pegados o cruzados: la marioneta solo mueve cabeza, tronco y peso ("hablar", "asentir", '
                      '"ladear", "peso").')
    return {'fondo': fondo, 'personaje': recorte['archivo'], 'es_persona': persona, 'brazos_libres': libres, 'fondo_limpio': metodo,
            'momento': momento, 'capas': capas, **({'avisos': avisos} if avisos else {}),
            'uso': 'Pon "momento" en la receta (con su desde/hasta) y "capas" (con los mismos desde/hasta), en ese orden: '
                   'los planos y luego el personaje. Calza con la imagen original si la foto va con ese encuadre. Cámara: '
                   'movimientos cortos. Elige el gesto por lo que hace: "peso" (por defecto: trabaja, mira, posa), "hablar" '
                   '(cuenta algo a cámara), "asentir", "ladear", "senalar"/"saludar"/"explicar" (con los brazos libres), o una '
                   'secuencia de gestos.'}


def main():
    # En Windows la consola no es UTF-8: sin esto, las tildes de lo que se imprime llegan rotas al agente.
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding='utf-8')
        except Exception:
            pass
    p = argparse.ArgumentParser(description='El kit de Recorte para el modo agente.')
    sub = p.add_subparsers(dest='orden', required=True)
    g = sub.add_parser('golpes')
    g.add_argument('archivo')
    g.add_argument('--n', type=int, default=16)
    h = sub.add_parser('hoja')
    h.add_argument('video')
    h.add_argument('--n', type=int, default=12)
    h.add_argument('--salida')
    e = sub.add_parser('encuadre')
    e.add_argument('foto')
    e.add_argument('--zoom', type=float, default=1)
    e.add_argument('--cx', type=float, default=0.5)
    e.add_argument('--cy', type=float, default=0.5)
    e.add_argument('--ancho', type=int, default=1080)
    e.add_argument('--alto', type=int, default=1920)
    a = sub.add_parser('armar')
    a.add_argument('receta')
    a.add_argument('--prueba', help='segundos separados por coma: solo esos fotogramas, a revision/')
    a.add_argument('--todo', action='store_true', help='dibujar el video entero aunque haya un render anterior que aprovechar')
    v = sub.add_parser('voz')
    v.add_argument('archivo', help='texto con una frase por línea')
    v.add_argument('--nueva', action='store_true', help='pedir todas las frases otra vez (si el usuario cambió de voz)')
    for nombre in ('imagen', 'clip'):
        m = sub.add_parser(nombre)
        m.add_argument('prompt', help='qué tiene que verse, bien descrito (sujeto, encuadre, luz, estilo)')
        m.add_argument('--ref', action='append', help='foto de referencia (entrada/… o medios/…); se puede repetir')
        m.add_argument('--recorte', action='store_true',
                       help='sobre verde croma y sin fondo: un PNG (imagen) o un WebM con transparencia (clip) para usar como capa')
        m.add_argument('--nuevo', action='store_true', help='generar otra versión aunque ya exista una con el mismo pedido')
    an = sub.add_parser('animar')
    an.add_argument('imagen')
    an.add_argument('--tipo', choices=TIPOS_ANIMAR + GESTOS, default='respirar')
    an.add_argument('--puntos', help='JSON con el esqueleto corregido: {"hombro_d": [x, y], …} en fracción de la imagen')
    an.add_argument('--lado', choices=['izquierda', 'derecha'], help='qué brazo hace el gesto (en pantalla)')
    an.add_argument('--secuencia', help='JSON (o archivo) con gestos seguidos: [{"tipo": "hablar", "hasta": 1.2}, {"tipo": "senalar"}]')
    es = sub.add_parser('esqueleto')
    es.add_argument('imagen')
    es.add_argument('--salida')
    an.add_argument('--fuerza', type=float, default=0.5)
    an.add_argument('--duracion', type=float, default=CICLO_S)
    an.add_argument('--salida')
    rv = sub.add_parser('recortar-video')
    rv.add_argument('clip')
    rv.add_argument('--salida')
    rv2 = sub.add_parser('revisar')
    rv2.add_argument('video')
    rv2.add_argument('--referencia', help='el video de referencia, para comparar ritmo y estilo')
    rv2.add_argument('--receta', help='la receta del video (por defecto receta.json junto a salida/): sus transiciones no se avisan')
    dn = sub.add_parser('donde')
    dn.add_argument('consulta', help='lo que nombra el usuario: «la bandera», «el título 2002», «cuando dice órbita»')
    dn.add_argument('--receta', default='receta.json')
    es2 = sub.add_parser('escena')
    es2.add_argument('imagen')
    es2.add_argument('--planos', type=int, default=2, help='en cuántos planos partir el fondo (0: sin partir)')
    es2.add_argument('--zoom', type=float, default=1.15, help='el zoom de la foto de fondo en la receta')
    es2.add_argument('--limpio', help='el fondo sin la persona, si ya lo tienes')
    es2.add_argument('--sin-flow', action='store_true', help='no pedir el fondo limpio: rellenar el hueco')
    es2.add_argument('--gesto', choices=GESTOS, help='el gesto de la marioneta (por defecto «hablar»)')
    es2.add_argument('--salida')
    sp = sub.add_parser('separar')
    sp.add_argument('imagen')
    sp.add_argument('--planos', type=int, default=3)
    sp.add_argument('--salida')
    rc = sub.add_parser('recortar')
    rc.add_argument('imagen')
    rc.add_argument('--salida')
    rc.add_argument('--tolerancia', type=float)
    rc.add_argument('--modo', choices=['auto', 'liso', 'modelo'], default='auto',
                    help='auto: fondo liso si lo es y si no el modelo (se baja una vez, 178 MB)')
    x = p.parse_args()
    if x.orden == 'voz':
        voz(x.archivo, nueva=x.nueva)
    elif x.orden in ('imagen', 'clip'):
        # Un clip puede tardar varios minutos en Flow.
        medio(x.orden, x.prompt, x.ref, 900 if x.orden == 'imagen' else 1500, para_recortar=getattr(x, 'recorte', False),
              nuevo=getattr(x, 'nuevo', False))
    elif x.orden == 'animar':
        puntos = json.loads(open(x.puntos, encoding='utf-8').read() if os.path.isfile(x.puntos) else x.puntos) if x.puntos else None
        secuencia = json.loads(open(x.secuencia, encoding='utf-8').read() if os.path.isfile(x.secuencia) else x.secuencia) if x.secuencia else None
        print(json.dumps(animar_imagen(x.imagen, secuencia or x.tipo, x.fuerza, x.salida, x.duracion, puntos=puntos, lado=x.lado), ensure_ascii=False))
    elif x.orden == 'esqueleto':
        print(json.dumps(info_esqueleto(x.imagen, x.salida), ensure_ascii=False))
    elif x.orden == 'recortar-video':
        print(json.dumps(recortar_video(x.clip, x.salida), ensure_ascii=False))
    elif x.orden == 'revisar':
        print(json.dumps(revisar(x.video, x.referencia, receta=x.receta), ensure_ascii=False))
    elif x.orden == 'donde':
        print(json.dumps(donde(x.receta, x.consulta), ensure_ascii=False))
    elif x.orden == 'escena':
        print(json.dumps(escena(x.imagen, x.salida, x.planos, x.zoom, x.limpio, x.sin_flow, x.gesto), ensure_ascii=False))
    elif x.orden == 'separar':
        print(json.dumps(separar(x.imagen, x.planos, x.salida), ensure_ascii=False))
    elif x.orden == 'recortar':
        print(json.dumps(recortar(x.imagen, x.salida, x.tolerancia, x.modo), ensure_ascii=False))
    elif x.orden == 'golpes':
        golpes(x.archivo, x.n)
    elif x.orden == 'hoja':
        print(json.dumps({'hoja': hoja(x.video, x.n, x.salida)}, ensure_ascii=False))
    elif x.orden == 'encuadre':
        vista_encuadre(x.foto, x.zoom, x.cx, x.cy, x.ancho, x.alto)
    else:
        armar(x.receta, [float(v) for v in x.prueba.split(',')] if x.prueba else None, todo=x.todo)


if __name__ == '__main__':
    main()
