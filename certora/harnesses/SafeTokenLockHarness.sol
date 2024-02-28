// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0 <0.9.0;

import {SafeTokenLock} from "../../contracts/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) SafeTokenLock(initialOwner, safeToken, cooldownPeriod) {}

    function harnessGetUserUnlockSum(address holder) external returns (uint256 amount) {
        User memory user = _users[holder];
        for (uint32 i = user.unlockStart; i < user.unlockEnd; i++) {
            UnlockInfo memory unlock = _unlocks[i][holder];
            // Use a wide integer instead of `uint96` so that we actually compute the full sum
            // without potential for overflows. Note that overflowing a `uint256` is not possible
            // here, as: `type(uint96).max * type(uint32).max` cannot overflow a `uint256`.
            amount += uint256(unlock.amount);
        }
    }
}
