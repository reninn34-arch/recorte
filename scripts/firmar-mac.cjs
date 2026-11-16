// electron-builder (afterPack): firma «ad hoc» la app de Mac entera, sin certificado de Apple.
//
// Sin ninguna firma, una app bajada de internet en un Mac con chip Apple sale como «dañada» y no abre. Con la firma ad
// hoc completa (la app y todo lo que lleva dentro, sellado), macOS solo pide confirmar la primera vez (Ajustes del
// Sistema → Privacidad y seguridad → «Abrir igualmente»). Para que abra sin preguntar hace falta la firma y la
// notarización de Apple (cuenta de desarrollador).
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

exports.default = async function firmarMac(contexto) {
  if (contexto.electronPlatformName !== 'darwin') return
  const app = join(contexto.appOutDir, `${contexto.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
