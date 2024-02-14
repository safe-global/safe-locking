import { expect } from 'chai'
import { deployments, ethers, network } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { cooldownPeriod, getSafeToken, getSafeTokenLock } from './utils/setup'
import { timestamp, transferToken } from './utils/execution'
import { HardhatNetworkConfig } from 'hardhat/types'
import { safeTokenOwnerAddress } from '../src/utils/addresses'

describe('E2E - Lock', function () {
  before(function () {
    if (!(network.config as HardhatNetworkConfig).forking?.enabled) {
      this.skip()
    }
  })

  const setupTests = async () => {
    await deployments.fixture()
    const [tokenCollector, alice, bob, carol] = await ethers.getSigners()
    const owner = await ethers.getImpersonatedSigner(safeTokenOwnerAddress)
    await tokenCollector.sendTransaction({ to: safeTokenOwnerAddress, value: ethers.parseUnits('10', 18) })

    const safeToken = await getSafeToken()
    await safeToken.connect(owner).unpause() // Tokens are initially paused in SafeToken
    const safeTokenOwnerBalance = await safeToken.balanceOf(safeTokenOwnerAddress)
    await transferToken(safeToken, owner, tokenCollector, safeTokenOwnerBalance)

    const safeTokenLock = await getSafeTokenLock()
    return { safeToken, safeTokenLock, owner, tokenCollector, alice, bob, carol }
  }

  describe('Deployment', function () {
    it('Should deploy correctly', async function () {
      const { safeToken, safeTokenLock } = await setupTests()

      // Checking contract deployment.
      expect(ethers.dataLength(await ethers.provider.getCode(safeTokenLock))).to.not.equal(0)
      expect(ethers.dataLength(await ethers.provider.getCode(safeToken))).to.not.equal(0)

      // Checking Safe Token Lock Initialization Values
      expect(await safeTokenLock.SAFE_TOKEN()).to.equal(safeToken)
      expect(await safeTokenLock.COOLDOWN_PERIOD()).to.equal(cooldownPeriod) // 30 days
    })
  })

  describe('Locking', function () {
    it('Should lock tokens correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)
      expect(await safeToken.balanceOf(alice)).to.equal(tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)
      expect(await safeToken.balanceOf(alice)).to.equal(0)
      expect(await safeToken.balanceOf(safeTokenLock)).to.equal(tokenToLock)

      // Checking Locked Token details
      expect((await safeTokenLock.users(alice)).locked).to.equal(tokenToLock)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)
    })

    it('Should lock tokens correctly multiple times', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const totalTokensToLock = ethers.parseUnits('1000', 18)
      const tokenToLock = ethers.parseUnits('200', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, totalTokensToLock)
      let aliceTokenBalance = await safeToken.balanceOf(alice)

      // Locking tokens multiple times
      let aliceSafeTokenLockTokenBalance = (await safeTokenLock.users(alice)).locked
      let safeTokenLockTokenBalance = await safeToken.balanceOf(safeTokenLock)
      await safeToken.connect(alice).approve(safeTokenLock, totalTokensToLock)
      for (let index = 0; index < 5; index++) {
        await safeTokenLock.connect(alice).lock(tokenToLock)
        expect(await safeToken.balanceOf(alice)).to.equal(aliceTokenBalance - tokenToLock)
        expect(await safeToken.balanceOf(safeTokenLock)).to.equal(safeTokenLockTokenBalance + tokenToLock)
        expect((await safeTokenLock.users(alice)).locked).to.equal(aliceSafeTokenLockTokenBalance + tokenToLock)
        aliceTokenBalance = await safeToken.balanceOf(alice)
        aliceSafeTokenLockTokenBalance = (await safeTokenLock.users(alice)).locked
        safeTokenLockTokenBalance = await safeToken.balanceOf(safeTokenLock)
      }

      // Checking Final Locked Token details
      expect((await safeTokenLock.users(alice)).locked).to.equal(totalTokensToLock)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(totalTokensToLock)
    })

    it('Should emit Locked event when tokens are locked correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.emit(safeTokenLock, 'Locked').withArgs(alice, tokenToLock)
    })
  })

  describe('Unlocking', function () {
    it('Should unlock tokens correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

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
      expect((await safeTokenLock.users(alice)).locked).to.equal(tokenToLock - tokenToUnlock)
      expect((await safeTokenLock.users(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.users(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.users(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.unlocks(0, alice)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.unlocks(0, alice)).unlockedAt).to.equal(expectedUnlockedAt)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)
    })

    it('Should unlock tokens correctly multiple times', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      let currentLocked = (await safeTokenLock.users(alice)).locked
      let currentUnlocked = (await safeTokenLock.users(alice)).unlocked
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)

        // Calculating expected unlockedAt timestamp
        const expectedUnlockedAt = BigInt(await timestamp()) + cooldownPeriod

        // Checking Locked & Unlocked Token details
        expect((await safeTokenLock.users(alice)).locked).to.equal(currentLocked - tokenToUnlock)
        expect((await safeTokenLock.users(alice)).unlocked).to.equal(currentUnlocked + tokenToUnlock)
        expect((await safeTokenLock.users(alice)).unlockStart).to.equal(0)
        expect((await safeTokenLock.users(alice)).unlockEnd).to.equal(index + 1)
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(expectedUnlockedAt)
        currentLocked = (await safeTokenLock.users(alice)).locked
        currentUnlocked = (await safeTokenLock.users(alice)).unlocked
      }

      // Checking Final Locked & Unlocked Token details
      expect((await safeTokenLock.users(alice)).locked).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.users(alice)).unlocked).to.equal(tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.users(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.users(alice)).unlockEnd).to.equal(index)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)
    })

    it('Should emit Unlocked event when tokens are unlocked correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      await expect(safeTokenLock.connect(alice).unlock(tokenToUnlock)).to.emit(safeTokenLock, 'Unlocked').withArgs(alice, 0, tokenToUnlock)
    })

    it('Unlock Index can be same for two different user with two different locked and unlocked amount', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice, bob } = await setupTests()
      const tokenToLockAlice = ethers.parseUnits('100', 18)
      const tokenToUnlockAlice = ethers.parseUnits('50', 18)
      const tokenToLockBob = ethers.parseUnits('80', 18)
      const tokenToUnlockBob = ethers.parseUnits('40', 18)
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const index = 0 // Unlock Index shared by Alice & Bob

      // Transfer tokens to Alice & Bob
      await transferToken(safeToken, tokenCollector, alice, tokenToLockAlice)
      await transferToken(safeToken, tokenCollector, bob, tokenToLockBob)

      // Locking tokens of Alice & Bob
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLockAlice)
      await safeTokenLock.connect(alice).lock(tokenToLockAlice)
      await safeToken.connect(bob).approve(safeTokenLock, tokenToLockBob)
      await safeTokenLock.connect(bob).lock(tokenToLockBob)

      // Unlocking tokens of Alice & calculating expected unlockedAt timestamp
      await safeTokenLock.connect(alice).unlock(tokenToUnlockAlice)
      const currentTimestampAlice = BigInt(await timestamp())
      const expectedUnlockedAtAlice = currentTimestampAlice + cooldownPeriod

      // Unlocking tokens of Bob & calculating expected unlockedAt timestamp
      await safeTokenLock.connect(bob).unlock(tokenToUnlockBob)
      const currentTimestampBob = BigInt(await timestamp())
      const expectedUnlockedAtBob = currentTimestampBob + cooldownPeriod

      // Checking Unlocked Token details of Alice and Bob
      expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlockAlice)
      expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(expectedUnlockedAtAlice)
      expect((await safeTokenLock.unlocks(index, bob)).amount).to.equal(tokenToUnlockBob)
      expect((await safeTokenLock.unlocks(index, bob)).unlockedAt).to.equal(expectedUnlockedAtBob)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLockAlice)
      expect(await safeTokenLock.totalBalance(bob)).to.equal(tokenToLockBob)
    })
  })

  describe('Withdrawing', function () {
    it('Should withdraw tokens correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

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
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
    })

    it('Should withdraw multiple unlocked tokens together by passing maxUnlocks', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(5)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
    })

    it('Should withdraw all matured unlocked tokens together by passing zero as maxUnlocks', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(0)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
    })

    it('Should withdraw multiple times correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 10; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      let unlockedAt = (await safeTokenLock.unlocks(5, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for first 3 unlocks (even though 5 unlocks are matured.)
      let aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      let aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      let aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      let aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      let aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      let aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for next 3 unlocks (even though next 7 unlocks are matured.)
      aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 6; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
      }
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(6))
    })

    it('Should withdraw multiple times correctly with specified and zero maxUnlocks', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 10; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      let unlockedAt = (await safeTokenLock.unlocks(5, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for first 3 unlocks (even though 5 unlocks are matured.)
      let aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      let aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      let aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      let aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      let aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      let aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for next all matured unlocks (next 7 unlocks are matured.)
      aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(0)
      aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(7))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(7))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(7))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.totalBalance(alice)).to.equal(0)
    })

    it('Should not revert if passed with maxUnlocks > unlock operations and withdraw based on unlock timestamp', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(10)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
    })

    it('Should withdraw multiple unlocked tokens only after unlock timestamp', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 10; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
        await time.increase(index + 1) // Ensuring different timestamp for each unlock
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index / 2 - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt) // Only unlocking half of the unlock operations

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(10)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index / 2))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index / 2))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index / 2))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
      }
    })

    it('Should only withdraw multiple unlocked tokens only until `maxUnlock` even if unlock timestamp reached for rest', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 10; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
        await time.increase(index + 1) // Ensuring different timestamp for each unlock
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index / 2 - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt) // Only unlocking half of the unlock operations

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.users(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.users(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.users(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.users(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * 3n)
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * 3n)
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + 3n)
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(0)
        expect((await safeTokenLock.unlocks(index, alice)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.unlocks(index, alice)).amount).to.equal(tokenToUnlock)
      }
    })

    it('Should emit Withdrawn event when tokens are withdrawn correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

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
      await expect(safeTokenLock.connect(alice).withdraw(1)).to.emit(safeTokenLock, 'Withdrawn').withArgs(alice, 0, tokenToUnlock)
    })

    it('Should emit n Withdrawn event when n unlock operations are withdrawn correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1000', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens multiple times
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(index - 1, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      await expect(safeTokenLock.connect(alice).withdraw(5))
        .to.emit(safeTokenLock, 'Withdrawn')
        .withArgs(alice, 0, tokenToUnlock)
        .to.emit(safeTokenLock, 'Withdrawn')
        .withArgs(alice, 1, tokenToUnlock)
        .to.emit(safeTokenLock, 'Withdrawn')
        .withArgs(alice, 2, tokenToUnlock)
        .to.emit(safeTokenLock, 'Withdrawn')
        .withArgs(alice, 3, tokenToUnlock)
        .to.emit(safeTokenLock, 'Withdrawn')
        .withArgs(alice, 4, tokenToUnlock)
    })
  })

  describe('Balance', function () {
    it('Should account for total tokens correctly in every state', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Checking Total Balance of User after Lock (Locked: tokenToLock, Unlocked: 0)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Checking Total Balance of User after Unlock (Locked: tokenToLock - tokenToUnlock, Unlocked: tokenToUnlock)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock)

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.unlocks(0, alice)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      await safeTokenLock.connect(alice).withdraw(0)

      // Checking Total Balance of User after Withdraw (Locked: tokenToLock - tokenToUnlock, Unlocked: 0)
      expect(await safeTokenLock.totalBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
    })
  })

  describe('Recover ERC20', function () {
    it('Should allow ERC20 recovery other than Safe token', async () => {
      const { safeTokenLock, safeToken, owner } = await setupTests()
      const erc20 = await (await ethers.getContractFactory('TestERC20')).deploy('TEST', 'TEST')

      const amount = 1n
      await erc20.mint(safeTokenLock, amount)

      const ownerBalanceBefore = await erc20.balanceOf(owner)
      const contractBalanceBefore = await erc20.balanceOf(safeTokenLock)
      const contractSafeTokenBalanceBefore = await safeToken.balanceOf(safeTokenLock)

      await safeTokenLock.connect(owner).recoverERC20(erc20, amount)

      const ownerBalanceAfter = await erc20.balanceOf(owner)
      expect(ownerBalanceAfter).equals(ownerBalanceBefore + amount)

      const contractBalanceAfter = await erc20.balanceOf(safeTokenLock)
      expect(contractBalanceAfter).equals(contractBalanceBefore - amount)

      const contractSafeTokenBalanceAfter = await safeToken.balanceOf(safeTokenLock)
      expect(contractSafeTokenBalanceAfter).equals(contractSafeTokenBalanceBefore)
    })
  })
})
