"""El kit de Recorte para el modo agente: piezas probadas para no programar el video desde cero.

Uso (desde la carpeta de trabajo):
  python kit/kit.py golpes <audio-o-video> [--n 16]          los golpes de la música (segundos) y el tempo
  python kit/kit.py hoja <video> [--n 12] [--salida ruta]     una hoja de fotogramas para revisar
  python kit/kit.py encuadre <foto> [--zoom 1.3 --cx .5 --cy .5] [--ancho 1080 --alto 1920]
                                                              cómo queda una foto a pantalla completa
  python kit/kit.py armar <receta.json> [--prueba 0.5,3,8]    hace el video (o solo esos fotogramas)

La receta está explicada en kit/RECETA.md. Todo sale en una sola pasada: los fotogramas se dibujan con
NumPy y Pillow y van por tubería a FFmpeg, con la música recortada y su fundido.
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
}
CARPETAS_FUENTES = [os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts'), '/System/Library/Fonts', '/Library/Fonts',
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
        if os.path.splitext(ruta)[1].lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            raise SystemExit(f'Capa {i + 1}: solo imágenes (png, jpg, webp).')
        if hasta <= desde:
            continue
        im = Image.open(ruta).convert('RGBA')
        ancho = min(1.0, max(0.05, float(c.get('ancho', 0.3))))
        w = max(1, round(L.W * ancho))
        h = max(1, round(im.height * w / im.width))
        entrada = c.get('entrada', 'pop')
        capas.append({
            'im': im.resize((w, h), Image.LANCZOS),
            'desde': desde, 'hasta': hasta,
            'x': min(1.0, max(0.0, float(c.get('x', 0.5)))), 'y': min(1.0, max(0.0, float(c.get('y', 0.5)))),
            'entrada': entrada if entrada in ('pop', 'fundido', 'ninguna') else 'pop',
        })
    return capas


def capas_encima(lienzo, L, t):
    """Dibuja las capas visibles en `t`. El «pop» rebota como en el editor (45 % → 117 % → 100 % en 0,24 s)."""
    for c in L.capas:
        if not (c['desde'] <= t < c['hasta']):
            continue
        dt = t - c['desde']
        escala, alfa = 1.0, 1.0
        if c['entrada'] == 'pop':
            escala = 0.45 + dt / 0.13 * 0.72 if dt < 0.13 else (1.17 - (dt - 0.13) / 0.11 * 0.17 if dt < 0.24 else 1.0)
            alfa = min(1.0, dt / 0.08)
        elif c['entrada'] == 'fundido':
            alfa = min(1.0, dt / 0.35)
        alfa *= 1 - tramo(t, c['hasta'] - 0.12, c['hasta'])
        if alfa <= 0.01:
            continue
        im = c['im']
        if abs(escala - 1) > 0.01:
            im = im.resize((max(1, round(im.width * escala)), max(1, round(im.height * escala))), Image.BILINEAR)
        if alfa < 0.999:
            im = im.copy()
            im.putalpha(im.getchannel('A').point(lambda a: round(a * alfa)))
        x = round(L.W * c['x'] - im.width / 2)
        y = round(L.H * c['y'] - im.height / 2)
        capa = Image.new('RGBA', lienzo.size, (0, 0, 0, 0))
        capa.paste(im, (x, y), im)
        lienzo.alpha_composite(capa)
    return lienzo


class Momento:
    """Algo que se ve entre `desde` y `hasta`. Lo que va después en la lista se dibuja encima."""

    def __init__(self, m, L):
        self.m, self.L = m, L
        self.desde = float(m.get('desde', 0))
        self.hasta = float(m.get('hasta', self.desde + 2))
        self.entra = float(m.get('entra', L.transicion))

    def visible(self, t):
        # Se queda un poco más para que lo siguiente entre encima sin dejar un hueco.
        return self.desde - 1e-6 <= t < self.hasta + self.L.transicion

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


class Foto(Momento):
    """Una foto a pantalla completa, encuadrada, con acercamiento lento, rótulo y brillo opcional."""

    def __init__(self, m, L):
        super().__init__(m, L)
        im = tapar(abrir_foto(L.ruta(m['archivo'])), m.get('tapar'))
        e = m.get('encuadre') or {}
        self.margen = 1.06 if m.get('acercar', True) else 1.0
        self.img = encuadrar(im, round(L.W * self.margen), round(L.H * self.margen), e.get('zoom', 1), e.get('cx', 0.5), e.get('cy', 0.5))

    def cuadro(self, t):
        L = self.L
        s = self.margen - (self.margen - 1) * ease_out(tramo(t, self.desde, self.hasta))
        cw, ch = L.W * s, L.H * s
        x0, y0 = (self.img.width - cw) / 2, (self.img.height - ch) / 2
        im = self.img.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch))).resize((L.W, L.H), Image.BICUBIC)
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


PIEZAS = {'foto': Foto, 'video': Video, 'comparar': Comparar, 'collage': Collage, 'texto': Texto}


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
        momentos.append(PIEZAS[tipo](m, L))
    fin = max([m.hasta for m in momentos] or [1.0])
    dur = float(r.get('duracion', fin))
    return r, L, momentos, dur


def cuadro(L, momentos, t, dur, fundido_final):
    lienzo = Image.new('RGBA', (L.W, L.H), L.fondo + (255,))
    for m in momentos:
        if not m.visible(t):
            continue
        capa = m.cuadro(t, lienzo) if isinstance(m, Texto) else m.cuadro(t)
        k = m.opacidad(t)
        if k >= 0.999:
            lienzo = capa if capa.mode == 'RGBA' else capa.convert('RGBA')
        elif k > 0.001:
            lienzo = Image.blend(lienzo, capa, k)
    if lienzo.mode != 'RGBA':
        lienzo = lienzo.convert('RGBA')
    lienzo = capas_encima(lienzo, L, t)
    lienzo = subtitulo(lienzo, L, t)
    if fundido_final > 0:
        k = tramo(t, dur - fundido_final, dur)
        if k > 0:
            lienzo = Image.blend(lienzo, Image.new('RGBA', lienzo.size, (0, 0, 0, 255)), k)
    return lienzo.convert('RGB')


def armar(ruta, prueba=None):
    r, L, momentos, dur = cargar(ruta)
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
        print(json.dumps({'pruebas': rutas}, ensure_ascii=False))
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
    ff = subprocess.Popen(orden, stdin=subprocess.PIPE)
    total = int(round(dur * L.fps))
    for i in range(total):
        ff.stdin.write(np.asarray(cuadro(L, momentos, i / L.fps, dur, fundido_final), dtype=np.uint8).tobytes())
        if i % (L.fps * 2) == 0:
            print(f'cuadro {i}/{total}', file=sys.stderr, flush=True)
    ff.stdin.close()
    if ff.wait() != 0:
        raise SystemExit('FFmpeg falló al codificar.')
    for m in momentos:
        if isinstance(m, Video):
            m.proc.kill()
    hoja_ruta = hoja(salida, 12, os.path.join(revision, 'hoja-final.jpg'))
    info = probar(salida)
    print(json.dumps({'salida': os.path.relpath(salida, L.base), 'duracion': round(info['duracion'], 2), 'ancho': info['ancho'],
                      'alto': info['alto'], 'audio': info['audio'], 'hoja': os.path.relpath(hoja_ruta, L.base)}, ensure_ascii=False))


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


def pedir_a_recorte(buzon, datos, espera, que):
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
            print(json.dumps(r, ensure_ascii=False))
            if not r.get('ok'):
                raise SystemExit(r.get('error') or f'Recorte no pudo generar {que}.')
            return r
        time.sleep(1)
    raise SystemExit(f'Recorte no respondió al pedido de {que}. Sigue sin ello y dilo en el resumen.')


def voz(archivo, espera=900):
    """Pide a Recorte la narración con la voz que eligió el usuario: una frase por línea del archivo.

    Devuelve cada frase con su archivo y lo que dura, para poner cada momento en su frase.
    """
    with open(archivo, encoding='utf-8-sig') as f:
        frases = [l.strip() for l in f if l.strip()]
    if not frases:
        raise SystemExit('El archivo no tiene frases (una por línea).')
    pedir_a_recorte('voz', {'frases': frases}, espera, 'la voz')


def medio(tipo, prompt, referencias, espera):
    """Pide a Recorte una imagen o un clip generado (Google Flow o ChatGPT, con las cuentas del usuario).

    Las referencias (fotos de entrada/ o de medios/) hacen que lo generado se parezca a ellas. Devuelve el archivo en medios/.
    """
    if not prompt.strip():
        raise SystemExit('Describe qué generar.')
    pedir_a_recorte('medios', {'tipo': tipo, 'prompt': prompt, 'referencias': referencias or []}, espera,
                    'la imagen' if tipo == 'imagen' else 'el clip')


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
    v = sub.add_parser('voz')
    v.add_argument('archivo', help='texto con una frase por línea')
    for nombre in ('imagen', 'clip'):
        m = sub.add_parser(nombre)
        m.add_argument('prompt', help='qué tiene que verse, bien descrito (sujeto, encuadre, luz, estilo)')
        m.add_argument('--ref', action='append', help='foto de referencia (entrada/… o medios/…); se puede repetir')
    x = p.parse_args()
    if x.orden == 'voz':
        voz(x.archivo)
    elif x.orden in ('imagen', 'clip'):
        # Un clip puede tardar varios minutos en Flow.
        medio(x.orden, x.prompt, x.ref, 900 if x.orden == 'imagen' else 1500)
    elif x.orden == 'golpes':
        golpes(x.archivo, x.n)
    elif x.orden == 'hoja':
        print(json.dumps({'hoja': hoja(x.video, x.n, x.salida)}, ensure_ascii=False))
    elif x.orden == 'encuadre':
        vista_encuadre(x.foto, x.zoom, x.cx, x.cy, x.ancho, x.alto)
    else:
        armar(x.receta, [float(v) for v in x.prueba.split(',')] if x.prueba else None)


if __name__ == '__main__':
    main()
