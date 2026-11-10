// Prueba los adaptadores de los agentes con salidas reales grabadas (sin gastar créditos):
// que cada uno lance bien su orden (nueva y retomando la sesión) y traduzca su salida.
// npm run prueba:adaptadores
import assert from 'node:assert/strict'
import { ADAPTADORES } from '../src/main/adaptadoresagente.ts'

const leer = (agente, lineas) => lineas.flatMap((l) => ADAPTADORES[agente].leer(l))
const de = (evs, t) => evs.filter((e) => e.t === t)

// Claude Code 2: stream-json (grabado de `claude -p --output-format stream-json --verbose`).
{
  const evs = leer('claude', [
    '{"type":"system","subtype":"init","session_id":"92857ce3-f8d4-4a00-a749-f4328960575d"}',
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ffprobe entrada/01-a.mp4"}}]},"session_id":"92857ce3-f8d4-4a00-a749-f4328960575d"}',
    '{"type":"result","subtype":"success","is_error":false,"result":"ok","total_cost_usd":0.15,"session_id":"92857ce3-f8d4-4a00-a749-f4328960575d"}'
  ])
  assert.equal(de(evs, 'sesion')[0].id, '92857ce3-f8d4-4a00-a749-f4328960575d')
  assert.match(de(evs, 'linea')[0].texto, /^Bash: ffprobe/)
  assert.deepEqual(de(evs, 'fin')[0], { t: 'fin', ok: true, respuesta: 'ok', costoUsd: 0.15 })
  // Retomar una sesión que no existe: el motivo llega en `errors`.
  const perdida = leer('claude', ['{"type":"result","subtype":"error_during_execution","is_error":true,"errors":["No conversation found with session ID: 0000"]}'])
  assert.equal(de(perdida, 'fin')[0].ok, false)
  assert.match(de(perdida, 'fin')[0].error, /No conversation found/)
  const orden = ADAPTADORES.claude.orden('claude -p --model opus', 'C:\\t', 'abc')
  assert.match(orden, /^claude -p --model opus .*--output-format stream-json --verbose --resume abc$/)
  assert.doesNotMatch(ADAPTADORES.claude.orden('claude -p', 'C:\\t'), /--resume/)
}

// Codex 0.167: `exec --json` (grabado).
{
  const evs = leer('codex', [
    '{"type":"thread.started","thread_id":"01a1c225-dfae-73a3-9e52-353d7e5ae85f"}',
    '{"type":"turn.started"}',
    '{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"ffprobe x.mp4","status":"in_progress"}}',
    '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}',
    '{"type":"turn.completed","usage":{"input_tokens":17690,"cached_input_tokens":11648,"output_tokens":5}}'
  ])
  assert.equal(de(evs, 'sesion')[0].id, '01a1c225-dfae-73a3-9e52-353d7e5ae85f')
  assert.equal(de(evs, 'respuesta')[0].texto, 'ok')
  assert.match(de(evs, 'linea')[0].texto, /^Bash: ffprobe/)
  assert.equal(de(evs, 'fin')[0].ok, true)
  const fallo = leer('codex', ['{"type":"turn.failed","error":{"message":"usage limit reached"}}'])
  assert.equal(de(fallo, 'fin')[0].ok, false)
  const nueva = ADAPTADORES.codex.orden('codex exec -m gpt-5', 'C:\\t')
  assert.equal(nueva, 'codex exec -m gpt-5 --json --skip-git-repo-check -s workspace-write -C "C:\\t" -')
  const retoma = ADAPTADORES.codex.orden('codex exec -m gpt-5', 'C:\\t', 'abc')
  assert.equal(retoma, 'codex exec resume -m gpt-5 --json --skip-git-repo-check -c sandbox_mode=workspace-write abc -')
}

// OpenCode 1.19: `run --format json` (grabado) y `-s <id>` para seguir la sesión.
{
  const sid = 'ses_e382decb0ffeUGrGgHT3lVhDjE'
  const evs = leer('opencode', [
    `{"type":"step_start","sessionID":"${sid}","part":{"type":"step-start"}}`,
    `{"type":"tool_use","sessionID":"${sid}","part":{"type":"tool","tool":"write","state":{"status":"completed","input":{"filePath":"C:\\\\t\\\\hola.txt","content":"hola"}}}}`,
    `{"type":"step_finish","sessionID":"${sid}","part":{"reason":"tool-calls","type":"step-finish"}}`,
    `{"type":"text","sessionID":"${sid}","part":{"type":"text","text":"listo"}}`,
    `{"type":"step_finish","sessionID":"${sid}","part":{"reason":"stop","type":"step-finish"}}`
  ])
  assert.equal(de(evs, 'sesion')[0].id, sid)
  assert.equal(de(evs, 'linea')[0].texto, 'Write: hola.txt')
  assert.equal(de(evs, 'respuesta')[0].texto, 'listo')
  // Solo el «stop» termina el turno (los «tool-calls» son pasos intermedios).
  assert.equal(de(evs, 'fin').length, 1)
  assert.deepEqual(de(evs, 'fin')[0], { t: 'fin', ok: true })
  assert.equal(ADAPTADORES.opencode.conSesion, true)
  assert.equal(ADAPTADORES.opencode.orden('opencode run', 'C:\\t'), 'opencode run --format json --auto --dir "C:\\t"')
  assert.equal(ADAPTADORES.opencode.orden('opencode run -m x/y', 'C:\\t', sid), `opencode run -m x/y --format json --auto --dir "C:\\t" -s ${sid}`)
  const fallo = leer('opencode', ['{"type":"error","error":{"name":"APIError","data":{"message":"Rate limit exceeded"}}}'])
  assert.deepEqual(de(fallo, 'fin')[0], { t: 'fin', ok: false, error: 'Rate limit exceeded' })
}

// Los de texto: sin sesión, y Gemini con `-p` bien formado.
{
  assert.equal(ADAPTADORES.kimi.conSesion, false)
  assert.equal(ADAPTADORES.gemini.orden('gemini -p -m gemini-2.5-pro', 'C:\\t'), 'gemini -m gemini-2.5-pro --yolo --skip-trust -p "Sigue al pie de la letra las instrucciones de arriba."')
  const evs = leer('kimi', ['Leyendo entrada/', 'Listo.'])
  assert.equal(de(evs, 'respuesta').map((e) => e.texto).join(''), 'Leyendo entrada/\nListo.\n')
}

console.log('adaptadores: ok')
