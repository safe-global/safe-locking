using SafeTokenHarness as safeTokenContract;

definition MAX_UINT(mathint bitwidth) returns mathint = 2^bitwidth - 1;

methods {
    // SafeTokenLock functions
    function COOLDOWN_PERIOD() external returns (uint64) envfree;
    function SAFE_TOKEN() external returns (address) envfree;
    function getUnlock(address, uint32) external returns(ISafeTokenLock.UnlockInfo) envfree;
    function getUser(address) external returns(ISafeTokenLock.User) envfree;
    function getUserTokenBalance(address) external returns (uint96) envfree;
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Ownable/Ownable2Step functions
    function owner() external returns (address) envfree;
    function pendingOwner() external returns (address) envfree;

    // Harnessed functions
    function harnessGetUserUnlockSum(address) external returns(uint256) envfree;
    function harnessGetUserLastUnlockOperationIndex(address) external returns(uint32) envfree;

    // SafeToken functions
    function safeTokenContract.allowance(address, address) external returns(uint256) envfree;
    function safeTokenContract.balanceOf(address) external returns(uint256) envfree;
    function safeTokenContract.totalSupply() external returns(uint256) envfree;
    function safeTokenContract.paused() external returns(bool) envfree;

    // Prevent SafeTokenHarness.transfer to cause HAVOC
    function _.transfer(address,uint256) external => NONDET UNRESOLVED;
}

// Ghost variables that track the total and per-user lock amounts.
ghost mapping(address => mathint) ghostUserLocked {
    init_state axiom forall address holder. ghostUserLocked[holder] == 0;
}
ghost mathint ghostTotalLocked {
    init_state axiom ghostTotalLocked == 0;
}
hook Sload uint96 value _users[KEY address user].locked STORAGE {
    require ghostUserLocked[user] == to_mathint(value);
}
hook Sstore _users[KEY address user].locked uint96 value (uint96 oldValue) STORAGE {
    ghostTotalLocked = ghostTotalLocked + (value - oldValue);
    ghostUserLocked[user] = value;
}

// Ghost variables that track the total and per-user unlock amounts.
ghost mathint ghostTotalUnlocked {
    init_state axiom ghostTotalUnlocked == 0;
}
ghost mapping(address => mathint) ghostUserUnlocked {
    init_state axiom forall address holder. ghostUserUnlocked[holder] == 0;
}
hook Sload uint96 value _users[KEY address user].unlocked STORAGE {
    require ghostUserUnlocked[user] == to_mathint(value);
}
hook Sstore _users[KEY address key].unlocked uint96 value (uint96 oldValue) STORAGE {
    ghostTotalUnlocked = ghostTotalUnlocked + (value - oldValue);
    ghostUserUnlocked[key] = value;
}

// Ghost variables that track the per-user unlock indexes.
ghost mapping(address => mathint) ghostUserUnlockStart {
    init_state axiom forall address holder. ghostUserUnlockStart[holder] == 0;
}
ghost mapping(address => mathint) ghostUserUnlockEnd {
    init_state axiom forall address holder. ghostUserUnlockEnd[holder] == 0;
}
hook Sload uint32 value _users[KEY address holder].unlockStart STORAGE {
    require ghostUserUnlockStart[holder] == to_mathint(value);
}
hook Sload uint32 value _users[KEY address holder].unlockEnd STORAGE {
    require ghostUserUnlockEnd[holder] == to_mathint(value);
}
hook Sstore _users[KEY address holder].unlockStart uint32 value STORAGE {
    ghostUserUnlockStart[holder] = to_mathint(value);
}
hook Sstore _users[KEY address holder].unlockEnd uint32 value STORAGE {
    ghostUserUnlockEnd[holder] = to_mathint(value);
}

// Ghost variables that track the individual unlock amounts.
ghost mapping(address => mapping(mathint => mathint)) ghostUnlockAmount {
    init_state axiom
        forall address holder.
        forall mathint index.
            ghostUnlockAmount[holder][index] == 0;
}
hook Sload uint96 value _unlocks[KEY uint32 index][KEY address holder].amount STORAGE {
    require ghostUnlockAmount[holder][to_mathint(index)] == to_mathint(value);
}
hook Sstore _unlocks[KEY uint32 index][KEY address holder].amount uint96 value STORAGE {
    ghostUnlockAmount[holder][to_mathint(index)] = to_mathint(value);
}

// Ghost variable that tracks the last timestamp.
ghost mathint ghostLastTimestamp;

hook TIMESTAMP uint256 time {
    require to_mathint(time) < MAX_UINT(64) - COOLDOWN_PERIOD();
    require to_mathint(time) >= ghostLastTimestamp;
    ghostLastTimestamp = time;
}

// Ghost variables that track the individual unlock mature timestamp.
ghost mapping(address => mapping(mathint => mathint)) ghostUnlockMaturesAt {
    init_state axiom
        forall address holder.
        forall mathint index.
            ghostUnlockMaturesAt[holder][index] == 0;
}
hook Sload uint64 value _unlocks[KEY uint32 index][KEY address holder].maturesAt STORAGE {
    require ghostUnlockMaturesAt[holder][to_mathint(index)] == to_mathint(value);
}
hook Sstore _unlocks[KEY uint32 index][KEY address holder].maturesAt uint64 value STORAGE {
    ghostUnlockMaturesAt[holder][to_mathint(index)] = to_mathint(value);
}

// Verify that Safe token contract's Safe token balance is always zero.
invariant safeTokenSelfBalanceIsZero()
    safeTokenContract.balanceOf(safeTokenContract) == 0;

// Verify that Safe token contract cannot lock tokens. While this invariant is
// not important for the Safe locking contract per se, having the Safe token
// contract lock or hold balance could cause strange behaviours and cause other
// rules and invariants to not hold.
invariant safeTokenCannotLock()
    getUserTokenBalance(safeTokenContract) == 0
{
    preserved {
        requireInvariant safeTokenSelfBalanceIsZero();
    }
}

// A setup function that requires Safe token invariants that were proven in the
// Safe token spec. Because of Certora tool limitations, the invariants cannot
// be included in this file and used with `requireInvariant`, so instead we
// synthesize equivalent `require`-ments to the proven invariants.
function setupRequireSafeTokenInvariants(address a, address b) {
    require safeTokenContract.totalSupply() == 10^27;
    require safeTokenContract.balanceOf(a) <= safeTokenContract.totalSupply();
    require a != b
        => safeTokenContract.balanceOf(a) + safeTokenContract.balanceOf(b)
            <= to_mathint(safeTokenContract.totalSupply());
}

// Invariant that proves that the Safe token locking contract never has a locked
// balance; i.e. there is no way for an external caller to get the locking
// contract to call `lock`, `unlock` or `withdraw` on itself.
invariant contractCannotOperateOnItself()
    getUser(currentContract).locked == 0
        && getUser(currentContract).unlocked == 0
        && getUser(currentContract).unlockStart == 0
        && getUser(currentContract).unlockEnd == 0
{
    preserved with (env e) {
        require e.msg.sender != currentContract;
    }
}

// Invariant that proves that the Safe token locking contract never grants
// allowance to another address; i.e. there is no way for an external caller to
// get the locking contract to call `approve` or `increaseAllowance` on the Safe
// token.
invariant noAllowanceForSafeTokenLock(address spender)
    safeTokenContract.allowance(currentContract, spender) == 0
{
    preserved with (env e) {
        require e.msg.sender != currentContract;
    }
}

// Invariant proves that the locking contract's Safe token balance is always
// greater than the sum of all user's Safe token balance in the Safe locking
// contract; i.e. the sum of all users's `locked` and `unlocked` amounts. This
// is important to guarantee that there is always enough Safe token balance to
// withdraw matured unlocks.
invariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts()
    to_mathint(safeTokenContract.balanceOf(currentContract)) >= ghostTotalLocked + ghostTotalUnlocked
{
    preserved with (env e) {
        setupRequireSafeTokenInvariants(currentContract, e.msg.sender);
        requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
        require e.msg.sender != currentContract;
    }
    preserved safeTokenContract.transferFrom(address from, address to, uint256 value) with (env e) {
        setupRequireSafeTokenInvariants(from, to);
        requireInvariant noAllowanceForSafeTokenLock(e.msg.sender);
    }
}

// Invariants to ensure the ghost variable constraints are considered when
// proving invariants and rules. This is because for the ghost variable binding
// to work, the `SLOAD` hook needs to trigger, but it doesn't always happen
// for a given rule or invariant. This function ensures that ghost variable
// constraints are always included.
//
// Unfortunately, proving this fully with the Certora tool is not really
// possible in the absence of a "sum of" keyword (that may be added in the
// future), as proving it holds for a single address requires proving it for two
// addresses, which requires proving it for 3 addresses, etc.
invariant totalLockedIsGreaterThanUserLocked(address holder)
    ghostTotalLocked >= ghostUserLocked[holder]
{
    preserved unlock(uint96 amount) with (env e) {
        require holder != e.msg.sender
            => ghostTotalLocked >= ghostUserLocked[holder] + ghostUserLocked[e.msg.sender];
    }
}
invariant totalUnlockedIsGreaterThanUserUnlocked(address holder)
    ghostTotalUnlocked >= ghostUserUnlocked[holder]
{
    preserved withdraw(uint32 index) with (env e) {
        require holder != e.msg.sender
            => ghostTotalUnlocked >= ghostUserUnlocked[holder] + ghostUserUnlocked[e.msg.sender];
    }
}

// Invariant that a user's Safe token balance in the locking contract is less
// that the total supply of Safe token.
invariant userTokenBalanceIsLessThanTotalSupply(address holder)
    to_mathint(getUserTokenBalance(holder)) <= to_mathint(safeTokenContract.totalSupply())
{
    preserved with (env e) {
        setupRequireSafeTokenInvariants(currentContract, holder);
        requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
        requireInvariant userUnlockedIsSumOfUnlockAmounts(holder);
        requireInvariant totalLockedIsGreaterThanUserLocked(holder);
        requireInvariant totalUnlockedIsGreaterThanUserUnlocked(holder);
        require e.msg.sender != currentContract;
    }
}

// Invariant that the `unlockStart` index is always before the `unlockEnd` index
// for a user. This invariant is useful for rules where the well-formed-ness
// of the unlock indexes are important.
invariant unlockStartBeforeEnd(address holder)
    getUser(holder).unlockStart <= getUser(holder).unlockEnd;

// Invariant that the unlocked amount for a user is always equal to the sum of
// of the individual amounts of each of their pending unlocks. Note that this
// invariant has an associated rule that proves that `harnessGetUserUnlockSum`
// never reverts. This is important to ensure that a revert in the harness
// function will not hide potentially problematic executions.
invariant userUnlockedIsSumOfUnlockAmounts(address holder)
    to_mathint(getUser(holder).unlocked) == to_mathint(harnessGetUserUnlockSum(holder))
{
    preserved {
        requireInvariant unlockStartBeforeEnd(holder);
    }
}
rule harnessGetUserUnlockSumNeverReverts(address holder) {
    harnessGetUserUnlockSum@withrevert(holder);
    assert !lastReverted;
}

// Invariant to prove that no unlock amount in the list is 0. This invariant is
// important as as a 0 amount in the unlock array could result in a pending
// unlock being deleted without the `unlockStart` index being updated.
invariant unlockAmountsAreNonZero(address holder)
    // The use of ghost variables instead of directly accessing storage is
    // required because of limitations with the `index` universal quantifier.
    forall uint32 index.
        ghostUserUnlockStart[holder] <= to_mathint(index) && to_mathint(index) < ghostUserUnlockEnd[holder]
            => ghostUnlockAmount[holder][index] > 0
{
    preserved {
        requireInvariant userUnlockedIsSumOfUnlockAmounts(holder);
    }
}

// Invariant that proves that the user token balance of the zero address in the
// locking contract is always zero. This is important to ensure that the zero
// address cannot lock tokens in the locking contract.
invariant addressZeroCannotLock()
    getUserTokenBalance(0) == 0;

// Invariant to prove that unlock maturity timestamp is always increasing. For any
// user, newer unlock maturity is always greater than older unlock maturity timestamp.
invariant unlocksAreOrderedByMaturityTimestamp(uint64 cooldownPeriod, address user)
    (forall mathint i.
        ghostUserUnlockStart[user] <= i && i < ghostUserUnlockEnd[user]
            => ghostUnlockMaturesAt[user][i] <= ghostLastTimestamp + cooldownPeriod) &&
    (forall mathint i. forall mathint j.
        i <= j && ghostUserUnlockStart[user] <= i && j < ghostUserUnlockEnd[user]
            => ghostUnlockMaturesAt[user][i] <= ghostUnlockMaturesAt[user][j])
{
    preserved {
        require cooldownPeriod == COOLDOWN_PERIOD();
        requireInvariant unlockStartBeforeEnd(user);
    }
}

// Verify that no operations on the Safe token locking contract done by user A
// can affect the Safe token balance of user B in the locking contract.
rule doesNotAffectOtherUserBalance(method f, address holder) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    require (e.msg.sender != holder);
    uint96 balanceBefore = getUserTokenBalance(e, holder);

    f(e,args);

    assert getUserTokenBalance(e, holder) == balanceBefore;
}

// Verify that a user can always unlock their tokens. Notable exceptions are
// documented below.
rule canAlwaysUnlock(uint96 amount) {
    env e;

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);
    requireInvariant userTokenBalanceIsLessThanTotalSupply(e.msg.sender);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();

    ISafeTokenLock.User userBefore = getUser(e.msg.sender);

    // Exception 1: if the user has already done `type(uint256).max` previous
    // unlocks. This causes the new `unlockEnd` to overflow and therefore the
    // `unlock` call to always revert.
    require userBefore.unlockEnd + 1 <= MAX_UINT(32);

    // Exception 2: the timestamp is far enough in the future such that, when
    // added to the cooldown period, it would overflow a `uint64`. This is
    // billions of years away, so not a realistic limitation.
    require e.block.timestamp + COOLDOWN_PERIOD() <= MAX_UINT(64);

    unlock@withrevert(e, amount);

    if (e.msg.value == 0 && amount > 0 && amount <= userBefore.locked) {
        assert !lastReverted;

        ISafeTokenLock.User userAfter = getUser(e.msg.sender);
        assert to_mathint(userAfter.locked) == userBefore.locked - amount;
        assert to_mathint(userAfter.unlocked) == userBefore.unlocked + amount;
        assert userAfter.unlockStart == userBefore.unlockStart;
        assert to_mathint(userAfter.unlockEnd) == userBefore.unlockEnd + 1;
    } else {
        assert lastReverted;
    }
}

// Verify that it is impossible for a user to modify the time at which their
// unlock matures and can be withdrawn.
rule unlockMaturityTimestampDoesNotChange(method f, address holder) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    requireInvariant userUnlockedIsSumOfUnlockAmounts(holder);

    ISafeTokenLock.User userBefore = getUser(holder);
    uint32 index = userBefore.unlockStart;
    ISafeTokenLock.UnlockInfo unlockInfoBefore = getUnlock(holder, index);

    require userBefore.unlockStart < userBefore.unlockEnd;
    requireInvariant unlockAmountsAreNonZero(holder);

    f(e, args);

    ISafeTokenLock.User userAfter = getUser(holder);
    ISafeTokenLock.UnlockInfo unlockInfoAfter = getUnlock(holder, index);

    assert userAfter.unlockStart == userBefore.unlockStart
        => unlockInfoAfter.maturesAt == unlockInfoBefore.maturesAt;
    assert userAfter.unlockStart != userBefore.unlockStart
        => unlockInfoAfter.maturesAt == 0;
}

// Verify that withdrawal cannot increase the balance of a user more than their
// total unlocked amount, i.e. it is impossible to withdraw tokens without
// having previously unlocked them.
rule cannotWithdrawMoreThanUnlocked() {
    env e;

    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);

    uint256 balanceBefore = safeTokenContract.balanceOf(e.msg.sender);
    uint96 unlockedBefore = getUser(e.msg.sender).unlocked;

    withdraw(e, _);

    assert to_mathint(safeTokenContract.balanceOf(e.msg.sender))
        <= balanceBefore + unlockedBefore;
}

// Verify that withdrawing returns the exact amount of tokens that were
// transferred out and the user total amounts are correctly updated.
rule withdrawAmountCorrectness() {
    env e;

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractCannotOperateOnItself();

    uint256 balanceBefore = safeTokenContract.balanceOf(e.msg.sender);
    uint96 lockedBefore = getUser(e.msg.sender).locked;
    uint96 unlockedBefore = getUser(e.msg.sender).unlocked;
    uint96 userTokenBalanceBefore = getUserTokenBalance(e.msg.sender);

    uint96 amount = withdraw(e, _);

    assert to_mathint(safeTokenContract.balanceOf(e.msg.sender)) == balanceBefore + amount;
    assert getUser(e.msg.sender).locked == lockedBefore;
    assert to_mathint(getUser(e.msg.sender).unlocked) == unlockedBefore - amount;
    assert to_mathint(getUserTokenBalance(e.msg.sender)) == userTokenBalanceBefore - amount;
}

// Verify that unlock tokens can only be withdrawn once they mature.
rule cannotWithdrawBeforeCooldown() {
    env e;

    ISafeTokenLock.UnlockInfo unlockInfo = getUnlock(e.msg.sender, getUser(e.msg.sender).unlockStart);

    uint96 amountWithdrawn = withdraw(e, _);

    assert to_mathint(e.block.timestamp) < to_mathint(unlockInfo.maturesAt)
        => amountWithdrawn == 0;
}

// Verify that it is impossible to unlock more tokens once `unlockEnd` has
// reached the maximum value that can be represented by a `uint32`. This rule is
// meant to document this particular limitation in the locking contract.
rule cannotUnlockPastMaxUint32(method f, address holder) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    requireInvariant userUnlockedIsSumOfUnlockAmounts(holder);

    ISafeTokenLock.User userBefore = getUser(holder);
    require to_mathint(userBefore.unlockEnd) == MAX_UINT(32);

    f(e, args);

    ISafeTokenLock.User userAfter = getUser(holder);
    assert userAfter.locked >= userBefore.locked;
    assert userAfter.unlocked <= userBefore.unlocked;
}

// Verify that withdrawing is commutative. That is, withdrawing with
// `maxUnlocks` of `n` then `m`, is equivalent to `m` then `n`.
rule withdrawIsCommutative(uint32 maxUnlocks1, uint32 maxUnlocks2) {
    env e;

    requireInvariant unlockAmountsAreNonZero(e.msg.sender);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractCannotOperateOnItself();

    storage init = lastStorage;

    withdraw(e, maxUnlocks1);
    withdraw(e, maxUnlocks2);

    storage after1 = lastStorage;

    withdraw@withrevert(e, maxUnlocks2) at init;
    assert !lastReverted;
    withdraw@withrevert(e, maxUnlocks1);
    assert !lastReverted;

    assert lastStorage == after1;
}

// Verify that the `getUser` function never reverts.
rule getUserNeverReverts(address holder) {
    getUser@withrevert(holder);
    assert !lastReverted;
}

// Verify that the `getUserTokenBalance` function never reverts.
rule getUserTokenBalanceNeverReverts(address holder) {
    require getUser(holder).locked + getUser(holder).unlocked <= MAX_UINT(96);
    getUserTokenBalance@withrevert(holder);
    assert !lastReverted;
}

// Verify that the `getUnlock` function never reverts.
rule getUnlockNeverReverts(address holder, uint32 index) {
    getUnlock@withrevert(holder, index);
    assert !lastReverted;
}

// Verify that the `SAFE_TOKEN` and `COOLDOWN_PERIOD` never changes.
rule configurationNeverChanges(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    address safeTokenBefore = SAFE_TOKEN();
    uint64 cooldownPeriodBefore = COOLDOWN_PERIOD();

    f(e, args);

    assert SAFE_TOKEN() == safeTokenBefore;
    assert COOLDOWN_PERIOD() == cooldownPeriodBefore;
}

// Verify that an owner can always transfer ownership, thus it never gets
// "stuck" under specific conditions.
rule ownerCanAlwaysTransferOwnership(address newOwner) {
    env e;

    require e.msg.sender == owner();
    require e.msg.value == 0;

    transferOwnership@withrevert(e, newOwner);

    assert !lastReverted;
    assert owner() == e.msg.sender;
    assert pendingOwner() == newOwner;
}

// Verify that a pending owner can always accept ownership after transfer.
rule pendingOwnerCanAlwaysAcceptOwnership() {
    env e;

    require e.msg.sender == pendingOwner();
    require e.msg.value == 0;

    acceptOwnership@withrevert(e);

    assert !lastReverted;
    assert owner() == e.msg.sender;
    assert pendingOwner() == 0;
}

// Verify that an owner can always renounce ownership.
rule ownerCanAlwaysRenounceOwnership() {
    env e;

    require e.msg.sender == owner();
    require e.msg.value == 0;

    renounceOwnership@withrevert(e);

    assert !lastReverted;
    assert owner() == 0;
    assert pendingOwner() == 0;
}

// Verify that only the `owner` (when renouncing ownership) and the
// `pendingOwner` (when accepting ownership) can change the value of the
// contract `owner`.
rule onlyOwnerOrPendingOwnerCanChangeOwner(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    address pendingOwnerBefore = pendingOwner();
    address ownerBefore = owner();

    f(e, args);

    assert owner() != ownerBefore
        => (e.msg.sender == ownerBefore
            && f.selector == sig:renounceOwnership().selector)
        || (e.msg.sender == pendingOwnerBefore
            && f.selector == sig:acceptOwnership().selector);
}

// Verify that only the `owner` (when transferring or renouncing ownership) and
// the `pendingOwner` (when accepting ownership) can change the value of the
// contract `pendingOwner`.
rule onlyOwnerOrPendingOwnerCanChangePendingOwner(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg args;

    address pendingOwnerBefore = pendingOwner();
    address ownerBefore = owner();

    f(e, args);

    assert pendingOwner() != pendingOwnerBefore
        => (e.msg.sender == ownerBefore
            && (f.selector == sig:renounceOwnership().selector
                || f.selector == sig:transferOwnership(address).selector))
        || (e.msg.sender == pendingOwnerBefore
            && f.selector == sig:acceptOwnership().selector);
}

// Verify that it is always possible to, given an initial state with some
// locked token amount, to fully withdraw the entire locked balance.
rule alwaysPossibleToWithdraw(address holder, uint96 amount) {
    env e;
    env eW; // env for withdraw

    setupRequireSafeTokenInvariants(currentContract, holder);

    require e.msg.value == 0;
    require eW.msg.value == 0;
    require e.msg.sender != 0;
    require e.msg.sender == holder;
    require eW.msg.sender == holder;
    require holder != safeTokenContract;

    require to_mathint(e.block.timestamp) >= ghostLastTimestamp;
    require !safeTokenContract.paused();

    requireInvariant unlockStartBeforeEnd(holder);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(holder);
    requireInvariant unlocksAreOrderedByMaturityTimestamp(COOLDOWN_PERIOD(), holder);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
    requireInvariant totalLockedIsGreaterThanUserLocked(holder);
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(holder);

    ISafeTokenLock.User user = getUser(holder);
    uint96 userLockedBefore = user.locked;
    require to_mathint(user.unlockEnd) < MAX_UINT(32);

    mathint totalTokenBalanceBefore = getUserTokenBalance(holder);

    if (userLockedBefore > 0) {
        unlock@withrevert(e, userLockedBefore);
        assert !lastReverted;
    }

    require to_mathint(eW.block.timestamp) > e.block.timestamp + COOLDOWN_PERIOD();

    mathint withdrawAmount = withdraw@withrevert(eW, 0);
    assert !lastReverted && withdrawAmount == totalTokenBalanceBefore;
}

// Verity that the receiver's token balance always increases after a successful
// withdrawal.
rule withdrawShouldAlwaysIncreaseReceiverTokenBalance() {
    env e;

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);

    require e.msg.value == 0;
    require e.msg.sender != 0;
    require e.msg.sender != safeTokenContract;
    require e.msg.sender != currentContract;

    require !safeTokenContract.paused();

    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
    requireInvariant totalLockedIsGreaterThanUserLocked(e.msg.sender);
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(e.msg.sender);

    uint256 userBalanceBefore = safeTokenContract.balanceOf(e.msg.sender);

    uint96 amount = withdraw@withrevert(e, 0);
    assert !lastReverted;

    uint256 userBalanceAfter = safeTokenContract.balanceOf(e.msg.sender);
    assert to_mathint(userBalanceAfter) >= userBalanceBefore + amount;
}

// Verify that the `withdraw` function returns the correct amount based on the
// user's matured unlocks.
rule withdrawReturnsValueBasedOnMaturedUnlock() {
    env e;

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);

    require e.msg.value == 0;
    require e.msg.sender != 0;
    require e.msg.sender != safeTokenContract;
    require e.msg.sender != currentContract;

    require !safeTokenContract.paused();

    uint32 start = getUser(e.msg.sender).unlockStart;
    uint32 end = getUser(e.msg.sender).unlockEnd;
    ISafeTokenLock.UnlockInfo unlockInfo = getUnlock(e.msg.sender, start);

    requireInvariant unlockStartBeforeEnd(e.msg.sender);
    requireInvariant unlockAmountsAreNonZero(e.msg.sender);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(e.msg.sender);
    requireInvariant totalLockedIsGreaterThanUserLocked(e.msg.sender);
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(e.msg.sender);

    mathint withdrawAmount = withdraw@withrevert(e, 0);
    assert !lastReverted;

    if(start == end || (to_mathint(unlockInfo.maturesAt) > to_mathint(e.block.timestamp))) {
        assert withdrawAmount == 0;
    } else {
        assert withdrawAmount > 0;
    }
}

// Verify that the locked amount can always be withdrawn after maturity.
rule canAlwaysWithdrawEverythingAfterMaturity() {
    env e;

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);

    require e.msg.value == 0;

    require !safeTokenContract.paused();

    requireInvariant safeTokenCannotLock();
    requireInvariant addressZeroCannotLock();
    requireInvariant unlockStartBeforeEnd(e.msg.sender);
    requireInvariant unlockAmountsAreNonZero(e.msg.sender);
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant totalLockedIsGreaterThanUserLocked(e.msg.sender);
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(e.msg.sender);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
    requireInvariant unlocksAreOrderedByMaturityTimestamp(COOLDOWN_PERIOD(), e.msg.sender);

    ISafeTokenLock.User userBefore = getUser(e.msg.sender);

    uint32 lastUnlockIndex = harnessGetUserLastUnlockOperationIndex(e.msg.sender);
    require e.block.timestamp + COOLDOWN_PERIOD() < MAX_UINT(64);
    require to_mathint(e.block.timestamp) > to_mathint(getUnlock(e.msg.sender, lastUnlockIndex).maturesAt);

    uint96 amount = withdraw@withrevert(e, 0);
    assert !lastReverted;

    ISafeTokenLock.User userAfter = getUser(e.msg.sender);

    assert amount != 0
        => userBefore.unlockStart != userBefore.unlockEnd;
    assert userBefore.unlocked == amount;
    assert userAfter.unlocked == 0;
    assert userAfter.unlockStart == userAfter.unlockEnd;
    assert userAfter.unlockEnd == userBefore.unlockEnd;
}

// Verify that index received from `unlock` is always the last `unlockEnd`.
rule unlockIndexShouldReturnLastEndIndex() {
    env e;

    requireInvariant unlockStartBeforeEnd(e.msg.sender);

    uint32 end = getUser(e.msg.sender).unlockEnd;

    uint32 index = unlock@withrevert(e, _);
    assert !lastReverted => index == end;
}

// Verify that the user can always lock tokens. Notable exceptions are not
// having enough allowance to locking contract, not having enough balance,
// passed amount being zero and the Safe token contract being paused.
rule canAlwaysLock(uint96 amount) {
    env e;

    require e.msg.value == 0;
    require e.msg.sender != 0;
    require !safeTokenContract.paused();

    setupRequireSafeTokenInvariants(currentContract, e.msg.sender);

    requireInvariant totalLockedIsGreaterThanUserLocked(e.msg.sender);
    requireInvariant totalUnlockedIsGreaterThanUserUnlocked(e.msg.sender);
    requireInvariant contractBalanceIsGreaterThanTotalLockedAndUnlockedAmounts();
    requireInvariant userUnlockedIsSumOfUnlockAmounts(e.msg.sender);

    bool enoughAllowance = to_mathint(safeTokenContract.allowance(e.msg.sender, currentContract)) >= to_mathint(amount);
    bool enoughBalance = to_mathint(safeTokenContract.balanceOf(e.msg.sender)) >= to_mathint(amount);

    lock@withrevert(e, amount);

    if (enoughAllowance && enoughBalance && amount > 0) {
        assert !lastReverted;
    } else {
        assert lastReverted;
    }
}

// Verify that the user can always unlock tokens. If locked tokens are less than
// before, then unlocked tokens are more by exactly the difference than before.
rule allLockedCanGetUnlocked(method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    ISafeTokenLock.User userBefore = getUser(e.msg.sender);

    f(e, arg);

    ISafeTokenLock.User userAfter = getUser(e.msg.sender);

    assert userBefore.locked > userAfter.locked
        => userBefore.locked - userAfter.locked
            == userAfter.unlocked - userBefore.unlocked;
}
