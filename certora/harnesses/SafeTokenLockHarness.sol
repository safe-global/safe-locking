// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {SafeTokenLock} from "../../contracts/locking/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address initialOwner, address safeTokenAddress, uint32 cooldownPeriod) SafeTokenLock(initialOwner, safeTokenAddress, cooldownPeriod) {}

    function getUnlockSum(address holder) external returns (uint256 amount) {
        User memory user = _users[holder];
        for (uint32 i = user.unlockStart; i < user.unlockEnd; i++) {
            UnlockInfo memory unlock = _unlocks[i][holder];
            // Use a wide integer instead of `uint96` so that we actually compute the full sum
            // without potential for overflows. Note that overflowing a `uint256` is not possible
            // here, as: `type(uint96).max * type(uint32).max` cannot overflow a `uint256`.
            amount += uint256(unlock.amount);
        }
    }

    function getMinUnlockAmount(address holder) external returns (uint256 amount) {
        amount = type(uint256).max;
        User memory user = _users[holder];
        for (uint32 i = user.unlockStart; i < user.unlockEnd; i++) {
            UnlockInfo memory unlock = _unlocks[i][holder];
            if (amount > uint256(unlock.amount)) {
                amount = uint256(unlock.amount);
            }
        }
    }

    function getLastUnlockTimestamp(address holder) external returns (int256 unlockTimestamp) {
        User memory user = _users[holder];
        for (uint32 i = user.unlockStart; i < user.unlockEnd; i++) {
            UnlockInfo memory unlock = _unlocks[i][holder];
            if (unlock.unlockedAt < COOLDOWN_PERIOD) {
                return -1;
            }
            int256 currentUnlockTimestamp = int256(uint256(unlock.unlockedAt - COOLDOWN_PERIOD));
            if (unlockTimestamp > currentUnlockTimestamp) {
                return -1;
            }
            unlockTimestamp = currentUnlockTimestamp;
        }
    }
}
