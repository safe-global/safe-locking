// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IRecoverERC20
 * @author @safe-global/safe-protocol
 * @dev This interface defines function and event for recovering ERC20 tokens from a contract.
 */
interface IRecoverERC20 {
    event RecoveredERC20(IERC20 token, uint256 amount);

    /**
     * @notice Function to recover ERC20 tokens from a contract.
     * @dev Developers should apply additional checks such as only owner can call this function as per application.
     * @param token Address of the token to be transferred.
     * @param amount Amount of tokens to be transferred.
     */
    function recoverERC20(IERC20 token, uint256 amount) external;
}
