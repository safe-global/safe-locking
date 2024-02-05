import { expect } from 'chai'
import { deployments, ethers } from 'hardhat'
import { cooldownPeriod, getSafeToken, getSafeTokenLock, safeTokenTotalSupply } from './utils/setup'
import { transferToken } from './utils/execution'
import { ZeroAddress } from 'ethers'

describe('Lock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    const [deployer, owner, tokenCollector, alice, bob, carol] = await ethers.getSigners()

    const safeToken = await getSafeToken()
    await safeToken.unpause() // Tokens are initially paused in SafeToken
    await transferToken(safeToken, deployer, tokenCollector, safeTokenTotalSupply)

    const safeTokenLock = await getSafeTokenLock()
    return { safeToken, safeTokenLock, deployer, owner, tokenCollector, alice, bob, carol }
  })

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

    it('Should not deploy with zero address', async function () {
      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      const [owner] = await ethers.getSigners()
      await expect(SafeTokenLock.deploy(owner.address, ZeroAddress, cooldownPeriod)).to.be.revertedWithCustomError(
        SafeTokenLock,
        'ZeroAddress()',
      )
    })

    it('Should not deploy with zero cooldown period', async function () {
      const { safeToken } = await setupTests()
      const [owner] = await ethers.getSigners()

      const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
      await expect(SafeTokenLock.deploy(owner.address, safeToken, 0)).to.be.revertedWithCustomError(SafeTokenLock, 'ZeroValue()')
    })
  })

  describe('Locking', function () {
    it('Should lock tokens correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1', 20) // 100 tokens

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
    })

    it('Should not lock zero tokens', async function () {
      const { safeTokenLock, alice } = await setupTests()
      const tokenToLock = 0 // 0 tokens

      // Locking zero tokens
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWithCustomError(safeTokenLock, 'ZeroValue()')
    })

    it('Should not lock if token transfer is not approved', async function () {
      const { safeTokenLock, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1', 20) // 100 tokens

      // Locking tokens without approval
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWith('ERC20: insufficient allowance')
    })

    it('Should lock tokens correctly multiple times', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const totalTokensToLock = ethers.parseUnits('10', 20) // 1000 tokens
      const tokenToLock = ethers.parseUnits('2', 20) // 200 tokens

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, totalTokensToLock)
      let aliceTokenBalance = await safeToken.balanceOf(alice)
      expect(aliceTokenBalance).to.equal(totalTokensToLock)

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
    })

    it('Should be possible to lock all tokens', async function () {
      // This test checks the whether `uint96` is enough to hold all possible locked Safe Token.
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = safeTokenTotalSupply

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
    })

    it('Should not lock tokens without transferring token', async function () {
      const { safeToken, safeTokenLock, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1', 20) // 100 tokens

      // Approving without having any token balance.
      expect(await safeToken.balanceOf(alice)).to.equal(0)
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)

      // Locking tokens without transferring tokens
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
    })

    it('Should emit Locked event when tokens are locked correctly', async function () {
      const { safeToken, safeTokenLock, tokenCollector, alice } = await setupTests()
      const tokenToLock = ethers.parseUnits('1', 20) // 100 tokens

      // Transfer tokens to Alice
      await transferToken(safeToken, tokenCollector, alice, tokenToLock)
      expect(await safeToken.balanceOf(alice)).to.equal(tokenToLock)

      // Locking tokens
      await safeToken.connect(alice).approve(safeTokenLock, tokenToLock)
      await expect(safeTokenLock.connect(alice).lock(tokenToLock)).to.emit(safeTokenLock, 'Locked').withArgs(alice, tokenToLock)
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
      const { safeTokenLock, owner, safeToken } = await setupTests()
      expect(safeTokenLock.connect(owner).recoverERC20(safeToken, 0)).to.be.revertedWithCustomError(safeTokenLock, 'CannotRecoverSafeToken')
    })

    it('Should allow ERC20 recovery other than Safe token', async () => {
      const { safeTokenLock, owner } = await setupTests()
      const erc20 = await (await ethers.getContractFactory('TestERC20')).deploy('TEST', 'TEST')
      const balanceBefore = await erc20.balanceOf(owner)
      const amount = 1n

      await erc20.mint(safeTokenLock, amount)

      await safeTokenLock.connect(owner).recoverERC20(erc20, amount)

      const balanceAfter = await erc20.balanceOf(owner)
      expect(balanceAfter).equals(balanceBefore + amount)
    })
  })
})
