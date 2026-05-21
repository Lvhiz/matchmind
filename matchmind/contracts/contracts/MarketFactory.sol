// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PredictionMarket} from "./PredictionMarket.sol";

/**
 * @title MarketFactory
 * @author MatchMind
 * @notice Deploys and indexes {PredictionMarket} instances for the MatchMind AI agent on X Layer mainnet.
 */
contract MarketFactory is Ownable {
    /// @notice Maximum fee percentage mirrored from {PredictionMarket}.
    uint256 public constant MAX_FEE_PERCENT = 5;

    /// @notice Oracle relayer passed to every new market as the sole resolver.
    address public oracleRelayer;

    /// @notice USDT token used for all market stakes (6 decimals on X Layer).
    address public usdt;

    /// @notice Recipient of claim-time fees on deployed markets.
    address public feeRecipient;

    /// @notice AI agent wallet allowed to create markets.
    address public agent;

    /// @notice Protocol admin (factory deployer) passed to every new market.
    address public immutable admin;

    /// @notice All markets ever deployed by this factory.
    address[] private _allMarkets;

    event OracleRelayerUpdated(address indexed previous, address indexed current);
    event UsdtUpdated(address indexed previous, address indexed current);
    event FeeRecipientUpdated(address indexed previous, address indexed current);
    event AgentUpdated(address indexed previous, address indexed current);
    event MarketCreated(
        address indexed market,
        string question,
        uint256 expiry,
        uint256 timestamp
    );

    error ZeroAddress();
    error NotAgent();
    error InvalidExpiry();
    error InvalidFeePercent();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    /**
     * @notice Deploy the factory with core protocol addresses.
     * @param _oracleRelayer Oracle relayer authorised to resolve markets.
     * @param _usdt USDT token address on X Layer.
     * @param _feeRecipient Fee recipient for all deployed markets.
     * @param _agent AI agent wallet allowed to call {createMarket}.
     */
    constructor(
        address _oracleRelayer,
        address _usdt,
        address _feeRecipient,
        address _agent
    ) Ownable(msg.sender) {
        if (
            _oracleRelayer == address(0) ||
            _usdt == address(0) ||
            _feeRecipient == address(0) ||
            _agent == address(0)
        ) {
            revert ZeroAddress();
        }

        oracleRelayer = _oracleRelayer;
        usdt = _usdt;
        feeRecipient = _feeRecipient;
        agent = _agent;
        admin = msg.sender;
    }

    /**
     * @notice Update the oracle relayer address (new markets only unless markets support migration).
     * @param _oracleRelayer New relayer address.
     */
    function setOracleRelayer(address _oracleRelayer) external onlyOwner {
        if (_oracleRelayer == address(0)) revert ZeroAddress();
        address previous = oracleRelayer;
        oracleRelayer = _oracleRelayer;
        emit OracleRelayerUpdated(previous, _oracleRelayer);
    }

    /**
     * @notice Update the USDT token address used for new markets.
     * @param _usdt New token address.
     */
    function setUsdt(address _usdt) external onlyOwner {
        if (_usdt == address(0)) revert ZeroAddress();
        address previous = usdt;
        usdt = _usdt;
        emit UsdtUpdated(previous, _usdt);
    }

    /**
     * @notice Update the fee recipient for newly deployed markets.
     * @param _feeRecipient New fee recipient.
     */
    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        address previous = feeRecipient;
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(previous, _feeRecipient);
    }

    /**
     * @notice Update the authorised AI agent address.
     * @param _agent New agent wallet.
     */
    function setAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        address previous = agent;
        agent = _agent;
        emit AgentUpdated(previous, _agent);
    }

    /**
     * @notice Deploy a new prediction market. Callable only by the AI agent.
     * @param question Human-readable market question.
     * @param expiryTimestamp Unix timestamp when staking closes.
     * @param feePct Fee on winnings, 0–5 (whole percent).
     * @return market Address of the deployed {PredictionMarket}.
     */
    function createMarket(
        string calldata question,
        uint256 expiryTimestamp,
        uint256 feePct
    ) external onlyAgent returns (address market) {
        if (expiryTimestamp <= block.timestamp) revert InvalidExpiry();
        if (feePct > MAX_FEE_PERCENT) revert InvalidFeePercent();

        PredictionMarket pm = new PredictionMarket(
            question,
            expiryTimestamp,
            feePct,
            oracleRelayer,
            usdt,
            feeRecipient,
            admin
        );

        market = address(pm);
        _allMarkets.push(market);

        emit MarketCreated(market, question, expiryTimestamp, block.timestamp);
    }

    /**
     * @notice Return addresses of markets that have not yet been resolved.
     * @return active Unresolved market addresses.
     */
    function getActiveMarkets() external view returns (address[] memory active) {
        uint256 len = _allMarkets.length;
        uint256 activeCount;

        for (uint256 i; i < len; ) {
            if (!PredictionMarket(_allMarkets[i]).resolved()) {
                unchecked {
                    ++activeCount;
                }
            }
            unchecked {
                ++i;
            }
        }

        active = new address[](activeCount);
        uint256 index;

        for (uint256 i; i < len; ) {
            address m = _allMarkets[i];
            if (!PredictionMarket(m).resolved()) {
                active[index] = m;
                unchecked {
                    ++index;
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Return every market address created by this factory.
     * @return markets Full history of deployed markets.
     */
    function getAllMarkets() external view returns (address[] memory markets) {
        return _allMarkets;
    }

    /**
     * @notice Total number of markets ever created.
     * @return count Market count.
     */
    function marketCount() external view returns (uint256 count) {
        return _allMarkets.length;
    }
}
