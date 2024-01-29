import SafeToken from 'safe-token/build/artifacts/contracts/SafeToken.sol/SafeToken.json'
import { DeployFunction } from 'hardhat-deploy/types'

const deploy: DeployFunction = async ({ deployments, getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts()
  const { deploy } = deployments

  await deploy('SafeToken', {
    from: deployer,
    contract: SafeToken,
    args: [deployer], // Considering the deployer as the owner as well.
    log: true,
    deterministicDeployment: true,
  })
}

export default deploy
