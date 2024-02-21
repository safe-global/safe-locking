// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(
        address _initialOwner,
        address _safeTokenAddress,
        uint32 _cooldownPeriod
    ) SafeTokenLock(_initialOwner, _safeTokenAddress, _cooldownPeriod) {}

    // harnessed getter function
    function getStartAndEnd(address userAddress) external returns (uint32, uint32) {
        return (_users[userAddress].unlockStart, _users[userAddress].unlockEnd);
    }

    function getSafeTokenAddress() external view returns (address) {
        return address(SAFE_TOKEN);
    }
}
