// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) SafeTokenLock(initialOwner, safeToken, cooldownPeriod) {}

    // harnessed getter function
    function getStartAndEnd(address userAddress) external returns (uint32, uint32) {
        return (_users[userAddress].unlockStart, _users[userAddress].unlockEnd);
    }
}
