import { network } from 'hardhat'
import { HardhatNetworkConfig } from 'hardhat/types'

export const isForkedNetwork = () => {
  return (network.config as HardhatNetworkConfig).forking?.enabled
}
