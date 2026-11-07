<h1 align="center">Recorte</h1>

<p align="center"><b>El editor de video que maneja tu agente de IA.</b><br>
Edita hablando, crea videos desde cero y aprende cómo te gusta editar.</p>

<p align="center">
  <a href="https://github.com/reninn34-arch/recorte/releases/latest/download/Recorte-Setup.exe"><img alt="Descargar para Windows" src="https://img.shields.io/badge/Descargar%20para%20Windows-Recorte--Setup.exe-c8f169?style=for-the-badge&logo=windows&logoColor=111511&labelColor=c8f169&color=1b2116"></a>
</p>

<p align="center">
  <a href="https://github.com/reninn34-arch/recorte/releases/latest"><img alt="Versión" src="https://img.shields.io/github/v/release/reninn34-arch/recorte?label=versi%C3%B3n&color=c8f169&labelColor=1b2116"></a>
  <img alt="Windows 10 y 11" src="https://img.shields.io/badge/Windows-10%20%C2%B7%2011-1b2116?logo=windows&logoColor=c8f169">
  <a href="LICENSE"><img alt="Licencia" src="https://img.shields.io/badge/licencia-propietaria-1b2116?labelColor=1b2116&color=3a4232"></a>
</p>

<p align="center">
  <a href="https://github.com/reninn34-arch/recorte/releases/latest/download/Recorte-Setup.exe"><b>Descargar</b></a> ·
  <a href="https://github.com/reninn34-arch/recorte/releases">Todas las versiones</a> ·
  <a href="LICENSE">Licencia</a>
</p>

---

## Qué hace

| | |
|---|---|
| **Edita hablando** | Le pides al agente «quita las pausas», «pon un título al inicio» o «hazme una versión de 30 s», y lo hace en la timeline. Todo se deshace con Ctrl+Z. |
| **Te propone** | Después de cada cambio te ofrece los siguientes pasos como botones. Eliges con un clic. |
| **Aprende tu criterio** | Se queda con lo que te gusta, lo que deshaces y lo que corriges, y lo aplica en los siguientes videos. Lo ves y lo borras en Ajustes → Tu criterio. |
| **Tú mandas** | Puedes parar al agente a mitad de trabajo (deja de gastar al instante), editar un mensaje, reenviarlo o volver atrás. |
| **Timeline de verdad** | Varios clips, imágenes y videos por proyecto; textos, música con ducking, zoom y color; exporta a MP4 en la carpeta que elijas. |
| **Crear con IA** | Del pedido al guion, la voz (Gemini, tu voz grabada o un audio tuyo), imágenes y clips de Google Flow, y el video terminado. |
| **Tus agentes** | Claude Code, Kimi, Gemini, Codex, OpenCode o Antigravity, con tu propia suscripción. Eliges el agente y el modelo para cada paso. |
| **En tu equipo** | Transcripción, render y proyectos se quedan en tu computadora. |

## Instalar

1. [Descarga **Recorte-Setup.exe**](https://github.com/reninn34-arch/recorte/releases/latest/download/Recorte-Setup.exe) y ábrelo.
2. Si Windows dice «Windows protegió tu PC», da clic en **Más información** y luego en
   **Ejecutar de todas formas** (el instalador todavía no está firmado).
3. Al abrir Recorte, conecta tu agente. En **Ajustes → Herramientas de video**, el botón
   **Instalar todo lo que falta** baja FFmpeg, Python con sus paquetes, Node.js y HyperFrames
   a la carpeta de Recorte, sin instalar nada en Windows.

### Actualizaciones

Recorte busca versiones nuevas solo, al abrirse y cada cuatro horas. Cuando hay una, la
baja en segundo plano y te avisa: **Reiniciar y actualizar**. Si lo dejas para luego, se
instala al cerrar la app. También puedes buscar a mano en **Ajustes → Versión**.

## Para desarrollo

```bash
npm install
npm run dev
```

```bash
npm run typecheck   # tipos del proceso principal y de la interfaz
npm run build       # compilación de producción
npm run prueba:e2e  # importa, transcribe, edita, renderiza y captura la app real
```

Publicar una versión: `npm version patch` y `git push --follow-tags`. El workflow
[`release.yml`](.github/workflows/release.yml) compila el instalador y lo publica en
Releases; las apps instaladas se actualizan solas. Más detalle en
[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Licencia

Copyright © 2026 reninn34-arch. **Todos los derechos reservados.** El código se puede ver
aquí, pero no copiar, modificar, redistribuir ni usar comercialmente sin permiso escrito.
Ver [LICENSE](LICENSE).
