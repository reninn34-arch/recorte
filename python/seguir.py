"""
Sigue una zona de un video (una cara, una placa) para que una zona tapada la acompañe, como el seguimiento de
máscaras de Premiere.

Parte del rectángulo que dibujó el usuario en el segundo `--en` y lo sigue hacia adelante hasta `--hasta` y hacia
atrás hasta `--desde`, con el seguidor CSRT de OpenCV (o MIL si no está). Escribe en JSON el centro de la zona en
cada momento, en fracciones del cuadro:

    { "recorrido": [{ "f": segundo_de_la_fuente, "x": 0.41, "y": 0.37 }], "perdido": 0.0 }

`perdido` es la fracción de momentos en que el seguidor no la encontró (ahí se queda quieta).
"""

import argparse
import json
import sys

import cv2

ANCHO = 640


def crear_seguidor():
    for nombre in ('TrackerCSRT_create', 'TrackerKCF_create', 'TrackerMIL_create'):
        if hasattr(cv2, nombre):
            return getattr(cv2, nombre)()
        legado = getattr(cv2, 'legacy', None)
        if legado is not None and hasattr(legado, nombre):
            return getattr(legado, nombre)()
    raise RuntimeError('Este OpenCV no trae ningún seguidor.')


def cuadros(cap, desde, hasta, paso, escala):
    """Los cuadros del tramo, uno cada `paso` segundos (más o menos), achicados a ANCHO de ancho."""
    cap.set(cv2.CAP_PROP_POS_MSEC, desde * 1000)
    siguiente = desde
    while True:
        ok = cap.grab()
        if not ok:
            return
        t = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
        if t > hasta + 1e-3:
            return
        if t + 1e-3 < siguiente:
            continue
        ok, frame = cap.retrieve()
        if not ok:
            return
        siguiente = t + paso
        yield t, cv2.resize(frame, None, fx=escala, fy=escala) if escala < 1 else frame


def seguir(lista, caja):
    """Sigue `caja` por la lista de (t, cuadro) desde el primero. Devuelve [(t, cx, cy, encontrado)]."""
    if not lista:
        return []
    seguidor = crear_seguidor()
    seguidor.init(lista[0][1], tuple(int(round(v)) for v in caja))
    x, y, w, h = caja
    puntos = [(lista[0][0], x + w / 2, y + h / 2, True)]
    for t, frame in lista[1:]:
        ok, nueva = seguidor.update(frame)
        if ok:
            x, y, w, h = nueva
        puntos.append((t, x + w / 2, y + h / 2, bool(ok)))
    return puntos


def suavizar(puntos, ventana=2):
    salida = []
    for i, p in enumerate(puntos):
        vecinos = puntos[max(0, i - ventana): i + ventana + 1]
        salida.append((p[0], sum(v[1] for v in vecinos) / len(vecinos), sum(v[2] for v in vecinos) / len(vecinos), p[3]))
    return salida


def main():
    p = argparse.ArgumentParser()
    p.add_argument('video')
    p.add_argument('salida')
    p.add_argument('--desde', type=float, required=True)
    p.add_argument('--hasta', type=float, required=True)
    p.add_argument('--en', type=float, required=True)
    p.add_argument('--x', type=float, required=True, help='centro, fracción del ancho')
    p.add_argument('--y', type=float, required=True)
    p.add_argument('--ancho', type=float, required=True)
    p.add_argument('--alto', type=float, required=True)
    p.add_argument('--paso', type=float, default=1 / 15)
    a = p.parse_args()

    cap = cv2.VideoCapture(a.video)
    if not cap.isOpened():
        raise SystemExit(f'No pude abrir el video: {a.video}')
    w0 = cap.get(cv2.CAP_PROP_FRAME_WIDTH) or ANCHO
    h0 = cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or ANCHO
    escala = min(1.0, ANCHO / w0)
    W, H = w0 * escala, h0 * escala
    en = min(max(a.en, a.desde), a.hasta)
    caja = ((a.x - a.ancho / 2) * W, (a.y - a.alto / 2) * H, max(8, a.ancho * W), max(8, a.alto * H))

    # Hacia adelante, cuadro a cuadro desde el segundo elegido.
    adelante = seguir(list(cuadros(cap, en, a.hasta, a.paso, escala)), caja)
    # Hacia atrás: el tramo de antes se lee en orden y se sigue al revés.
    atras = []
    if en - a.desde > a.paso / 2:
        previos = list(cuadros(cap, a.desde, en, a.paso, escala))
        atras = seguir(list(reversed(previos)), caja)[1:]
        atras.reverse()
    cap.release()

    puntos = suavizar(atras + adelante)
    if not puntos:
        raise SystemExit('No pude leer cuadros de ese tramo.')
    perdidos = sum(1 for x in puntos if not x[3]) / len(puntos)
    recorrido = [{'f': round(t, 3), 'x': round(min(1, max(0, cx / W)), 4), 'y': round(min(1, max(0, cy / H)), 4)} for t, cx, cy, _ in puntos]
    with open(a.salida, 'w', encoding='utf-8') as f:
        json.dump({'recorrido': recorrido, 'perdido': round(perdidos, 3)}, f)
    print(json.dumps({'puntos': len(recorrido), 'perdido': round(perdidos, 3)}))


if __name__ == '__main__':
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        print(str(e), file=sys.stderr)
        sys.exit(1)
