using SafeToken as safeToken;

methods {
    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;
    function getStartAndEnd(address userAddress) external returns(uint32, uint32) envfree;
    function safeToken.balanceOf(address) external returns(uint256) envfree;
}

ghost mapping(address => mathint) userUnlocks {
    init_state axiom forall address X.userUnlocks[X] == 0;
}

ghost mapping(address => mathint) userLocks {
    init_state axiom forall address X.userLocks[X] == 0;
}

hook Sload uint96 v currentContract._users[KEY address user].locked STORAGE {
    require userLocks[user] == to_mathint(v);
}

hook Sload uint96 v currentContract._users[KEY address user].unlocked STORAGE { 
    require userUnlocks[user] == to_mathint(v);
}

// Used to track total sum of locked tokens
ghost mathint ghostLocked {
    init_state axiom ghostLocked == 0;
}
ghost mathint ghostUnlocked {
    init_state axiom ghostUnlocked == 0;
}

rule doesNotAffectOtherUserBalance(method f) {
    env e;  
    address otherUser;
    calldataarg args;
    require (e.msg.sender != otherUser);

    uint96 otherUserBalanceBefore = totalBalance(e, otherUser);
    f(e,args);
    assert totalBalance(e, otherUser) == otherUserBalanceBefore;
}

rule cannotWithdrawMoreThanUnlocked() {
    env e;
    uint256 balanceBefore = safeToken.balanceOf(e, e.msg.sender);
    mathint beforeWithdraw = userUnlocks[e.msg.sender];
    withdraw(e, 0);
    require !lastReverted;
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

    SafeTokenLock.UnlockInfo unlockInfo = getUnlock(e.msg.sender, i);
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

    SafeTokenLock.UnlockInfo unlockInfo = getUnlock(user, i);

    calldataarg args;
   
    maturesAtTimestamp = unlockInfo.unlockedAt;
    amount = unlockInfo.amount;
    require maturesAtTimestamp > to_mathint(e.block.timestamp) && amount > 0;


    f(e, args);

    SafeTokenLock.UnlockInfo unlockInfo2 = getUnlock(user, i);
    SafeTokenLock.User user2 = getUser(user);

    assert user1.unlockStart == user2.unlockStart;
    assert maturesAtTimestamp == to_mathint(unlockInfo2.unlockedAt);
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness._users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
    ghostLocked = ghostLocked + (value - old_value);
    userLocks[user] = value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness._users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
    ghostUnlocked = ghostUnlocked + (value - old_value);
    userUnlocks[key] = value;
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

    uint96 unlockAmount;
    require unlockAmount <= amount;

    unlock(eU, unlockAmount);

    withdraw(eW, 0);
    satisfy (balanceBefore == safeToken.balanceOf(sender));
}
