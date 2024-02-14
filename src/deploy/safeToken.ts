import { network } from 'hardhat'
import { DeployFunction } from 'hardhat-deploy/types'
import { HardhatNetworkConfig } from 'hardhat/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  if ((network.config as HardhatNetworkConfig).forking?.enabled) {
    console.log('\tSafeToken deployment skipped for forked network')
  } else if (network.name == 'hardhat') {
    await deploy('SafeToken', {
      from: deployer,
      args: [deployer], // Considering the deployer as the owner as well.
      log: true,
      deterministicDeployment: true,
    })
  }
}

export default deploy
