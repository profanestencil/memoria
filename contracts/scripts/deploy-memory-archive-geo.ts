import { ethers } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log('Deploying with', deployer.address)

  const Factory = await ethers.getContractFactory('MemoryArchiveGeo')
  const contract = await Factory.deploy()
  await contract.waitForDeployment()

  const addr = await contract.getAddress()
  console.log('MemoryArchiveGeo deployed to', addr)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})

