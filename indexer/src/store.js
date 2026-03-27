import fs from 'node:fs/promises'
import path from 'node:path'

const dataPath = path.join(process.cwd(), 'data.json')

export async function loadStore() {
  try {
    const raw = await fs.readFile(dataPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      lastBlock: typeof parsed.lastBlock === 'number' ? parsed.lastBlock : 0,
      memories: Array.isArray(parsed.memories) ? parsed.memories : []
    }
  } catch {
    return { lastBlock: 0, memories: [] }
  }
}

export async function saveStore(store) {
  const out = {
    lastBlock: store.lastBlock ?? 0,
    memories: store.memories ?? []
  }
  await fs.writeFile(dataPath, JSON.stringify(out, null, 2) + '\n', 'utf8')
}

