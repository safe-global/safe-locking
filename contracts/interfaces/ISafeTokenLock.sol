// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

/**
 * @title ISafeTokenLock - An interface of the SafeTokenLock Contract.
 * @author @safe-global/safe-protocol
 * @dev The contract describes the function signature and events used in the Safe Token Lock Contract.
 */
interface ISafeTokenLock {
    event Locked(address indexed holder, uint256 amount);
    event Unlocked(address indexed holder, uint256 indexed id, uint256 amount);
    event Withdrawn(address indexed holder, uint256 indexed id, address beneficiary, uint256 amount);

    /**
     * @notice Locks the specified amount of tokens.
     * @param amount The amount of tokens to lock.
     * @dev Safe Token Supply = 1 Billion with 18 decimals which is < 2 ** 96
     * Gas Usage (major): Token Transfer + SLOAD & SSTORE users[msg.sender] + Emit Event
     */
    function lock(uint256 amount) external;

    /**
     * @notice Unlocks the specified amount of tokens.
     * @param amount The amount of tokens to unlock.
     * @return id The id of the unlock operation.
     */
    function unlock(uint256 amount) external returns (uint256 id);

    /**
     * @notice Withdraws the unlocked tokens of all unlock operations initiated by the caller.
     */
    function withdraw() external;

    /**
     * @notice Withdraws the unlocked tokens of `maxUnlocks` oldest operations initiated by the caller.
     * @param maxUnlocks The number of unlock operations to be withdrawn.
     */
    function withdraw(uint256 maxUnlocks) external;

    /**
     * @notice Returns the amount of tokens associated to the specified holder.
     * @param holder The address of the holder.
     * @return amount The amount of (locked + to be unlocked + withdrawable) tokens of the holder.
     */
    function totalBalance(address holder) external returns (uint256 amount);

    /**
     * @notice Returns the timestamp & amount of tokens of a particular id getting unlocked.
     * @param id The id of the unlock operation.
     * @return maturesAtTimestamp The timestamp at which the tokens will mature.
     * @return amount The amount of tokens locked by the holder.
     */
    function unlockStatus(uint256 id) external returns (uint256 maturesAtTimestamp, uint256 amount);
}
