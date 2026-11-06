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

        with open(args.salida, "w", encoding="utf-8", newline="\n") as archivo:
            json.dump(resultado, archivo, ensure_ascii=False)

        progreso(1.0, "Transcripción lista")
        return 0
    except Exception as error:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        print(f"ERROR {type(error).__name__}: {error}", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
