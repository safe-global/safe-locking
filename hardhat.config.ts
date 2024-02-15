import '@nomicfoundation/hardhat-toolbox'
import 'hardhat-deploy'
import dotenv from 'dotenv'
import type { HardhatUserConfig, HttpNetworkUserConfig } from 'hardhat/types'
import yargs from 'yargs/yargs'

const argv = yargs(process.argv.slice(2))
  .options({ network: { type: 'string', default: 'hardhat' } })
  .help(false)
  .version(false)
  .parseSync()

// Load environment variables.
dotenv.config()
const { CUSTOM_NODE_URL, HARDHAT_FORK_URL, INFURA_KEY, MNEMONIC, ETHERSCAN_API_KEY, PK, SOLIDITY_VERSION, SOLIDITY_SETTINGS, OWNER } =
  process.env

const DEFAULT_MNEMONIC = 'candy maple cake sugar pudding cream honey rich smooth crumble sweet treat'

const sharedNetworkConfig: HttpNetworkUserConfig = {}
if (PK) {
  sharedNetworkConfig.accounts = [PK]
} else {
  sharedNetworkConfig.accounts = {
    mnemonic: MNEMONIC || DEFAULT_MNEMONIC,
  }
}

if (['mainnet', 'sepolia'].includes(argv.network) && INFURA_KEY === undefined) {
  throw new Error(`Could not find Infura key in env, unable to connect to network ${argv.network}`)
}

import './src/tasks/local_verify'
import './src/tasks/deploy_contracts'
import './src/tasks/show_codesize'

const solidityVersion = SOLIDITY_VERSION || '0.8.23'
const soliditySettings = SOLIDITY_SETTINGS
  ? JSON.parse(SOLIDITY_SETTINGS)
  : {
      evmVersion: 'paris',
      optimizer: {
        enabled: true,
        runs: 10_000_000,
      },
    }

const customNetwork = CUSTOM_NODE_URL
  ? {
      custom: {
        ...sharedNetworkConfig,
        url: CUSTOM_NODE_URL,
      },
    }
  : {}

const forking = HARDHAT_FORK_URL ? { forking: { enabled: true, url: HARDHAT_FORK_URL } } : {}

const userConfig: HardhatUserConfig = {
  paths: {
    artifacts: 'build/artifacts',
    cache: 'build/cache',
    deploy: 'src/deploy',
    sources: 'contracts',
  },
  solidity: {
    version: solidityVersion,
    settings: soliditySettings,
  },
  networks: {
    hardhat: {
      ...forking,
      tags: ['test'],
    },
    mainnet: {
      ...sharedNetworkConfig,
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
    },
    sepolia: {
      ...sharedNetworkConfig,
      url: `https://sepolia.infura.io/v3/${INFURA_KEY}`,
      tags: ['dev'],
    },
    ...customNetwork,
  },
  namedAccounts: {
    deployer: 0,
    owner: OWNER || 1,
  },
  mocha: {
    timeout: 2000000,
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  gasReporter: {
    enabled: true,
    excludeContracts: ['test', 'safe-token'],
  },
}
export default userConfig
