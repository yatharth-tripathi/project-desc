// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IJobContract
 * @dev Interface for individual job contract instances
 */
interface IJobContract {
    // ============ Enums ============

    enum JobStatus {
        OPEN,           // Job is open for bidding
        BIDDING_CLOSED, // Bidding period closed
        IN_PROGRESS,    // Job awarded and in progress
        COMPLETED,      // Job completed successfully
        CANCELLED,      // Job cancelled by client
        DISPUTED        // Job in dispute
    }

    enum BidStatus {
        ACTIVE,     // Bid is active
        WITHDRAWN,  // Bid withdrawn by freelancer
        ACCEPTED,   // Bid accepted by client
        REJECTED,   // Bid rejected by client
        EXPIRED     // Bid expired
    }

    enum MilestoneStatus {
        PENDING,    // Milestone not yet started
        SUBMITTED,  // Deliverable submitted
        APPROVED,   // Milestone approved by client
        REJECTED,   // Milestone rejected by client
        DISPUTED,   // Milestone in dispute
        COMPLETED   // Milestone completed and paid
    }

    // ============ Structs ============

    struct JobData {
        uint256 jobId;
        address client;
        string ipfsHash;
        uint256 totalBudget;
        address paymentToken;
        JobStatus status;
        uint256 createdAt;
        uint256 biddingDeadline;
        address selectedBidder;
        bytes32 skillsRequired;
    }

    struct Bid {
        address freelancer;
        uint256 proposedBudget;
        uint256 proposedTimeline;
        string proposalHash;
        uint256 submittedAt;
        BidStatus status;
        uint256 revisionCount;
    }

    struct Milestone {
        uint256 amount;
        uint256 deadline;
        MilestoneStatus status;
        string deliverableHash;
        uint256 submittedAt;
        uint256 approvedAt;
    }

    // ============ Events ============

    event BidSubmitted(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 indexed proposedBudget,
        uint256 proposedTimeline,
        string proposalHash
    );

    event BidAccepted(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint256 bidAmount
    );

    event BidRejected(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        uint256 bidIndex
    );

    event BidWithdrawn(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 bidIndex
    );

    event JobStatusChanged(
        uint256 indexed jobId,
        JobStatus oldStatus,
        JobStatus newStatus
    );

    event MilestoneSubmitted(
        uint256 indexed jobId,
        address indexed freelancer,
        uint256 indexed milestoneIndex,
        string deliverableHash
    );

    event MilestoneApproved(
        uint256 indexed jobId,
        address indexed client,
        uint256 indexed milestoneIndex
    );

    event MilestoneRejected(
        uint256 indexed jobId,
        address indexed client,
        uint256 indexed milestoneIndex,
        string reason
    );

    // ============ Functions ============

    /**
     * @notice Initialize the job contract
     */
    function initialize(
        uint256 jobId,
        address client,
        string memory ipfsHash,
        uint256 totalBudget,
        address paymentToken,
        uint256[] memory milestoneAmounts,
        uint256[] memory milestoneDeadlines,
        bytes32 skillsRequired
    ) external;

    /**
     * @notice Submit a bid for the job
     */
    function submitBid(
        uint256 proposedBudget,
        uint256 proposedTimeline,
        string memory proposalHash
    ) external;

    /**
     * @notice Revise an existing bid
     */
    function reviseBid(
        uint256 bidIndex,
        uint256 newBudget,
        uint256 newTimeline,
        string memory newProposalHash,
        string memory revisionReason
    ) external;

    /**
     * @notice Withdraw a submitted bid
     */
    function withdrawBid(uint256 bidIndex) external;

    /**
     * @notice Accept a bid (client only)
     */
    function acceptBid(uint256 bidIndex) external;

    /**
     * @notice Reject a bid (client only)
     */
    function rejectBid(uint256 bidIndex, string memory reason) external;

    /**
     * @notice Submit milestone deliverable
     */
    function submitMilestone(
        uint256 milestoneIndex,
        string memory deliverableHash
    ) external;

    /**
     * @notice Approve milestone (client only)
     */
    function approveMilestone(uint256 milestoneIndex) external;

    /**
     * @notice Reject milestone (client only)
     */
    function rejectMilestone(uint256 milestoneIndex, string memory reason) external;

    /**
     * @notice Cancel job (client only)
     */
    function cancelJob(string memory reason) external;

    // ============ View Functions ============

    /**
     * @notice Get job data
     */
    function getJobData() external view returns (JobData memory);

    /**
     * @notice Get bid by index
     */
    function getBid(uint256 bidIndex) external view returns (Bid memory);

    /**
     * @notice Get milestone by index
     */
    function getMilestone(uint256 milestoneIndex) external view returns (Milestone memory);

    /**
     * @notice Get total number of bids
     */
    function getBidCount() external view returns (uint256);

    /**
     * @notice Get total number of milestones
     */
    function getMilestoneCount() external view returns (uint256);

    /**
     * @notice Get freelancer's bid index
     */
    function getFreelancerBidIndex(address freelancer) external view returns (uint256);

    /**
     * @notice Check if freelancer has submitted a bid
     */
    function hasFreelancerBid(address freelancer) external view returns (bool);

    /**
     * @notice Calculate current bidding cost
     */
    function getCurrentBiddingCost() external view returns (uint256);

    /**
     * @notice Check if bidding is still open
     */
    function isBiddingOpen() external view returns (bool);

    /**
     * @notice Check if job is in progress
     */
    function isJobInProgress() external view returns (bool);

    /**
     * @notice Check if all milestones are completed
     */
    function areAllMilestonesCompleted() external view returns (bool);
}