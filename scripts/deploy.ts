import { ethers } from 'hardhat'

async function main() {
  const safeTokenLock = await ethers.deployContract('SafeTokenLock')

  await safeTokenLock.waitForDeployment()

  console.log(`Safe Token Lock deployed to ${safeTokenLock.target}`)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
