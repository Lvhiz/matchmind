// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title IPredictionMarket
 * @notice Minimal interface used by {OracleRelayer} to resolve markets.
 */
interface IPredictionMarket {
    function expiryTimestamp() external view returns (uint256);

    function resolved() external view returns (bool);

    function resolve(bool outcome) external;
}
