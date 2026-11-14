import argparse
import json
import os
import subprocess
import sys
import traceback

import numpy as np
from faster_whisper import WhisperModel


def progreso(pct: float, texto: str) -> None:
    print(f"PROGRESO {max(0.0, min(pct, 1.0)):.3f} {texto}", flush=True)


def cargar_audio(ruta: str, ffmpeg: str) -> np.ndarray:
    """Decodifica a 16 kHz mono con FFmpeg y evita depender de PyAV para leer el archivo."""
    comando = [
        ffmpeg,
        "-v",
        "error",
        "-i",
        ruta,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "f32le",
        "-",
    ]
    proceso = subprocess.run(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proceso.returncode != 0:
        detalle = proceso.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(detalle or "FFmpeg no pudo extraer el audio.")

    audio = np.frombuffer(proceso.stdout, dtype=np.float32)
    if audio.size == 0:
        raise RuntimeError("El archivo no tiene audio que transcribir.")
    return audio


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe una clase con faster-whisper.")
    parser.add_argument("entrada", help="Ruta del video o audio original.")
    parser.add_argument("salida", help="Ruta del JSON de salida.")
    parser.add_argument("--modelo", default="small", help="tiny, base, small, medium o large-v3.")
    parser.add_argument("--idioma", default=None, help="Código ISO del idioma; vacío para detectarlo.")
    parser.add_argument("--ffmpeg", default=None, help="Ruta del ejecutable de FFmpeg.")
    args = parser.parse_args()

    ffmpeg = args.ffmpeg or os.environ.get("RECORTE_FFMPEG") or "ffmpeg"

    try:
        progreso(0.02, "Extrayendo el audio")
        audio = cargar_audio(args.entrada, ffmpeg)

        progreso(0.08, "Cargando el modelo de voz")
        modelo = WhisperModel(args.modelo, device="auto", compute_type="auto")

        progreso(0.1, "Transcribiendo")
        segmentos, info = modelo.transcribe(
            audio,
            language=args.idioma,
            word_timestamps=True,
            vad_filter=True,
            beam_size=5,
        )

        duracion = float(info.duration or 0)
        resultado = {
            "language": info.language,
            "duration": duracion,
            "segments": [],
        }

        for indice, segmento in enumerate(segmentos):
            palabras = []
            for palabra in segmento.words or []:
                palabras.append(
                    {
                        "text": (palabra.word or "").strip(),
                        "start": float(palabra.start if palabra.start is not None else segmento.start),
                        "end": float(palabra.end if palabra.end is not None else segmento.end),
                    }
                )

            resultado["segments"].append(
                {
                    "id": f"s{indice}",
                    "start": float(segmento.start),
                    "end": float(segmento.end),
                    "text": segmento.text.strip(),
                    "words": palabras,
                }
            )

            if duracion > 0:
                progreso(0.1 + 0.85 * min(segmento.end / duracion, 1.0), "Transcribiendo")

        ajustar_a_la_voz(resultado["segments"], audio)

        with open(args.salida, "w", encoding="utf-8", newline="\n") as archivo:
            json.dump(resultado, archivo, ensure_ascii=False)

        progreso(1.0, "Transcripción lista")
        return 0
    except Exception as error:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        print(f"ERROR {type(error).__name__}: {error}", flush=True)
        return 1


def tramos_de_voz(audio: np.ndarray, sr: int = 16000) -> list:
    """Dónde suena la voz de verdad (tramos de 10 ms por encima del ruido de fondo, con huecos cortos unidos)."""
    paso = sr // 100
    n = len(audio) // paso
    if n == 0:
        return []
    marcos = audio[: n * paso].reshape(n, paso)
    db = 20 * np.log10(np.sqrt(np.mean(marcos**2, axis=1)) + 1e-9)
    piso = float(np.percentile(db, 10))
    pico = float(np.percentile(db, 99))
    umbral = max(piso + 12, pico - 38)
    activo = db > umbral
    tramos = []
    i = 0
    while i < n:
        if not activo[i]:
            i += 1
            continue
        j = i
        while j < n and (activo[j] or activo[j : j + 8].any()):
            j += 1
        if j - i >= 4:  # menos de 40 ms es un clic, no voz
            tramos.append((i / 100.0, j / 100.0))
        i = j
    return tramos


def ajustar_a_la_voz(segmentos: list, audio: np.ndarray) -> None:
    """
    Whisper a veces pone la primera palabra de una frase en el silencio de antes (o tarde, ya dentro de la voz) y
    la última fuera de su final: hasta 0,4 s. Las palabras que tocan una pausa se pegan al borde real de la voz;
    las de en medio no se mueven. Así los subtítulos, «quitar pausas» y los cortes caen en su sitio.
    """
    tramos = tramos_de_voz(audio)
    if not tramos:
        return
    palabras = [p for s in segmentos for p in s["words"]]
    if not palabras:
        return
    # Un ruidito suelto (un labio, un clic) no marca dónde empieza o acaba una frase.
    firmes = [(a, b) for a, b in tramos if b - a >= 0.15] or tramos
    inicios = [a for a, _ in firmes]
    finales = [b for _, b in firmes]

    # Las palabras, en orden, se reparten entre los tramos de voz (cada tramo, un bloque seguido de palabras): cuesta
    # lo lejos que queda cada palabra de su tramo, y empezar un tramo nuevo es más barato tras un punto o una coma.
    firmes_t = list(zip(inicios, finales))
    W, T = len(palabras), len(firmes_t)

    def lejos(i, t):
        a, b = firmes_t[t]
        m = (palabras[i]["start"] + palabras[i]["end"]) / 2
        return 0.0 if a <= m <= b else min(abs(m - a), abs(m - b))

    def corte(i):
        if i == 0:
            return 0.0
        return -0.2 if palabras[i - 1]["text"].rstrip()[-1:] in ".,;:?!¿¡" else 0.15

    INF = float("inf")
    costo = [[INF] * T for _ in range(W)]
    desde = [[-1] * T for _ in range(W)]
    for t in range(T):
        costo[0][t] = lejos(0, t)
    for i in range(1, W):
        for t in range(T):
            mismo = costo[i - 1][t]
            mejor_t, mejor = -1, INF
            for u in range(t):
                if costo[i - 1][u] < mejor:
                    mejor, mejor_t = costo[i - 1][u], u
            nuevo_costo = mejor + corte(i) if mejor_t >= 0 else INF
            if mismo <= nuevo_costo:
                costo[i][t], desde[i][t] = mismo + lejos(i, t), t
            else:
                costo[i][t], desde[i][t] = nuevo_costo + lejos(i, t), mejor_t
    t = min(range(T), key=lambda u: costo[W - 1][u])
    asignado = [0] * W
    for i in range(W - 1, -1, -1):
        asignado[i] = t
        t = desde[i][t] if i > 0 else t
    for t in set(asignado):
        bloque = [i for i in range(W) if asignado[i] == t]
        a, b = firmes_t[t]
        primera, ultima = palabras[bloque[0]], palabras[bloque[-1]]
        s0, e0 = primera["start"], ultima["end"]
        s1 = a if abs(s0 - a) <= 0.7 else s0
        e1 = b if abs(e0 - b) <= 0.7 and b > s1 + 0.05 else e0
        if e0 - s0 < 0.05 or e1 - s1 < 0.05:
            continue
        # Todo el bloque se estira o se encoge en proporción: las palabras de en medio se mueven con sus bordes.
        escala = (e1 - s1) / (e0 - s0)
        for i in bloque:
            palabras[i]["start"] = round(s1 + (palabras[i]["start"] - s0) * escala, 3)
            palabras[i]["end"] = round(s1 + (palabras[i]["end"] - s0) * escala, 3)
    # En orden y sin pisarse.
    for k in range(1, len(palabras)):
        if palabras[k]["start"] < palabras[k - 1]["end"]:
            palabras[k]["start"] = palabras[k - 1]["end"]
        if palabras[k]["end"] < palabras[k]["start"]:
            palabras[k]["end"] = palabras[k]["start"]
    for s in segmentos:
        if s["words"]:
            s["start"] = s["words"][0]["start"]
            s["end"] = s["words"][-1]["end"]


if __name__ == "__main__":
    sys.exit(main())
