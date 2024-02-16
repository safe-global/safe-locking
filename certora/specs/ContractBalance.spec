import "../helpers/erc20.spec";
using SafeToken as safeToken;

methods {

    // SafeTokenLock functions
    function lock(uint96) external returns(uint32);
    function unlock(uint32, uint96) external returns(bool);
    function withdraw(uint32) external returns (uint96);

    // Harnessed functions
    function getUser(address userAddress) external returns(SafeTokenLock.User memory) envfree;
    function getUserUnlock(address userAddress, uint32 index) external returns(SafeTokenLock.UnlockInfo memory) envfree;
    function getSafeTokenAddress() external returns(address) envfree;
    function getStartAndEnd(address userAddress) external returns(uint32, uint32) envfree;
    function safeToken.balanceOf(address) external returns(uint256) envfree;

    // function SafeToken.allowance(address,address) external returns(uint256) envfree;
}

// a cvl function for precondition assumptions 
function setup(env e){
}

function safeAssumptions(address a, env e) {
    require e.msg.sender != currentContract;
    requireInvariant noAllowance(a, e);
}

invariant noAllowance(address a, env e1)
    safeToken.allowance(e1, a, e1.msg.sender) == 0
{ preserved with (env e) { safeAssumptions(a, e); } }

// Used to track total sum of locked tokens
ghost mathint ghostLocked {
    init_state axiom ghostLocked == 0;
}

ghost mathint ghostUnlocked {
    init_state axiom ghostUnlocked == 0;
}

// hook to update sum of locked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address user].locked uint96 value (uint96 old_value) STORAGE {
    ghostLocked = ghostLocked + (value - old_value);
}

// hook to update sum of unlocked tokens whenever user struct is updated
hook Sstore SafeTokenLockHarness.users[KEY address key].unlocked uint96 value (uint96 old_value) STORAGE {
    ghostUnlocked = ghostUnlocked + (value - old_value);
}

invariant contractBalanceGreaterThanSumOfLockedAndUnlocked(address a) 
    to_mathint(safeToken.balanceOf(currentContract)) >= ghostLocked + ghostUnlocked
{
    preserved with (env e) {
       safeAssumptions(a, e);
    }
}