#!/usr/bin/env node
// El sonido de una escena a WAV: node sonido-a-wav.mjs <guion.js> <salida.wav> [--voz]
// El guion exporta DURACION y sonido(M). Con --voz: modo narración (sin fondos ni música, lo menor más bajo).
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { crearMezcla } from './sonido.js'

const [guion, salida, ...resto] = process.argv.slice(2)
if (!guion || !salida) { console.error('uso: node sonido-a-wav.mjs <guion.js> <salida.wav> [--voz]'); process.exit(1) }
const G = await import(pathToFileURL(resolve(guion)).href)
if (typeof G.sonido !== 'function' || !G.DURACION) { console.error('El guion tiene que exportar DURACION y sonido(M).'); process.exit(1) }
const M = crearMezcla(G.DURACION, { conVoz: resto.includes('--voz') })
G.sonido(M)
writeFileSync(salida, M.aWav())
console.log(`listo: ${resolve(salida)} (${G.DURACION} s)`)
