"""Prepara la biblioteca de música libre que trae Recorte (python/musica/) a partir de las pistas originales.

Solo pistas con licencia CC0 (dominio público): las grabaciones de Musopen (archive.org/details/MusopenKickstarterRecordings)
y música de OpenGameArt con la licencia CC0 marcada en su página. Cada pista se recorta a 2,5 min con un final suave, se
iguala el volumen (EBU R128, -16 LUFS) y se comprime en MP3 de 96 kbps (música de fondo); se anotan su origen, su licencia y su ánimo en
catalogo.json, y las licencias en LICENCIAS.txt.

Uso: python scripts/biblioteca-musica.py <carpeta con las originales> <musopen.json> <oga.json>
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO = os.path.join(RAIZ, 'python', 'musica')
MAX_S = 150
FFMPEG = shutil.which('ffmpeg') or 'ffmpeg'


def medir(ruta):
    """Ritmo aproximado (golpes por minuto) y energía (0 a 1) de una pista, del sobre de volumen cada 10 ms."""
    p = subprocess.run([FFMPEG, '-v', 'error', '-i', ruta, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], capture_output=True)
    a = np.frombuffer(p.stdout, np.int16).astype(np.float32) / 32768
    if len(a) < 8000:
        return 0, 0.0
    marcos = a[: len(a) // 80 * 80].reshape(-1, 80)
    rms = np.sqrt((marcos ** 2).mean(1))
    # Lo que sube de golpe (ataques) y su periodicidad: autocorrelación entre 50 y 180 golpes por minuto.
    sube = np.maximum(0, np.diff(rms))
    sube -= sube.mean()
    ac = np.correlate(sube, sube, 'full')[len(sube) - 1:]
    lo, hi = int(100 * 60 / 180), int(100 * 60 / 50)
    lag = lo + int(np.argmax(ac[lo:hi])) if hi < len(ac) else 0
    bpm = round(6000 / lag) if lag else 0
    # Energía: volumen medio relativo (las pistas ya están igualadas) y cuánto se mueve.
    energia = float(np.clip(rms.mean() / 0.12 * 0.6 + min(1.0, np.abs(np.diff(rms)).mean() / 0.004) * 0.4, 0, 1))
    return bpm, round(energia, 2)


def preparar(origen, nombre):
    salida = os.path.join(DESTINO, nombre)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', origen],
                               capture_output=True, text=True).stdout.strip() or 0)
    largo = min(dur, MAX_S)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', origen, '-t', f'{largo:.2f}', '-af',
                    f'loudnorm=I=-16:LRA=11:TP=-1.5,afade=t=out:st={max(0, largo - 3):.2f}:d=3', '-ar', '44100', '-ac', '2',
                    '-b:a', '96k', salida], check=True)
    return round(largo, 1)


def main():
    originales, musopen, oga = sys.argv[1:4]
    os.makedirs(DESTINO, exist_ok=True)
    catalogo = []
    for x in json.load(open(musopen, encoding='utf-8')):
        archivo = f"{x['animo']}-{x['nombre']}.mp3"
        dur = preparar(os.path.join(originales, archivo), archivo)
        catalogo.append({'archivo': archivo, 'animo': x['animo'], 'titulo': x['obra'], 'autor': 'Musopen (grabación); obra de dominio público',
                         'licencia': 'CC0 1.0', 'fuente': 'https://archive.org/details/MusopenKickstarterRecordings', 'duracion': dur,
                         'estilo': 'clásica (orquesta, cuarteto o piano)'})
    for x in json.load(open(oga, encoding='utf-8')):
        archivo = f"{x['animo']}-{x['nombre']}.mp3"
        dur = preparar(os.path.join(originales, x['archivo']), archivo)
        catalogo.append({'archivo': archivo, 'animo': x['animo'], 'titulo': x['obra'], 'autor': x['autor'], 'licencia': 'CC0 1.0',
                         'fuente': x['fuente'], 'duracion': dur, 'estilo': 'moderna (electrónica, ambiental o de videojuego)'})
    # (El ritmo de una pista se mide con kit.py golpes cuando se elige: un número aproximado aquí confundiría.)
    catalogo.sort(key=lambda c: (c['animo'], c['archivo']))
    with open(os.path.join(DESTINO, 'catalogo.json'), 'w', encoding='utf-8') as f:
        json.dump(catalogo, f, ensure_ascii=False, indent=1)
    with open(os.path.join(DESTINO, 'LICENCIAS.txt'), 'w', encoding='utf-8') as f:
        f.write('Música incluida en Recorte. Todas las pistas tienen licencia CC0 1.0 (dominio público): se pueden usar,\n'
                'modificar y distribuir, también con fines comerciales, sin pedir permiso ni dar crédito.\n'
                'https://creativecommons.org/publicdomain/zero/1.0/\n\n')
        for c in catalogo:
            f.write(f"{c['archivo']}: «{c['titulo']}» — {c['autor']} — {c['licencia']} — {c['fuente']}\n")
    total = sum(os.path.getsize(os.path.join(DESTINO, c['archivo'])) for c in catalogo)
    print(f'{len(catalogo)} pistas, {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
