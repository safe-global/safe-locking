methods {
    function allowance(address owner, address spender) external returns (uint256) envfree;
    function balanceOf(address account) external returns (uint256) envfree;
    function totalSupply() external returns (uint256) envfree;
}

definition UINT256_MAX() returns mathint = 2^256 - 1;

rule allowanceNoRevert (address owner, address spender) {
    allowance@withrevert(owner, spender);
    assert !lastReverted;
}

rule balanceOfNoRevert (address owner) {
    balanceOf@withrevert(owner);
    assert !lastReverted;
}

rule totalSupplyNoRevert () {
    totalSupply@withrevert();
    assert !lastReverted;
}

rule transferOk (address to, uint256 amount) {
    env e;

    mathint balanceFromBefore = balanceOf(e.msg.sender);
    mathint balanceToBefore = balanceOf(to);

    transfer(e, to, amount);

    mathint balanceFromAfter = balanceOf(e.msg.sender);
    mathint balanceToAfter = balanceOf(to);

    if (e.msg.sender != to) {
        assert balanceFromBefore - amount == balanceFromAfter;
        assert balanceToBefore + amount == balanceToAfter;
    } else {
        assert balanceToBefore == balanceToAfter;
    }
}

rule transferFromOk (address from, address to, uint256 amount) {
    env e;

    mathint allowanceBefore = allowance(from, e.msg.sender);
    mathint balanceFromBefore = balanceOf(from);
    mathint balanceToBefore = balanceOf(to);

    transferFrom(e, from, to, amount);

    mathint allowanceAfter = allowance(from, e.msg.sender);
    mathint balanceFromAfter = balanceOf(from);
    mathint balanceToAfter = balanceOf(to);

    assert allowanceBefore >= to_mathint(amount);
    if (allowanceBefore == UINT256_MAX()) {
        assert allowanceAfter == UINT256_MAX();
    } else {
        assert allowanceBefore - amount == allowanceAfter;
    }

    if (from != to) {
        assert balanceFromBefore - amount == balanceFromAfter;
        assert balanceToBefore + amount == balanceToAfter;
    } else {
        assert balanceToBefore == balanceToAfter;
    }

    satisfy amount == 1;
}

rule transferFromCumulative (address from, address to, uint256 amount1, uint256 amount2) {
    env e;

    require from != to; // cumulativity ONLY valid when from != to

    storage init = lastStorage;

    transferFrom(e, from, to, amount1);
    transferFrom(e, from, to, amount2);

    storage after1 = lastStorage;

    uint256 amountSum = assert_uint256(amount1 + amount2);
    transferFrom@withrevert(e, from, to, amountSum) at init;
    assert !lastReverted;

    storage after2 = lastStorage;

    assert after1 == after2;
}

rule transferFromCommutative (address from, address to, uint256 amount1, uint256 amount2) {
    env e;

    storage init = lastStorage;

    transferFrom(e, from, to, amount1);
    transferFrom(e, from, to, amount2);

    storage after1 = lastStorage;

    transferFrom@withrevert(e, from, to, amount2) at init;
    assert !lastReverted;
    transferFrom@withrevert(e, from, to, amount1);
    assert !lastReverted;

    storage after2 = lastStorage;

    assert after1 == after2;
}

rule totalSupplyIsConstant (method f) filtered {
    f -> !f.isView
} {
    env e;
    calldataarg arg;

    mathint totalSupplyBefore = totalSupply();

    f(e, arg);

    mathint totalSupplyAfter = totalSupply();

    assert totalSupplyBefore == totalSupplyAfter;
}

ghost mathint totalBalance {
    init_state axiom totalBalance == 0;
}

hook Sstore _balances[KEY address account] uint256 v (uint256 oldV) STORAGE {
    totalBalance = totalBalance + v - oldV;
}

invariant totalSupplyEqualsTotalBalance()
    to_mathint(totalSupply()) == totalBalance;
