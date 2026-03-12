const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deploying with', deployer.address)

  const MemoryArchive = await hre.ethers.getContractFactory('MemoryArchive')
  const contract = await MemoryArchive.deploy()
  await contract.waitForDeployment()

  const addr = await contract.getAddress()
  console.log('MemoryArchive deployed to', addr)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

