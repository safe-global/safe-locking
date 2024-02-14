import { deployments, ethers, network } from 'hardhat'
import { safeTokenAddress } from '../../src/utils/addresses'
import { HardhatNetworkConfig } from 'hardhat/types'

export const safeTokenTotalSupply = ethers.parseUnits('1', 27) // 1 Billion Safe Token (with 18 decimals)
export const cooldownPeriod = 60 * 60 * 24 * 30 // 30 days

export const getSafeTokenLock = async () => {
  const SafeTokenLockDeployment = await deployments.get('SafeTokenLock')
  return await ethers.getContractAt('SafeTokenLock', SafeTokenLockDeployment.address)
}

export const getSafeToken = async () => {
  let SafeTokenDeploymentAddress
  if ((network.config as HardhatNetworkConfig).forking?.enabled) {
    SafeTokenDeploymentAddress = safeTokenAddress
  } else {
    SafeTokenDeploymentAddress = (await deployments.get('SafeToken')).address
  }
  return await ethers.getContractAt('SafeToken', SafeTokenDeploymentAddress)
}
