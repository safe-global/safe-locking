import { DeployFunction } from 'hardhat-deploy/types'
import { cooldownPeriod } from '../../test/utils/setup'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  const safeToken = await deployments.get('SafeToken')

  await deploy('SafeTokenLock', {
    from: deployer,
    args: [safeToken.address, cooldownPeriod],
    log: true,
    deterministicDeployment: true,
  })
}

export default deploy
