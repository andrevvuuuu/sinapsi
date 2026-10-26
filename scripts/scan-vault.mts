import { homedir } from 'node:os'
import { scanVault } from '../src/main/vault/scan.ts'
import { DEFAULT_EXCLUDED } from '../src/shared/settings-schema.ts'

const root = process.argv[2] ?? `${homedir()}/Obsidian Vault`
const t0 = Date.now()
const idx = await scanVault(root, DEFAULT_EXCLUDED)
const links = idx.notes.flatMap((n) => n.links)
console.log(`note: ${idx.notes.length} · leggibili: ${idx.notes.filter((n) => n.available).length} · non scaricate da iCloud: ${idx.notes.filter((n) => !n.available).length}`)
console.log(`link: ${links.length} · verso note inesistenti: ${links.filter((l) => !l.resolved).length} · materie: ${idx.subjects.length} · ${Date.now() - t0} ms`)
