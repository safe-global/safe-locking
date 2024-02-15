import { network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { isForkedNetwork } from '../utils/e2e'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer, owner } = await getNamedAccounts()
  const { deploy } = deployments

  if (network.name == 'hardhat' && !isForkedNetwork()) {
    await deploy('SafeToken', {
      from: deployer,
      args: [owner],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    console.log('\tSafeToken deployment Skipped')
  }
}

export default deploy
