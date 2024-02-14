// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";
import {User} from "./libraries/User.sol";

/**
 * @title SafeTokenLock - A Locking Contract for Safe Tokens.
 * @author @safe-global/safe-protocol
 * @custom:security-contact bounty@safe.global
 */
contract SafeTokenLock is ISafeTokenLock, Ownable2Step {
    using User for User.Data;

    struct MemoryUser {
        uint256 locked;
        uint256 unlocked;
        uint256 unlockStart;
        uint256 unlockEnd;
    }
    struct UnlockInfo {
        uint256 amount; // For 1 Billion Safe Tokens, this is enough. 10 ** 27 < 2 ** 96
        uint64 unlockedAt; // Valid until Year: 2554.
    }

    /* solhint-disable var-name-mixedcase */
    IERC20 public immutable SAFE_TOKEN; // Safe Token Address.
    uint256 public immutable COOLDOWN_PERIOD; // Contains the cooldown period. Default will be 30 days.
    /* solhint-enable var-name-mixedcase */

    mapping(address => User.Data) private _users; // Contains the address => user info struct.
    mapping(uint256 => mapping(address => UnlockInfo)) public unlocks; // Contains the Unlock id => user => Unlock Info struct.

    /**
     * @notice Error indicating an attempt to use the zero address as Safe Token address.
     */
    error InvalidSafeTokenAddress();

    /**
     * @notice Error indicating an attempt to use zero as cooldown period value.
     */
    error InvalidCooldownPeriod();

    /**
     * @notice An error that indicates an attempt to transfer Safe tokens out of the contract using recovery mechanism.
     */
    error CannotRecoverSafeToken();

    /**
     * @notice Sets the immutables of the contract and the initial owner.
     * @param initialOwner Initial owner of the contract.
     * @param safeTokenAddress Address of the Safe token. Passing address(0) will revert with {InvalidSafeTokenAddress}.
     * @param cooldownPeriod A uint256 type indicating the minimum period in seconds after which Safe token withdrawal can be performed. Passing zero will revert with {InvalidTokenAmount}.
     */
    constructor(address initialOwner, address safeTokenAddress, uint256 cooldownPeriod) Ownable(initialOwner) {
        if (safeTokenAddress == address(0)) revert InvalidSafeTokenAddress();
        if (cooldownPeriod == 0) revert InvalidCooldownPeriod();

        SAFE_TOKEN = IERC20(safeTokenAddress); // Safe Token Contract Address
        COOLDOWN_PERIOD = cooldownPeriod; // Cooldown period. Expected value to be passed is 30 days in seconds.
    }

    function users(address holder) external view returns (MemoryUser memory user) {
        (user.locked, user.unlocked, user.unlockStart, user.unlockEnd) = _users[holder].unpack();
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function lock(uint256 amount) external {
        if (amount == 0) revert InvalidTokenAmount();
        SAFE_TOKEN.transferFrom(msg.sender, address(this), amount);

        _users[msg.sender] = _users[msg.sender].lock(amount);
        emit Locked(msg.sender, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function unlock(uint256 amount) external returns (uint256 index) {
        if (amount == 0) revert InvalidTokenAmount();

        (uint256 locked, uint256 unlocked, uint256 unlockStart, uint256 unlockEnd) = _users[msg.sender].unpack();
        if (locked < amount) revert UnlockAmountExceeded();

        unlocks[unlockEnd][msg.sender] = UnlockInfo(uint96(amount), uint64(block.timestamp + COOLDOWN_PERIOD));
        _users[msg.sender] = User.pack(locked - amount, unlocked + amount, unlockStart, unlockEnd + 1);
        index = unlockEnd;

        emit Unlocked(msg.sender, unlockEnd, amount);
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function withdraw(uint256 maxUnlocks) external returns (uint256 amount) {
        (uint256 locked, uint256 unlocked, uint256 index, uint256 unlockEnd) = _users[msg.sender].unpack();
        uint256 stop = unlockEnd > index + maxUnlocks && maxUnlocks != 0 ? index + maxUnlocks : unlockEnd;

        for (; index < stop; index++) {
            UnlockInfo memory unlockInfo = unlocks[index][msg.sender];
            if (unlockInfo.unlockedAt > block.timestamp) break;

            amount += unlockInfo.amount;
            emit Withdrawn(msg.sender, index, unlockInfo.amount);
            delete unlocks[index][msg.sender];
        }

        if (amount > 0) {
            _users[msg.sender] = User.pack(locked, unlocked - amount, index, unlockEnd);
            SAFE_TOKEN.transfer(msg.sender, amount);
        }
    }

    /**
     * @inheritdoc ISafeTokenLock
     */
    function totalBalance(address holder) external view returns (uint256 amount) {
        (uint256 locked, uint256 unlocked, , ) = _users[holder].unpack();
        return locked + unlocked;
    }

    /**
     * @dev Transfers the specified amount of tokens from the contract to the owner. Only the owner can call this function.
     * @param token Address of the token to be recovered. The function will revert with {CannotRecoverSafeToken} in case `token` is {SAFE_TOKEN}.
     * @param amount The amount of tokens to transfer.
     */
    function recoverERC20(IERC20 token, uint256 amount) external onlyOwner {
        if (token == SAFE_TOKEN) revert CannotRecoverSafeToken();
        token.transfer(msg.sender, amount);
    }
}
