/**
 * Builds portrait / landscape memory board GLBs for AR (Photo material gets texture at runtime).
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      Promise.resolve(blob.arrayBuffer?.() ?? new ArrayBuffer(0)).then((ab) => {
        this.result = ab
        this.onloadend?.()
      })
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public/ar')
mkdirSync(outDir, { recursive: true })

const exportGlb = (scene, outPath) =>
  new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      scene,
      (gltf) => {
        writeFileSync(outPath, Buffer.from(gltf))
        console.log(`[ar-glb] ${outPath}`)
        resolve()
      },
      (err) => reject(err),
      { binary: true }
    )
  })

const buildBoardScene = (w, h, depth) => {
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x6b4e9a,
    roughness: 0.78,
    metalness: 0.04,
    name: 'Frame',
  })
  const backMat = new THREE.MeshStandardMaterial({
    color: 0xd8d4cc,
    roughness: 0.94,
    metalness: 0,
    name: 'Back',
  })
  const photoMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.02,
    name: 'Photo',
  })

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, depth),
    [frameMat, frameMat, frameMat, frameMat, photoMat, backMat]
  )
  board.name = 'MemoryBoard'

  const root = new THREE.Group()
  root.name = 'MemoryCard'
  root.add(board)

  const scene = new THREE.Scene()
  scene.add(root)
  return scene
}

const depth = 0.048

await exportGlb(
  buildBoardScene(0.54, 0.96, depth),
  join(outDir, 'memory-board-portrait.glb')
)
await exportGlb(
  buildBoardScene(0.96, 0.54, depth),
  join(outDir, 'memory-board-landscape.glb')
)
