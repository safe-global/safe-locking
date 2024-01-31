import { BigNumberish, Signer } from 'ethers'
import { SafeToken } from '../../typechain-types/contracts/token/SafeToken.sol'

export const transferToken = (token: SafeToken, from: Signer, to: Signer, amount: BigNumberish) => {
  return token.connect(from).transfer(to, amount)
}
