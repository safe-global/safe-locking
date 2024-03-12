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
     * @notice Error indicating an attempt to use an invalid Safe token, whose {totalSupply} is greater than `type(uint96).max`.
     */
    error InvalidSafeToken();

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
     * @param safeToken Address of the Safe token. Passing it a token whose {totalSupply} is greater than `type(uint96).max` will revert with {InvalidSafeToken}.
     * @param cooldownPeriod The minimum period in seconds after which Safe token withdrawal can be performed. Passing zero will revert with {InvalidTokenAmount}.
     * @dev This contract uses {uint96} values for token amount accounting, meaning that the token's {totalSupply} must not overflow a {uint96}.
     *      This is checked by the constructor, but can be circumvented by inflationary tokens where the {totalSupply} can increase, which should not be used with this contract.
     *      Luckily the Safe token's {totalSupply} both fits in a {uint96} and is constant, meaning it works with this locking contract.
     */
    constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) Ownable(initialOwner) {
        if (IERC20(safeToken).totalSupply() > type(uint96).max) revert InvalidSafeToken();
        if (cooldownPeriod == 0) revert InvalidCooldownPeriod();

        SAFE_TOKEN = safeToken;
        COOLDOWN_PERIOD = cooldownPeriod;
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function lock(uint96 amount) external {
        if (amount == 0) revert InvalidTokenAmount();

        _users[msg.sender].locked += amount;

        IERC20(SAFE_TOKEN).transferFrom(msg.sender, address(this), amount);

        emit Locked(msg.sender, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function unlock(uint96 amount) external returns (uint32 index) {
        if (amount == 0) revert InvalidTokenAmount();

        User memory user = _users[msg.sender];
        if (user.locked < amount) revert UnlockAmountExceeded();

        // Use of unchecked math here is sound as we would have reverted if `user.locked < amount`,
        // meaning the following subtraction cannot overflow.
        uint96 locked;
        unchecked {
            locked = user.locked - amount;
        }

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
        _users[msg.sender] = User(locked, user.unlocked + amount, user.unlockStart, index + 1);

        emit Unlocked(msg.sender, index, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
        User memory user = _users[msg.sender];
        uint32 index = user.unlockStart;
        uint32 withdrawEnd = user.unlockEnd;

        // Use of unchecked math here is sound as:
        // 1. `uint256(index) + uint256(maxUnlocks)` cannot overflow a `uint256`, as both are 32-bit
        //    integers, and thus have a maximum value of `0xffffffff` individually, making the
        //    maximum value of their sum as `0x1fffffffe`.
        // 2. `index + maxUnlocks` cannot overflow a `uint32`, as this line is only called if the
        //    check that `uint256(withdrawEnd) > uint256(index) + uint256(maxUnlocks)` is true,
        //    which implies that the sum is less than `withdrawEnd`, which is itself a `uint32`.
        unchecked {
            if (maxUnlocks != 0 && uint256(withdrawEnd) > uint256(index) + uint256(maxUnlocks)) {
                withdrawEnd = index + maxUnlocks;
            }
        }

        for (; index < withdrawEnd; index++) {
            UnlockInfo memory unlockInfo = _unlocks[index][msg.sender];
            if (unlockInfo.maturesAt > block.timestamp) break;

            // This contract maintains the invariant that `user.unlocked == ∑ unlockInfo.amount`,
            // therefore, `amount + unlockInfo.amount<= user.unlocked` and, since `user.unlocked` is
            // a `uint96`, this sum cannot overflow a `uint96`.
            unchecked {
                amount += unlockInfo.amount;
            }
            emit Withdrawn(msg.sender, index, unlockInfo.amount);
            delete _unlocks[index][msg.sender];
        }

        // Note that we disallow 0 amount `unlock`s. This means that if amount is non-0, that we
        // withdrew at least one unlock; i.e. `amount > 0 == index > user.unlockStart`.
        if (amount > 0) {
            // This contract maintains the invariant that `user.unlocked == ∑ unlockInfo.amount`,
            // therefore, `amount <= user.unlocked` and this subtraction cannot overflow.
            unchecked {
                _users[msg.sender] = User(user.locked, user.unlocked - amount, index, user.unlockEnd);
            }
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
