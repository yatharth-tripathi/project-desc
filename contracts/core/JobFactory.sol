// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../interfaces/IJobContract.sol";
import "../interfaces/IEscrowContract.sol";

/**
 * @title JobFactory
 * @dev Factory contract for creating individual job contracts using minimal proxy pattern
 * @notice This contract creates job instances efficiently and manages job registry
 */
contract JobFactory is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using Clones for address;
    using Address for address;

    // ============ State Variables ============

    /// @notice Implementation contract for jobs
    address public jobImplementation;

    /// @notice Implementation contract for escrow
    address public escrowImplementation;

    /// @notice Mapping from job ID to job contract address
    mapping(uint256 => address) public jobs;

    /// @notice Total number of jobs created
    uint256 public jobCounter;

    /// @notice Mapping to track authorized clients
    mapping(address => bool) public authorizedClients;

    /// @notice Mapping to track jobs per client
    mapping(address => uint256) public clientJobCount;

    /// @notice Platform treasury address
    address public treasury;

    // ============ Constants ============

    uint256 public constant MAX_JOBS_PER_CLIENT = 50;
    uint256 public constant JOB_CREATION_FEE = 0.01 ether;
    uint256 public constant MAX_MILESTONES = 10;
    uint256 public constant MIN_JOB_BUDGET = 0.01 ether;
    uint256 public constant MAX_JOB_BUDGET = 10000 ether;

    // ============ Events ============

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed jobContract,
        string ipfsHash,
        uint256 totalBudget,
        address paymentToken
    );

    event ClientAuthorized(address indexed client, bool authorized);
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl, string contractType);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ============ Errors ============

    error UnauthorizedClient();
    error InvalidBudget(uint256 provided, uint256 min, uint256 max);
    error InvalidMilestones(uint256 count, uint256 max);
    error MilestoneMismatch(uint256 totalBudget, uint256 milestoneSum);
    error TooManyJobs(uint256 current, uint256 max);
    error InsufficientFee(uint256 provided, uint256 required);
    error InvalidAddress();
    error InvalidIPFSHash();
    error DeadlineInPast(uint256 deadline, uint256 current);

    // ============ Modifiers ============

    modifier onlyAuthorizedClient() {
        if (!authorizedClients[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedClient();
        }
        _;
    }

    // ============ Initialization ============

    /**
     * @notice Initialize the factory contract
     * @param _jobImplementation Address of job contract implementation
     * @param _escrowImplementation Address of escrow contract implementation
     * @param _treasury Address of platform treasury
     */
    function initialize(
        address _jobImplementation,
        address _escrowImplementation,
        address _treasury
    ) external initializer {
        if (_jobImplementation == address(0) ||
            _escrowImplementation == address(0) ||
            _treasury == address(0)) {
            revert InvalidAddress();
        }

        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        jobImplementation = _jobImplementation;
        escrowImplementation = _escrowImplementation;
        treasury = _treasury;
    }

    // ============ External Functions ============

    /**
     * @notice Create a new job contract
     * @param ipfsHash IPFS hash containing job details
     * @param totalBudget Total budget for the job
     * @param paymentToken Token address (address(0) for ETH)
     * @param milestoneAmounts Array of milestone payment amounts
     * @param milestoneDeadlines Array of milestone deadlines
     * @param skillsRequired Packed hash of required skills
     * @return jobContract Address of created job contract
     */
    function createJob(
        string memory ipfsHash,
        uint256 totalBudget,
        address paymentToken,
        uint256[] memory milestoneAmounts,
        uint256[] memory milestoneDeadlines,
        bytes32 skillsRequired
    )
        external
        payable
        onlyAuthorizedClient
        whenNotPaused
        nonReentrant
        returns (address jobContract)
    {
        // Validate input parameters
        _validateJobCreation(
            ipfsHash,
            totalBudget,
            milestoneAmounts,
            milestoneDeadlines
        );

        // Check creation fee
        if (msg.value < JOB_CREATION_FEE) {
            revert InsufficientFee(msg.value, JOB_CREATION_FEE);
        }

        // Check client job limit
        if (clientJobCount[msg.sender] >= MAX_JOBS_PER_CLIENT) {
            revert TooManyJobs(clientJobCount[msg.sender], MAX_JOBS_PER_CLIENT);
        }

        // Increment job counter
        uint256 jobId = ++jobCounter;

        // Deploy job contract using minimal proxy
        jobContract = jobImplementation.clone();

        // Initialize job contract
        IJobContract(jobContract).initialize(
            jobId,
            msg.sender,
            ipfsHash,
            totalBudget,
            paymentToken,
            milestoneAmounts,
            milestoneDeadlines,
            skillsRequired
        );

        // Store job reference
        jobs[jobId] = jobContract;
        clientJobCount[msg.sender]++;

        // Transfer creation fee to treasury
        payable(treasury).transfer(JOB_CREATION_FEE);

        // Refund excess fee
        if (msg.value > JOB_CREATION_FEE) {
            payable(msg.sender).transfer(msg.value - JOB_CREATION_FEE);
        }

        emit JobCreated(
            jobId,
            msg.sender,
            jobContract,
            ipfsHash,
            totalBudget,
            paymentToken
        );

        return jobContract;
    }

    /**
     * @notice Create escrow contract for a job
     * @param jobContract Address of the job contract
     * @param client Client address
     * @param freelancer Selected freelancer address
     * @param totalAmount Total escrow amount
     * @param milestoneAmounts Array of milestone amounts
     * @return escrowContract Address of created escrow contract
     */
    function createEscrow(
        address jobContract,
        address client,
        address freelancer,
        address paymentToken,
        uint256 totalAmount,
        uint256[] memory milestoneAmounts
    )
        external
        whenNotPaused
        returns (address escrowContract)
    {
        // Only job contracts can create escrow
        require(_isValidJobContract(jobContract), "Invalid job contract");

        // Deploy escrow contract using minimal proxy
        escrowContract = escrowImplementation.clone();

        // Initialize escrow contract
        IEscrowContract(escrowContract).initialize(
            jobContract,
            client,
            freelancer,
            paymentToken,
            totalAmount,
            milestoneAmounts
        );

        return escrowContract;
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize or deauthorize a client
     * @param client Client address
     * @param authorized Authorization status
     */
    function setClientAuthorization(address client, bool authorized) external onlyOwner {
        if (client == address(0)) revert InvalidAddress();

        authorizedClients[client] = authorized;
        emit ClientAuthorized(client, authorized);
    }

    /**
     * @notice Update job implementation contract
     * @param newImplementation New implementation address
     */
    function updateJobImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert InvalidAddress();

        address oldImplementation = jobImplementation;
        jobImplementation = newImplementation;

        emit ImplementationUpdated(oldImplementation, newImplementation, "JobContract");
    }

    /**
     * @notice Update escrow implementation contract
     * @param newImplementation New implementation address
     */
    function updateEscrowImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert InvalidAddress();

        address oldImplementation = escrowImplementation;
        escrowImplementation = newImplementation;

        emit ImplementationUpdated(oldImplementation, newImplementation, "EscrowContract");
    }

    /**
     * @notice Update treasury address
     * @param newTreasury New treasury address
     */
    function updateTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();

        address oldTreasury = treasury;
        treasury = newTreasury;

        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /**
     * @notice Pause contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View Functions ============

    /**
     * @notice Get job contract address by ID
     * @param jobId Job ID
     * @return Job contract address
     */
    function getJobContract(uint256 jobId) external view returns (address) {
        return jobs[jobId];
    }

    /**
     * @notice Check if address is authorized client
     * @param client Address to check
     * @return Authorization status
     */
    function isAuthorizedClient(address client) external view returns (bool) {
        return authorizedClients[client] || client == owner();
    }

    /**
     * @notice Get total jobs created by client
     * @param client Client address
     * @return Job count
     */
    function getClientJobCount(address client) external view returns (uint256) {
        return clientJobCount[client];
    }

    // ============ Internal Functions ============

    /**
     * @notice Validate job creation parameters
     */
    function _validateJobCreation(
        string memory ipfsHash,
        uint256 totalBudget,
        uint256[] memory milestoneAmounts,
        uint256[] memory milestoneDeadlines
    ) internal view {
        // Validate IPFS hash
        if (bytes(ipfsHash).length == 0) {
            revert InvalidIPFSHash();
        }

        // Validate budget
        if (totalBudget < MIN_JOB_BUDGET || totalBudget > MAX_JOB_BUDGET) {
            revert InvalidBudget(totalBudget, MIN_JOB_BUDGET, MAX_JOB_BUDGET);
        }

        // Validate milestones
        if (milestoneAmounts.length == 0 || milestoneAmounts.length > MAX_MILESTONES) {
            revert InvalidMilestones(milestoneAmounts.length, MAX_MILESTONES);
        }

        if (milestoneAmounts.length != milestoneDeadlines.length) {
            revert InvalidMilestones(milestoneAmounts.length, milestoneDeadlines.length);
        }

        // Validate milestone amounts sum to total budget
        uint256 milestoneSum = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            milestoneSum += milestoneAmounts[i];

            // Validate deadline is in future
            if (milestoneDeadlines[i] <= block.timestamp) {
                revert DeadlineInPast(milestoneDeadlines[i], block.timestamp);
            }
        }

        if (milestoneSum != totalBudget) {
            revert MilestoneMismatch(totalBudget, milestoneSum);
        }
    }

    /**
     * @notice Check if address is a valid job contract created by this factory
     */
    function _isValidJobContract(address contractAddress) internal view returns (bool) {
        for (uint256 i = 1; i <= jobCounter; i++) {
            if (jobs[i] == contractAddress) {
                return true;
            }
        }
        return false;
    }
}