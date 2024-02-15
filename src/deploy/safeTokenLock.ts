import { DeployFunction } from 'hardhat-deploy/types'
import { cooldownPeriod } from '../../test/utils/setup'
import { network } from 'hardhat'
import { isForkedNetwork } from '../utils/e2e'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer, owner } = await getNamedAccounts()
  const { deploy } = deployments

  if (network.name == 'hardhat' && !isForkedNetwork()) {
    const safeToken = await deployments.get('SafeToken')
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [owner, safeToken.address, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  } else {
    const { SAFE_TOKEN } = process.env
    await deploy('SafeTokenLock', {
      from: deployer,
      args: [owner, SAFE_TOKEN, cooldownPeriod],
      log: true,
      deterministicDeployment: true,
    })
  }
}

export default deploy
