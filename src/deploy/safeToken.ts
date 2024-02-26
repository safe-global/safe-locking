import { network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { getDeploymentParameters } from '../utils/deployment'
import { isForkedNetwork } from '../utils/e2e'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  const { initialOwner } = getDeploymentParameters()
  if (network.name == 'hardhat' && !isForkedNetwork()) {
    await deploy('SafeToken', {
      from: deployer,
      args: [initialOwner],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    console.log('\tSafeToken deployment Skipped')
  }
}

export default deploy
