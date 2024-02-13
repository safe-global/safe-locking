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

    /*
     * @notice Error indicating an attempt to use zero tokens when locking or unlocking.
     */
    error InvalidTokenAmount();

    /*
     * @notice Error indicating an attempt to unlock an amount greater than the holder's currently locked tokens.
     */
    error UnlockAmountExceeded();

    /**
     * @notice Locks the specified amount of tokens.
     * @param amount The amount of tokens to lock. The function will revert with {InvalidTokenAmount} in case amount is 0.
     * @dev Safe Token Supply = 1 Billion with 18 decimals which is < 2 ** 96
     * Does not allow locking zero tokens.
     * Gas Usage (major): Token Transfer + SLOAD & SSTORE users[msg.sender] + Emit Event
     */
    function lock(uint96 amount) external;

    /**
     * @notice Unlocks the specified amount of tokens.
     * @param amount The amount of tokens to lock. The function will revert with custom error InvalidTokenAmount() in case amount is 0.
     *               The function will revert with custom error UnlockAmountExceeded() in case amount is greater than the locked amount.
     * @return index The index of the unlock operation.
     * @dev Does not allow unlocking zero tokens.
     * Gas Usage (major): SLOAD & SSTORE users[msg.sender] + SLOAD COOLDOWN_PERIOD + SSTORE UnlockInfo + Emit Event
     */
    function unlock(uint96 amount) external returns (uint32 index);

    /**
     * @notice Withdraws the unlocked tokens of `maxUnlocks` oldest operations initiated by the caller.
     * @param maxUnlocks The number of unlock operations to be withdrawn.
     * @return amount The amount of tokens withdrawn.
     * @dev Calling this function with zero `maxUnlocks` will result in withdrawing all matured unlock operations.
     * Gas Usage (major usage only): SLOAD users[caller] + n SLOAD unlocks[i][caller] + n Event Emits
     * + n Zero assignment SSTORE unlocks[i][caller] + SSTORE users[caller] + SLOAD SAFE_TOKEN + Token Transfer
     * where n can be as high as max(`unlockEnd - unlockStart`, `maxUnlocks`).
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount);

    /**
     * @notice Returns the amount of tokens associated to the specified holder.
     * @param holder The address of the holder.
     * @return amount The amount of (locked + to be unlocked + withdrawable) tokens of the holder.
     */
    function totalBalance(address holder) external returns (uint96 amount);
}
