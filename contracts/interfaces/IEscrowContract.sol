// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IEscrowContract
 * @dev Interface for escrow contract managing payments
 */
interface IEscrowContract {
    // ============ Enums ============

    enum EscrowStatus {
        ACTIVE,     // Escrow is active
        COMPLETED,  // Escrow completed successfully
        DISPUTED,   // Escrow in dispute
        CANCELLED   // Escrow cancelled
    }

    enum MilestoneStatus {
        PENDING,    // Milestone not yet started
        SUBMITTED,  // Deliverable submitted
        APPROVED,   // Milestone approved
        DISPUTED,   // Milestone in dispute
        RELEASED    // Payment released
    }

    // ============ Structs ============

    struct EscrowAccount {
        address jobContract;
        address client;
        address freelancer;
        address arbitrator;
        address paymentToken;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 disputedAmount;
        EscrowStatus status;
        uint256 createdAt;
    }

    struct MilestonePayment {
        uint256 amount;
        MilestoneStatus status;
        uint256 deadline;
        uint256 submittedAt;
        uint256 approvedAt;
        string deliverableHash;
    }

    struct ReleaseApproval {
        bool clientApproval;
        bool freelancerApproval;
        bool arbitratorApproval;
        uint256 approvalCount;
        uint256 requiredApprovals;
    }

    // ============ Events ============

    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed jobContract,
        address indexed client,
        address freelancer,
        uint256 totalAmount
    );

    event MilestoneApprovalRequested(
        bytes32 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed requester
    );

    event MilestoneApproved(
        bytes32 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed approver
    );

    event PaymentReleased(
        bytes32 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed recipient,
        uint256 amount
    );

    event DisputeRaised(
        bytes32 indexed escrowId,
        uint256 indexed milestoneIndex,
        address indexed initiator,
        string reason
    );

    event ArbitratorAssigned(
        bytes32 indexed escrowId,
        address indexed arbitrator
    );

    event EscrowStatusChanged(
        bytes32 indexed escrowId,
        EscrowStatus oldStatus,
        EscrowStatus newStatus
    );

    // ============ Functions ============

    /**
     * @notice Initialize the escrow contract
     */
    function initialize(
        address jobContract,
        address client,
        address freelancer,
        address paymentToken,
        uint256 totalAmount,
        uint256[] memory milestoneAmounts
    ) external;

    /**
     * @notice Deposit funds into escrow
     */
    function depositFunds() external payable;

    /**
     * @notice Request milestone payment release
     */
    function requestMilestoneRelease(uint256 milestoneIndex) external;

    /**
     * @notice Approve milestone payment
     */
    function approveMilestonePayment(
        uint256 milestoneIndex,
        string memory deliverableHash
    ) external;

    /**
     * @notice Release milestone payment
     */
    function releaseMilestonePayment(uint256 milestoneIndex) external;

    /**
     * @notice Raise dispute for milestone
     */
    function raiseDispute(
        uint256 milestoneIndex,
        string memory reason
    ) external;

    /**
     * @notice Assign arbitrator to dispute
     */
    function assignArbitrator(address arbitrator) external;

    /**
     * @notice Resolve dispute (arbitrator only)
     */
    function resolveDispute(
        uint256 milestoneIndex,
        uint256 clientAmount,
        uint256 freelancerAmount,
        string memory reasoning
    ) external;

    /**
     * @notice Cancel escrow (emergency only)
     */
    function cancelEscrow(string memory reason) external;

    /**
     * @notice Withdraw funds after completion
     */
    function withdrawFunds() external;

    // ============ View Functions ============

    /**
     * @notice Get escrow account data
     */
    function getEscrowAccount() external view returns (EscrowAccount memory);

    /**
     * @notice Get milestone payment data
     */
    function getMilestonePayment(uint256 milestoneIndex)
        external
        view
        returns (MilestonePayment memory);

    /**
     * @notice Get milestone approval status
     */
    function getMilestoneApproval(uint256 milestoneIndex)
        external
        view
        returns (ReleaseApproval memory);

    /**
     * @notice Get total number of milestones
     */
    function getMilestoneCount() external view returns (uint256);

    /**
     * @notice Calculate total released amount
     */
    function getTotalReleasedAmount() external view returns (uint256);

    /**
     * @notice Calculate remaining escrow balance
     */
    function getRemainingBalance() external view returns (uint256);

    /**
     * @notice Check if milestone can be released
     */
    function canReleaseMilestone(uint256 milestoneIndex) external view returns (bool);

    /**
     * @notice Check if escrow is fully completed
     */
    function isEscrowCompleted() external view returns (bool);

    /**
     * @notice Get dispute status for milestone
     */
    function isInDispute(uint256 milestoneIndex) external view returns (bool);

    /**
     * @notice Calculate platform fee
     */
    function calculatePlatformFee(uint256 amount) external view returns (uint256);
}