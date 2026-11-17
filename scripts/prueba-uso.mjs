// Cuánto le queda a cada cosa con cuota: lo que cuenta Claude Code en cada turno, lo que Codex deja en sus sesiones, la
// voz de Google del día y el aviso antes de hacer un video. npm run prueba:uso
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { iniciarUso, apuntarClaude, apuntarClaudeDeSalida, leerCodex, apuntarVoz, apuntarAgotado, estadoUso, avisoAntesDeHacer, proximaMedianochePacifico } = await import('../src/main/uso.ts')
const { leerLinea } = await import('../src/main/turnoagente.ts')
const { textoUso } = await import('../src/main/mcprecorte.ts')

const dir = mkdtempSync(join(tmpdir(), 'recorte-uso-'))
try {
  iniciarUso(join(dir, 'uso.json'))
  const ahora = Date.UTC(2026, 10, 17, 12, 0, 0)

  // Claude Code: el rate_limit_event de stream-json llega como evento «uso» y se apunta.
  const evento = JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed_warning', resetsAt: 1795014000, rateLimitType: 'seven_day', utilization: 0.95,
      unifiedWindows: { five_hour: { utilization: 0, resetsAt: 1794955200, status: 'allowed' }, seven_day: { utilization: 0.95, resetsAt: 1795014000, status: 'allowed_warning' } }
    },
    session_id: 's1'
  })
  const evs = leerLinea('claude', evento)
  assert.ok(evs.some((e) => e.t === 'uso'), JSON.stringify(evs))
  assert.equal(apuntarClaudeDeSalida(`{"type":"system"}\n${evento}\n`), true)
  let e = estadoUso({ agentes: ['claude'], voz: false }, ahora)
  const claude = e.servicios[0]
  assert.deepEqual(claude.ventanas.map((v) => [v.nombre, v.usado]), [['5 horas', 0], ['semana', 0.95]])
  assert.equal(claude.nivel, 'alto', '95 % de la semana: queda poco')
  // Ya renovada la semana, vuelve a cero.
  assert.equal(estadoUso({ agentes: ['claude'], voz: false }, 1795014000 * 1000 + 1).servicios[0].nivel, 'ok')

  // Codex: el rate_limits del último token_count de sus sesiones.
  const sesiones = join(dir, 'codex', '2026', '11', '16')
  mkdirSync(sesiones, { recursive: true })
  writeFileSync(
    join(sesiones, 'rollout-1.jsonl'),
    [
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: 40, window_minutes: 43200, resets_at: 1797000000 } } } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', rate_limits: { primary: { used_percent: 77, window_minutes: 43200, resets_at: 1797445652 }, secondary: null, plan_type: 'go' } } })
    ].join('\n')
  )
  const codex = leerCodex(join(dir, 'codex'))
  assert.deepEqual(codex && [codex.ventanas[0].nombre, codex.ventanas[0].usado, codex.plan], ['mes', 0.77, 'go'], JSON.stringify(codex))

  // La voz de Google: las frases de hoy y, si se acaba, hasta la medianoche de California.
  apuntarVoz('hecha', ahora)
  apuntarVoz('hecha', ahora)
  apuntarVoz('cuota-dia', ahora)
  e = estadoUso({ agentes: [], voz: true }, ahora + 60_000)
  const voz = e.servicios[0]
  assert.equal(voz.nivel, 'agotado')
  assert.equal(voz.agotadoHasta, proximaMedianochePacifico(ahora))
  // 12:00 UTC del 17 de noviembre son las 4:00 en California (UTC−8): se renueva a las 8:00 UTC del 18.
  assert.equal(new Date(voz.agotadoHasta).toISOString(), '2026-11-18T08:00:00.000Z')
  assert.match(voz.nota, /^2 frases hoy/)

  // Un agente que no informa su uso: solo si se quedó sin plan.
  apuntarAgotado('gemini', ahora + 3 * 3600_000, ahora)
  e = estadoUso({ agentes: ['claude', 'gemini'], voz: true, flow: [{ correo: 'a@b.c', creditos: 12, leido: ahora }] }, ahora + 60_000)
  assert.equal(e.servicios.find((s) => s.id === 'gemini').nivel, 'agotado')
  assert.equal(e.servicios.find((s) => s.id === 'flow').nivel, 'alto', 'menos de 20 créditos: queda poco')

  // El aviso antes de hacer el video: a Claude le queda poco y la voz se acabó.
  const aviso = avisoAntesDeHacer(e, 'claude', true)
  assert.match(aviso, /^Antes de hacerlo: A Claude Code le queda poco esta semana: llevas el 95 %/)
  assert.match(aviso, /voz de Google ya se acabó por hoy/)
  assert.match(avisoAntesDeHacer(e, 'gemini', false), /Gemini CLI se quedó sin uso de su plan/)
  assert.equal(avisoAntesDeHacer(estadoUso({ agentes: ['claude'], voz: false }, 1795014000 * 1000 + 1), 'claude', false), null, 'todo bien: sin aviso')

  // Para el MCP, en texto.
  const texto = textoUso(e)
  assert.match(texto, /Claude Code \[queda poco\]: 5 horas: 0 % usado.*semana: 95 % usado/)
  assert.match(texto, /Voz de Google \[AGOTADO\]/)
  console.log('uso de agentes, voz y Flow: se lee, se guarda y avisa antes de hacer ✓')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
