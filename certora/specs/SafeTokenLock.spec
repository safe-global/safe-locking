using SafeToken as safeToken;

methods {

    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw() external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;

    function SafeToken.balanceOf(address) external returns(uint256) envfree;

}

definition onlyStateChangingAction(method f) returns bool =
    f.selector == sig:lock(uint96).selector
    || f.selector == sig:unlock(uint96).selector
    || f.selector == sig:withdraw().selector
    || f.selector == sig:withdraw(uint32).selector;

// a cvl function for precondition assumptions 
function setup(env e){
    // require getSafeTokenAddress() == safeToken;
}

ghost mapping(address => mathint) userUnlocks {
    init_state axiom forall address X.userUnlocks[X] == 0;
}

ghost mapping(address => mathint) userLocks {
    init_state axiom forall address X.userLocks[X] == 0;
}

hook Sload uint96 v currentContract.users[KEY address user].locked STORAGE {
    require userLocks[user] == to_mathint(v);
}

hook Sload uint96 v currentContract.users[KEY address user].unlocked STORAGE { 
    require userUnlocks[user] == to_mathint(v);
}

// hook Sload uint96 v currentContract.users[KEY bytes32 ilk].locked STORAGE {
//     require ArtGhost[ilk] == v;
// }

// Used to track total sum of locked tokens
ghost mathint ghostLocked {
    init_state axiom ghostLocked == 0;
}
ghost mathint ghostUnlocked {
    init_state axiom ghostUnlocked == 0;
}

rule doesNotAffectOtherUserBalance(method f) {
    env e;  
    setup(e);
    address user;
    address otherUser;
    calldataarg args;

    require (otherUser != user);
    require (e.msg.sender == user);

    uint96 otherUserBalanceBefore = totalBalance(e, otherUser);
    f(e,args);
    assert totalBalance(e, otherUser) == otherUserBalanceBefore;
}

rule cannotWithdrawMoreThanUnlocked(method f) {
    env e;
    setup(e);
    uint256 balanceBefore = safeToken.balanceOf(e, e.msg.sender);
    mathint beforeWithdraw = userUnlocks[e.msg.sender];
    withdraw(e);
    require !lastReverted;
    uint256 balanceAfter = safeToken.balanceOf(e, e.msg.sender);
    assert to_mathint(balanceAfter) == balanceBefore + beforeWithdraw;
}

rule cannotWithdrawBeforeCooldown(method f) {
    uint32 i;
    env e;
    setup(e);
    uint256 maturesAtTimestamp;
    uint96 amount;

    SafeTokenLock.UnlockInfo unlockInfo = getUserUnlock(e.msg.sender, i);
    maturesAtTimestamp = unlockInfo.unlockedAt;
    amount = unlockInfo.amount;
    require maturesAtTimestamp < e.block.timestamp && amount > 0;
    withdraw@withrevert(e);
    assert lastReverted;
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
    ghostLocked = ghostLocked + (value - old_value);
    userLocks[user] = value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
    ghostUnlocked = ghostUnlocked + (value - old_value);
    userUnlocks[key] = value;
}

// hook Sload uint96 value SafeTokenLockHarness.users[KEY address user].locked STORAGE {

// }

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked() 
    to_mathint(safeToken.balanceOf(currentContract)) >= ghostLocked + ghostUnlocked;


// rule unlockedTokensAlwaysLessOrEqualLocked{
//    // userUnlocks[user] + userLocks[user] sum should not change on unlock or (except withdraw or lock)
// }
// invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
//     userUnlocks[user] <= userLocks[user];

// When total locked increases, contract balance increases
rule contractBalanceIncreasesWhenTotalLockedIncreases(method f) filtered {
    f -> onlyStateChangingAction(f)
} {
    env e;
    setup(e);
    calldataarg args;
    mathint totalLockedBefore = ghostLocked;
    uint256 contractBalanceBefore = safeToken.balanceOf(e, currentContract);
    f(e, args);
    mathint totalLockedAfter = ghostLocked;
    uint256 contractBalanceAfter = safeToken.balanceOf(e, currentContract);
    assert (totalLockedAfter - totalLockedBefore > 0) => (contractBalanceAfter - contractBalanceBefore > 0);
}

invariant sumOfUserUnlock(address u)
    to_mathint(getUser(u).unlocked) == userUnlocks[u];

// atleast 1 good case that user can withdraw all tokens using satisfy
rule possibleToFullyWithdraw(address sender, uint96 amount) {
    
    env eL; // env for lock
    env eU; // env for unlock
    env eW; // env for withdraw
    setup(eL);
    uint256 balanceBefore = safeToken.balanceOf(sender);
    require eL.msg.sender == sender;
    require eU.msg.sender == sender;
    require eW.msg.sender == sender;

    require amount > 0;
    lock(eL, amount);

    uint96 unlockAmount;
    require unlockAmount <= amount;

    unlock(eU, unlockAmount);

    withdraw(eW);
    satisfy (balanceBefore == safeToken.balanceOf(sender));
}

// if unlock index x < unlock index y, then unlock timestamp of x < unlock timestamp of y
rule unlockTimestampOnlyIncreases(uint32 x, uint32 y) {
    require x < y;
    env e;
    setup(e);
    uint256 xTimestamp;
    uint96 xAmount;

    SafeTokenLock.UnlockInfo unlockInfo1 =  getUserUnlock(e.msg.sender, x);
    xTimestamp = unlockInfo1.unlockedAt;
    xAmount = unlockInfo1.amount;
    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require xAmount > 0;
    
    uint256 yTimestamp;
    uint96 yAmount;
        
    SafeTokenLock.UnlockInfo unlockInfo2 = getUserUnlock(e.msg.sender, y);
    yTimestamp = unlockInfo2.unlockedAt; 
    yAmount = unlockInfo2.amount;

    // make use that contract state is such that msg.sender has requested unlock(xAmount)
    require yAmount > 0;

    assert xTimestamp < yTimestamp;
}

// invariant: if there is an unlock, then start must be less than end
invariant unlockStartLessThanUnlockEnd(address u)
    (getUser(u).unlocked > 0) => getUser(u).unlockStart < getUser(u).unlockEnd;

rule unlockTimestampNeverZero() {
    env e;
    setup(e);
    uint96 amount;
    uint96 unlockAmount;
    require unlockAmount > 0 && unlockAmount <= amount && amount > 0;
    
    lock(e,amount);
    uint32 id;
    id = unlock(e, unlockAmount);

    assert getUserUnlock(e.msg.sender, id).amount == unlockAmount;
    assert getUserUnlock(e.msg.sender, id).unlockedAt > 0;
}

// TODO If everything is withdrawn, then cannot withdraw again
// TODO withdraw(x+y) equivalent to withdraw(x) and withdraw(y)
// TODO withdraw() greater or equal withdraw(x1)
