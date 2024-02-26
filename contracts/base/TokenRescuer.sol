// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TokenRescuer - Rescuing accidentally transferred ERC20 tokens.
 * @author @safe-global/safe-protocol
 * @custom:security-contact bounty@safe.global
 */
abstract contract TokenRescuer is Ownable2Step {
    using SafeERC20 for IERC20;

    /**
     * @dev Hook that gets called before rescuing a token.
     * @param token Token that should be rescued.
     * @param beneficiary The account that should receive the tokens.
     * @param amount Amount of tokens that should be rescued.
     */
    function _beforeTokenRescue(address token, address beneficiary, uint256 amount) internal virtual {}

    /**
     * @notice Rescues the specified `amount` of `tokens` to `beneficiary`. Can only be called by the {owner}.
     * @param token Token that should be rescued.
     * @param beneficiary The account that should receive the tokens.
     * @param amount Amount of tokens that should be rescued.
     */
    function rescueToken(address token, address beneficiary, uint256 amount) external onlyOwner {
        _beforeTokenRescue(token, beneficiary, amount);
        IERC20(token).safeTransfer(beneficiary, amount);
    }
}
