import { BigNumberish, Signer } from 'ethers'
import { SafeToken } from '../../typechain-types/safe-token/contracts/SafeToken'
import { ethers } from 'hardhat'

export const transferToken = (token: SafeToken, from: Signer, to: Signer, amount: BigNumberish) => {
  return token.connect(from).transfer(to, amount)
}

export const timestamp = async () => {
  const block = await ethers.provider.getBlock('latest')
  if (block === null) {
    throw new Error('Missing Latest Block!')
  }
  return BigInt(block.timestamp)
}
