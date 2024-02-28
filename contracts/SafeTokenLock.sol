// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TokenRescuer} from "./base/TokenRescuer.sol";
import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";

/**
 * @title SafeTokenLock - A Locking Contract for Safe Tokens.
 * @author @safe-global/safe-protocol
 * @custom:security-contact bounty@safe.global
 */
contract SafeTokenLock is ISafeTokenLock, TokenRescuer {
    /**
     * @notice Error indicating an attempt to use the zero {address} as Safe token address.
     */
    error InvalidSafeTokenAddress();

    /**
     * @notice Error indicating an attempt to use zero as cooldown period value.
     */
    error InvalidCooldownPeriod();

    /**
     * @notice Error indicating an attempt to transfer Safe tokens out of the contract using the rescue mechanism.
     */
    error CannotRescueSafeToken();

    /**
     * @inheritdoc ISafeTokenLock
     */
    address public immutable SAFE_TOKEN;

    /**
     * @inheritdoc ISafeTokenLock
     */
    uint64 public immutable COOLDOWN_PERIOD;

    /**
     * @dev A mapping from a `holder` to its {User} data.
     */
    mapping(address holder => User) internal _users;

    /**
     * @dev A mapping from an unlock `index` and its `holder` to the {UnlockInfo}.
     *      The inner-most mapping is on the `holder` {address}, ensuring that the storage is associated with the `holder` and allows the unlock information to be read during user operation validation in the context of ERC-4337.
     */
    mapping(uint32 index => mapping(address holder => UnlockInfo)) internal _unlocks;

    /**
     * @notice Creates a new instance of the Safe token locking contract.
     * @param initialOwner Initial owner of the contract.
     * @param safeToken Address of the Safe token. Passing the zero {address} will revert with {InvalidSafeTokenAddress}.
     * @param cooldownPeriod The minimum period in seconds after which Safe token withdrawal can be performed. Passing zero will revert with {InvalidTokenAmount}.
     */
    constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) Ownable(initialOwner) {
        if (safeToken == address(0)) revert InvalidSafeTokenAddress();
        if (cooldownPeriod == 0) revert InvalidCooldownPeriod();

        SAFE_TOKEN = safeToken;
        COOLDOWN_PERIOD = cooldownPeriod;
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function lock(uint96 amount) external {
        if (amount == 0) revert InvalidTokenAmount();
        IERC20(SAFE_TOKEN).transferFrom(msg.sender, address(this), amount);

        _users[msg.sender].locked += amount;
        emit Locked(msg.sender, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function unlock(uint96 amount) external returns (uint32 index) {
        if (amount == 0) revert InvalidTokenAmount();

        User memory user = _users[msg.sender];
        if (user.locked < amount) revert UnlockAmountExceeded();

        index = user.unlockEnd;

        // Use unchecked math for computing the `maturesAt` timestamp for the unlock information.
        // This means that, in the case of overflows, we would create unlocks that immediately
        // mature, and allow tokens to be withdrawn before the intended time. However, since we use
        // a 64-bit timestamp, this can only happen for `maturesAt` values that would be greater
        // than 2**64, which is hundreds of billions of years in the future. Using unchecked math
        // here saves gas and code size, without any real downsides.
        unchecked {
            _unlocks[index][msg.sender] = UnlockInfo(amount, uint64(block.timestamp) + COOLDOWN_PERIOD);
        }

        // Note that it is possible here for `index + 1` to overflow and revert in the case where
        // `user.unlockEnd == type(uint32).max`. This means that after roughly 4 billion unlocks,
        // it is possible for funds to remain stuck in the locking contract. The amount of gas
        // required to perform 4 billion unlocks is prohibitively high, and we do not believe that
        // a user will realistically hit this limit.
        _users[msg.sender] = User(user.locked - amount, user.unlocked + amount, user.unlockStart, index + 1);

        emit Unlocked(msg.sender, index, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
        User memory user = _users[msg.sender];
        uint32 index = user.unlockStart;
        uint32 withdrawEnd = user.unlockEnd;
        if (maxUnlocks != 0 && withdrawEnd > uint256(index) + uint256(maxUnlocks)) {
            withdrawEnd = index + maxUnlocks;
        }

        for (; index < withdrawEnd; index++) {
            UnlockInfo memory unlockInfo = _unlocks[index][msg.sender];
            if (unlockInfo.maturesAt > block.timestamp) break;

            amount += unlockInfo.amount;
            emit Withdrawn(msg.sender, index, unlockInfo.amount);
            delete _unlocks[index][msg.sender];
        }

        // Note that we disallow 0 amount `unlock`s. This means that if amount is non-0, that we
        // withdrew at least one unlock; i.e. `amount > 0 == index > user.unlockStart`.
        if (amount > 0) {
            _users[msg.sender] = User(user.locked, user.unlocked - amount, index, user.unlockEnd);
            IERC20(SAFE_TOKEN).transfer(msg.sender, uint256(amount));
        }
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function getUserTokenBalance(address holder) external view returns (uint96 amount) {
        return _users[holder].locked + _users[holder].unlocked;
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function getUser(address holder) external view returns (User memory user) {
        user = _users[holder];
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function getUnlock(address holder, uint32 index) external view returns (UnlockInfo memory unlockInfo) {
        unlockInfo = _unlocks[index][holder];
    }

    /**
     * @inheritdoc TokenRescuer
     */
    function _beforeTokenRescue(address token, address beneficiary, uint256 amount) internal override {
        if (token == SAFE_TOKEN) revert CannotRescueSafeToken();
        TokenRescuer._beforeTokenRescue(token, beneficiary, amount);
    }
}
