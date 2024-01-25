import { deployments, ethers } from 'hardhat'

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}
