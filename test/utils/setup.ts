import { deployments, ethers } from 'hardhat'

export const safeTokenTotalSupply = ethers.parseUnits('1', 27) // 1 Billion Safe Token (with 18 decimals)
export const cooldownPeriod = 60 * 60 * 24 * 30 // 30 days

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}

export const getSafeToken = async () => {
  const SafeTokenDeployment = await deployments.get('SafeToken')
  return await ethers.getContractAt('SafeToken', SafeTokenDeployment.address)
}
