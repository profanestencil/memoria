const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deploying with', deployer.address)

  const Factory = await hre.ethers.getContractFactory('MemoryArchiveGeo')
  const contract = await Factory.deploy()
  await contract.waitForDeployment()

  const addr = await contract.getAddress()
  console.log('MemoryArchiveGeo deployed to', addr)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

