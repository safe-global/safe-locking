import { expect } from 'chai'
import { deployments, ethers, network } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { getSafeToken, getSafeTokenLock } from './utils/setup'
import { timestamp, transferToken } from './utils/execution'
import { ZeroAddress } from 'ethers'
import { getDeploymentParameters } from '../src/utils/deployment'
import { isForkedNetwork } from '../src/utils/e2e'

describe('SafeTokenLock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()

    const safeToken = await getSafeToken()
    const safeTokenOwner = await ethers.getImpersonatedSigner(await safeToken.owner())
    const safeTokenToTransfer = isForkedNetwork() ? await safeToken.balanceOf(safeTokenOwner) : await safeToken.totalSupply()

    const [, tokenCollector, alice, bob, carol] = await ethers.getSigners()
    await tokenCollector.sendTransaction({ to: safeTokenOwner, value: ethers.parseEther('1') })

    await safeToken.connect(safeTokenOwner).unpause() // Tokens are initially paused in SafeToken
    await transferToken(safeToken, safeTokenOwner, tokenCollector, safeTokenToTransfer)

    const safeTokenLock = await getSafeTokenLock()
    const owner = await ethers.getImpersonatedSigner(await safeTokenLock.owner())

    return { safeToken, safeTokenLock, owner, tokenCollector, alice, bob, carol }
  })

  describe('Deployment', function () {
    it('Should deploy correctly', async function () {
      const { safeToken, safeTokenLock } = await setupTests()

      // Checking contract deployment.
      expect(ethers.dataLength(await ethers.provider.getCode(safeTokenLock))).to.not.equal(0)
      expect(ethers.dataLength(await ethers.provider.getCode(safeToken))).to.not.equal(0)

      // Checking Safe token lock initialization values
      expect(await safeTokenLock.SAFE_TOKEN()).to.equal(safeToken)
      expect(await safeTokenLock.COOLDOWN_PERIOD()).to.equal(getDeploymentParameters().cooldownPeriod)
    })

    it('Should not deploy with zero address', async function () {
      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      const { initialOwner, cooldownPeriod } = getDeploymentParameters()
      await expect(SafeTokenLock.deploy(initialOwner, ZeroAddress, cooldownPeriod)).to.be.revertedWithCustomError(
        SafeTokenLock,
        'InvalidSafeTokenAddress()',
      )
    })

    it('Should not deploy with zero cooldown period', async function () {
      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      const { initialOwner, safeToken } = getDeploymentParameters()
      await expect(SafeTokenLock.deploy(initialOwner, safeToken, 0)).to.be.revertedWithCustomError(SafeTokenLock, 'InvalidCooldownPeriod()')
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
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)
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
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(totalTokensToLock)
    })

    it('Should be possible to lock all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
      // This test checks the whether `uint96` is enough to hold all possible locked Safe token.
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = await safeToken.totalSupply()

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Checking Locked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)
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

      // Calculating expected maturesAt timestamp
      const currentTimestamp = await timestamp()
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const expectedMaturesAt = currentTimestamp + cooldownPeriod

      // Checking Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock - tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUnlock(alice, 0)).maturesAt).to.equal(expectedMaturesAt)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)
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

        // Calculating expected maturesAt timestamp
        const expectedMaturesAt = (await timestamp()) + cooldownPeriod

        // Checking Locked & Unlocked Token details
        expect((await safeTokenLock.getUser(alice)).locked).to.equal(currentLocked - tokenToUnlock)
        expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(currentUnlocked + tokenToUnlock)
        expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
        expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(index + 1)
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(expectedMaturesAt)
        currentLocked = (await safeTokenLock.getUser(alice)).locked
        currentUnlocked = (await safeTokenLock.getUser(alice)).unlocked
      }

      // Checking Final Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock * BigInt(index))
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(index)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)
    })

    it('Should be possible to unlock all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const totalSupply = await safeToken.totalSupply()
      const tokenToLock = totalSupply
      const tokenToUnlock = totalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      const unlockTransaction = await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Calculating expected maturesAt timestamp
      const { timestamp: unlockTimestamp } = (await unlockTransaction.getBlock())!
      const cooldownPeriod = await safeTokenLock.COOLDOWN_PERIOD()
      const expectedMaturesAt = BigInt(unlockTimestamp) + cooldownPeriod

      // Checking Locked & Unlocked Token details
      expect((await safeTokenLock.getUser(alice)).locked).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlocked).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUser(alice)).unlockStart).to.equal(0)
      expect((await safeTokenLock.getUser(alice)).unlockEnd).to.equal(1)
      expect((await safeTokenLock.getUnlock(alice, 0)).amount).to.equal(tokenToUnlock)
      expect((await safeTokenLock.getUnlock(alice, 0)).maturesAt).to.equal(expectedMaturesAt)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToUnlock)
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

    it('Should allow the same unlock index for two different users with two different locked and unlocked amount', async function () {
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

      // Unlocking tokens of Alice & calculating expected maturesAt timestamp
      await safeTokenLock.connect(alice).unlock(tokenToUnlockAlice)
      const currentTimestampAlice = await timestamp()
      const expectedMaturesAtAlice = currentTimestampAlice + cooldownPeriod

      // Unlocking tokens of Bob & calculating expected maturesAt timestamp
      await safeTokenLock.connect(bob).unlock(tokenToUnlockBob)
      const currentTimestampBob = await timestamp()
      const expectedMaturesAtBob = currentTimestampBob + cooldownPeriod

      // Checking Unlocked Token details of Alice and Bob
      expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlockAlice)
      expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(expectedMaturesAtAlice)
      expect((await safeTokenLock.getUnlock(bob, index)).amount).to.equal(tokenToUnlockBob)
      expect((await safeTokenLock.getUnlock(bob, index)).maturesAt).to.equal(expectedMaturesAtBob)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLockAlice)
      expect(await safeTokenLock.getUserTokenBalance(bob)).to.equal(tokenToLockBob)
    })

    it('Should allow multiple unlocks per transaction', async function () {
      // Note that we intentionally skip this test as it takes a very long time to run, and it is not particularly
      // interesting to check all the time but mostly to give an indication on how much total gas would be needed to hit
      // the `type(uint32).max` limit on unlocks for a single holder.
      this.skip()

      const { safeToken, safeTokenLock, tokenCollector } = await setupTests()

      const UnlockN = await ethers.getContractFactory('UnlockN')
      const unlockN = await UnlockN.deploy(safeTokenLock)

      // Transfer tokens to UnlockN contract
      await transferToken(safeToken, tokenCollector, unlockN, ethers.parseUnits('1', 18))

      // Locking tokens of UnlockN contract
      await unlockN.lockAll()

      // Multiple unlocks in a single transaction do not revert, up to a maximum of 1167 from the block gas limit.
      await expect(unlockN.unlock(1167, { gasLimit: 30e6 })).to.not.be.rejected
      await expect(unlockN.unlock(1168, { gasLimit: 30e6 })).to.be.rejected
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
      expect((await safeTokenLock.getUnlock(alice, 0)).maturesAt).to.equal(0)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(index))
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
      let maturesAt = (await safeTokenLock.getUnlock(alice, 5)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock * BigInt(6))
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
      let maturesAt = (await safeTokenLock.getUnlock(alice, 5)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }

      // Getting unlocked at timestamp and increasing timestamp
      maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(0)
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index / 2 - 1)).maturesAt
      await time.increaseTo(maturesAt) // Only unlocking half of the unlock operations

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index / 2 - 1)).maturesAt
      await time.increaseTo(maturesAt) // Only unlocking half of the unlock operations

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
        expect((await safeTokenLock.getUnlock(alice, index)).maturesAt).to.equal(0)
      }
      for (; index < 10; index++) {
        expect((await safeTokenLock.getUnlock(alice, index)).amount).to.equal(tokenToUnlock)
      }
    })

    it('Should be possible to withdraw all tokens', async function () {
      if (isForkedNetwork()) {
        this.skip()
      }
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const totalSupply = await safeToken.totalSupply()
      const tokenToLock = totalSupply
      const tokenToUnlock = totalSupply

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await safeTokenLock.connect(alice).lock(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Getting unlocked at timestamp and increasing timestamp
      const maturesAt = (await safeTokenLock.getUnlock(alice, 0)).maturesAt
      await time.increaseTo(maturesAt)

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
      expect((await safeTokenLock.getUnlock(alice, 0)).maturesAt).to.equal(0)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(0)
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
      const maturesAt = (await safeTokenLock.getUnlock(alice, 0)).maturesAt
      await time.increaseTo(maturesAt)

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
      const maturesAt = (await safeTokenLock.getUnlock(alice, index - 1)).maturesAt
      await time.increaseTo(maturesAt)

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
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)

      // Unlocking tokens
      await safeTokenLock.connect(alice).unlock(tokenToUnlock)

      // Checking Total Balance of User after Unlock (Locked: tokenToLock - tokenToUnlock, Unlocked: tokenToUnlock)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock)

      // Getting unlocked at timestamp and increasing timestamp
      const maturesAt = (await safeTokenLock.getUnlock(alice, 0)).maturesAt
      await time.increaseTo(maturesAt)

      // Withdrawing tokens
      await safeTokenLock.connect(alice).withdraw(0)

      // Checking Total Balance of User after Withdraw (Locked: tokenToLock - tokenToUnlock, Unlocked: 0)
      expect(await safeTokenLock.getUserTokenBalance(alice)).to.equal(tokenToLock - tokenToUnlock)
    })
  })

  describe('Token Rescue', function () {
    it('Should allow rescuing tokens other other than Safe token', async () => {
      const { safeToken, safeTokenLock, owner, alice } = await setupTests()
      const erc20 = await (await ethers.getContractFactory('TestERC20')).deploy('TEST', 'TEST')

      const amount = 1n
      await erc20.mint(safeTokenLock, amount)

      const aliceBalanceBefore = await erc20.balanceOf(alice)
      const contractBalanceBefore = await erc20.balanceOf(safeTokenLock)
      const contractSafeTokenBalanceBefore = await safeToken.balanceOf(safeTokenLock)

      await safeTokenLock.connect(owner).rescueToken(erc20, alice, amount)

      const aliceBalanceAfter = await erc20.balanceOf(alice)
      expect(aliceBalanceAfter).equals(aliceBalanceBefore + amount)

      const contractBalanceAfter = await erc20.balanceOf(safeTokenLock)
      expect(contractBalanceAfter).equals(contractBalanceBefore - amount)

      const contractSafeTokenBalanceAfter = await safeToken.balanceOf(safeTokenLock)
      expect(contractSafeTokenBalanceAfter).equals(contractSafeTokenBalanceBefore)
    })

    it('Should work with non-standard ERC20s', async () => {
      const { safeTokenLock, owner } = await setupTests()

      const TestNonStandardERC20 = await ethers.getContractFactory('TestNonStandardERC20')

      const erc20ReturnFalseOnFailure = await TestNonStandardERC20.deploy(0)
      const erc20ReturnNothingOnSuccess = await TestNonStandardERC20.deploy(1)

      await expect(safeTokenLock.connect(owner).rescueToken(erc20ReturnFalseOnFailure, owner, 1)).to.be.reverted
      await expect(safeTokenLock.connect(owner).rescueToken(erc20ReturnNothingOnSuccess, owner, 1)).to.not.be.reverted
    })

    it('Should not allow rescuing Safe token', async () => {
      const { safeToken, safeTokenLock, owner } = await setupTests()
      expect(safeTokenLock.connect(owner).rescueToken(safeToken, ZeroAddress, 0)).to.be.revertedWithCustomError(
        safeTokenLock,
        'CannotRescueSafeToken',
      )
    })

    it('Should not allow rescuing as non-owner', async () => {
      const { safeTokenLock, alice } = await setupTests()
      expect(safeTokenLock.connect(alice).rescueToken(ZeroAddress, ZeroAddress, 0))
        .to.be.revertedWithCustomError(safeTokenLock, 'OwnableUnauthorizedAccount')
        .withArgs(alice)
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
      const maturesAtT1 = (await safeTokenLock.getUnlock(alice, 0)).maturesAt
      await time.increaseTo(maturesAtT1)

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
      const maturesAtT2 = (await safeTokenLock.getUnlock(alice, 1)).maturesAt
      await time.increaseTo(maturesAtT2)

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
