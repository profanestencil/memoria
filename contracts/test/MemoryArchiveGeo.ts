import { expect } from 'chai'
import hre from 'hardhat'

describe('MemoryArchiveGeo', () => {
  it('mints to caller and stores geo/time/title/note', async () => {
    const [user] = await hre.ethers.getSigners()
    const Factory = await hre.ethers.getContractFactory('MemoryArchiveGeo')
    const c = await Factory.deploy()
    await c.waitForDeployment()

    const tokenURI = 'ipfs://example-metadata'
    const title = 'Golden hour'
    const note = 'Tide was low.'
    const latE7 = 377749000 // 37.7749
    const lngE7 = -1224194000 // -122.4194

    const tx = await c.connect(user).mint(tokenURI, title, note, latE7, lngE7)
    const receipt = await tx.wait()
    expect(receipt).to.not.equal(null)

    expect(await c.ownerOf(0)).to.eq(user.address)

    const res = await c.getMemoryData(0)
    expect(res[0].latitudeE7).to.eq(latE7)
    expect(res[0].longitudeE7).to.eq(lngE7)
    expect(res[0].title).to.eq(title)
    expect(res[0].note).to.eq(note)
    expect(res[1]).to.eq(tokenURI)
  })
})

