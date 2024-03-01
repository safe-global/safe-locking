# SafeTokenLock Implementation Details

## Pseudocode

```solidity
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import { TokenRescuer } from './base/TokenRescuer.sol';
import { ISafeTokenLock } from './interfaces/ISafeTokenLock.sol';

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock, TokenRescuer {
  struct User {
    uint96 locked; // Contains the total locked token by a particular user.
    uint96 unlocked; // Contains the total unlocked token by a particular user.
    uint32 unlockStart; // Zero or ID of Oldest unlock operation created which is yet to be withdrawn.
    uint32 unlockEnd; // Next unlock Id = unlockEnd++
  }
  struct UnlockInfo {
    uint96 amount; // For 1 Billion Safe tokens, this is enough. 10 ** 27 < 2 ** 96
    uint64 maturesAt; // Valid for billions of years.
  }

  address public immutable SAFE_TOKEN; // = Safe token Address.
  uint64 public immutable COOLDOWN_PERIOD; // Contains the cooldown period.
  mapping(address => User) internal _users; // Contains the address => user info struct.
  mapping(uint32 => mapping(address => UnlockInfo)) internal _unlocks; // Contains the Unlock index => user => Unlock Info struct.

  constructor(address initialOwner, address safeToken, uint32 cooldownPeriod) Ownable(initialOwner) {
    /**
     * 1. Check if the total supply of the passed `safeToken` is greater than type(uint96).max, if yes, then revert.
     * 2. Ensure that the `cooldownPeriod` is not passed with zero value.
     * 3. Assign `safeToken` to `SAFE_TOKEN`.
     * 4. Assign `cooldownPeriod` to `COOLDOWN_PERIOD`.
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function lock(uint96 amount) external {
    /**
     * 1. Cautionary check that the `amount` > zero.
     * 2. `transferFrom` holder (Holder should `approve` in advance).
     * 3. Update the locked amount of that particular user in `_users[holder].locked`.
     * 4. Emit the Event.
     *
     * Gas Usage (major usage only): Token Transfer + SLOAD & SSTORE _users[holder] + Emit Event
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function unlock(uint96 amount) external returns (uint32 index) {
    /**
     * 1. Cautionary check that the `amount` > zero.
     * 2. Read the `_users[holder]` to `User memory user`.
     * 3. Check if the `user[holder].locked` >= `amount`.
     * 4. Assign `locked` as `user.locked - amount`.
     * 5. Assign `index` to `user.unlockEnd`.
     * 6. Assign `UnlockInfo` struct with details of `(amount, timestampOfUnlock`)` to `_unlocks[index][holder]`.
     * 4. Update the `_users[holder]` with (locked, user.unlocked + amount, user.unlockStart, index + 1).
     * 5. Emit the Event.
     *
     * Gas Usage (major usage only): SLOAD & STORE _users[holder] + SSTORE UnlockInfo + Emit Event
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
    /**
     * 1. Read the `_users[holder]` to `User memory user`.
     * 2. Based on the passed maxUnlocks, decide on the `withdrawEnd`.
     * 3. For i = `user.unlockStart`, i < `withdrawEnd`:
     *		3.1 Read `_unlocks[i][holder]` to `UnlockInfo memory unlockInfo`.
     * 		3.2 Check if `unlockInfo.maturesAt > block.timestamp`. If yes, break. Else continue:
     *			3.2.1 Add `unlockInfo.amount` to `amount`.
     *			3.2.2 Emit the event.
     *			3.2.3 Clear out unlocks[i][holder]
     * 4. If `amount` > 0:
     *		4.1 Update `_users[holder]` to `(locked as same, user.unlocked - amount, i, user.unlockEnd)`
     *		4.2 Transfer `amount` to `holder`.
     *
     * Gas Usage (major usage only): SLOAD _users[holder] + n SLOAD _unlocks[i][holder] + n Event Emits + n Zero assignment SSTORE _unlocks[i][holder] + SSTORE _users[holder] + Token Transfer
     * where n can be as high as max(`withdrawEnd - unlockStart`, `maxUnlocks`).
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function getUserTokenBalance(address holder) external returns (uint96 amount) {
    /**
     * Return the amount from `_users[holder].locked` + `_users[holder].unlocked`.
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function getUser(address holder) external view returns (User memory user) {
    /**
     * Return the `User` from `_users[holder]`.
     */
  }

  /**
   * @inheritdoc ISafeTokenLock
   */
  function getUnlock(address holder, uint32 index) external view returns (UnlockInfo memory unlockInfo) {
    /**
     * Return the `UnlockInfo` from ` _unlocks[index][holder]`.
     */
    unlockInfo = _unlocks[index][holder];
  }
}
```

## State Change Example

### Initial State

```solidity
_users[A] = (0, 0, 0, 0)
_users[B] = (0, 0, 0, 0)
_unlocks[0][A] = (0, 0)
_unlocks[1][A] = (0, 0)
_unlocks[2][A] = (0, 0)
_unlocks[0][B] = (0, 0)
_unlocks[1][B] = (0, 0)
```

### Operations

| User | Operation | Time | Amount | \_users[User]    | \_unlocks[index][User]                              | Note                                         |
| ---- | --------- | ---- | ------ | ---------------- | --------------------------------------------------- | -------------------------------------------- |
| A    | Lock      |      | 250    | (250, 0, 0, 0)   |                                                     |                                              |
| A    | Unlock    |      | 20     | (230, 20, 0, 1)  | \_unlocks[0][A] → (20, t1)                          |                                              |
| B    | Lock      |      | 20 0   | (200, 0, 0, 0)   |                                                     |                                              |
| A    | Unlock    |      | 50     | (180, 70, 0, 2)  | \_unlocks[1][A] → (50, t2)                          |                                              |
| B    | Unlock    |      | 35     | (165, 35, 0, 1)  | \_unlocks[0][B] → (35, t2)                          |                                              |
| A    | Unlock    |      | 70     | (110, 140, 0, 3) | \_unlocks[2][A] → (70, t2)                          |                                              |
| A    | Withdraw  | t1   |        | (110, 120, 1, 3) | \_unlocks[0][A] → (0, 0)                            |                                              |
| B    | Unlock    |      | 75     | (90, 110, 0, 2)  | \_unlocks[1][B] → (75, t3)                          |                                              |
| A    | Withdraw  | t2   |        | (110, 0, 3, 3)   | \_unlocks[2][A] → (0, 0) & \_unlocks[3][A] → (0, 0) | Here 2 withdraw happens, as time t2 reached. |
| B    | Withdraw  |      |        | (90, 75, 1, 2)   | \_unlocks[0][B] → (0, 0)                            |                                              |

### Final State

```solidity
_users[A] = (110, 0, 3, 3)
_users[B] = (90, 75, 1, 2)
_unlocks[0][A] = (0, 0)
_unlocks[1][A] = (0, 0)
_unlocks[2][A] = (0, 0)
_unlocks[0][B] = (0, 0)
_unlocks[1][B] = (75, t3)
```
