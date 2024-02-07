// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock, Ownable2Step {
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

    /* solhint-disable var-name-mixedcase */
    IERC20 public immutable SAFE_TOKEN; // Safe Token Address.
    uint64 public immutable COOLDOWN_PERIOD; // Contains the cooldown period. Default will be 30 days.

    /* solhint-enable var-name-mixedcase */
    mapping(address => User) public users; // Contains the address => user info struct.
    mapping(uint32 => mapping(address => UnlockInfo)) public unlocks; // Contains the Unlock id => user => Unlock Info struct.

    error ZeroAddress();
    error ZeroValue();
    error UnlockAmountExceeded();
    error CannotRecoverSafeToken();

    constructor(address initialOwner, address safeTokenAddress, uint32 cooldownPeriod) Ownable(initialOwner) {
        if (safeTokenAddress == address(0)) revert ZeroAddress();
        if (cooldownPeriod == 0) revert ZeroValue();

        SAFE_TOKEN = IERC20(safeTokenAddress); // Safe Token Contract Address
        COOLDOWN_PERIOD = cooldownPeriod; // Cooldown period. Expected value to be passed is 30 days in seconds.
    }

    // @inheritdoc ISafeTokenLock
    function lock(uint96 amount) external {
        if (amount == 0) revert ZeroValue();
        SAFE_TOKEN.transferFrom(msg.sender, address(this), amount);

        users[msg.sender].locked += amount;
        emit Locked(msg.sender, amount);
    }

    // @inheritdoc ISafeTokenLock
    function unlock(uint96 amount) external returns (uint32 index) {
        if (amount == 0) revert ZeroValue();

        User memory user = users[msg.sender];
        if (user.locked < amount) revert UnlockAmountExceeded();

        unlocks[user.unlockEnd][msg.sender] = UnlockInfo(amount, uint64(block.timestamp) + COOLDOWN_PERIOD);
        users[msg.sender] = User(user.locked - amount, user.unlocked + amount, user.unlockStart, user.unlockEnd + 1);
        index = user.unlockEnd;

        emit Unlocked(msg.sender, index, amount);
    }

    function _withdraw(uint32 maxUnlocks) internal returns (uint96 amount) {
        User memory user = users[msg.sender];
        uint32 unlockEnd = user.unlockEnd > maxUnlocks && maxUnlocks != 0 ? maxUnlocks : user.unlockEnd;
        uint32 index = user.unlockStart;

        for (; index < unlockEnd; index++) {
            UnlockInfo memory unlockInfo = unlocks[index][msg.sender];
            if (unlockInfo.unlockedAt > block.timestamp) break;

            amount += unlockInfo.amount;
            emit Withdrawn(msg.sender, index, unlockInfo.amount);
            delete unlocks[index][msg.sender];
        }

        if (amount > 0) {
            users[msg.sender] = User(user.locked, user.unlocked - amount, index, user.unlockEnd);
            SAFE_TOKEN.transfer(msg.sender, uint256(amount));
        }
    }

    // @inheritdoc ISafeTokenLock
    function withdraw() external returns (uint96 amount) {
        amount = _withdraw(0);
    }

    // @inheritdoc ISafeTokenLock
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
        if (maxUnlocks == 0) revert ZeroValue();
        amount = _withdraw(maxUnlocks);
    }

    // @inheritdoc ISafeTokenLock
    function totalBalance(address holder) external returns (uint96 amount) {}

    // @inheritdoc IRecoverERC20
    function recoverERC20(IERC20 token, uint256 amount) external onlyOwner {
        if (token == SAFE_TOKEN) revert CannotRecoverSafeToken();
        token.transfer(msg.sender, amount);
    }
}
