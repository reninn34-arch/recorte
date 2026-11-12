"""Prueba del muñeco por piezas: una minifigura dibujada de perfil (con sus puntos), que camina, salta y se sienta.
Uso: python scripts/prueba-muneco.py <carpeta del kit> <carpeta de trabajo>. Imprime un JSON con lo medido."""
import json
import os
import sys

sys.path.insert(0, sys.argv[1])
import kit  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

AM, RO, AZ, GR, NE = (250, 205, 40, 255), (200, 40, 40, 255), (40, 80, 170, 255), (90, 90, 90, 255), (30, 30, 30, 255)
im = Image.new('RGBA', (300, 520), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
# Mirando a la derecha, de pie: la pierna y el brazo de atrás más oscuros.
d.polygon([(140, 275), (160, 275), (150, 470), (128, 470)], fill=(30, 60, 140, 255))
d.polygon([(128, 470), (150, 470), (165, 497), (120, 497)], fill=(30, 60, 140, 255))
d.polygon([(130, 110), (155, 112), (128, 200), (108, 196)], fill=(160, 30, 30, 255))
d.ellipse((96, 190, 126, 226), fill=AM)
d.rounded_rectangle((120, 20, 190, 95), 14, fill=AM)
d.ellipse((168, 45, 178, 55), fill=NE)
d.rectangle((140, 95, 168, 108), fill=AM)
d.polygon([(125, 108), (175, 108), (180, 250), (120, 250)], fill=RO)
d.rectangle((120, 250, 180, 285), fill=GR)
d.polygon([(145, 275), (168, 275), (175, 470), (152, 470)], fill=AZ)
d.polygon([(152, 470), (175, 470), (200, 497), (147, 497)], fill=AZ)
d.polygon([(150, 112), (172, 112), (190, 200), (170, 205)], fill=RO)
d.ellipse((168, 198, 198, 232), fill=AM)
P = {'nariz': [182, 60], 'ojo_d': [173, 50], 'oreja_d': [140, 55], 'hombro_i': [160, 118], 'hombro_d': [142, 118],
     'codo_i': [180, 160], 'codo_d': [120, 160], 'muneca_i': [182, 210], 'muneca_d': [111, 207], 'mano_i': [183, 225],
     'mano_d': [110, 222], 'cadera_i': [156, 275], 'cadera_d': [150, 275], 'rodilla_i': [162, 372], 'rodilla_d': [143, 372],
     'tobillo_i': [164, 468], 'tobillo_d': [139, 468], 'punta_i': [195, 495], 'punta_d': [160, 495]}
puntos = {k: [v[0] / im.width, v[1] / im.height] for k, v in P.items()}
ruta = os.path.join(sys.argv[2], 'mini-perfil.png')
im.save(ruta)


def caja(c):
    a = np.asarray(c)[..., 3]
    ys, xs = np.nonzero(a > 128)
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


m = kit.Muneco(im, 'caminar', 0.6, puntos)
res = {'vista': 'perfil' if m.perfil else 'frente', 'mira': m.adelante, 'piezas': [h[0] for h in m.huesos]}
quieto = kit.Muneco(im, 'peso', 0.0, puntos).cuadro(0)
suelo0 = caja(quieto)[3]
# Caminando: las piernas se abren (la figura se ensancha) y los pies no se hunden ni flotan.
anchos, suelos = [], []
for t in np.linspace(0, 1.1, 12):
    x0, y0, x1, y1 = caja(m.cuadro(float(t)))
    anchos.append(x1 - x0)
    suelos.append(y1)
res['ancho_quieto'] = caja(quieto)[2] - caja(quieto)[0]
res['ancho_max_caminando'] = max(anchos)
res['suelo_quieto'] = suelo0
res['suelo_caminando'] = [min(suelos), max(suelos)]
# Saltando: en el aire, los pies suben; sentado, la cabeza baja.
s = kit.Muneco(im, 'saltar', 0.6, puntos)
res['suelo_saltando'] = caja(s.cuadro(0.85))[3] - caja(s.cuadro(0.0))[3]
se = kit.Muneco(im, 'sentarse', 0.6, puntos)
res['cabeza_sentado'] = caja(se.cuadro(1.5))[1] - caja(se.cuadro(0.0))[1]
# Por la línea de órdenes, la revisión de piezas.
res['info'] = kit.info_muneco(ruta, puntos=puntos)
print(json.dumps(res))
