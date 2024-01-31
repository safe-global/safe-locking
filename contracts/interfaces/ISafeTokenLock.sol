// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

/**
 * @title ISafeTokenLock - An interface of the SafeTokenLock Contract.
 * @author @safe-global/safe-protocol
 * @dev The contract describes the function signature and events used in the Safe Token Lock Contract.
 */
interface ISafeTokenLock {
    event Locked(address indexed holder, uint96 amount);
    event Unlocked(address indexed holder, uint32 indexed index, uint96 amount);
    event Withdrawn(address indexed holder, uint32 indexed index, uint96 amount);

    /**
     * @notice Locks the specified amount of tokens.
     * @param amount The amount of tokens to lock.
     */
    function lock(uint96 amount) external;

    /**
     * @notice Unlocks the specified amount of tokens.
     * @param amount The amount of tokens to unlock.
     * @return index The index of the unlock operation.
     */
    function unlock(uint96 amount) external returns (uint32 index);

    /**
     * @notice Withdraws the unlocked tokens of all unlock operations initiated by the caller.
     * @return amount The amount of tokens withdrawn.
     */
    function withdraw() external returns (uint96 amount);

    /**
     * @notice Withdraws the unlocked tokens of `maxUnlocks` oldest operations initiated by the caller.
     * @param maxUnlocks The number of unlock operations to be withdrawn.
     * @return amount The amount of tokens withdrawn.
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount);

    /**
     * @notice Returns the amount of tokens associated to the specified holder.
     * @param holder The address of the holder.
     * @return amount The amount of (locked + to be unlocked + withdrawable) tokens of the holder.
     */
    function totalBalance(address holder) external returns (uint96 amount);
}
