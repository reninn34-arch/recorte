"""Prepara los efectos de sonido que trae Recorte (python/sonidos/) y su catálogo.

Dos orígenes, los dos libres de usar sin dar crédito:
- Grabaciones CC0 de OpenGameArt (la licencia CC0 comprobada en la página de cada paquete).
- Efectos de cine fabricados aquí con números (subida, impacto, reversa, glitch, tensión): no son de nadie.
Cada uno se recorta (sin silencio al principio), se pasa a WAV mono de 44,1 kHz, se iguala (los golpes por su pico,
los ambientes más bajos para ir de fondo) y se le pone un final suave. Los cinco primeros (whoosh, pop…) ya estaban.

Uso: python scripts/biblioteca-sonidos.py <carpeta con los paquetes de OpenGameArt bajados>
"""
import json
import os
import shutil
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import butter, sosfilt

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'python', 'sonidos')
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'
SR = 44100
OGA = 'https://opengameart.org/content/'

# Los que ya traía Recorte (fabricados para la app).
PROPIOS = [
    ('whoosh', 'Whoosh', 'transicion', 'un cambio rápido, algo que entra volando'),
    ('pop', 'Pop', 'interfaz', 'un logo o un ícono que aparece'),
    ('pop-alto', 'Pop agudo', 'interfaz', 'otro ícono, o el siguiente de una serie'),
    ('ding', 'Ding', 'interfaz', 'un dato, un acierto, un precio'),
    ('caching', 'Caja registradora', 'interfaz', 'una oferta, un descuento, una venta'),
]

# id, nombre, tipo, para qué sirve, (paquete de OGA, archivo dentro, autor), segundos máx.
GRABADOS = [
    ('swish', 'Swish', 'transicion', 'un movimiento corto y suave: una tarjeta que pasa, un dato que entra', ('swishes-sound-pack', 'swish-3.wav', 'artisticdude'), 1),
    ('camara-foto', 'Cámara de fotos', 'objeto', 'una foto que aparece, un recuerdo, un flash', ('camera', 'photo.ogg', 'themightyglider'), 2),
    ('latido', 'Latido', 'tension', 'un momento de nervios, algo que está en juego', ('heartbeat-sounds', 'heartbeat_slow_0.wav', 'bart'), 3),
    ('pagina', 'Página', 'objeto', 'un documento, un libro, pasar a otro capítulo', ('10-book-page-flips', 'book_flip.2.ogg', 'StarNinjas'), 2),
    ('papel', 'Papel', 'objeto', 'una carta, un recorte de periódico que aparece', ('100-cc0-sfx', 'paper_01.ogg', 'rubberduck'), 1),
    ('campana', 'Campana', 'interfaz', 'un logro, el inicio de algo, una buena noticia', ('100-cc0-sfx', 'bell_03.ogg', 'rubberduck'), 3),
    ('gong', 'Gong', 'impacto', 'una revelación solemne, un título importante', ('100-cc0-sfx', 'gong_01.ogg', 'rubberduck'), 3),
    ('golpe', 'Golpe', 'impacto', 'algo que cae, un sello, un dato que pega fuerte', ('100-cc0-sfx', 'slam_02.ogg', 'rubberduck'), 1.5),
    ('puerta', 'Puerta', 'objeto', 'alguien que se va, un final, una etapa que se cierra', ('100-cc0-sfx', 'door_close_01.ogg', 'rubberduck'), 1.5),
    ('cristal', 'Cristal roto', 'impacto', 'algo que se rompe, un récord que cae', ('100-cc0-sfx', 'glass_01.ogg', 'rubberduck'), 1.5),
    ('interruptor', 'Interruptor', 'interfaz', 'encender una idea, un cambio de escena seco', ('100-cc0-sfx', 'switch_01.ogg', 'rubberduck'), 1),
    ('trueno', 'Trueno', 'ambiente', 'una tormenta, un giro oscuro de la historia', ('100-cc0-sfx-2', 'sfx100v2_thunder_01.ogg', 'rubberduck'), 6),
    ('monedas', 'Monedas', 'objeto', 'dinero, ganancias, un precio', ('202-more-sound-effects', 'Money_01.wav', 'OwlishMedia'), 1.5),
    ('telefono', 'Teléfono', 'objeto', 'una llamada, una notificación, un mensaje', ('202-more-sound-effects', 'Phone1.wav', 'OwlishMedia'), 2),
    ('alarma', 'Alarma', 'tension', 'un peligro, una urgencia, algo que falla', ('30-cc0-sfx-loops', 'alarm_01.ogg', 'rubberduck'), 2),
    ('lluvia', 'Lluvia', 'ambiente', 'de fondo en una escena de lluvia o tristeza', ('amb-rain-loop-1', 'amb_rain_loop_1.wav', 'Kresiek The Furry'), 10),
    ('trafico', 'Tráfico', 'ambiente', 'de fondo en la ciudad, una calle, una autopista', ('100-cc0-sfx-2', 'sfx100v2_loop_highway.ogg', 'rubberduck'), 10),
    ('obra', 'Obra en construcción', 'ambiente', 'de fondo cuando se construye algo, una fábrica que nace', ('100-cc0-sfx-2', 'sfx100v2_loop_construction_site.ogg', 'rubberduck'), 10),
    ('maquinas', 'Máquinas', 'ambiente', 'de fondo en una fábrica, un taller, un laboratorio', ('100-cc0-sfx-2', 'sfx100v2_loop_machine_01.ogg', 'rubberduck'), 7),
    ('multitud', 'Multitud', 'ambiente', 'de fondo con gente: un mercado, una protesta, un estadio', ('crowd-shoutingspeaking-ambience', 'crowd_shouting_0.ogg', 'StarNinjas'), 10),
]
URL_PAQUETE = {'swishes-sound-pack': 'swishes-sound-pack'}

# Los que son varios golpes seguidos: id, nombre, tipo, para, paquete, archivos (se alternan), autor, intervalo(s), veces.
# Un intervalo en lista = al azar entre esos dos (como una persona escribiendo).
SECUENCIAS = [
    ('maquina-escribir', 'Máquina de escribir', 'objeto', 'un texto que se escribe letra a letra, una fecha, un expediente (2 s)',
     'typewriter-sounds', [f'typewriter{i}.wav' for i in (1, 2, 3, 4, 5, 6, 7, 8)], 'Cassie-OrbitGames', [0.1, 0.19], 14),
    ('reloj', 'Tic tac', 'objeto', 'el tiempo que pasa, una cuenta atrás, una espera (4 s)',
     'tick-and-tock', ['tick.wav', 'tick2.wav'], 'cemkalyoncu', 0.5, 8),
    ('pasos', 'Pasos', 'objeto', 'alguien que llega o camina (3 s)',
     '100-cc0-sfx-2', ['sfx100v2_footstep_01.ogg', 'sfx100v2_footstep_02.ogg'], 'rubberduck', 0.52, 6),
]

FABRICADOS = [
    ('subida', 'Subida', 'tension', 'la tensión que sube hasta un corte o una revelación (termina en seco: ponlo para que acabe justo en el corte)'),
    ('impacto', 'Impacto de cine', 'impacto', 'un golpe grave y largo: el título, la gran cifra, el giro de la historia'),
    ('reversa', 'Reversa', 'transicion', 'el aire que se recoge antes de un corte (termina en seco, como la subida pero más corta)'),
    ('explosion', 'Explosión', 'impacto', 'un estallido, un fracaso, algo que revienta'),
    ('glitch', 'Glitch', 'transicion', 'un fallo digital: tecnología, internet, algo que se corrompe o un salto brusco'),
    ('tension', 'Zumbido de tensión', 'tension', 'de fondo bajo un momento de misterio o peligro, 8 s'),
]


def graves(a, hz):
    """Solo lo grave (por debajo de `hz`), con un filtro de verdad (el promedio móvil deja pasar agudos a rachas)."""
    return sosfilt(butter(4, hz, 'low', fs=SR, output='sos'), a)


def guardar(nombre, a):
    a = np.clip(a, -1, 1)
    with wave.open(os.path.join(DESTINO, f'{nombre}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((a * 32767).astype('<i2').tobytes())


def cola(a, segundos):
    """Un final suave de `segundos`."""
    n = min(len(a), int(segundos * SR))
    if n:
        a[-n:] *= np.linspace(1, 0, n) ** 2
    return a


def fabricar(nombre):
    rng = np.random.default_rng(7)
    if nombre == 'subida':
        d = 3.0
        t = np.arange(int(d * SR)) / SR
        x = t / d
        # Ruido que se abre (de oscuro a brillante) y un tono que sube, todo creciendo hasta cortar en seco.
        ruido = rng.standard_normal(len(t))
        brillante = np.zeros_like(ruido)
        k = 0.0
        for i, v in enumerate(ruido):
            alfa = 0.02 + 0.6 * x[i] ** 2
            k += alfa * (v - k)
            brillante[i] = k
        fase = 2 * np.pi * np.cumsum(110 * 2 ** (x * 2.5)) / SR
        tono = np.sin(fase) + 0.4 * np.sin(2 * fase) + 0.25 * np.sin(3.01 * fase)
        a = (brillante * 1.4 + tono * 0.35) * x ** 2.2
        a[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    elif nombre == 'impacto':
        d = 3.5
        t = np.arange(int(d * SR)) / SR
        # Un bombo grave que cae de 70 a 35 Hz, el golpe de ruido del principio y una cola con eco.
        f = 35 + 35 * np.exp(-t * 6)
        bajo = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
        golpe = rng.standard_normal(len(t)) * np.exp(-t * 18)
        cuerpo = graves(rng.standard_normal(len(t)), 400) * np.exp(-t * 3)
        a = bajo * 0.9 + golpe * 0.35 + cuerpo * 0.6
        a = cola(a, 1.5)
    elif nombre == 'reversa':
        d = 1.6
        t = np.arange(int(d * SR)) / SR
        # Un platillo (ruido brillante que se apaga) dado la vuelta: crece y termina en seco.
        r = np.diff(rng.standard_normal(len(t) + 1)) * np.exp(-t * 3.2)
        a = r[::-1] * 0.7
        a[-int(0.008 * SR):] *= np.linspace(1, 0, int(0.008 * SR))
    elif nombre == 'explosion':
        # La explosión grabada (corta) con un retumbo grave detrás que se apaga.
        d = 2.5
        t = np.arange(int(d * SR)) / SR
        r = rng.standard_normal(len(t))
        r = graves(r, 180)
        retumbo = r / (np.abs(r).max() or 1) * np.exp(-t * 1.6) * np.minimum(1, t / 0.03)
        a = retumbo * 0.8
        g = leer(EXPLOSION)
        a[: len(g)] += g * 0.9
        a = cola(a, 1)
    elif nombre == 'glitch':
        d = 0.7
        n = int(d * SR)
        a = np.zeros(n)
        pos = 0
        while pos < n:
            largo = int(rng.uniform(0.015, 0.07) * SR)
            t = np.arange(largo) / SR
            tipo = rng.integers(3)
            if tipo == 0:
                trozo = np.sign(np.sin(2 * np.pi * rng.uniform(200, 2400) * t))
            elif tipo == 1:
                trozo = np.round(rng.standard_normal(largo) * 2) / 4
            else:
                trozo = np.zeros(largo)
            a[pos:pos + largo] = trozo[: n - pos] * rng.uniform(0.3, 0.8)
            pos += largo
        a = cola(a, 0.1)
    elif nombre == 'tension':
        d = 8.0
        t = np.arange(int(d * SR)) / SR
        # Dos graves casi iguales que laten entre sí, un armónico inquieto y un poco de aire.
        lento = 1 + 0.003 * np.sin(2 * np.pi * 0.13 * t)
        a = (np.sin(2 * np.pi * 55 * t * lento) + np.sin(2 * np.pi * 55.7 * t) * 0.9
             + np.sin(2 * np.pi * 164.8 * t) * 0.25 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.21 * t)))
        aire = graves(rng.standard_normal(len(t)), 300)
        aire /= np.abs(aire).max() or 1
        a = (a * 0.3 + aire * 0.35) * np.minimum(1, t / 1.5)
        a = cola(a, 2)
    pico = np.abs(a).max() or 1
    return a / pico * 0.89  # -1 dB


EXPLOSION = None


def leer(ruta):
    """Un audio cualquiera como mono 44,1 kHz en números (-1 a 1), sin el silencio del principio."""
    p = subprocess.run([FFMPEG, '-v', 'error', '-i', ruta, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB',
                        '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True)
    a = np.frombuffer(p.stdout, '<i2').astype(np.float64) / 32768
    return a / (np.abs(a).max() or 1)


def secuencia(origenes, intervalo, veces):
    rng = np.random.default_rng(3)
    golpes = [leer(o) for o in origenes]
    momentos, t = [], 0.0
    for i in range(veces):
        momentos.append(t)
        t += rng.uniform(*intervalo) if isinstance(intervalo, list) else intervalo
    largo = int((momentos[-1] + max(len(g) for g in golpes) / SR) * SR) + 1
    a = np.zeros(largo)
    orden = rng.permutation(veces) % len(golpes) if isinstance(intervalo, list) else np.arange(veces) % len(golpes)
    for m, k in zip(momentos, orden):
        g = golpes[k] * (rng.uniform(0.75, 1) if isinstance(intervalo, list) else 1)
        i = int(m * SR)
        a[i: i + len(g)] += g
    return cola(a / np.abs(a).max() * 0.89, 0.05)


def buscar(carpeta, paquete, archivo):
    for raiz, _, nombres in os.walk(os.path.join(carpeta, paquete)):
        if archivo in nombres:
            return os.path.join(raiz, archivo)
    raise SystemExit(f'No encuentro {paquete}/{archivo}')


def grabar(origen, nombre, tipo, maximo):
    """Sin el silencio del principio, mono 44,1 kHz, igualado y con final suave."""
    salida = os.path.join(DESTINO, f'{nombre}.wav')
    if tipo == 'ambiente':
        # Los ambientes van de fondo: más bajos y con entrada y salida suaves.
        filtro = f'loudnorm=I=-26:LRA=7:TP=-6,afade=t=in:d=0.5,afade=t=out:st={maximo - 1.5}:d=1.5'
    else:
        filtro = (f'silenceremove=start_periods=1:start_threshold=-50dB,'
                  f'afade=t=out:st={max(0, maximo - 0.25)}:d=0.25')
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', origen, '-t', str(maximo + 0.5), '-af', filtro,
                    '-t', str(maximo), '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', salida], check=True)
    if tipo != 'ambiente':
        # Los golpes, por su pico (a -1 dB): el editor y la receta les bajan el volumen.
        with wave.open(salida, 'rb') as w:
            a = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768
        # Lo que quede casi en silencio al final, fuera.
        vivo = np.nonzero(np.abs(a) > 0.003)[0]
        a = a[: vivo[-1] + int(0.05 * SR)] if len(vivo) else a
        guardar(nombre, cola(a / (np.abs(a).max() or 1) * 0.89, min(0.05, len(a) / SR / 4)))


def duracion(nombre):
    with wave.open(os.path.join(DESTINO, f'{nombre}.wav'), 'rb') as w:
        return round(w.getnframes() / w.getframerate(), 2)


def main():
    paquetes = sys.argv[1]
    catalogo = []
    for id_, nombre, tipo, para in PROPIOS:
        catalogo.append({'id': id_, 'nombre': nombre, 'tipo': tipo, 'para': para, 'duracion': duracion(id_),
                         'autor': 'Recorte', 'licencia': 'CC0 1.0', 'fuente': 'hecho para Recorte'})
    for id_, nombre, tipo, para, (paquete, archivo, autor), maximo in GRABADOS:
        grabar(buscar(paquetes, paquete, archivo), id_, tipo, maximo)
        catalogo.append({'id': id_, 'nombre': nombre, 'tipo': tipo, 'para': para, 'duracion': duracion(id_),
                         'autor': autor, 'licencia': 'CC0 1.0', 'fuente': OGA + URL_PAQUETE.get(paquete, paquete)})
    for id_, nombre, tipo, para, paquete, archivos, autor, intervalo, veces in SECUENCIAS:
        guardar(id_, secuencia([buscar(paquetes, paquete, a) for a in archivos], intervalo, veces))
        catalogo.append({'id': id_, 'nombre': nombre, 'tipo': tipo, 'para': para, 'duracion': duracion(id_),
                         'autor': autor, 'licencia': 'CC0 1.0', 'fuente': OGA + paquete})
    global EXPLOSION
    EXPLOSION = buscar(paquetes, '100-cc0-sfx', 'explosion.ogg')
    for id_, nombre, tipo, para in FABRICADOS:
        guardar(id_, fabricar(id_))
        de_oga = id_ == 'explosion'
        catalogo.append({'id': id_, 'nombre': nombre, 'tipo': tipo, 'para': para, 'duracion': duracion(id_),
                         'autor': 'rubberduck y Recorte' if de_oga else 'Recorte (sintetizado)', 'licencia': 'CC0 1.0',
                         'fuente': OGA + '100-cc0-sfx' if de_oga else 'hecho para Recorte'})
    orden = ('transicion', 'interfaz', 'impacto', 'tension', 'objeto', 'ambiente')
    catalogo.sort(key=lambda c: orden.index(c['tipo']))
    with open(os.path.join(DESTINO, 'catalogo.json'), 'w', encoding='utf-8') as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DESTINO, 'LICENCIAS.txt'), 'w', encoding='utf-8') as f:
        f.write('Efectos de sonido incluidos en Recorte. Todos tienen licencia CC0 1.0 (dominio público): se pueden usar,\n'
                'modificar y distribuir, también con fines comerciales, sin pedir permiso ni dar crédito.\n'
                'https://creativecommons.org/publicdomain/zero/1.0/\n\n')
        for c in catalogo:
            f.write(f"{c['id']}.wav: «{c['nombre']}» — {c['autor']} — {c['licencia']} — {c['fuente']}\n")
    total = sum(os.path.getsize(os.path.join(DESTINO, c['id'] + '.wav')) for c in catalogo)
    print(f'{len(catalogo)} sonidos, {total / 1e6:.1f} MB')
    for c in catalogo:
        print(f"  {c['id']:18} {c['duracion']:5}s  {c['tipo']}")


if __name__ == '__main__':
    main()
