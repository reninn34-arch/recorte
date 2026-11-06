"""
Detecta la cara principal de un tramo de video y guarda los centros en JSON.

Muestrea un fotograma cada `--paso` segundos, localiza la cara más grande con un
cascade Haar de OpenCV, interpola los huecos y suaviza con media móvil. La salida
queda en coordenadas del video original:

    { "puntos": [{ "t": segundos, "x": centro_x, "y": centro_y }] }

Si no se detecta ninguna cara, "puntos" queda vacío y el llamador usa el centro.
"""

import argparse
import json
import sys

import cv2
import numpy as np


def muestrear(video: str, inicio: float, fin: float, paso: float):
    cap = cv2.VideoCapture(video)
    if not cap.isOpened():
        raise RuntimeError(f"No pude abrir el video: {video}")

    ancho = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    # Detectar a 480 px de ancho basta para caras y es mucho más rápido.
    escala = 480.0 / ancho if ancho > 480 else 1.0
    minimo = max(24, int(48 * escala))

    tiempos = []
    centros = []
    t = inicio
    while t < fin:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            break
        if escala < 1.0:
            frame = cv2.resize(frame, None, fx=escala, fy=escala)
        gris = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        caras = cascade.detectMultiScale(
            gris, scaleFactor=1.2, minNeighbors=5, minSize=(minimo, minimo)
        )
        tiempos.append(t)
        if len(caras):
            x, y, w, h = max(caras, key=lambda c: c[2] * c[3])
            centros.append(((x + w / 2) / escala, (y + h / 2) / escala))
        else:
            centros.append(None)
        t += paso

    cap.release()
    return tiempos, centros


def completar_y_suavizar(tiempos, centros, ventana_segundos=3.0):
    """Interpola los huecos sin cara y aplica media móvil."""
    validos = [i for i, c in enumerate(centros) if c is not None]
    if not validos:
        return []

    xs = np.zeros(len(tiempos))
    ys = np.zeros(len(tiempos))
    tiempos_np = np.array(tiempos)
    xs_v = np.array([centros[i][0] for i in validos])
    ys_v = np.array([centros[i][1] for i in validos])
    t_v = np.array([tiempos[i] for i in validos])

    xs[:] = np.interp(tiempos_np, t_v, xs_v)
    ys[:] = np.interp(tiempos_np, t_v, ys_v)

    paso = float(np.median(np.diff(tiempos_np))) if len(tiempos) > 1 else 0.5
    ventana = max(1, int(round(ventana_segundos / max(paso, 0.1))))
    if ventana > 1:
        kernel = np.ones(ventana) / ventana
        xs = np.convolve(xs, kernel, mode="same")
        ys = np.convolve(ys, kernel, mode="same")
        # Los bordes de la convolución se contaminan con ceros; se fijan al valor válido.
        mitad = ventana // 2
        if mitad > 0 and len(xs) > ventana:
            xs[:mitad] = xs[mitad]
            xs[-mitad:] = xs[-mitad - 1]
            ys[:mitad] = ys[mitad]
            ys[-mitad:] = ys[-mitad - 1]

    return [
        {"t": round(t, 2), "x": round(float(x), 1), "y": round(float(y), 1)}
        for t, x, y in zip(tiempos, xs, ys)
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("video")
    parser.add_argument("salida")
    parser.add_argument("--inicio", type=float, default=0.0)
    parser.add_argument("--fin", type=float, default=0.0)
    parser.add_argument("--paso", type=float, default=0.5)
    args = parser.parse_args()

    fin = args.fin if args.fin > args.inicio else args.inicio + 60
    try:
        tiempos, centros = muestrear(args.video, args.inicio, fin, args.paso)
        puntos = completar_y_suavizar(tiempos, centros)
    except Exception as error:  # noqa: BLE001 - el llamador solo necesita el mensaje
        print(f"ERROR {error}")
        return 1

    with open(args.salida, "w", encoding="utf-8") as archivo:
        json.dump({"puntos": puntos}, archivo)
    print(f"OK {len(puntos)} puntos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
