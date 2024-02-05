// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(
        address _initialOwner,
        address _safeTokenAddress,
        uint32 _cooldownPeriod
    ) SafeTokenLock(_initialOwner, _safeTokenAddress, _cooldownPeriod) {}
}
