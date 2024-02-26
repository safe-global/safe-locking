// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

/**
 * @title ISafeTokenLock - The Interface for the Safe Token Locking Contract.
 * @author @safe-global/safe-protocol
 * @dev The contract describes the function signature and events used in the Safe token locking contract.
 * @custom:security-contact bounty@safe.global
 */
interface ISafeTokenLock {
    /**
     * @notice Contains the user locked and unlocked token information, along with unlock indexes.
     * @param locked Contains the total locked token by a particular user.
     * @param unlocked Contains the total unlocked token by a particular user.
     * @param unlockStart Zero or ID of Oldest unlock operation created which is yet to be withdrawn.
     * @param unlockEnd Next unlock Id = unlockEnd++
     */
    struct User {
        uint96 locked;
        uint96 unlocked;
        uint32 unlockStart;
        uint32 unlockEnd;
    }

    // struct UnlockInfo containing the unlock amount and unlock time.
    /**
     * @notice Contains the unlock amount and unlock time.
     * @param amount The amount of tokens to be unlocked.
     * @param unlockedAt The time at which the tokens will be unlocked.
     * @dev For 1 Billion Safe Tokens, uint96 is enough. 10 ** 27 < 2 ** 96.
     *      uint64 is valid for billions of years.
     */
    struct UnlockInfo {
        uint96 amount;
        uint64 unlockedAt;
    }

    /**
     * @notice Emitted when tokens are locked.
     * @param holder The address of the user who locked the tokens.
     * @param amount The amount of tokens locked.
     */
    event Locked(address indexed holder, uint96 amount);

    /**
     * @notice Emitted when tokens are unlocked.
     * @param holder The address of the user who unlocked the tokens.
     * @param index The index of the unlock operation.
     * @param amount The amount of tokens unlocked.
     */
    event Unlocked(address indexed holder, uint32 indexed index, uint96 amount);

    /**
     * @notice Emitted when tokens are withdrawn.
     * @param holder The address of the user who withdrew the tokens.
     * @param index The index of the unlock operation which is withdrawn.
     * @param amount The amount of tokens withdrawn.
     */
    event Withdrawn(address indexed holder, uint32 indexed index, uint96 amount);

    /**
     * @notice Error indicating an attempt to use zero tokens when locking or unlocking.
     */
    error InvalidTokenAmount();

    /**
     * @notice Error indicating an attempt to unlock an amount greater than the holder's currently locked tokens.
     */
    error UnlockAmountExceeded();

    /* solhint-disable func-name-mixedcase */

    /**
     * @notice Gets the configured Safe token for locking contract.
     * @return safeToken The address of the Safe token.
     * @dev The Safe token address is immutable and does not change.
     */
    function SAFE_TOKEN() external view returns (address safeToken);

    /**
     * @notice Gets the configured cooldown period for locking contract.
     * @return cooldownPeriod The cooldown period in seconds.
     * @dev The cooldown period is immutable and does not change.
     */
    function COOLDOWN_PERIOD() external view returns (uint64 cooldownPeriod);

    /* solhint-enable func-name-mixedcase */

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
     * Gas Usage (major): SLOAD & SSTORE users[msg.sender] + SSTORE UnlockInfo + Emit Event
     */
    function unlock(uint96 amount) external returns (uint32 index);

    /**
     * @notice Withdraws the unlocked tokens of `maxUnlocks` oldest operations initiated by the caller.
     * @param maxUnlocks The number of unlock operations to be withdrawn.
     * @return amount The amount of tokens withdrawn.
     * @dev Calling this function with zero `maxUnlocks` will result in withdrawing all matured unlock operations.
     * Gas Usage (major usage only): SLOAD users[caller] + n SLOAD unlocks[i][caller] + n Event Emits
     * + n Zero assignment SSTORE unlocks[i][caller] + SSTORE users[caller] + Token Transfer
     * where n can be as high as max(`unlockEnd - unlockStart`, `maxUnlocks`).
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount);

    /**
     * @notice Returns the amount of Safe tokens associated to the specified holder.
     * @param holder The address of the holder.
     * @return amount The amount of (locked + to be unlocked + withdrawable) Safe tokens of the holder.
     */
    function userTokenBalance(address holder) external returns (uint96 amount);

    /**
     * @notice Returns user information for the specified address.
     * @param holder Address of the user.
     * @return user {User} struct containing information for the specified address.
     */
    function getUser(address holder) external view returns (User memory user);

    /**
     * @notice Returns unlock information for the specified user and index.
     * @param holder Address of the user.
     * @param index The index of the unlock.
     * @return unlockInfo {UnlockInfo} struct containing information about the unlock.
     */
    function getUnlock(address holder, uint32 index) external view returns (UnlockInfo memory unlockInfo);
}
