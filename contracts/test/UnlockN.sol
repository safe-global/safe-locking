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
        unchecked {
            for (; n > 0; n--) {
                ISafeTokenLock(SAFE_TOKEN_LOCK).unlock(1);
            }
        }
    }
}
