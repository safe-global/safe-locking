using SafeTokenHarness as safeTokenContract;

definition MAX_UINT(mathint bitwidth) returns mathint = 2^bitwidth - 1;

methods {
    // SafeTokenLock functions
    function COOLDOWN_PERIOD() external returns (uint64) envfree;
    function getUnlock(address, uint32) external returns(ISafeTokenLock.UnlockInfo) envfree;
    function getUser(address) external returns(ISafeTokenLock.User) envfree;
    function getUserTokenBalance(address) external returns (uint96) envfree;
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Harnessed functions
    function harnessGetUserUnlockSum(address) external returns(uint256) envfree;

    // SafeToken functions
    function safeTokenContract.allowance(address, address) external returns(uint256) envfree;
    function safeTokenContract.balanceOf(address) external returns(uint256) envfree;
    function safeTokenContract.totalSupply() external returns(uint256) envfree;

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
            => ghostUnlockAmount[holder][index] > 0;

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

    uint256 balanceBefore = safeTokenContract.balanceOf(e.msg.sender);
    mathint unlockedBefore = getUser(e.msg.sender).unlocked;

    withdraw(e, _);

    uint256 balanceAfter = safeTokenContract.balanceOf(e.msg.sender);
    assert to_mathint(balanceAfter) <= balanceBefore + unlockedBefore;
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

// Verify that it is always possible to, given an initial state with some
// locked token amount, to fully withdraw the entire locked balance.
// **Currently this is a "satisfy" rule which is very weak, and will change in
// a future PR**.
rule possibleToFullyWithdraw(address sender, uint96 amount) {
    env eL; // env for lock
    env eU; // env for unlock
    env eW; // env for withdraw
    uint256 balanceBefore = safeTokenContract.balanceOf(sender);
    require eL.msg.sender == sender;
    require eU.msg.sender == sender;
    require eW.msg.sender == sender;

    require amount > 0;
    lock(eL, amount);

    uint96 unlockAmount;
    require unlockAmount <= amount;

    unlock(eU, unlockAmount);

    withdraw(eW, 0);
    satisfy (balanceBefore == safeTokenContract.balanceOf(sender));
}
