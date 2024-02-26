import { DeployFunction } from 'hardhat-deploy/types'
import { network } from 'hardhat'
import { getDeploymentParameters } from '../utils/deployment'
import { isForkedNetwork } from '../utils/e2e'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  const { initialOwner, safeToken, cooldownPeriod } = getDeploymentParameters()
  if (network.name == 'hardhat' && !isForkedNetwork()) {
    const safeToken = await deployments.get('SafeToken')
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [initialOwner, safeToken.address, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [initialOwner, safeToken, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  }
}

export default deploy
