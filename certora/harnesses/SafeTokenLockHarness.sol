// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address _safeTokenAddress, uint32 _cooldownPeriod) SafeTokenLock(_safeTokenAddress, _cooldownPeriod) {}

    // harnessed getter function
    function getUser(address userAddress) external returns (User memory) {
        return users[userAddress];
    }

    function getUserUnlock(address userAddress, uint32 index) external returns (UnlockInfo memory) {
        return unlocks[index][userAddress];
    }

    function getSafeTokenAddress() external view returns (address) {
        return address(SAFE_TOKEN);
    }
}
