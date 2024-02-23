methods {
    function VERIFIER() external returns (address) envfree;
    function X() external returns (uint256) envfree;
    function Y() external returns (uint256) envfree;

    function harnessVerifierIsAddress() external returns (bool) envfree;

    function _signingMessage(
        bytes calldata authenticatorData,
        bytes32 challenge,
        bytes calldata clientDataFields
    ) internal returns (bytes32)
        => signingMessageSummary(authenticatorData, challenge, clientDataFields);

    function _verifySignatureAllowMalleability(
        address verifier,
        bytes32 message,
        uint256 r,
        uint256 s,
        uint256 x,
        uint256 y
    ) internal returns (bool)
        => verifySummary(verifier, message, r, s, x, y);
}

ghost bytes32 lastSigningMessageResult;

function signingMessageSummary(bytes authenticatorData, bytes32 challenge, bytes clientDataFields) returns bytes32 {
    bytes32 result;
    lastSigningMessageResult = result;
    return result;
}

ghost bool lastVerificationParametersMatch;
ghost bool lastVerificationResult;

invariant verifierIsAlwaysAnAddress()
    harnessVerifierIsAddress();

function verifySummary(address verifier, bytes32 message, uint256 r, uint256 s, uint256 x, uint256 y) returns bool {
    bool result;
    requireInvariant verifierIsAlwaysAnAddress();
    lastVerificationParametersMatch = (
        verifier == VERIFIER()
        && message == lastSigningMessageResult
        && x == X()
        && y == Y()
    );
    lastVerificationResult = result;
    return result;
}

definition MAGIC_VALUE() returns bytes4 = to_bytes4(0x1626ba7e);

rule isValidSignatureReturnsZeroOrMagicValue() {
    env e;

    lastVerificationParametersMatch = true;
    lastVerificationResult = false;

    bytes32 message;
    bytes signature;

    bytes4 result = isValidSignature(e, message, signature);
    assert lastVerificationParametersMatch;

    assert (result == to_bytes4(0) && !lastVerificationResult)
        || (result == MAGIC_VALUE() && lastVerificationResult);
    satisfy result == MAGIC_VALUE();
}


