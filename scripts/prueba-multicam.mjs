import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { picosDeArchivo } from '../src/main/onda.ts'
import { desfasePorSonido } from '../src/main/multicam.ts'
import { cambiarAngulo, anguloEn, duracionTimeline, normalizarTimeline, tramos } from '../src/shared/timeline.ts'

/**
 * Multicámara: dos tomas de la misma escena (el mismo sonido, una empieza 3,4 s después) se sincronizan por el sonido,
 * y cortar a la otra toma muestra el mismo momento de la escena.
 * Uso: npm run prueba:multicam
 */

const dir = mkdtempSync(join(tmpdir(), 'recorte-multicam-'))
const ff = (args) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
try {
  // Un «habla» de ráfagas de ruido de distinto largo (no se repite), y la misma escena grabada desde dos cámaras.
  const voz = join(dir, 'voz.wav')
  ff(['-f', 'lavfi', '-i', "anoisesrc=d=20:a=0.5,volume='0.15+0.85*gt(sin(t*2.3)+sin(t*0.71+1)+sin(t*5.1),0.6)':eval=frame", voz])
  const a = join(dir, 'camara-a.mp4')
  const b = join(dir, 'camara-b.mp4')
  ff(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=20:r=30', '-i', voz, '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', a])
  // La cámara B empezó a grabar antes: el mismo sonido llega 3,4 s más tarde en su archivo.
  ff(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=23.4:r=30', '-i', voz, '-filter_complex', '[1:a]adelay=3400:all=1[x]', '-map', '0:v', '-map', '[x]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', b])
  const [pa, pb] = await Promise.all([picosDeArchivo(a, dir), picosDeArchivo(b, dir)])
  const s = desfasePorSonido(pa, pb)
  assert.ok(Math.abs(s.desfase - 3.4) < 0.06, `el desfase debía ser 3,4 s: ${JSON.stringify(s)}`)
  assert.ok(s.confianza > 0.6, `la confianza debía ser alta: ${s.confianza}`)
  console.log(`sincronizar por el sonido: desfase ${s.desfase} s (real 3,4), confianza ${s.confianza.toFixed(2)} ✓`)

  // Cortar a la toma B en el segundo 5: desde ahí se ve B en el mismo momento de la escena (5 + 3,4 de su archivo).
  const tl = normalizarTimeline(
    { version: 1, clips: [{ id: 'c', fuente: 'principal', entrada: 0, salida: 20 }], textos: [], multicam: { angulos: [{ fuente: 'principal', desfase: 0 }, { fuente: 'mb', desfase: s.desfase }] } },
    20,
    { mb: 23.4 }
  )
  assert.equal(tl.multicam.angulos.length, 2, 'la multicámara sobrevive a guardar y abrir')
  const dur = (f) => (f === 'principal' ? 20 : 23.4)
  const corte = cambiarAngulo(tl, 5, 1, dur)
  const [c1, c2] = tramos(corte)
  assert.equal(corte.clips.length, 2, 'cortar a otra toma divide el clip')
  assert.ok(c2.clip.fuente === 'mb' && Math.abs(c2.clip.entrada - (5 + s.desfase)) < 0.01, `la toma B debía empezar en ${5 + s.desfase}: ${c2.clip.entrada}`)
  assert.ok(Math.abs(duracionTimeline(corte) - 20) < 0.01, 'cortar entre tomas no cambia la duración')
  assert.equal(anguloEn(corte, 3), 0)
  assert.equal(anguloEn(corte, 8), 1)
  // Volver a la A en el 12: otra vez el mismo momento.
  const vuelta = cambiarAngulo(corte, 12, 0, dur)
  assert.ok(Math.abs(tramos(vuelta)[2].clip.entrada - 12) < 0.01, `de vuelta a la A, en su segundo 12: ${tramos(vuelta)[2].clip.entrada}`)
  assert.equal(cambiarAngulo(vuelta, 13, 0, dur), vuelta, 'cortar a la toma que ya se ve no cambia nada')
  console.log(`cortar entre tomas: A hasta el 5, B (desde su ${c2.clip.entrada.toFixed(2)}) hasta el 12, y otra vez A; ${c1.clip.fuente} → mb → principal ✓`)
  console.log('prueba multicam: ok')
} catch (e) {
  console.error(`prueba multicam: error · ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
