import { task, types } from 'hardhat/config'
import { loadSolc } from '../utils/solc'

task('codesize', 'Displays the code size of the contracts')
  .addParam('skipCompile', 'should not compile before printing size', false, types.boolean, true)
  .addParam('contractName', 'name of the contract', undefined, types.string, true)
  .setAction(async ({ skipCompile, contractName }, hre) => {
    if (!skipCompile) {
      await hre.run('compile')
    }
    const contracts = await hre.artifacts.getAllFullyQualifiedNames()
    for (const contract of contracts) {
      const artifact = await hre.artifacts.readArtifact(contract)
      if (contractName && contractName !== artifact.contractName) continue
      console.log(artifact.contractName, hre.ethers.dataLength(artifact.deployedBytecode), 'bytes (limit is 24576)')
    }
  })

task('yulcode', 'Outputs Yul code for contracts')
  .addParam('contractName', 'name of the contract', undefined, types.string, true)
  .setAction(async ({ contractName }, hre) => {
    const contracts = await hre.artifacts.getAllFullyQualifiedNames()
    for (const contract of contracts) {
      if (contractName && !contract.endsWith(`:${contractName}`)) continue
      const buildInfo = await hre.artifacts.getBuildInfo(contract)
      if (!buildInfo) continue
      buildInfo.input.settings.outputSelection['*']['*'].push('ir', 'evm.assembly')
      const solc = await loadSolc(buildInfo.solcLongVersion)
      const compiled = solc.compile(JSON.stringify(buildInfo.input))
      const output = JSON.parse(compiled)
      if (!output.errors) {
        console.log(output.contracts[contract.split(':')[0]][contractName].ir)
      } else {
        console.error(output.errors)
        process.exitCode = 1
      }
    }
  })

export {}
