// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0 <0.9.0;

import {SafeTokenLock} from "../../contracts/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) SafeTokenLock(initialOwner, safeToken, cooldownPeriod) {}

    function getStartAndEnd(address userAddress) external view returns (uint32, uint32) {
        return (_users[userAddress].unlockStart, _users[userAddress].unlockEnd);
    }
}
