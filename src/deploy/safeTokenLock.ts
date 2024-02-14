import { DeployFunction } from 'hardhat-deploy/types'
import { cooldownPeriod } from '../../test/utils/setup'
import { safeTokenAddress } from '../utils/addresses'
import { network } from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer, owner } = await getNamedAccounts()
  const { deploy } = deployments

  if (network.name == 'hardhat' && !(network.config as HardhatNetworkConfig).forking?.enabled) {
    const safeToken = await deployments.get('SafeToken')
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [owner, safeToken.address, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [owner, safeTokenAddress, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  }
}

export default deploy
