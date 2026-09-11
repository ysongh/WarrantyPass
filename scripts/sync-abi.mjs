#!/usr/bin/env node

/*
 * Regenerates src/contracts/warrantyPassRegistry.ts from the Foundry artifact.
 *
 * Run after any change to the contract:
 *
 *     forge build && pnpm sync:abi
 *
 * Why a script rather than pasting the ABI
 * ----------------------------------------
 * A hand-copied ABI is correct exactly until someone edits the contract and
 * forgets. The failure is quiet — viem encodes a call against a stale signature
 * and the transaction reverts for reasons that look nothing like the cause. The
 * artifact is the source of truth; this keeps the copy honest.
 *
 * Only the ABI is emitted. The deployed address is *not* written here, because
 * this file is regenerated: an address belongs in configuration, and lives in
 * src/lib/contracts/warrantyPass.ts, which is hand-written and never clobbered.
 *
 * No filtering is applied. The registry's full ABI is four functions, one event
 * and six errors — all of which the app needs, the errors included, since viem
 * decodes reverts through them to tell a duplicate registration apart from a
 * genuine failure. "Minimal" and "complete" happen to be the same thing here.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CONTRACT = 'WarrantyPassRegistry'
const ARTIFACT = join(root, 'contracts', 'out', `${CONTRACT}.sol`, `${CONTRACT}.json`)
const OUTPUT = join(root, 'src', 'contracts', 'warrantyPassRegistry.ts')

let artifact

try {
  artifact = JSON.parse(await readFile(ARTIFACT, 'utf8'))
} catch (cause) {
  console.error(`Could not read ${ARTIFACT}`)
  console.error('Run `forge build` first.')
  console.error(String(cause?.message ?? cause))
  process.exit(1)
}

const abi = artifact?.abi

if (!Array.isArray(abi) || abi.length === 0) {
  console.error('The artifact contains no ABI. Did the contract compile?')
  process.exit(1)
}

// Pinned in foundry.toml so the registry compiles reproducibly; recorded here
// so the generated file says which compiler produced it.
const compiler = artifact?.metadata?.compiler?.version ?? 'unknown'

const banner = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by scripts/sync-abi.mjs from the Foundry artifact for
 * contracts/src/${CONTRACT}.sol. Regenerate with:
 *
 *     forge build && pnpm sync:abi
 *
 * Compiler: solc ${compiler}
 *
 * The deployed address is deliberately not here — this file is overwritten on
 * every sync. See src/lib/contracts/warrantyPass.ts for address configuration.
 */`

const body = `${banner}

/**
 * The registry ABI, \`as const\` so viem can infer argument and return types
 * from it rather than falling back to \`unknown\`.
 */
export const warrantyPassRegistryAbi = ${JSON.stringify(abi, null, 2)} as const
`

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, body, 'utf8')

const counts = abi.reduce((acc, entry) => {
  acc[entry.type] = (acc[entry.type] ?? 0) + 1
  return acc
}, {})

console.log(`Wrote ${OUTPUT.replace(`${root}/`, '')}`)
console.log(
  `  solc ${compiler} — ` +
    Object.entries(counts)
      .map(([type, count]) => `${count} ${type}`)
      .join(', '),
)
