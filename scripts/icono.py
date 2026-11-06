"""Genera build/icon.png (512x512) con la marca de Recorte: tijeras tinta sobre lima."""
from PIL import Image, ImageDraw

S = 4  # supersampling
SIZE = 512 * S
LIME = (201, 242, 106, 255)   # --accent
INK = (16, 20, 10, 255)       # --ink

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Fondo: cuadrado redondeado lima
margen = int(SIZE * 0.04)
radio = int(SIZE * 0.24)
d.rounded_rectangle([margen, margen, SIZE - margen, SIZE - margen], radius=radio, fill=LIME)

# Glifo: viewBox 24x24 escalado al 58% del lienzo, centrado
escala = (SIZE * 0.58) / 24
ox = (SIZE - 24 * escala) / 2
oy = (SIZE - 24 * escala) / 2


def p(x, y):
    return (ox + x * escala, oy + y * escala)


ancho = int(2.0 * escala)

# Cuchillas: M8.2 7.6 L20 18  /  M8.2 16.4 L20 6
d.line([p(8.2, 7.6), p(20, 18)], fill=INK, width=ancho)
d.line([p(8.2, 16.4), p(20, 6)], fill=INK, width=ancho)

# Anillas: círculos (6,6) y (6,18), r 2.5
r = 2.5 * escala
for cx, cy in ((6, 6), (6, 18)):
    x, y = p(cx, cy)
    d.ellipse([x - r, y - r, x + r, y + r], outline=INK, width=ancho)

img = img.resize((512, 512), Image.LANCZOS)
img.save("build/icon.png")
print("build/icon.png", img.size)
