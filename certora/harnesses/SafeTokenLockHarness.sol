// SPDX-License-Identifier: LGPL-3.0-only
import {SafeTokenLock} from "../munged/SafeTokenLock.sol";

contract SafeTokenLockHarness is SafeTokenLock {
    constructor(address _safeTokenAddress, uint32 _cooldownPeriod) SafeTokenLock(_safeTokenAddress, _cooldownPeriod) {}
}
