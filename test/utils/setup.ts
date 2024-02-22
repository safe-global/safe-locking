import { deployments, ethers } from 'hardhat'
import { isForkedNetwork } from '../../src/utils/e2e'
import { Address } from 'hardhat-deploy/types'

export const cooldownPeriod = 60n * 60n * 24n * 30n // 30 days

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}

export const getSafeToken = async () => {
  let SafeTokenDeploymentAddress
  if (isForkedNetwork()) {
    const { SAFE_TOKEN } = process.env
    SafeTokenDeploymentAddress = SAFE_TOKEN as Address
  } else {
    SafeTokenDeploymentAddress = (await deployments.get('SafeToken')).address
  }
  return await ethers.getContractAt('SafeToken', SafeTokenDeploymentAddress)
}
