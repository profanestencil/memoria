import { expect } from 'chai'
import hre from 'hardhat'

describe('MemoryRegistry', () => {
  it('mints and stores a memory', async () => {
    const [creator] = await hre.ethers.getSigners()
    const Factory = await hre.ethers.getContractFactory('MemoryRegistry')
    const c = await Factory.deploy()
    await c.waitForDeployment()

    const title = 'First'
    const note = 'Hello chain'
    const lat = 407123456 // 40.7123456 * 1e7
    const lng = -740012345 // -74.0012345 * 1e7
    const isPublic = true

    const tx = await c.mintMemory(title, note, lat, lng, isPublic)
    const receipt = await tx.wait()
    expect(receipt).to.not.equal(null)

    expect(await c.nextMemoryId()).to.equal(1n)

    const m = await c.getMemory(0)
    expect(m.creator).to.equal(creator.address)
    expect(m.latitudeE7).to.equal(BigInt(lat))
    expect(m.longitudeE7).to.equal(BigInt(lng))
    expect(m.isPublic).to.equal(isPublic)
    expect(m.title).to.equal(title)
    expect(m.note).to.equal(note)
  })
})

