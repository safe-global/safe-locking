// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import {ISafeTokenLock} from "./interfaces/ISafeTokenLock.sol";
import {IRecoverERC20} from "./interfaces/IRecoverERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock, IRecoverERC20, Ownable2Step {
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

    constructor(address initialOwner, address _safeTokenAddress, uint32 _cooldownPeriod) Ownable(initialOwner) {
        if (_safeTokenAddress == address(0)) revert ZeroAddress();
        if (_cooldownPeriod == 0) revert ZeroValue();

        SAFE_TOKEN = IERC20(_safeTokenAddress); // Safe Token Contract Address
        COOLDOWN_PERIOD = _cooldownPeriod; // Cooldown period. Expected value to be passed is 30 days in seconds.
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

        User memory _user = users[msg.sender];
        if (_user.locked < amount) revert UnlockAmountExceeded();

        unlocks[_user.unlockEnd][msg.sender] = UnlockInfo(amount, uint64(block.timestamp) + COOLDOWN_PERIOD);
        users[msg.sender] = User(_user.locked - amount, _user.unlocked + amount, _user.unlockStart, _user.unlockEnd + 1);
        index = _user.unlockEnd;

        emit Unlocked(msg.sender, index, amount);
    }

    // @inheritdoc ISafeTokenLock
    function withdraw() external returns (uint96 amount) {}

    // @inheritdoc ISafeTokenLock
    function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {}

    // @inheritdoc ISafeTokenLock
    function totalBalance(address holder) external returns (uint96 amount) {}

    // @inheritdoc IRecoverERC20
    function recoverERC20(IERC20 token, uint256 amount) external override onlyOwner {
        if (token == SAFE_TOKEN) {
            revert CannotRecoverSafeToken();
        }
        token.transfer(msg.sender, amount);
    }
}
