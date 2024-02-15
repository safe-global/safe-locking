import { expect } from 'chai'
import { deployments, ethers, getNamedAccounts } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { getSafeToken, getSafeTokenLock } from './utils/setup'
import { timestamp, transferToken } from './utils/execution'

describe('Total Supply - Lock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    const { owner: ownerAddress } = await getNamedAccounts()
    const owner = await ethers.getImpersonatedSigner(ownerAddress)
    const [deployer, , tokenCollector, alice, bob, carol] = await ethers.getSigners()
    await tokenCollector.sendTransaction({ to: owner, value: ethers.parseUnits('10', 18) })

    const safeToken = await getSafeToken()
    await safeToken.connect(owner).unpause() // Tokens are initially paused in SafeToken

    const safeTokenTotalSupply = await safeToken.totalSupply()
    await transferToken(safeToken, owner, tokenCollector, safeTokenTotalSupply)

    const safeTokenLock = await getSafeTokenLock()
    return { safeToken, safeTokenTotalSupply, safeTokenLock, deployer, owner, tokenCollector, alice, bob, carol }
  })

  describe('Locking', function () {
    it('Should be possible to lock all tokens', async function () {
      // This test checks the whether `uint96` is enough to hold all possible locked Safe Token.
      const { safeToken, safeTokenTotalSupply, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Checking Locked Token details
      expect((await safeTokenLock.users(alice)).locked).to.equal(tokenToLock)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)
    })
  })

  describe('Unlocking', function () {
    it('Should be possible to unlock all tokens', async function () {
      const { safeToken, safeTokenTotalSupply, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply
      const tokenToUnlock = safeTokenTotalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Calculating expected unlockedAt timestamp
      const currentTimestamp = BigInt(await timestamp())
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const expectedUnlockedAt = currentTimestamp + cooldownPeriod

      // Checking Locked & Unlocked Token details
      expect((await safeTokenLock.users(alice)).locked).to.equal(0)
      expect((await safeTokenLock.users(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.users(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.users(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.unlocks(0, alice)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.unlocks(0, alice)).unlockedAt).to.equal(expectedUnlockedAt)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToUnlock)
    })
  })

  describe('Withdrawing', function () {
    it('Should be possible to withdraw all tokens', async function () {
      const { safeToken, safeTokenTotalSupply, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply
      const tokenToUnlock = safeTokenTotalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(0, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(1)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock)
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock)
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + 1n)
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)
      expect((await safeTokenLock.unlocks(0, alice)).amount).to.equal(0)
      expect((await safeTokenLock.unlocks(0, alice)).unlockedAt).to.equal(0)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(0)
    })
  })
})
