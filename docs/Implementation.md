# SafeTokenLock Implementation Details

## Pseudocode

```solidity
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.23;

import { ISafeTokenLock } from './interfaces/ISafeTokenLock.sol';

/**
 * @title SafeTokenLock - A Locking Contract for the Safe Tokens.
 * @author @safe-global/safe-protocol
 */
contract SafeTokenLock is ISafeTokenLock {
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

  address public immutable SAFE_TOKEN; // = Safe Token Address.
  uint64 public immutable COOLDOWN_PERIOD; // Contains the cooldown period. Default will be 30 days.
  mapping(address => User) public users; // Contains the address => user info struct.
  mapping(uint32 => mapping(address => UnlockInfo)) public unlocks; // Contains the Unlock index => user => Unlock Info struct.

  constructor(address safeTokenAddress, uint32 cooldownPeriod) {
    SAFE_TOKEN = safeTokenAddress; // Safe Token Contract Address
    COOLDOWN_PERIOD = cooldownPeriod; // Cooldown period. Expected value to be passed is 30 days in seconds.
  }

  // @inheritdoc ISafeTokenLock
  function lock(uint96 amount) external {
    /**
        1. Cautionary check that the `amount` > zero
        2. `transferFrom` caller (Caller should `approve` in advance).
        3. Update the locked amount of that particular user in `users[caller].locked`.
        4. Emit the Event.

        Gas Usage (major usage only): Token Transfer + SLOAD users[caller] + SSTORE users[caller] + Emit Event
    */
  }

  // @inheritdoc ISafeTokenLock
  function unlock(uint96 amount) external returns (uint32 index) {
    /**
        1. Read the `users[caller]` to `User memory user`.
        2. Check if the `user[caller].locked` >= `amount`
        3. Assign `UnlockInfo` struct with details of `(amount, timestampOfUnlock`)` to `user[caller].unlockEnd` in `unlocks`.
        4. Update the `users[caller]` with (user[caller].locked - amount, user[caller].unlocked + amount, user[caller].unlockStart, user[caller].unlockEnd++).
        5. Emit the Event.

        Gas Usage (major usage only): SLOAD & STORE users[caller] + SLOAD COOLDOWN_PERIOD + SSTORE UnlockInfo + Emit Event
    */
  }

  function _withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
    /**
        1. Read the `users[caller]` to `User memory user`.
        2. Based on the passed maxUnlocks, decide on the `unlockEnd`.
        3. For i = `user[caller].unlockStart`, i < `unlockEnd`:
            3.1 Read `unlocks[i][caller]` to `UnlockInfo memory unlockInfo`.
            3.2 Check if `unlockInfo.unlockedAt > block.timestamp`. If yes, break. Else continue:
                3.2.1 Add `unlockInfo.amount` to `amount`.
                3.2.2 Emit the event.
                3.2.3 Clear out unlocks[i][caller]
        4. If `amount` > 0:
          4.1 Update `users[caller]` to `(locked as same, unlocked - amount, unlockStart = i, unlockEnd as same)`
          4.2 Transfer `amount` to `caller`.

        Gas Usage (major usage only): SLOAD users[caller] + n SLOAD unlocks[i][caller] + n Event Emits + n Zero assignment SSTORE unlocks[i][caller] + SSTORE users[caller] + SLOAD SAFE_TOKEN + Token Transfer
        where n can be as high as `unlockEnd - unlockStart`.
    */
  }

  // @inheritdoc ISafeTokenLock
  function withdraw() external returns (uint96 amount) {
    /**
        1. Call `_withdraw(0)`.
    */
  }

  // @inheritdoc ISafeTokenLock
  function withdraw(uint32 maxUnlocks) external returns (uint96 amount) {
    /**
        1. Check if passed `maxUnlocks` is zero. If yes, revert. Else continue.
        2. Call `_withdraw(maxUnlocks)`.
    */
  }

  // @inheritdoc ISafeTokenLock
  function totalBalance(address holder) external returns (uint96 amount) {
    /**
        Return the amount from `users[caller].locked` + `users[caller].unlocked`.

        Gas Usage: As this is a view function, gas usage is not considered.
    */
  }
}
```

## State Change Example

### Initial State

```solidity
users[A] = (0, 0, 0, 0)
users[B] = (0, 0, 0, 0)
unlocks[0][A] = (0, 0)
unlocks[1][A] = (0, 0)
unlocks[2][A] = (0, 0)
unlocks[0][B] = (0, 0)
unlocks[1][B] = (0, 0)
```

### Operations

| User | Operation | Time | Amount | users[User]        | unlocks[index][User]                                | Note                                         |
| ---- | --------- | ---- | ------ | ------------------ | --------------------------------------------------- | -------------------------------------------- |
| A    | Lock      |      | 2500   | (2500, 0, 0, 0)    |                                                     |                                              |
| A    | Unlock    |      | 200    | (2300, 200, 0, 1)  | unlocks[0][A] → (200, t1)                           |                                              |
| B    | Lock      |      | 2000   | (2000, 0, 0, 0)    |                                                     |                                              |
| A    | Unlock    |      | 500    | (1800, 700, 0, 2)  | unlocks[1][A] → (500, t2)                           |                                              |
| B    | Unlock    |      | 350    | (1650, 350, 0, 1)  | unlocks[0][B] → (350, t2)                           |                                              |
| A    | Unlock    |      | 700    | (1100, 1400, 0, 3) | unlocks[2][A] → (700, t2)                           |                                              |
| A    | Withdraw  | t1   |        | (1100, 1200, 1, 3) | unlocks[0][A] → (0, 0) ???                          |                                              |
| B    | Unlock    |      | 750    | (900, 1100, 0, 2)  | unlocks[1][B] → (750, t3)                           |                                              |
| A    | Withdraw  | t2   |        | (1100, 0, 3, 3)    | unlocks[2][A] → (0, 0) & unlocks[3][A] → (0, 0) ??? | Here 2 withdraw happens, as time t2 reached. |
| B    | Withdraw  |      |        | (900, 750, 1, 2)   | unlocks[0][B] → (0, 0) ???                          |                                              |

### Final State

```solidity
users[A] = (1100, 0, 3, 3)
users[B] = (900, 750, 1, 2)
unlocks[0][A] = (0, 0)
unlocks[1][A] = (0, 0)
unlocks[2][A] = (0, 0)
unlocks[0][B] = (0, 0)
unlocks[1][B] = (750, t3)
```

## Note

- `unlocks[index][caller]` will only be zeroed based on the gas usage check.
