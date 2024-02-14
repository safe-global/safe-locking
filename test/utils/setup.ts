import { deployments, ethers, network } from 'hardhat'
import { SAFE_TOKEN_ADDRESS } from '../../src/utils/addresses'
import { HardhatNetworkConfig } from 'hardhat/types'

export const cooldownPeriod = 60 * 60 * 24 * 30 // 30 days

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}

export const getSafeToken = async () => {
  let SafeTokenDeploymentAddress
  if ((network.config as HardhatNetworkConfig).forking?.enabled) {
    SafeTokenDeploymentAddress = SAFE_TOKEN_ADDRESS
  } else {
    SafeTokenDeploymentAddress = (await deployments.get('SafeToken')).address
  }
  return await ethers.getContractAt('SafeToken', SafeTokenDeploymentAddress)
}
