import type { Project, RenderJob } from '../../shared/types'

export const proyectoDemo: Project = {
  id: 'curso-fotografia',
  name: 'Curso de fotografía · Módulo 3',
  source: {
    path: '',
    name: 'modulo-03-luz.mp4',
    duration: 2892,
    width: 1920,
    height: 1080,
    fps: 30
  },
  clips: [
    {
      id: 'c1',
      start: 760,
      end: 798,
      title: 'El error que arruina tus fotos con poca luz',
      hook: 'Si disparas así con poca luz, estás perdiendo detalle.',
      score: 94,
      reason: 'Problema concreto, solución clara y gancho en la primera frase.',
      status: 'elegido',
      captionStyle: 'Editorial',
      reframe: 'cara'
    },
    {
      id: 'c2',
      start: 1265,
      end: 1312,
      title: 'Tres ajustes que cambian todo en interiores',
      hook: 'No necesitas más equipo: necesitas mover tres ajustes.',
      score: 91,
      reason: 'Lista corta, aplicable y fácil de recordar.',
      status: 'renderizando',
      captionStyle: 'Impacto',
      reframe: 'cara'
    },
    {
      id: 'c3',
      start: 2058,
      end: 2102,
      title: 'Por qué tu histograma te está mintiendo',
      hook: 'El histograma no te dice si la foto está bien.',
      score: 88,
      reason: 'Rompe una creencia y abre una explicación visual.',
      status: 'sugerido',
      captionStyle: 'Limpio',
      reframe: 'centro'
    },
    {
      id: 'c4',
      start: 2470,
      end: 2504,
      title: 'La prueba de los cinco segundos',
      hook: 'Si no entiendes la foto en cinco segundos, no funciona.',
      score: 85,
      reason: 'Regla simple y comprobable en el momento.',
      status: 'sugerido',
      captionStyle: 'Editorial',
      reframe: 'cara'
    },
    {
      id: 'c5',
      start: 1102,
      end: 1141,
      title: 'Cómo rebotar la luz sin comprar nada',
      hook: 'Una pared blanca vale más que un flash caro.',
      score: 83,
      reason: 'Solución de bajo coste con resultado visible.',
      status: 'sugerido',
      captionStyle: 'Caja',
      reframe: 'division'
    },
    {
      id: 'c6',
      start: 450,
      end: 492,
      title: 'El secreto del balance de blancos',
      hook: 'El color no se arregla después: se elige antes.',
      score: 80,
      reason: 'Concepto básico mal entendido, buen gancho.',
      status: 'sugerido',
      captionStyle: 'Limpio',
      reframe: 'centro'
    },
    {
      id: 'c7',
      start: 2750,
      end: 2790,
      title: 'Tu foto no está mal, está subexpuesta',
      hook: 'Antes de editar, mira si el problema es la exposición.',
      score: 78,
      reason: 'Corrige un diagnóstico habitual.',
      status: 'sugerido',
      captionStyle: 'Impacto',
      reframe: 'cara'
    },
    {
      id: 'c8',
      start: 1742,
      end: 1778,
      title: 'Un minuto para entender el ruido',
      hook: 'El ruido no aparece por tener el ISO alto.',
      score: 74,
      reason: 'Explicación corta con una idea contraintuitiva.',
      status: 'sugerido',
      captionStyle: 'Editorial',
      reframe: 'division'
    }
  ],
  brand: {
    name: 'Estudio Luz',
    primary: '#c9f26a',
    secondary: '#ff8a5c',
    font: 'Inter'
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
  transcription: 'lista',
  language: 'es',
  demo: true
}

export const colaDemo: RenderJob[] = [
  {
    id: 'r1',
    clipId: 'c1',
    title: 'El error que arruina tus fotos con poca luz',
    progress: 100,
    status: 'listo'
  },
  {
    id: 'r2',
    clipId: 'c2',
    title: 'Tres ajustes que cambian todo en interiores',
    progress: 42,
    status: 'renderizando'
  }
]
