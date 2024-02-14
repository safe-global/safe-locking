// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(
        address initial_owner,
        address _safeTokenAddress,
        uint32 _cooldownPeriod
    ) SafeTokenLock(initial_owner, _safeTokenAddress, _cooldownPeriod) {}

    // harnessed getter function
    function getUser(address userAddress) external returns (User memory) {
        return users[userAddress];
    }

    function getUserUnlock(address userAddress, uint32 index) external returns (UnlockInfo memory) {
        return unlocks[index][userAddress];
    }

    function getStartAndEnd(address userAddress) external returns (uint32, uint32) {
        return (users[userAddress].unlockStart, users[userAddress].unlockEnd);
    }

    function getSafeTokenAddress() external view returns (address) {
        return address(SAFE_TOKEN);
    }
}
