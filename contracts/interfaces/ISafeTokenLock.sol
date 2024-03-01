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
     * @notice Contains the user locked and unlocked token information, along with pending unlock indexes.
     * @param locked The total locked token amount for the user.
     * @param unlocked The total unlocked token amount for the user.
     * @param unlockStart The index of the first pending unlock for the user.
     * @param unlockEnd The end index of the pending unlocks.
     * @dev Note that `unlockEnd` does not correspond to an index of a pending unlock but instead the index of the next unlock to be added.
     *      Thus, `unlockStart == unlockEnd` implies that the user has no pending unlocks.
     */
    struct User {
        uint96 locked;
        uint96 unlocked;
        uint32 unlockStart;
        uint32 unlockEnd;
    }

    /**
     * @notice Contains information associated with a pending unlock.
     * @param amount The amount of tokens for the unlock.
     * @param maturesAt The timestamp the unlock will mature at, and become available for withdrawal.
     * @dev For total supply of Safe tokens (1 billion), {uint96} is enough: `10 ** 27 < 2 ** 96`.
     *      {uint64} is valid for billions of years.
     */
    struct UnlockInfo {
        uint96 amount;
        uint64 maturesAt;
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
     * @param index The index of the unlock operation which was withdrawn.
     * @param amount The amount of withdrawn tokens.
     */
    event Withdrawn(address indexed holder, uint32 indexed index, uint96 amount);

    /**
     * @notice Error indicating an attempt to lock or unlock with an amount of zero.
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
     * @param amount The amount of tokens to lock. The function will revert with {InvalidTokenAmount} in case `amount` is zero.
     */
    function lock(uint96 amount) external;

    /**
     * @notice Unlocks the specified amount of tokens.
     * @param amount The amount of tokens to lock. The function will revert with custom error {InvalidTokenAmount} in case `amount` is zero.
     *               The function will revert with custom error {UnlockAmountExceeded} in case `amount` is greater than the locked amount.
     * @return index The index of the unlock operation.
     */
    function unlock(uint96 amount) external returns (uint32 index);

    /**
     * @notice Withdraws the unlocked tokens of `maxUnlocks` oldest operations initiated by the caller.
     * @param maxUnlocks The maximum number of unlock operations to be withdrawn, or zero to process all unlocks.
     *                   Will not revert if `maxUnlocks` is greater than the number of matured unlocks, and will only withdraw the matured unlocks.
     * @return amount The amount of tokens withdrawn.
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount);

    /**
     * @notice Returns the amount of Safe tokens associated to the specified holder.
     * @param holder The address of the holder.
     * @return amount The amount of (locked + to be unlocked + withdrawable) Safe tokens of the holder.
     */
    function getUserTokenBalance(address holder) external view returns (uint96 amount);

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
