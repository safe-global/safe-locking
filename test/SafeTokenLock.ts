import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers'
import { expect } from 'chai'
import { ethers } from 'hardhat'

describe('Lock', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    const SafeTokenLock = await ethers.getContractFactory('SafeTokenLock')
    const safeTokenLock = await SafeTokenLock.deploy()
    return { safeTokenLock }
  }

  describe('Deployment', function () {
    it('Should deploy', async function () {
      const { safeTokenLock } = await loadFixture(deployFixture)

      expect(safeTokenLock).to.exist
    })
  })
})
