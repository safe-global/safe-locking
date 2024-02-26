export function getDeploymentParameters() {
  const SAFE_FOUNDATION = '0x8CF60B289f8d31F737049B590b5E4285Ff0Bd1D1'
  const SAFE_TOKEN = '0x5aFE3855358E112B5647B952709E6165e1c1eEEe'
  const ONE_DAY = 24 * 60 * 60

  const { DEPLOYMENT_INITIAL_OWNER, DEPLOYMENT_SAFE_TOKEN, DEPLOYMENT_COOLDOWN_PERIOD } = process.env

  return {
    initialOwner: DEPLOYMENT_INITIAL_OWNER || SAFE_FOUNDATION,
    safeToken: DEPLOYMENT_SAFE_TOKEN || SAFE_TOKEN,
    cooldownPeriod: DEPLOYMENT_COOLDOWN_PERIOD || ONE_DAY,
  }
}
