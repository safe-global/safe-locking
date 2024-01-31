// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock {
    // @inheritdoc ISafeTokenLock
    function lock(uint96 amount) external {}

    // @inheritdoc ISafeTokenLock
    function unlock(uint96 amount) external returns (uint32 index) {}

    // @inheritdoc ISafeTokenLock
    function withdraw() external returns (uint96 amount) {}

    // @inheritdoc ISafeTokenLock
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {}

    // @inheritdoc ISafeTokenLock
    function totalBalance(address holder) external returns (uint96 amount) {}
}
