// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPredictionMarket} from "./interfaces/IPredictionMarket.sol";

/**
 * @title OracleRelayer
 * @author MatchMind
 * @notice Bridges off-chain AI oracle signatures to on-chain market resolution on X Layer mainnet.
 * @dev Agent-signed resolutions are preferred; owner may resolve 2 hours after expiry as a fallback.
 */
contract OracleRelayer is Ownable {
    /// @notice Authorised AI agent wallet that signs resolutions.
    address public agent;

    /// @notice Grace period after expiry before the owner may force-resolve.
    uint256 public constant RESOLUTION_FALLBACK_DELAY = 2 hours;

    event AgentUpdated(address indexed previousAgent, address indexed newAgent);
    event MarketResolved(address indexed market, bool outcome, uint256 timestamp);

    error ZeroAddress();
    error NotAgent();
    error InvalidSignature();
    error MarketAlreadyResolved();
    error FallbackTooEarly();
    error InvalidMarket();

    /**
     * @notice Deploy the relayer and set the initial agent address.
     * @param initialAgent AI oracle wallet authorised to sign resolutions.
     */
    constructor(address initialAgent) Ownable(msg.sender) {
        if (initialAgent == address(0)) revert ZeroAddress();
        agent = initialAgent;
        emit AgentUpdated(address(0), initialAgent);
    }

    /**
     * @notice Update the authorised AI agent address.
     * @param newAgent New agent wallet address.
     */
    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        address previous = agent;
        agent = newAgent;
        emit AgentUpdated(previous, newAgent);
    }

    /**
     * @notice Resolve a market using an ECDSA signature from the authorised agent.
     * @param market Prediction market contract address.
     * @param outcome Winning side (`true` = Yes, `false` = No).
     * @param signature Agent signature over the resolution payload (65-byte ECDSA).
     */
    function resolveMarket(
        address market,
        bool outcome,
        bytes calldata signature
    ) external {
        _verifyAgentSignature(market, outcome, signature);
        _resolve(market, outcome);
    }

    /**
     * @notice Owner fallback: resolve an expired market that remains unresolved after 2 hours.
     * @param market Prediction market contract address.
     * @param outcome Winning side (`true` = Yes, `false` = No).
     */
    function resolveMarketFallback(address market, bool outcome) external onlyOwner {
        IPredictionMarket m = IPredictionMarket(market);
        if (m.resolved()) revert MarketAlreadyResolved();
        if (block.timestamp < m.expiryTimestamp() + RESOLUTION_FALLBACK_DELAY) {
            revert FallbackTooEarly();
        }
        _resolve(market, outcome);
    }

    /**
     * @notice Recover the signer of an agent resolution payload.
     * @param market Market address included in the signed message.
     * @param outcome Outcome included in the signed message.
     * @param signature ECDSA signature (EIP-191 eth_sign style).
     * @return signer Recovered signer address.
     */
    function recoverSigner(
        address market,
        bool outcome,
        bytes calldata signature
    ) external view returns (address signer) {
        bytes32 digest = _resolutionDigest(market, outcome);
        return ECDSA.recover(digest, signature);
    }

    /**
     * @dev Hash signed by the agent: keccak256(abi.encodePacked(market, outcome, chainId, address(this))).
     */
    function _resolutionDigest(address market, bool outcome) internal view returns (bytes32) {
        bytes32 payload = keccak256(
            abi.encodePacked(market, outcome, block.chainid, address(this))
        );
        return _toEthSignedMessageHash(payload);
    }

    /**
     * @dev EIP-191 prefix for a 32-byte payload (`"\x19Ethereum Signed Message:\n32"`).
     */
    function _toEthSignedMessageHash(bytes32 payload) private pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", payload));
    }

    /**
     * @dev Require `signature` to be from the configured agent wallet.
     */
    function _verifyAgentSignature(
        address market,
        bool outcome,
        bytes calldata signature
    ) internal view {
        if (market == address(0)) revert InvalidMarket();

        bytes32 digest = _resolutionDigest(market, outcome);
        address signer = ECDSA.recover(digest, signature);

        if (signer != agent) revert InvalidSignature();
    }

    /**
     * @dev Call {IPredictionMarket.resolve} and emit {MarketResolved}.
     */
    function _resolve(address market, bool outcome) internal {
        IPredictionMarket m = IPredictionMarket(market);
        if (m.resolved()) revert MarketAlreadyResolved();

        m.resolve(outcome);

        emit MarketResolved(market, outcome, block.timestamp);
    }
}
