import { execFile } from 'node:child_process'

/** Lo que delata un trabajo pesado que el agente dejó corriendo (un render, un armado del kit). */
const TRABAJO_PESADO = /ffmpeg|kit\.py|hyperframes|remotion|blender|render/i

/**
 * Si el agente tiene de fondo un render o un armado todavía en marcha (un proceso suyo, descendiente del que lanzó
 * Recorte). Los servidores que traiga (MCP y demás) no cuentan.
 */
export function trabajoDeFondo(pid: number | undefined): Promise<boolean> {
  if (!pid) return Promise.resolve(false)
  const ver = (lista: { pid: number; padre: number; cmd: string }[]): boolean => {
    const hijos = new Map<number, typeof lista>()
    for (const x of lista) hijos.set(x.padre, [...(hijos.get(x.padre) ?? []), x])
    const pila = [pid]
    const vistos = new Set<number>()
    while (pila.length) {
      const actual = pila.pop()!
      for (const h of hijos.get(actual) ?? []) {
        if (vistos.has(h.pid)) continue
        vistos.add(h.pid)
        if (TRABAJO_PESADO.test(h.cmd)) return true
        pila.push(h.pid)
      }
    }
    return false
  }
  return new Promise((resolver) => {
    if (process.platform === 'win32') {
      const ps = 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name) $($_.CommandLine)" }'
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 20_000, maxBuffer: 1 << 24 }, (e, out) => {
        if (e) return resolver(false)
        resolver(ver(out.split(/\r?\n/).map((l) => l.split('\t')).filter((c) => c.length >= 3).map((c) => ({ pid: Number(c[0]), padre: Number(c[1]), cmd: c.slice(2).join(' ') }))))
      })
    } else {
      execFile('ps', ['-A', '-o', 'pid=,ppid=,args='], { timeout: 10_000, maxBuffer: 1 << 24 }, (e, out) => {
        if (e) return resolver(false)
        resolver(
          ver(
            out
              .split('\n')
              .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
              .filter((m): m is RegExpExecArray => !!m)
              .map((m) => ({ pid: Number(m[1]), padre: Number(m[2]), cmd: m[3] }))
          )
        )
      })
    }
  })
}
