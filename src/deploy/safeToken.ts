import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  await deploy('SafeToken', {
    from: deployer,
    args: [deployer], // Considering the deployer as the owner as well.
    log: true,
    deterministicDeployment: true,
  })
}

export default deploy
