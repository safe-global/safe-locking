import { expect } from 'chai'
import { deployments, ethers, getNamedAccounts, network } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { cooldownPeriod, getSafeToken, getSafeTokenLock } from './utils/setup'
import { timestamp, transferToken } from './utils/execution'
import { ZeroAddress } from 'ethers'
import { isForkedNetwork } from '../src/utils/e2e'

describe('SafeTokenLock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    let safeTokenToTransfer
    const { owner: ownerAddress } = await getNamedAccounts()
    const owner = await ethers.getImpersonatedSigner(ownerAddress)

    const safeToken = await getSafeToken()
    if (isForkedNetwork()) {
      safeTokenToTransfer = await safeToken.balanceOf(owner)
    } else {
      safeTokenToTransfer = await safeToken.totalSupply()
    }

    const [, , tokenCollector, alice, bob, carol] = await ethers.getSigners()
    await tokenCollector.sendTransaction({ to: owner, value: ethers.parseUnits('10', 18) })
    const safeTokenTotalSupply = await safeToken.totalSupply()

    await safeToken.connect(owner).unpause() // Tokens are initially paused in SafeToken
    await transferToken(safeToken, owner, tokenCollector, safeTokenToTransfer)

    const safeTokenLock = await getSafeTokenLock()
    return { safeToken, safeTokenTotalSupply, safeTokenLock, owner, tokenCollector, alice, bob, carol }
  })

  describe('Deployment', function () {
    it('Should deploy correctly', async function () {
      const { safeToken, safeTokenLock } = await setupTests()

      // Checking contract deployment.
      expect(ethers.dataLength(await ethers.provider.getCode(safeTokenLock))).to.not.equal(0)
      expect(ethers.dataLength(await ethers.provider.getCode(safeToken))).to.not.equal(0)

      // Checking Safe Token Lock Initialization Values
      expect(await safeTokenLock.SAFE_TOKEN()).to.equal(safeToken)
      expect(await safeTokenLock.COOLDOWN_PERIOD()).to.equal(cooldownPeriod)
    })

    it('Should not deploy with zero address', async function () {
      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      const { owner } = await setupTests()
      await expect(SafeTokenLock.deploy(owner, ZeroAddress, cooldownPeriod)).to.be.revertedWithCustomError(
        SafeTokenLock,
        'InvalidSafeTokenAddress()',
      )
    })

    it('Should not deploy with zero cooldown period', async function () {
      const { safeToken, owner } = await setupTests()

      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      await expect(SafeTokenLock.deploy(owner, safeToken, 0)).to.be.revertedWithCustomError(SafeTokenLock, 'InvalidCooldownPeriod()')
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
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)
    })

    it('Should not lock zero tokens', async function () {
      const { safeTokenLock, alice } = await setupTests()
      const tokenToLock = 0 // 0 tokens

      // Locking zero tokens
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWithCustomError(safeTokenLock, 'InvalidTokenAmount()')
    })

    it('Should not lock if token transfer is not approved', async function () {
      const { safeTokenLock, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)

      // Locking tokens without approval
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWith('ERC20: insufficient allowance')
    })

    it('Should lock tokens correctly multiple times', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const totalTokensToLock = ethers.parseUnits('1000', 18)
      const tokenToLock = ethers.parseUnits('200', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, totalTokensToLock)
      let aliceTokenBalance = await safeToken.balanceOf(alice)

      // Locking tokens multiple times
      let aliceSafeTokenLockTokenBalance = (await safeTokenLock.getUser(alice)).locked
      let safeTokenLockTokenBalance = await safeToken.balanceOf(safeTokenLock)
      await safeToken.connect(alice).approve(safeTokenLock, totalTokensToLock)
      for (let index = 0; index < 5; index++) {
        await safeTokenLock.connect(alice).lock(tokenToLock)
        expect(await safeToken.balanceOf(alice)).to.equal(aliceTokenBalance - tokenToLock)
        expect(await safeToken.balanceOf(safeTokenLock)).to.equal(safeTokenLockTokenBalance + tokenToLock)
        expect((await safeTokenLock.getUser(alice)).locked).to.equal(aliceSafeTokenLockTokenBalance + tokenToLock)
        aliceTokenBalance = await safeToken.balanceOf(alice)
        aliceSafeTokenLockTokenBalance = (await safeTokenLock.getUser(alice)).locked
        safeTokenLockTokenBalance = await safeToken.balanceOf(safeTokenLock)
      }

      // Checking Final Locked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(totalTokensToLock)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(totalTokensToLock)
    })

    it('Should be possible to lock all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
      // This test checks the whether `uint96` is enough to hold all possible locked Safe Token.
      const { safeToken, safeTokenTotalSupply, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Checking Locked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)
    })

    it('Should not lock tokens without transferring token', async function () {
      const { safeToken, safeTokenLock, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)

      // Approving without having any token balance.
      expect(await safeToken.balanceOf(alice)).to.equal(0)
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)

      // Locking tokens without transferring tokens
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
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
      const currentTimestamp = await timestamp()
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const expectedUnlockedAt = currentTimestamp + cooldownPeriod

      // Checking Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock - tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUnlock(alice, 0)).unlockedAt).to.equal(expectedUnlockedAt)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)
    })

    it('Should not unlock zero tokens', async function () {
      const { safeTokenLock, alice } = await setupTests()
      const tokenToUnlock = 0 // 0 tokens

      // Unlocking zero tokens
      await expect(safeTokenLock.connect(alice).unlock(tokenToUnlock)).to.be.revertedWithCustomError(safeTokenLock, 'InvalidTokenAmount()')
    })

    it('Should not unlock is amount > total locked tokens', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('50', 18)
      const tokenToUnlock = ethers.parseUnits('100', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      await expect(safeTokenLock.connect(alice).unlock(tokenToUnlock)).to.be.revertedWithCustomError(
        safeTokenLock,
        'UnlockAmountExceeded()',
      )
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
      let currentLocked = (await safeTokenLock.getUser(alice)).locked
      let currentUnlocked = (await safeTokenLock.getUser(alice)).unlocked
      let index = 0
      for (; index < 5; index++) {
        await safeTokenLock.connect(alice).unlock(tokenToUnlock)

        // Calculating expected unlockedAt timestamp
        const expectedUnlockedAt = (await timestamp()) + cooldownPeriod

        // Checking Locked & Unlocked Token details
        expect((await safeTokenLock.getUser(alice)).locked).to.equal(currentLocked - tokenToUnlock)
        expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(currentUnlocked + tokenToUnlock)
        expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
        expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(index + 1)
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(expectedUnlockedAt)
        currentLocked = (await safeTokenLock.getUser(alice)).locked
        currentUnlocked = (await safeTokenLock.getUser(alice)).unlocked
      }

      // Checking Final Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(index)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)
    })

    it('Should be possible to unlock all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
      const { safeToken, safeTokenTotalSupply, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply
      const tokenToUnlock = safeTokenTotalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      const unlockTransaction = await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Calculating expected unlockedAt timestamp
      const { timestamp: unlockTimestamp } = (await unlockTransaction.getBlock())!
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const expectedUnlockedAt = BigInt(unlockTimestamp) + cooldownPeriod

      // Checking Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUnlock(alice, 0)).unlockedAt).to.equal(expectedUnlockedAt)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToUnlock)
    })

    it('Should not reduce the total token before & after unlock', async function () {
      // Total tokens can increase but not decrease during an unlock operation.
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('100', 18)
      const tokenToUnlock = ethers.parseUnits('50', 18)

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      const safeTokenBeforeUnlock = await safeToken.balanceOf(safeTokenLock)
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      const safeTokenAfterUnlock = await safeToken.balanceOf(safeTokenLock)

      // Check token balance remains same or not
      expect(safeTokenBeforeUnlock).to.equal(safeTokenAfterUnlock)
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
      const currentTimestampAlice = await timestamp()
      const expectedUnlockedAtAlice = currentTimestampAlice + cooldownPeriod

      // Unlocking tokens of Bob & calculating expected unlockedAt timestamp
      await safeTokenLock.connect(bob).unlock(tokenToUnlockBob)
      const currentTimestampBob = await timestamp()
      const expectedUnlockedAtBob = currentTimestampBob + cooldownPeriod

      // Checking Unlocked Token details of Alice and Bob
      expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlockAlice)
      expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(expectedUnlockedAtAlice)
      expect((await safeTokenLock.getUnlock(bob, index)).amount).to.equal(tokenToUnlockBob)
      expect((await safeTokenLock.getUnlock(bob, index)).unlockedAt).to.equal(expectedUnlockedAtBob)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLockAlice)
      expect(await safeTokenLock.userTokenBalance(bob)).to.equal(tokenToLockBob)
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
      const unlockTransaction = await safeTokenLock.connect(alice).unlock(tokenToUnlock)
      const { timestamp: unlockTimestamp } = (await unlockTransaction.getBlock())!
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()

      // Getting unlocked at timestamp and increasing timestamp
      await time.increaseTo(BigInt(unlockTimestamp) + cooldownPeriod)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(1)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock)
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock)
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + 1n)
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(0)
      expect((await safeTokenLock.getUnlock(alice, 0)).unlockedAt).to.equal(0)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
    })

    it('Should allow withdraw call even if no tokens are unlocked', async function () {
      // `withdraw()` should not revert even if there are no tokens to withdraw.
      const { safeTokenLock, alice } = await setupTests()

      // Withdrawing tokens
      expect(await safeTokenLock.connect(alice).withdraw(1)).to.not.be.reverted
      expect(await safeTokenLock.connect(alice).withdraw.staticCall(1)).to.equal(0)
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(5)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(0)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
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
      let unlockedAt = (await safeTokenLock.getUnlock(alice, 5)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for first 3 unlocks (even though 5 unlocks are matured.)
      let aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      let aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      let aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      let aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      let aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      let aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for next 3 unlocks (even though next 7 unlocks are matured.)
      aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 6; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(6))
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
      let unlockedAt = (await safeTokenLock.getUnlock(alice, 5)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for first 3 unlocks (even though 5 unlocks are matured.)
      let aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      let aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      let aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      let aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      let aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      let aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      let aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(3))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(3))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(3))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens for next all matured unlocks (next 7 unlocks are matured.)
      aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(0)
      aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Intermediate Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(7))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(7))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(7))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(0)
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(10)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index / 2 - 1)).unlockedAt
      await time.increaseTo(unlockedAt) // Only unlocking half of the unlock operations

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(10)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * BigInt(index / 2))
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * BigInt(index / 2))
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + BigInt(index / 2))
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 5; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index / 2 - 1)).unlockedAt
      await time.increaseTo(unlockedAt) // Only unlocking half of the unlock operations

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(3)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Final Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock * 3n)
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock * 3n)
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + 3n)
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)

      index = 0
      for (; index < 3; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(0)
        expect((await safeTokenLock.getUnlock(alice, index)).unlockedAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }
    })

    it('Should be possible to withdraw all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, 0)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      const aliceTokenBalanceBefore = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceBefore = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartBefore = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndBefore = (await safeTokenLock.getUser(alice)).unlockEnd
      await safeTokenLock.connect(alice).withdraw(1)
      const aliceTokenBalanceAfter = await safeToken.balanceOf(alice)
      const aliceUnlockContractBalanceAfter = (await safeTokenLock.getUser(alice)).unlocked
      const aliceUnlockStartAfter = (await safeTokenLock.getUser(alice)).unlockStart
      const aliceUnlockEndAfter = (await safeTokenLock.getUser(alice)).unlockEnd

      // Checking Token Balance & Unlocked Token details
      expect(aliceTokenBalanceAfter).to.equal(aliceTokenBalanceBefore + tokenToUnlock)
      expect(aliceUnlockContractBalanceAfter).to.equal(aliceUnlockContractBalanceBefore - tokenToUnlock)
      expect(aliceUnlockStartAfter).to.equal(aliceUnlockStartBefore + 1n)
      expect(aliceUnlockEndAfter).to.equal(aliceUnlockEndBefore)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(0)
      expect((await safeTokenLock.getUnlock(alice, 0)).unlockedAt).to.equal(0)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(0)
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, 0)).unlockedAt
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
      const unlockedAt = (await safeTokenLock.getUnlock(alice, index - 1)).unlockedAt
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
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Checking Total Balance of User after Unlock (Locked: tokenToLock - tokenToUnlock, Unlocked: tokenToUnlock)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock)

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAt = (await safeTokenLock.getUnlock(alice, 0)).unlockedAt
      await time.increaseTo(unlockedAt)

      // Withdrawing tokens
      await safeTokenLock.connect(alice).withdraw(0)

      // Checking Total Balance of User after Withdraw (Locked: tokenToLock - tokenToUnlock, Unlocked: 0)
      expect(await safeTokenLock.userTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
    })
  })

  describe('Recover ERC20', function () {
    it('Should not allow non-owner to recover', async () => {
      const { safeTokenLock, alice } = await setupTests()
      expect(safeTokenLock.connect(alice).recoverERC20(ZeroAddress, 0))
        .to.be.revertedWithCustomError(safeTokenLock, 'OwnableUnauthorizedAccount')
        .withArgs(alice)
    })

    it('Should not allow Safe token recovery', async () => {
      const { safeToken, safeTokenLock, owner } = await setupTests()
      expect(safeTokenLock.connect(owner).recoverERC20(safeToken, 0)).to.be.revertedWithCustomError(safeTokenLock, 'CannotRecoverSafeToken')
    })

    it('Should allow ERC20 recovery other than Safe token', async () => {
      const { safeToken, safeTokenLock, owner } = await setupTests()
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

  describe('Operations', function () {
    it('Should handle all operations correctly among multiple users', async function () {
      // This test is based on the test mentioned in the Operation section of the Implementation.
      const { safeToken, safeTokenLock, tokenCollector, alice, bob } = await setupTests()
      const tokenToLockAlice = ethers.parseUnits('250', 18)
      const tokenToUnlockAlice1 = ethers.parseUnits('20', 18)
      const tokenToUnlockAlice2 = ethers.parseUnits('50', 18)
      const tokenToUnlockAlice3 = ethers.parseUnits('70', 18)
      const tokenToLockBob = ethers.parseUnits('200', 18)
      const tokenToUnlockBob1 = ethers.parseUnits('35', 18)
      const tokenToUnlockBob2 = ethers.parseUnits('75', 18)

      // Transfer tokens to Alice & Bob
      await transferToken(safeToken, tokenCollector, alice, tokenToLockAlice)
      await transferToken(safeToken, tokenCollector, bob, tokenToLockBob)

      // Locking tokens for Alice
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLockAlice)
      await safeTokenLock.connect(alice).lock(tokenToLockAlice)
      expect(await safeTokenLock.getUser(alice)).to.deep.equal([tokenToLockAlice, 0n, 0n, 0n])

      // Unlocking tokens for Alice
      await safeTokenLock.connect(alice).unlock(tokenToUnlockAlice1)
      expect(await safeTokenLock.getUser(alice)).to.deep.equal([tokenToLockAlice - tokenToUnlockAlice1, tokenToUnlockAlice1, 0n, 1n])
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlockAlice1)

      // Locking tokens for Bob
      await safeToken.connect(bob).approve(safeTokenLock, tokenToLockBob)
      await safeTokenLock.connect(bob).lock(tokenToLockBob)
      expect(await safeTokenLock.getUser(bob)).to.deep.equal([tokenToLockBob, 0n, 0n, 0n])

      // Automine switched off to do transaction in the same timestamp
      await network.provider.send('evm_setAutomine', [false])

      // Unlocking tokens for Alice
      await safeTokenLock.connect(alice).unlock(tokenToUnlockAlice2)

      // Unlocking tokens for Bob
      await safeTokenLock.connect(bob).unlock(tokenToUnlockBob1)

      // Unlocking tokens for Alice
      await safeTokenLock.connect(alice).unlock(tokenToUnlockAlice3)

      // Restarting Automine and Dummy transaction to force the next block to be mined.
      await network.provider.send('evm_setAutomine', [true])
      await tokenCollector.sendTransaction({ to: tokenCollector, value: ethers.parseEther('1') })

      // Checking updated status for Alice & Bob
      expect(await safeTokenLock.getUser(bob)).to.deep.equal([tokenToLockBob - tokenToUnlockBob1, tokenToUnlockBob1, 0n, 1n])
      expect((await safeTokenLock.getUnlock(bob, 0)).amount).to.equal(tokenToUnlockBob1)
      expect(await safeTokenLock.getUser(alice)).to.deep.equal([
        tokenToLockAlice - tokenToUnlockAlice1 - tokenToUnlockAlice2 - tokenToUnlockAlice3,
        tokenToUnlockAlice1 + tokenToUnlockAlice2 + tokenToUnlockAlice3,
        0n,
        3n,
      ])
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlockAlice1)
      expect((await safeTokenLock.getUnlock(alice, 1)).amount).to.equal(tokenToUnlockAlice2)
      expect((await safeTokenLock.getUnlock(alice, 2)).amount).to.equal(tokenToUnlockAlice3)

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAtT1 = (await safeTokenLock.getUnlock(alice, 0)).unlockedAt
      await time.increaseTo(unlockedAtT1)

      // Withdrawing tokens for Alice
      await safeTokenLock.connect(alice).withdraw(1)
      expect(await safeTokenLock.getUnlock(alice, 0)).to.deep.equal([0n, 0n])

      // Unlocking tokens for Bob
      await safeTokenLock.connect(bob).unlock(tokenToUnlockBob2)
      expect(await safeTokenLock.getUser(bob)).to.deep.equal([
        tokenToLockBob - tokenToUnlockBob1 - tokenToUnlockBob2,
        tokenToUnlockBob1 + tokenToUnlockBob2,
        0n,
        2n,
      ])
      expect((await safeTokenLock.getUnlock(bob, 1)).amount).to.equal(tokenToUnlockBob2)

      // Getting unlocked at timestamp and increasing timestamp
      const unlockedAtT2 = (await safeTokenLock.getUnlock(alice, 1)).unlockedAt
      await time.increaseTo(unlockedAtT2)

      // Withdrawing tokens for Alice
      await safeTokenLock.connect(alice).withdraw(0)
      expect(await safeTokenLock.getUnlock(alice, 1)).to.deep.equal([0n, 0n])
      expect(await safeTokenLock.getUnlock(alice, 2)).to.deep.equal([0n, 0n])

      // Withdrawing tokens for Bob
      await safeTokenLock.connect(bob).withdraw(0)
      expect(await safeTokenLock.getUnlock(bob, 0)).to.deep.equal([0n, 0n])

      // Checking Final State details
      expect(await safeTokenLock.getUser(alice)).to.deep.equal([
        tokenToLockAlice - tokenToUnlockAlice1 - tokenToUnlockAlice2 - tokenToUnlockAlice3,
        0n,
        3n,
        3n,
      ])
      expect(await safeTokenLock.getUser(bob)).to.deep.equal([
        tokenToLockBob - tokenToUnlockBob1 - tokenToUnlockBob2,
        tokenToUnlockBob2,
        1n,
        2n,
      ])
    })
  })
})
