// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Interface for the DelphiToken (TRC20) to allow staking and unstaking.
interface IDelphiToken {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// Interface for the Optimistic Oracle to allow the DAO to resolve disputes.
interface IDelphiOptimisticOracle {
    function resolveDispute(bytes32 questionId, int256 finalOutcome) external;
    // We also need access to the outcome constants for validation
    function OUTCOME_NO() external view returns (int256);
    function OUTCOME_YES() external view returns (int256);
    function OUTCOME_SPLIT() external view returns (int256);
    function OUTCOME_EARLY_REQUEST() external view returns (int256);
}

/**
 * @title DisputeResolutionDAO
 * @author Project Delphi Team
 * @notice A DAO that allows DELPHIToken holders to stake their tokens and vote to
 * resolve disputes escalated from the DelphiOptimisticOracle.
 */
contract DisputeResolutionDAO {

    // ==================================================================
    //                             STATE
    // ==================================================================

    IDelphiToken public immutable delphiToken;
    IDelphiOptimisticOracle public immutable oracle;

    // uint256 public constant VOTING_PERIOD_SECONDS = 72 hours; // 3-day voting period
    uint256 public constant VOTING_PERIOD_SECONDS = 20 seconds; // 20 seconds for testing

    // Tracks the amount of DELPHIToken staked by each user.
    mapping(address => uint256) public stakedBalances;

    // A struct to manage the state of each dispute's vote.
    struct DisputeVote {
        bool exists;
        uint256 votingDeadline;
        // Mapping from an outcome (e.g., 0 for NO, 1 for YES) to the total stake voted for it.
        mapping(int256 => uint256) votesPerOutcome;
        // Mapping to ensure each user can only vote once per dispute.
        mapping(address => bool) hasVoted;
    }

    // Maps a questionId from the oracle to its corresponding vote in the DAO.
    mapping(bytes32 => DisputeVote) public disputes;

    // ==================================================================
    //                              EVENTS
    // ==================================================================

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event DisputeCreated(bytes32 indexed questionId, uint256 votingDeadline);
    event Voted(bytes32 indexed questionId, address indexed voter, int256 outcome, uint256 stakeAmount);
    event DisputeResolved(bytes32 indexed questionId, int256 winningOutcome, uint256 totalVotes);


    // ==================================================================
    //                              ERRORS
    // ==================================================================

    error NotTheOracle();
    error NoStake();
    error AlreadyVoted();
    error DisputeNotActive();
    error VotingPeriodNotOver();
    error InvalidVoteOutcome(int256 outcome);

    // ==================================================================
    //                            MODIFIERS
    // ==================================================================

    modifier onlyOracle() {
        if (msg.sender != address(oracle)) revert NotTheOracle();
        _;
    }

    // ==================================================================
    //                           CONSTRUCTOR
    // ==================================================================

    constructor(address _tokenAddress, address _oracleAddress) {
        delphiToken = IDelphiToken(_tokenAddress);
        oracle = IDelphiOptimisticOracle(_oracleAddress);
    }

    // ==================================================================
    //                       STAKING FUNCTIONS
    // ==================================================================

    /**
     * @notice Stakes DELPHITokens to gain voting power in the DAO.
     * @dev The user must first approve this contract to spend their tokens.
     * @param amount The amount of DELPHIToken to stake.
     */
    function stake(uint256 amount) external {
        require(amount > 0, "Cannot stake 0 tokens");
        // Pull tokens from the user to this contract. User must approve first.
        bool success = delphiToken.transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed. Did you approve the contract?");
        stakedBalances[msg.sender] += amount;
        emit Staked(msg.sender, amount);
    }

    /**
     * @notice Unstakes DELPHITokens, removing voting power.
     * @param amount The amount of DELPHIToken to unstake.
     */
    function unstake(uint256 amount) external {
        require(amount > 0, "Cannot unstake 0 tokens");
        require(stakedBalances[msg.sender] >= amount, "Insufficient staked balance");
        stakedBalances[msg.sender] -= amount;
        // Send tokens from this contract back to the user.
        bool success = delphiToken.transfer(msg.sender, amount);
        require(success, "Token transfer failed");
        emit Unstaked(msg.sender, amount);
    }

    // ==================================================================
    //                        CORE DAO FUNCTIONS
    // ==================================================================

    /**
     * @notice Initiates a new voting session for a disputed question.
     * @dev This function can ONLY be called by the whitelisted Oracle contract.
     * @param questionId The unique identifier for the question from the Oracle.
     */
    function createDispute(bytes32 questionId) external onlyOracle {
        require(!disputes[questionId].exists, "Dispute already exists");

        DisputeVote storage newVote = disputes[questionId];
        newVote.exists = true;
        newVote.votingDeadline = block.timestamp + VOTING_PERIOD_SECONDS;

        emit DisputeCreated(questionId, newVote.votingDeadline);
    }

    /**
     * @notice Cast a vote on an active dispute.
     * @dev The voter's entire staked balance is committed to their chosen outcome.
     * @param questionId The identifier of the dispute to vote on.
     * @param outcome The outcome to vote for (must be one of the Oracle's standardized outcomes).
     */
    function vote(bytes32 questionId, int256 outcome) external {
        DisputeVote storage disputeVote = disputes[questionId];
        if (!disputeVote.exists || block.timestamp > disputeVote.votingDeadline) {
            revert DisputeNotActive();
        }
        if (stakedBalances[msg.sender] == 0) revert NoStake();
        if (disputeVote.hasVoted[msg.sender]) revert AlreadyVoted();

        // Validate that the vote is for a legitimate outcome
        if (
            outcome != oracle.OUTCOME_NO() &&
            outcome != oracle.OUTCOME_YES() &&
            outcome != oracle.OUTCOME_SPLIT() &&
            outcome != oracle.OUTCOME_EARLY_REQUEST()
        ) {
            revert InvalidVoteOutcome(outcome);
        }

        disputeVote.hasVoted[msg.sender] = true;
        disputeVote.votesPerOutcome[outcome] += stakedBalances[msg.sender];

        emit Voted(questionId, msg.sender, outcome, stakedBalances[msg.sender]);
    }

    /**
     * @notice Tallies the votes for a dispute and resolves it on the Oracle.
     * @dev Can be called by anyone, but only after the voting period has ended.
     * @param questionId The identifier of the dispute to resolve.
     */
    function tallyAndResolve(bytes32 questionId) external {
        DisputeVote storage disputeVote = disputes[questionId];
        if (!disputeVote.exists) revert DisputeNotActive();
        if (block.timestamp <= disputeVote.votingDeadline) revert VotingPeriodNotOver();

        // Find the winning outcome by iterating through the standard outcomes.
        int256 winningOutcome = oracle.OUTCOME_NO();
        uint256 maxVotes = disputeVote.votesPerOutcome[winningOutcome];

        int256[] memory outcomes = new int256[](3);
        outcomes[0] = oracle.OUTCOME_YES();
        outcomes[1] = oracle.OUTCOME_SPLIT();
        outcomes[2] = oracle.OUTCOME_EARLY_REQUEST();

        for (uint i = 0; i < outcomes.length; i++) {
            int256 currentOutcome = outcomes[i];
            uint256 currentVotes = disputeVote.votesPerOutcome[currentOutcome];
            if (currentVotes > maxVotes) {
                maxVotes = currentVotes;
                winningOutcome = currentOutcome;
            }
        }
        
        // In case of a perfect tie, the default resolution is NO.

        // Make the callback to the Oracle to finalize the dispute.
        oracle.resolveDispute(questionId, winningOutcome);

        // Clean up to prevent re-resolution and save gas for future interactions.
        delete disputes[questionId];

        emit DisputeResolved(questionId, winningOutcome, maxVotes);
    }
}
