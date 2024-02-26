import { deployments, ethers } from 'hardhat'

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}

export const getSafeToken = async () => {
  const safeTokenLock = await getSafeTokenLock()
  return await ethers.getContractAt('SafeToken', await safeTokenLock.SAFE_TOKEN())
}
