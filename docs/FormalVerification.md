# SafeTokenLock contract invariants and rules for formal verification

## Invariants

| Invariant name                                   | Description | Status |
| ------------------------------------------------ | ----------- | ------ |
| unlockIndexInBetweenStartAndEnd                  |             | Todo   |
| sumOfUserUnlock                                  |             | Todo   |
| contractBalanceGreaterThanSumOfLockedAndUnlocked |             | Todo   |
| unlockedTokensAlwaysLessOrEqualLocked            |             | Todo   |

## Rules

| Invariant name                                   | Description                                                                                          | Status |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------ |
| doesNotAffectOtherUserBalance                    | Actions of a user should not affect locking, unlocking or withrdrawal of the other user.             | Todo   |
| cannotWithdrawMoreThanUnlocked                   | A user should not be able to get back more that locked amount                                        | Todo   |
| cannotWithdrawBeforeCooldown                     | Ensure that every unlock must go through cooldown period before withdrawal                           | Todo   |
| contractBalanceIncreasesWhenTotalLockedIncreases | Locking contract balance increases when user locks tokens                                            | Todo   |
| possibleToFullyWithdraw                          | Users must be able to withdraw tokens from the contract                                              | Todo   |
| unlockTimestampOnlyIncreases                     | Every new unlock action's unlock time must be greater that the previous unlock request for each user | Todo   |
| unlockTimestampNeverZero                         | If user unlocks tokens the timestamp when the tokens can be withdrawn should be non zero             | Todo   |
