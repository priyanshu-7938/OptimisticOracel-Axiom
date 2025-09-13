// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

// Interface to interact with the DisputeResolutionDAO
interface IDisputeResolutionDAO {
    function createDispute(bytes32 questionId) external;
}

/**
 * @title DelphiOptimisticOracleV2
 * @author Project Delphi Team
 * @notice Manages dispute resolution by escalating to a DAO arbiter.
 */
contract DelphiOptimisticOracle {
    // ==================================================================
    //                          STATE & EVENTS
    // ==================================================================

    enum State {
        PENDING,
        PROPOSED,
        DISPUTED,
        RESOLVED
    }

    int256 public constant OUTCOME_NO = 0;
    int256 public constant OUTCOME_YES = 1;
    int256 public constant OUTCOME_SPLIT = 2;
    int256 public constant OUTCOME_EARLY_REQUEST = 3;

    struct Resolution {
        State state;
        int256 proposedOutcome;
        int256 finalOutcome;
        address proposer;
        address disputer;
        uint256 proposalBond;
        uint256 disputeBond;
        uint256 proposalTimestamp;
        uint256 resolutionTimestamp;
    }

    mapping(bytes32 => Resolution) public resolutions;

    // The arbiter is now mutable to allow for a DAO to be set post-deployment.
    address public arbiter;
    bool private arbiterIsSet;

    uint256 public proposalBondAmount;
    uint256 public disputeBondMultiplier;
    uint256 public disputeWindowSeconds;

    event QuestionProposed(bytes32 indexed questionId, int256 proposedOutcome, address indexed proposer, uint256 bond, uint256 proposalTimestamp);
    event QuestionDisputed(bytes32 indexed questionId, address indexed disputer, uint256 bond);
    event QuestionResolved(bytes32 indexed questionId, int256 finalOutcome);
    event ArbiterSet(address indexed newArbiter);

    // ==================================================================
    //                               ERRORS
    // ==================================================================

    error InvalidState(State currentState);
    error InvalidBond(uint256 sent, uint256 required);
    error DisputeWindowIsOpen();
    error DisputeWindowIsClosed();
    error NotTheArbiter();
    error InvalidOutcome(int256 outcome);
    error OnlyInitialOwner();
    error ArbiterAlreadySet();
    error ArbiterNotSet();

    // ==================================================================
    //                            CONSTRUCTOR
    // ==================================================================

    constructor(uint256 _proposalBond, uint256 _disputeMultiplier, uint256 _disputeWindow) {
        require(_proposalBond > 0, "Proposal bond must be > 0");
        require(_disputeMultiplier > 1, "Dispute multiplier must be > 1");
        
        // The contract deployer is the initial, temporary arbiter/owner.
        arbiter = msg.sender;
        proposalBondAmount = _proposalBond;
        disputeBondMultiplier = _disputeMultiplier;
        disputeWindowSeconds = _disputeWindow;
    }

    // ==================================================================
    //                         ADMIN FUNCTIONS
    // ==================================================================
    /**
     * @notice Sets the DAO contract as the permanent arbiter.
     * @dev Can only be called once by the initial deployer of this contract.
     * This is a critical step for decentralization.
     * @param _daoAddress The address of the DisputeResolutionDAO contract.
     */
    function setArbiter(address _daoAddress) external {
        if (msg.sender != arbiter) revert OnlyInitialOwner();
        if (arbiterIsSet) revert ArbiterAlreadySet();
        require(_daoAddress != address(0), "Arbiter cannot be zero address");

        arbiter = _daoAddress;
        arbiterIsSet = true;
        emit ArbiterSet(_daoAddress);
    }
    
    // ==================================================================
    //                         CORE ORACLE LOGIC
    // ==================================================================

    function proposeOutcome(bytes32 questionId, int256 outcome) external payable {
        if (outcome < OUTCOME_NO || outcome > OUTCOME_EARLY_REQUEST) {
            revert InvalidOutcome(outcome);
        }
        Resolution storage res = resolutions[questionId];
        if (res.state != State.PENDING) revert InvalidState(res.state);
        if (msg.value != proposalBondAmount) revert InvalidBond(msg.value, proposalBondAmount);

        res.state = State.PROPOSED;
        res.proposer = msg.sender;
        res.proposedOutcome = outcome;
        res.proposalBond = msg.value;
        res.proposalTimestamp = block.timestamp;

        emit QuestionProposed(questionId, outcome, msg.sender, msg.value, block.timestamp);
    }

    /**
     * @notice Disputes an existing proposal, escalating it to the DAO for resolution.
     */
    function disputeOutcome(bytes32 questionId) external payable {
        if (!arbiterIsSet) revert ArbiterNotSet(); // DAO must be set first.
        
        Resolution storage res = resolutions[questionId];
        if (res.state != State.PROPOSED) revert InvalidState(res.state);
        if (block.timestamp > res.proposalTimestamp + disputeWindowSeconds) revert DisputeWindowIsClosed();

        uint256 requiredDisputeBond = res.proposalBond * disputeBondMultiplier;
        if (msg.value != requiredDisputeBond) revert InvalidBond(msg.value, requiredDisputeBond);

        res.state = State.DISPUTED;
        res.disputer = msg.sender;
        res.disputeBond = msg.value;

        // Escalate to the DAO to start the voting process.
        IDisputeResolutionDAO(arbiter).createDispute(questionId);

        emit QuestionDisputed(questionId, msg.sender, msg.value);
    }

    function finalizeOutcome(bytes32 questionId) external {
        Resolution storage res = resolutions[questionId];
        if (res.state != State.PROPOSED) revert InvalidState(res.state);
        if (block.timestamp <= res.proposalTimestamp + disputeWindowSeconds) revert DisputeWindowIsOpen();

        res.state = State.RESOLVED;
        res.finalOutcome = res.proposedOutcome;

        (bool success, ) = res.proposer.call{value: res.proposalBond}("");
        require(success, "Bond refund failed");

        emit QuestionResolved(questionId, res.finalOutcome);
    }

    /**
    * @notice The secure callback function for the DAO (as arbiter) to resolve a dispute.
    */
    function resolveDispute(bytes32 questionId, int256 finalOutcome) external {
        if (msg.sender != arbiter) revert NotTheArbiter();
        if (finalOutcome < OUTCOME_NO || finalOutcome > OUTCOME_EARLY_REQUEST) {
            revert InvalidOutcome(finalOutcome);
        }
        
        Resolution storage res = resolutions[questionId];
        if (res.state != State.DISPUTED) revert InvalidState(res.state);

        res.state = State.RESOLVED;
        res.finalOutcome = finalOutcome;
        res.resolutionTimestamp = block.timestamp;

        // --- NEW: Handle special outcomes first ---

        if (finalOutcome == OUTCOME_SPLIT) {
            // In a 50/50 split, both parties get their original bonds back.
            (bool successProposer, ) = payable(res.proposer).call{value: res.proposalBond}("");
            require(successProposer, "Proposer refund failed");

            (bool successDisputer, ) = payable(res.disputer).call{value: res.disputeBond}("");
            require(successDisputer, "Disputer refund failed");

        } else if (finalOutcome == OUTCOME_EARLY_REQUEST) {
            // If the question is resolved as invalid, the disputer is always the winner
            // for correctly challenging a flawed market.
            uint256 totalPot = res.proposalBond + res.disputeBond;
            (bool success, ) = payable(res.disputer).call{value: totalPot}("");
            require(success, "Winner payment failed for early request");

        } else {
            // --- Standard YES/NO outcome logic ---
            address winner;
            if (finalOutcome == res.proposedOutcome) {
                winner = res.proposer;
            } else {
                winner = res.disputer;
            }

            uint256 totalPot = res.proposalBond + res.disputeBond;
            (bool success, ) = payable(winner).call{value: totalPot}("");
            require(success, "Winner payment failed");
        }

        emit QuestionResolved(questionId, finalOutcome);
    }

    function getOutcome(bytes32 questionId) external view returns (int256) {
        Resolution storage res = resolutions[questionId];
        if (res.state != State.RESOLVED) {
            revert InvalidState(res.state);
        }
        return res.finalOutcome;
    }
}

