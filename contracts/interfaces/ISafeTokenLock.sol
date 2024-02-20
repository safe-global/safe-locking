// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

/**
 * @title ISafeTokenLock - The Interface for the Safe Token Locking Contract.
 * @author @safe-global/safe-protocol
 * @dev The contract describes the function signature and events used in the Safe token locking contract.
 * @custom:security-contact bounty@safe.global
 */
interface ISafeTokenLock {
    struct User {
        uint96 locked; // Contains the total locked token by a particular user.
        uint96 unlocked; // Contains the total unlocked token by a particular user.
        uint32 unlockStart; // Zero or ID of Oldest unlock operation created which is yet to be withdrawn.
        uint32 unlockEnd; // Next unlock Id = unlockEnd++
    }
    struct UnlockInfo {
        uint96 amount; // For 1 Billion Safe Tokens, this is enough. 10 ** 27 < 2 ** 96
        uint64 unlockedAt; // Valid until Year: 2554.
    }

    event Locked(address indexed holder, uint96 amount);
    event Unlocked(address indexed holder, uint32 indexed index, uint96 amount);
    event Withdrawn(address indexed holder, uint32 indexed index, uint96 amount);

    /**
     * @notice Error indicating an attempt to use zero tokens when locking or unlocking.
     */
    error InvalidTokenAmount();

    /**
     * @notice Error indicating an attempt to unlock an amount greater than the holder's currently locked tokens.
     */
    error UnlockAmountExceeded();

    /**
     * @notice Locks the specified amount of tokens.
     * @param amount The amount of tokens to lock. The function will revert with {InvalidTokenAmount} in case `amount` is 0.
     * @dev Safe Token Supply = 1 Billion with 18 decimals which is < 2 ** 96
     * Does not allow locking zero tokens.
     * Gas Usage (major): Token Transfer + SLOAD & SSTORE users[msg.sender] + Emit Event
     */
    function lock(uint96 amount) external;

    /**
     * @notice Unlocks the specified amount of tokens.
     * @param amount The amount of tokens to lock. The function will revert with custom error {InvalidTokenAmount} in case `amount` is 0.
     *               The function will revert with custom error {UnlockAmountExceeded} in case `amount` is greater than the locked amount.
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

    /**
     * @dev A view function that returns information in the form of User struct.
     * @param holder Address of the user.
     * @return user User struct containing information of current.
     */
    function getUser(address holder) external view returns (User memory user);

    /**
     * @dev A view function that returns the unlock information.
     * @param holder Address of the user.
     * @param index A uint32 type indicating the unlock index for the given user address.
     * @return unlockInfo UnlockInfo struct containing information about the unlock.
     */
    function getUnlock(address holder, uint32 index) external view returns (UnlockInfo memory unlockInfo);
}
