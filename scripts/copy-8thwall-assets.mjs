import { cp, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '..')

const fromDir = path.join(projectRoot, 'node_modules', '@8thwall', 'engine-binary', 'dist')
const toDir = path.join(projectRoot, 'public', 'external', 'xr')

const ensureReadableDir = async (p) => {
  const s = await stat(p)
  if (!s.isDirectory()) {
    throw new Error(`Expected directory: ${p}`)
  }
}

const run = async () => {
  await ensureReadableDir(fromDir)
  await mkdir(toDir, { recursive: true })
  await cp(fromDir, toDir, { recursive: true, force: true })
  process.stdout.write(`Copied 8th Wall engine assets to ${path.relative(projectRoot, toDir)}\n`)
}

run().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
  process.exitCode = 1
})

