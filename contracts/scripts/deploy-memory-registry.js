const hre = require('hardhat')

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  if (!deployer) {
    throw new Error(
      'No deployer signer available. Set PRIVATE_KEY in your environment before deploying.'
    )
  }
  console.log('Deploying with', deployer.address)

  const Factory = await hre.ethers.getContractFactory('MemoryRegistry')
  const contract = await Factory.deploy()
  await contract.waitForDeployment()

  const addr = await contract.getAddress()
  console.log('MemoryRegistry deployed to', addr)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

