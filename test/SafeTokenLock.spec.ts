import { expect } from 'chai'
import { deployments } from 'hardhat'
import { getSafeTokenLock } from './utils/setup'

describe('Lock', function () {
  const setupTests = deployments.createFixture(async ({ deployments }) => {
    await deployments.fixture()
    const safeTokenLock = await getSafeTokenLock()
    return { safeTokenLock }
  })

  describe('Deployment', function () {
    it('Should deploy', async function () {
      const { safeTokenLock } = await setupTests()

      expect(safeTokenLock).to.exist
    })
  })
})
