using SafeToken as safeToken;

methods {

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;

    function SafeToken.balanceOf(address) external returns(uint256) envfree;

}

// a cvl function for precondition assumptions 
function setup(env e){
    require getSafeTokenAddress() == safeToken;
}

ghost mapping(address => mathint) userUnlocks {
    init_state axiom forall address X.userUnlocks[X] == 0;
}

ghost mapping(address => mathint) userLocks {
    init_state axiom forall address X.userLocks[X] == 0;
}

hook Sload uint96 v currentContract.users[KEY address user].locked STORAGE {
    require assert_uint96(userLocks[user]) == v;
}

hook Sload uint96 v currentContract.users[KEY address user].unlocked STORAGE {
    require assert_uint96(userUnlocks[user]) == v;
}

// hook Sload uint96 v currentContract.users[KEY bytes32 ilk].locked STORAGE {
//     require ArtGhost[ilk] == v;
// }


// Used to track total sum of locked tokens
ghost ghostLocked() returns uint256 {
    init_state axiom ghostLocked() == 0;
}

// Used to track total sum of unlocked tokens
ghost ghostUnLocked() returns uint256 {
    init_state axiom ghostUnLocked() == 0;
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
    assert balanceAfter == assert_uint256(balanceBefore + beforeWithdraw);
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
  havoc ghostLocked assuming ghostLocked@new() == assert_uint256(ghostLocked@old() + (value - old_value));
  userLocks[user] = userLocks[user] + value;
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
   havoc ghostUnLocked assuming ghostUnLocked@new() == assert_uint256(ghostUnLocked@old() + (value - old_value));
   userUnlocks[key] =  userUnlocks[key] + value;
}

// hook Sload uint96 value SafeTokenLockHarness.users[KEY address user].locked STORAGE {

// }

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked() 
    safeToken.balanceOf(currentContract) >= assert_uint256(ghostLocked() + ghostUnLocked());


invariant unlockedTokensAlwaysLessOrEqualLocked(address user) 
    userUnlocks[user] <= userLocks[user];

// When total locked increases, contract balance increases
rule contractBalanceIncreasesWhenTotalLockedIncreases(method f) {
    env e;
    setup(e);
    calldataarg args;
    uint256 totalLockedBefore = ghostLocked();
    uint256 contractBalanceBefore = safeToken.balanceOf(e, currentContract);
    f(e, args);
    uint256 totalLockedAfter = ghostLocked();
    uint256 contractBalanceAfter = safeToken.balanceOf(e, currentContract);
    assert (totalLockedAfter - totalLockedBefore > 0) => (contractBalanceAfter - contractBalanceBefore > 0);
}

invariant sumOfUserUnlock(address u)
    getUser(u).unlocked == assert_uint96(userUnlocks[u]);

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
invariant unlockIndexInBetweenStartAndEnd(address u)
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
