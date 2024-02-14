import { DeployFunction } from 'hardhat-deploy/types'
import { cooldownPeriod } from '../../test/utils/setup'
import { safeTokenAddress, safeTokenOwnerAddress } from '../utils/addresses'
import { network } from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer, owner } = await getNamedAccounts()
  const { deploy } = deployments

  if ((network.config as HardhatNetworkConfig).forking?.enabled) {
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [safeTokenOwnerAddress, safeTokenAddress, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    const safeToken = await deployments.get('SafeToken')
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [owner, safeToken.address, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  }
}

export default deploy
