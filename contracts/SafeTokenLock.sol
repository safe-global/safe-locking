// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock {
    // @inheritdoc ISafeTokenLock
    function lock(uint256 amount) external {}

    // @inheritdoc ISafeTokenLock
    function unlock(uint256 amount) external returns (uint256 id) {}

    // @inheritdoc ISafeTokenLock
    function withdraw() external returns (uint256 amount) {}

    // @inheritdoc ISafeTokenLock
    function withdraw(uint256 maxUnlocks) external returns (uint256 amount) {}

    // @inheritdoc ISafeTokenLock
    function totalBalance(address holder) external returns (uint256 amount) {}
}
