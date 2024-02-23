// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(
        address _initialOwner,
        address _safeTokenAddress,
        uint32 _cooldownPeriod
    ) SafeTokenLock(_initialOwner, _safeTokenAddress, _cooldownPeriod) {}

    // harnessed getter function
    function getStartAndEnd(address userAddress) external view returns (uint32, uint32) {
        return (users[userAddress].unlockStart, users[userAddress].unlockEnd);
    }

    function getSafeTokenAddress() external view returns (address) {
        return address(SAFE_TOKEN);
    }

    function getUserUnlockSum(address holder) external view returns (uint256 amount) {
        User memory user = users[holder];
        for (uint32 i = user.unlockStart; i < user.unlockEnd; i++) {
            UnlockInfo memory unlock = unlocks[i][holder];
            amount += unlock.amount;
        }
    }
}
