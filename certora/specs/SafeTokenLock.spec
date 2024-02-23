using SafeTokenHarness as safeToken;

methods {
    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);
    function totalBalance(address) external returns(uint96) envfree;
    function owner() external returns(address) envfree;
    function pendingOwner() external returns(address) envfree;
    function SAFE_TOKEN() external returns(address) envfree;
    function COOLDOWN_PERIOD() external returns(uint64) envfree;

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;
    function getStartAndEnd(address userAddress) external returns(uint32, uint32) envfree;
    function getUserUnlockSum(address) external returns(uint256) envfree;
    function safeToken.balanceOf(address) external returns(uint256) envfree;
    function safeToken.totalSupply() external returns(uint256) envfree;
    function safeToken.allowance(address, address) external returns(uint256) envfree;
    function safeToken.allowance(address, address) external returns(uint256) envfree;
    function safeToken.paused() external returns(bool) envfree;

    function _.transfer(address, uint256) external => NONDET UNRESOLVED;
}

definition MAX_UINT32() returns mathint = 2^32 - 1;
definition MAX_UINT64() returns mathint = 2^64 - 1;
definition SAFE_TOKEN_TOTAL_SUPPLY() returns mathint = 10^27;

ghost mapping(address => mathint) userUnlocks {
    init_state axiom forall address X.userUnlocks[X] == 0;
}

ghost mapping(address => mathint) userLocks {
    init_state axiom forall address X.userLocks[X] == 0;
}

// Used to track total sum of locked tokens
ghost mathint totalLocked {
    init_state axiom totalLocked == 0;
}

ghost mathint totalUnlocked {
    init_state axiom totalUnlocked == 0;
}

ghost mathint lastTimestamp;

ghost mapping(address => mathint) userStart {
    init_state axiom forall address X.userStart[X] == 0;
}

ghost mapping(address => mathint) userEnd {
    init_state axiom forall address X.userEnd[X] == 0;
}

ghost mapping(address => mapping(mathint => mathint)) unlockAmount {
    init_state axiom forall address user. forall mathint i. unlockAmount[user][i] == 0;
}

ghost mapping(address => mapping(mathint => mathint)) userUnlockAt {
    init_state axiom forall address user. forall mathint i. userUnlockAt[user][i] == 0;
}

ghost mathint ghostCooldownPeriod;

hook TIMESTAMP uint256 time {
    require to_mathint(time) < MAX_UINT64() - ghostCooldownPeriod;
    require to_mathint(time) >= lastTimestamp;
    lastTimestamp = time;
}

hook Sstore SafeTokenLockHarness.users[KEY address user].unlockStart uint32 value (uint32 old_value) STORAGE {
    userStart[user] = to_mathint(value);
}

hook Sstore SafeTokenLockHarness.users[KEY address user].unlockEnd uint32 value (uint32 old_value) STORAGE {
    userEnd[user] = to_mathint(value);
}

hook Sstore SafeTokenLockHarness.unlocks[KEY uint32 index][KEY address user].unlockedAt uint64 value (uint64 old_value) STORAGE {
    userUnlockAt[user][to_mathint(index)] = to_mathint(value);
}

hook Sstore SafeTokenLockHarness.unlocks[KEY uint32 index][KEY address user].amount uint96 value (uint96 old_value) STORAGE {
    unlockAmount[user][to_mathint(index)] = to_mathint(value);
}

hook Sload uint32 v currentContract.users[KEY address user].unlockStart STORAGE {
    require userStart[user] == to_mathint(v);
}

hook Sload uint32 v currentContract.users[KEY address user].unlockEnd STORAGE {
    require userEnd[user] == to_mathint(v);
}

hook Sload uint64 v currentContract.unlocks[KEY uint32 index][KEY address user].unlockedAt STORAGE {
    require userUnlockAt[user][to_mathint(index)] == to_mathint(v);
}

hook Sload uint96 v currentContract.unlocks[KEY uint32 index][KEY address user].amount STORAGE {
    require unlockAmount[user][to_mathint(index)] == to_mathint(v);
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
    totalLocked = totalLocked + (value - old_value);
    userLocks[user] = value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
    totalUnlocked = totalUnlocked + (value - old_value);
    userUnlocks[key] = value;
}

hook Sload uint96 v currentContract.users[KEY address user].locked STORAGE {
    require userLocks[user] == to_mathint(v);
}

hook Sload uint96 v currentContract.users[KEY address user].unlocked STORAGE { 
    require userUnlocks[user] == to_mathint(v);
}

// function checkTimestampWithinCooldown(address user) returns bool {
//     mathint cooldownPeriod = to_mathint(COOLDOWN_PERIOD());
//     return (forall mathint i. userStart[user] <= i && i < userEnd[user] => userUnlockAt[user][i] <= lastTimestamp + cooldownPeriod);
// }

// invariant timestampWithinCooldown(address user)
//     checkTimestampWithinCooldown(user);

invariant timestampsIncreaseWithinCooldownPeriod(address user)
    (forall mathint i. userStart[user] <= i && i < userEnd[user] => userUnlockAt[user][i] <= lastTimestamp + ghostCooldownPeriod) &&
    (forall mathint i. forall mathint j. i <= j && userStart[user] <= i && j < userEnd[user] => userUnlockAt[user][i] <= userUnlockAt[user][j]) {
        preserved {
            requireInvariant unlockStartBeforeEnd(user);
            require ghostCooldownPeriod == to_mathint(currentContract.COOLDOWN_PERIOD());
        }
    }

invariant contractBalanceEqSumOfLockedAndUnlocked()
    to_mathint(safeToken.balanceOf(currentContract)) >= totalLocked + totalUnlocked {
        preserved lock(uint96 amount) with (env e) {
            require safeToken.balanceOf(e.msg.sender) + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());
            require e.msg.sender != currentContract;
        }
        preserved safeToken.transfer(address to, uint256 value) with (env e) {
            require safeToken.balanceOf(e.msg.sender) + safeToken.balanceOf(to) <= to_mathint(safeToken.totalSupply());
            require e.msg.sender != currentContract;
        }
        preserved safeToken.transferFrom(address from, address to, uint256 value) with (env e) {
            require safeToken.balanceOf(from) + safeToken.balanceOf(to) <= to_mathint(safeToken.totalSupply());
            requireInvariant noAllowanceForSafeTokenLock(e.msg.sender);
        }
    }

invariant noAllowanceForSafeTokenLock(address user)
    safeToken.allowance(currentContract, user) == 0 {
        preserved safeToken.approve(address spender, uint256 amount) with (env e) {
            require e.msg.sender != currentContract;
        }
        preserved safeToken.increaseAllowance(address spender, uint256 addedValue) with (env e) {
            require e.msg.sender != currentContract;
        }
    }

invariant unlockStartBeforeEnd(address holder)
    getUser(holder).unlockStart <= getUser(holder).unlockEnd;

invariant unlockedIsSumOfUnlockAmounts(address holder)
    to_mathint(getUser(holder).unlocked) == to_mathint(getUserUnlockSum(holder))
    {
        preserved {
            requireInvariant unlockStartBeforeEnd(holder);
        }
    }

// rule withdrawReturnsValueBasedOnMaturedUnlock() {
//     env e;
//     uint32 start;
//     uint32 end;
//     mathint withdrawAmount;

//     require e.msg.value == 0;
//     require !safeToken.paused();
//     require e.msg.sender != safeToken;
//     require e.msg.sender != 0;

//     start, end = getStartAndEnd(e.msg.sender);
//     requireInvariant unlockStartBeforeEnd(e.msg.sender);

//     SafeTokenLock.UnlockInfo unlockInfo = getUserUnlock(e.msg.sender, start);
//     // require to_mathint(unlockInfo.amount) <= to_mathint(safeToken.balanceOf(currentContract)); // https://prover.certora.com/output/232916/89a623fc726b4a0c8067f55df4593f27?anonymousKey=4dbfc191a5f8be32f7cf22394e7b706d107e93cd
//     requireInvariant contractBalanceEqSumOfLockedAndUnlocked(); // https://prover.certora.com/output/232916/cfd6c0fdf7244c44af9f5f0e73f9a3eb?anonymousKey=c621b114d8ae9654d6cd425ad355ce3d7e826f3f
//     requireInvariant unlockedIsSumOfUnlockAmounts(e.msg.sender); // https://prover.certora.com/output/232916/c6a87caca06d4fa384612c21a9064899?anonymousKey=fd4006be60ce8f843954974a86b7f0a3c29770f4
//     require userUnlocks[e.msg.sender] <= totalUnlocked;

//     withdrawAmount = withdraw@withrevert(e, 0);
//     assert !lastReverted;

//     if(start == end || (to_mathint(unlockInfo.unlockedAt) > to_mathint(e.block.timestamp) && unlockInfo.amount > 0)) { // unlockInfo.amount > 0 is problematic, as for multiple unlocks, the first one could be zero but the rest could be higher.
//         assert withdrawAmount == 0;
//     } else {
//         assert withdrawAmount > 0;
//     }
// }

rule doesNotAffectOtherUserBalance(method f) {
    env e;  
    address otherUser;
    calldataarg args;
    require (e.msg.sender != otherUser);

    uint96 otherUserBalanceBefore = totalBalance(otherUser);
    f(e,args);
    assert totalBalance(otherUser) == otherUserBalanceBefore;
}

rule cannotWithdrawMoreThanUnlocked() {
    env e;
    uint256 balanceBefore = safeToken.balanceOf(e, e.msg.sender);
    mathint beforeWithdraw = userUnlocks[e.msg.sender];
    withdraw(e, 0);
    uint256 balanceAfter = safeToken.balanceOf(e, e.msg.sender);
    assert to_mathint(balanceAfter) <= balanceBefore + beforeWithdraw;
}

rule cannotWithdrawBeforeCooldown() {
    uint32 i;
    uint32 start;
    uint32 end;
    env e;
    uint256 maturesAtTimestamp;
    uint96 amount;

    start, end = getStartAndEnd(e.msg.sender);

    require start == i && end != i;

    SafeTokenLock.UnlockInfo unlockInfo = getUserUnlock(e.msg.sender, i);
    maturesAtTimestamp = unlockInfo.unlockedAt;
    amount = unlockInfo.amount;
    require maturesAtTimestamp > e.block.timestamp && amount > 0;
    uint96 amountWithdrawn;

    require e.msg.value == 0;

    amountWithdrawn = withdraw@withrevert(e, 0);
    assert !lastReverted && amountWithdrawn == 0;
}

rule unlockTimeDoesNotChange(method f) {
    uint32 i;
    uint32 start;
    uint32 end;
    env e;
    mathint maturesAtTimestamp;
    uint96 amount;
    address user;

    SafeTokenLock.User user1 = getUser(user);

    require user1.unlockStart == i && user1.unlockEnd != i;

    SafeTokenLock.UnlockInfo unlockInfo = getUserUnlock(user, i);

    calldataarg args;
   
    maturesAtTimestamp = unlockInfo.unlockedAt;
    amount = unlockInfo.amount;
    require maturesAtTimestamp > to_mathint(e.block.timestamp) && amount > 0;

    f(e, args);

    SafeTokenLock.UnlockInfo unlockInfo2 = getUserUnlock(user, i);
    SafeTokenLock.User user2 = getUser(user);

    assert user1.unlockStart == user2.unlockStart;
    assert maturesAtTimestamp == to_mathint(unlockInfo2.unlockedAt);
}

// atleast 1 good case that user can withdraw all tokens using satisfy
rule possibleToFullyWithdraw(address sender, uint96 amount) {
    
    env eL; // env for lock
    env eU; // env for unlock
    env eW; // env for withdraw
    uint256 balanceBefore = safeToken.balanceOf(sender);
    require eL.msg.sender == sender;
    require eU.msg.sender == sender;
    require eW.msg.sender == sender;

    require amount > 0;
    lock(eL, amount);

    uint96 amountToUnlock;
    require amountToUnlock <= amount;

    unlock(eU, amountToUnlock);

    withdraw(eW, 0);
    satisfy (balanceBefore == safeToken.balanceOf(sender));
}

rule alwaysPossibleToWithdraw(address sender, uint96 amount) {
    requireInvariant unlockStartBeforeEnd(sender);
    requireInvariant unlockedIsSumOfUnlockAmounts(sender);
    requireInvariant timestampsIncreaseWithinCooldownPeriod(sender);
    require ghostCooldownPeriod == to_mathint(COOLDOWN_PERIOD());

    env e;
    env eW; // env for withdraw
    require e.msg.sender != 0;
    require e.msg.sender == sender;
    require sender != safeToken;
    require to_mathint(e.block.timestamp) >= lastTimestamp;
    require eW.msg.sender == sender;
    require !safeToken.paused();

    requireInvariant contractBalanceEqSumOfLockedAndUnlocked();
    require userUnlocks[sender] <= totalUnlocked;
    require userLocks[sender] <= totalLocked;

    require e.msg.value == 0;
    require eW.msg.value == 0;

    SafeTokenLock.User user = getUser(e.msg.sender);
    uint96 userLockedBefore = user.locked;
    require to_mathint(user.unlockEnd) < MAX_UINT32();
    mathint totalTokenBalanceBefore = totalBalance(e.msg.sender);
    require safeToken.balanceOf(e.msg.sender) + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());

    if (userLockedBefore > 0) {
        unlock@withrevert(e, userLockedBefore);
        assert !lastReverted;
    }

    require to_mathint(eW.block.timestamp) > e.block.timestamp + COOLDOWN_PERIOD();

    mathint withdrawAmount = withdraw@withrevert(eW, 0);
    assert !lastReverted && withdrawAmount == totalTokenBalanceBefore;
}

rule withdrawShouldAlwaysIncreaseReceiverTokenBalance() {
    env e;
    mathint amount;
    require e.msg.value == 0;
    require e.msg.sender != 0;
    require e.msg.sender != safeToken;
    require e.msg.sender != currentContract;
    require !safeToken.paused();
    requireInvariant unlockedIsSumOfUnlockAmounts(e.msg.sender);
    requireInvariant contractBalanceEqSumOfLockedAndUnlocked();
    // require to_mathint(safeToken.balanceOf(currentContract)) >= userUnlocks[e.msg.sender];
    require userUnlocks[e.msg.sender] <= totalUnlocked;
    require userLocks[e.msg.sender] <= totalLocked;
    uint256 userBalanceBefore = safeToken.balanceOf(e.msg.sender);
    require userBalanceBefore + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());

    amount = withdraw@withrevert(e, 0);
    assert !lastReverted;
    // assert amount <= userUnlocks[e.msg.sender];

    uint256 userBalanceAfter = safeToken.balanceOf(e.msg.sender);
    assert to_mathint(userBalanceAfter) >= userBalanceBefore + amount;
}

rule noNegativeOrZeroLocked() {
    env e;
    uint96 amount;
    require e.msg.value == 0;
    require e.msg.sender != 0;
    require !safeToken.paused();
    require to_mathint(safeToken.totalSupply()) == SAFE_TOKEN_TOTAL_SUPPLY();

    bool enoughAllowance = to_mathint(safeToken.allowance(e.msg.sender, currentContract)) >= to_mathint(amount);
    bool enoughBalance = to_mathint(safeToken.balanceOf(e.msg.sender)) >= to_mathint(amount);

    require safeToken.balanceOf(e.msg.sender) + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());
    require userLocks[e.msg.sender] <= totalLocked;
    require userUnlocks[e.msg.sender] <= totalUnlocked;
    requireInvariant contractBalanceEqSumOfLockedAndUnlocked();
    requireInvariant unlockedIsSumOfUnlockAmounts(e.msg.sender);

    // SafeTokenLock.User user = getUser(e.msg.sender);
    // require user.locked + amount <= to_mathint(safeToken.totalSupply());

    lock@withrevert(e, amount);
    if (enoughAllowance && enoughBalance && amount > 0) {
        assert !lastReverted;
    } else {
        assert lastReverted;
    }
}

rule unlockIndexShouldReturnLastEndIndex() {
    env e;
    require e.msg.value == 0;
    uint32 end;
    _, end = getStartAndEnd(e.msg.sender);
    requireInvariant unlockStartBeforeEnd(e.msg.sender);
    
    require userLocks[e.msg.sender] > 0;
    
    uint32 index = unlock@withrevert(e, _);
    assert !lastReverted => index == end;
}

invariant defaultContructorState()
    SAFE_TOKEN() != 0 && COOLDOWN_PERIOD() != 0;

invariant unlockedAmountNonZero(address user)
    forall uint32 index. userStart[user] <= to_mathint(index) && to_mathint(index) < userEnd[user] => unlockAmount[user][index] > 0;

rule unlockWithMaxUnlocksIsCommutative() {
    env e;
    uint32 maxUnlocks1;
    uint32 maxUnlocks2;
    require e.msg.sender != currentContract;

    storage initState = lastStorage;

    require getUser(e.msg.sender).unlockEnd + maxUnlocks1 <= MAX_UINT32();    
    requireInvariant unlockedAmountNonZero(e.msg.sender);

    withdraw(e, maxUnlocks1);
    withdraw(e, maxUnlocks2);

    storage after1 = lastStorage;

    withdraw@withrevert(e, maxUnlocks2) at initState;
    assert !lastReverted;

    withdraw@withrevert(e, maxUnlocks1);
    assert !lastReverted;

    assert lastStorage == after1;
}

rule noFrontRunning(method f, method g) filtered {
    f -> !f.isView && f.contract == currentContract,
    g -> !g.isView
} {
    env e1; // Possibly a victim.
    env e2; // Possibly an evil actor.
    address from;
    address to;
    uint256 amount;
    require e1.msg.sender != e2.msg.sender;
    require e1.msg.sender != owner();
    require e1.msg.sender != safeToken;
    require e1.msg.sender != currentContract;
    require e2.msg.sender != currentContract;
    require !safeToken.paused();
    requireInvariant contractBalanceEqSumOfLockedAndUnlocked();
    requireInvariant noAllowanceForSafeTokenLock(e2.msg.sender);
    require userLocks[e1.msg.sender] + userLocks[e2.msg.sender] <= totalLocked;
    require userUnlocks[e1.msg.sender] + userUnlocks[e2.msg.sender] <= totalUnlocked;
    require safeToken.balanceOf(e1.msg.sender) + safeToken.balanceOf(e2.msg.sender) + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());
    require from != e1.msg.sender && from != currentContract => safeToken.balanceOf(e1.msg.sender) + safeToken.balanceOf(from) + safeToken.balanceOf(currentContract) <= to_mathint(safeToken.totalSupply());

    calldataarg args1;
    calldataarg args2;

    storage initState = lastStorage;
    address beforeOwner = owner();
    address beforePendingOwner = pendingOwner();
    uint256 beforeAllowance = safeToken.allowance(e1.msg.sender,e2.msg.sender);

    f(e1, args1);
    if (g.selector == sig:SafeTokenHarness.transferFrom(address,address,uint256).selector) {
        safeToken.transferFrom@withrevert(e2, from, to, amount);
    } else {
        g@withrevert(e2, args2);
    }

    storage after1 = lastStorage;

    if (g.selector == sig:SafeTokenHarness.transferFrom(address,address,uint256).selector) {
        safeToken.transferFrom@withrevert(e2, from, to, amount) at initState;
    } else {
        g(e2, args2) at initState;
    }
    f@withrevert(e1, args1);

    assert
        (lastStorage == after1 && !lastReverted) ||
        (f.selector == sig:acceptOwnership().selector && e1.msg.sender == beforePendingOwner && e2.msg.sender == beforeOwner) ||
        (g.selector == sig:SafeTokenHarness.transferFrom(address,address,uint256).selector && beforeAllowance > 0);
}
