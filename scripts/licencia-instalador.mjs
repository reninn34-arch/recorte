// El instalador (NSIS) lee la licencia como texto ANSI salvo que lleve la marca UTF-8 (BOM):
// sin ella, las tildes, la ñ y las comillas salen rotas. Este script deja una copia con la
// marca en build/licencia-instalador.txt, que es la que usa electron-builder.yml.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const texto = readFileSync(join(raiz, 'LICENSE'), 'utf8').replace(/^﻿/, '').replace(/\r?\n/g, '\r\n')
mkdirSync(join(raiz, 'build'), { recursive: true })
writeFileSync(join(raiz, 'build', 'licencia-instalador.txt'), '﻿' + texto, 'utf8')
console.log('licencia del instalador: build/licencia-instalador.txt')
