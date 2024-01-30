import { expect } from 'chai'
import { deployments } from 'hardhat'
import { getSafeTokenLock, getSafeToken } from './utils/setup'

describe('Lock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()

    const safeTokenLock = await getSafeTokenLock()
    const safeToken = await getSafeToken()
    return { safeTokenLock, safeToken }
  })

  describe('Deployment', function () {
    it('Should deploy', async function () {
      const { safeTokenLock, safeToken } = await setupTests()

      expect(safeTokenLock).to.exist
      expect(await safeToken.decimals()).to.be.eq(18)
    })
  })
})
