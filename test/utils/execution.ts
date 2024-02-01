import { BigNumberish, Signer } from 'ethers'
import { SafeToken } from '../../typechain-types/safe-token/contracts/SafeToken'

export const transferToken = (token: SafeToken, from: Signer, to: Signer, amount: BigNumberish) => {
  return token.connect(from).transfer(to, amount)
}
