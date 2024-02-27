// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.0 <0.9.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ISafeTokenLock} from "../interfaces/ISafeTokenLock.sol";

contract UnlockN {
    address public immutable SAFE_TOKEN_LOCK;

    constructor(address safeTokenLock) {
        SAFE_TOKEN_LOCK = safeTokenLock;
    }

    function lockAll() external {
        ISafeTokenLock safeTokenLock = ISafeTokenLock(SAFE_TOKEN_LOCK);
        IERC20 safeToken = IERC20(safeTokenLock.SAFE_TOKEN());

        uint256 amount = safeToken.balanceOf(address(this));
        safeToken.approve(address(safeTokenLock), amount);
        safeTokenLock.lock(uint96(amount));
    }

    function unlock(uint256 n) external {
        ISafeTokenLock safeTokenLock = ISafeTokenLock(SAFE_TOKEN_LOCK);
        bytes4 unlockSelector = safeTokenLock.unlock.selector;

        // Highly optimized call loop to squeeze out every last unlock possible.
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(0, unlockSelector)
            mstore(4, 1)
            for {

            } gt(n, 0) {
                n := sub(n, 1)
            } {
                pop(call(gas(), safeTokenLock, 0, 0, 0x24, 0, 0))
            }
        }
    }
}
