// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PredictionMarket
 * @author MatchMind
 * @notice Binary prediction market settled in USDT (6 decimals) on X Layer mainnet.
 * @dev Stakes are bounded by MIN_STAKE / MAX_STAKE for hackathon-safe real-money exposure.
 */
contract PredictionMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Minimum stake: 0.01 USDT (6-decimal units).
    uint256 public constant MIN_STAKE = 10_000;

    /// @notice Maximum stake: 5 USDT (6-decimal units).
    uint256 public constant MAX_STAKE = 5_000_000;

    /// @notice Maximum fee percentage (whole percent, e.g. 5 = 5%).
    uint256 public constant MAX_FEE_PERCENT = 5;

    /// @notice Seconds after expiry before owner may trigger emergency refunds.
    uint256 public constant EMERGENCY_REFUND_DELAY = 48 hours;

    /// @notice Human-readable market question.
    string public question;

    /// @notice Unix timestamp after which new stakes are rejected.
    uint256 public expiryTimestamp;

    /// @notice Fee percentage applied to winnings (0–5).
    uint256 public feePercent;

    /// @notice Oracle relayer authorised to resolve this market.
    address public oracle;

    /// @notice USDT (or compatible) ERC-20 used for stakes.
    IERC20 public immutable token;

    /// @notice Recipient of protocol fees taken at claim time.
    address public immutable feeRecipient;

    /// @notice Protocol admin (deployer) authorised to trigger emergency refunds.
    address public immutable admin;

    /// @notice Timestamp from which staking is allowed (deployment time).
    uint256 public immutable openTimestamp;

    /// @notice Whether the market has been resolved.
    bool public resolved;

    /// @notice Winning side after resolution (`true` = Yes, `false` = No).
    bool public winningSide;

    /// @notice Total USDT staked on the Yes side.
    uint256 public yesPool;

    /// @notice Total USDT staked on the No side.
    uint256 public noPool;

    struct Position {
        bool side;
        uint256 amount;
        bool claimed;
        bool refunded;
    }

    mapping(address => Position) private _positions;

    /// @notice Stakers registered for batch emergency refunds.
    address[] private _stakers;

    event Staked(address indexed user, bool side, uint256 amount);
    event Resolved(bool outcome);
    event Claimed(address indexed user, uint256 amount);

    error MarketAlreadyResolved();
    error MarketNotResolved();
    error MarketNotOpen();
    error MarketExpired();
    error InvalidStakeAmount();
    error AlreadyStaked();
    error NotOracle();
    error NotAdmin();
    error NotWinner();
    error AlreadyClaimed();
    error AlreadyRefunded();
    error EmergencyRefundNotAvailable();
    error InvalidFeePercent();
    error ZeroAddress();
    error InvalidExpiry();

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /**
     * @notice Deploy a new binary prediction market.
     * @param _question Human-readable question text.
     * @param _expiryTimestamp Unix timestamp when staking closes.
     * @param _feePercent Fee on winnings, 0–5 (whole percent).
     * @param _oracle Oracle relayer address allowed to call {resolve}.
     * @param _token USDT token address (6 decimals).
     * @param _feeRecipient Address receiving protocol fees.
     * @param _admin Protocol admin (deployer) allowed to call {emergencyRefund}.
     */
    constructor(
        string memory _question,
        uint256 _expiryTimestamp,
        uint256 _feePercent,
        address _oracle,
        address _token,
        address _feeRecipient,
        address _admin
    ) Ownable(msg.sender) {
        if (
            _oracle == address(0) ||
            _token == address(0) ||
            _feeRecipient == address(0) ||
            _admin == address(0)
        ) {
            revert ZeroAddress();
        }
        if (_expiryTimestamp <= block.timestamp) revert InvalidExpiry();
        if (_feePercent > MAX_FEE_PERCENT) revert InvalidFeePercent();

        question = _question;
        expiryTimestamp = _expiryTimestamp;
        feePercent = _feePercent;
        oracle = _oracle;
        token = IERC20(_token);
        feeRecipient = _feeRecipient;
        admin = _admin;
        openTimestamp = block.timestamp;
    }

    /**
     * @notice Stake USDT on Yes (`side = true`) or No (`side = false`).
     * @param side `true` for Yes, `false` for No.
     * @param amount Stake size in token base units (6 decimals for USDT).
     */
    function stake(bool side, uint256 amount) external nonReentrant {
        if (resolved) revert MarketAlreadyResolved();
        if (block.timestamp < openTimestamp) revert MarketNotOpen();
        if (block.timestamp >= expiryTimestamp) revert MarketExpired();
        if (amount < MIN_STAKE || amount > MAX_STAKE) revert InvalidStakeAmount();

        Position storage pos = _positions[msg.sender];
        if (pos.amount != 0) revert AlreadyStaked();

        token.safeTransferFrom(msg.sender, address(this), amount);

        pos.side = side;
        pos.amount = amount;
        _stakers.push(msg.sender);

        if (side) {
            yesPool += amount;
        } else {
            noPool += amount;
        }

        emit Staked(msg.sender, side, amount);
    }

    /**
     * @notice Resolve the market to Yes or No. Callable only by the oracle relayer.
     * @param outcome `true` if Yes wins, `false` if No wins.
     */
    function resolve(bool outcome) external onlyOracle {
        if (resolved) revert MarketAlreadyResolved();

        resolved = true;
        winningSide = outcome;

        emit Resolved(outcome);
    }

    /**
     * @notice Claim winnings after resolution.
     * @dev Pays original stake plus proportional share of the losing pool, minus fee on winnings.
     */
    function claim() external nonReentrant {
        if (!resolved) revert MarketNotResolved();

        Position storage pos = _positions[msg.sender];
        if (pos.amount == 0) revert NotWinner();
        if (pos.side != winningSide) revert NotWinner();
        if (pos.claimed) revert AlreadyClaimed();

        uint256 winningPool = winningSide ? yesPool : noPool;
        uint256 losingPool = winningSide ? noPool : yesPool;

        uint256 stakeAmount = pos.amount;
        uint256 winnings = 0;
        if (winningPool > 0 && losingPool > 0) {
            winnings = (stakeAmount * losingPool) / winningPool;
        }

        uint256 fee = (winnings * feePercent) / 100;
        uint256 payout = stakeAmount + winnings - fee;

        pos.claimed = true;

        if (fee > 0) {
            token.safeTransfer(feeRecipient, fee);
        }
        token.safeTransfer(msg.sender, payout);

        emit Claimed(msg.sender, payout);
    }

    /**
     * @notice Admin safety net: refund every staker if the market is still unresolved 48h after expiry.
     * @dev Only the protocol admin (factory deployer) may call this on mainnet.
     */
    function emergencyRefund() external onlyAdmin nonReentrant {
        if (resolved) revert MarketAlreadyResolved();
        if (block.timestamp < expiryTimestamp + EMERGENCY_REFUND_DELAY) {
            revert EmergencyRefundNotAvailable();
        }

        uint256 len = _stakers.length;
        for (uint256 i; i < len; ) {
            _refundStaker(_stakers[i]);
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Refund a single staker's original stake during an emergency refund sweep.
     * @param staker Address to refund.
     */
    function _refundStaker(address staker) internal {
        Position storage pos = _positions[staker];
        if (pos.amount == 0 || pos.refunded) {
            return;
        }

        uint256 refundAmount = pos.amount;
        bool side = pos.side;

        pos.refunded = true;
        pos.amount = 0;

        if (side) {
            yesPool -= refundAmount;
        } else {
            noPool -= refundAmount;
        }

        token.safeTransfer(staker, refundAmount);
    }

    /**
     * @notice Return implied Yes / No odds as integer percentages (0–100).
     * @return yesPercent Share of total pool on Yes side.
     * @return noPercent Share of total pool on No side.
     */
    function getOdds() external view returns (uint256 yesPercent, uint256 noPercent) {
        uint256 total = yesPool + noPool;
        if (total == 0) {
            return (50, 50);
        }
        yesPercent = (yesPool * 100) / total;
        noPercent = 100 - yesPercent;
    }

    /**
     * @notice Total USDT locked in the market (both sides).
     * @return Total pool size in token base units.
     */
    function getTotalPool() external view returns (uint256) {
        return yesPool + noPool;
    }

    /**
     * @notice Return a user's stake side and amount.
     * @param user Staker address to query.
     * @return side `true` = Yes, `false` = No.
     * @return amount Staked amount (0 if none).
     */
    function getUserStake(address user) external view returns (bool side, uint256 amount) {
        Position storage pos = _positions[user];
        return (pos.side, pos.amount);
    }
}
