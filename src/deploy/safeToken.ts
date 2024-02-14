import { network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatNetworkConfig } from 'hardhat/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  if (network.name == 'hardhat' && !(network.config as HardhatNetworkConfig).forking?.enabled) {
    await deploy('SafeToken', {
      from: deployer,
      args: [deployer], // Considering the deployer as the owner as well.
      log: true,
      deterministicDeployment: true,
    })
  } else {
    console.log('\tSafeToken deployment Skipped')
  }
}

export default deploy
