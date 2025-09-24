# Smart Contract Specifications

## 📋 Complete Contract Specifications

This document provides detailed specifications for all smart contracts in the Blockchain Freelancing Platform.

## 🏗️ Contract Architecture

### Core Contracts

1. **JobFactory**: Creates and manages job contracts
2. **JobContract**: Individual job instance management
3. **AdvancedEscrow**: Payment and fund management
4. **ArbitratorRegistry**: Dispute resolution system
5. **StakingContract**: Freelancer and arbitrator staking
6. **PaymentHandler**: Multi-token payment processing

## 📄 Detailed Contract Specifications

### 1. JobFactory Contract

**File**: `contracts/core/JobFactory.sol`

#### Purpose
Factory contract for creating individual job contracts using minimal proxy pattern for gas efficiency.

#### Key Features
- Minimal proxy deployment (OpenZeppelin Clones)
- Job counter and registry
- Access control for job creation
- Event emission for indexing

#### State Variables
```solidity
contract JobFactory is Ownable, Pausable {
    address public immutable jobImplementation;
    mapping(uint256 => address) public jobs;
    uint256 public jobCounter;

    // Access control
    mapping(address => bool) public authorizedClients;

    // Constants
    uint256 public constant MAX_JOBS_PER_CLIENT = 50;
    uint256 public constant JOB_CREATION_FEE = 0.01 ether;
}
```

#### Functions

##### createJob()
```solidity
function createJob(
    string memory ipfsHash,
    uint256 totalBudget,
    address paymentToken,
    uint256[] memory milestoneAmounts,
    uint256[] memory milestoneDeadlines,
    bytes32 skillsRequired
) external payable whenNotPaused returns (address jobContract)
```

**Parameters**:
- `ipfsHash`: IPFS hash containing job details
- `totalBudget`: Total budget in wei or token units
- `paymentToken`: Token address (address(0) for ETH)
- `milestoneAmounts`: Array of milestone payment amounts
- `milestoneDeadlines`: Array of milestone deadlines (timestamps)
- `skillsRequired`: Packed hash of required skills

**Requirements**:
- Caller must be authorized client
- Must pay creation fee
- Total milestone amounts must equal total budget
- Maximum 10 milestones per job
- All milestone deadlines must be future timestamps

**Events**:
```solidity
event JobCreated(
    uint256 indexed jobId,
    address indexed client,
    address jobContract,
    string ipfsHash,
    uint256 totalBudget
);
```

#### Gas Optimization
- Uses minimal proxy pattern: ~45,000 gas per deployment vs ~2,000,000 for full contract
- Packed storage for job metadata
- Efficient event indexing

---

### 2. JobContract Implementation

**File**: `contracts/core/JobContract.sol`

#### Purpose
Individual job instance managing bids, milestone tracking, and freelancer selection.

#### Key Features
- Time-weighted bidding system
- Automatic bid expiration
- Milestone-based project tracking
- Anti-spam mechanisms

#### State Variables
```solidity
contract JobContract is Initializable, ReentrancyGuard, Pausable {
    struct JobData {
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

    JobData public job;
    Bid[] public bids;
    Milestone[] public milestones;

    // Bidding controls
    mapping(address => uint256) public freelancerBidIndex;
    uint256 public constant MAX_BIDS = 100;
    uint256 public constant BID_REVISION_LIMIT = 2;
    uint256 public constant BIDDING_DURATION = 7 days;
}
```

#### Enums
```solidity
enum JobStatus { OPEN, BIDDING_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED, DISPUTED }
enum BidStatus { ACTIVE, WITHDRAWN, ACCEPTED, REJECTED, EXPIRED }
enum MilestoneStatus { PENDING, SUBMITTED, APPROVED, REJECTED, DISPUTED, COMPLETED }
```

#### Key Functions

##### submitBid()
```solidity
function submitBid(
    uint256 proposedBudget,
    uint256 proposedTimeline,
    string memory proposalHash
) external nonReentrant whenNotPaused
```

**Requirements**:
- Job must be in OPEN status
- Bidding deadline not passed
- Freelancer must have sufficient stake
- Maximum bids per job not exceeded
- Proposed budget within reasonable range (10%-150% of posted budget)

**Anti-Spam Measures**:
- Minimum stake requirement: 10 platform tokens
- Bidding cost increases over time: `baseCost * (1 + timeElapsed/biddingDuration)`
- Maximum 2 active bids per freelancer across platform

##### acceptBid()
```solidity
function acceptBid(uint256 bidIndex) external onlyClient nonReentrant
```

**Requirements**:
- Only job client can accept
- Bid must be in ACTIVE status
- Job must be in OPEN status
- Creates escrow contract automatically

**Process**:
1. Validate bid and caller
2. Update job and bid status
3. Create escrow contract
4. Transfer funds to escrow
5. Emit events for indexing

##### submitMilestone()
```solidity
function submitMilestone(
    uint256 milestoneIndex,
    string memory deliverableHash
) external onlySelectedFreelancer nonReentrant
```

**Requirements**:
- Only selected freelancer can submit
- Milestone must be in PENDING status
- Previous milestones must be completed
- Deliverable hash must not be empty

---

### 3. AdvancedEscrow Contract

**File**: `contracts/core/AdvancedEscrow.sol`

#### Purpose
Secure payment management with multi-signature releases, DeFi yield integration, and dispute handling.

#### Key Features
- Multi-signature release mechanism (2 of 3)
- DeFi yield generation on idle funds
- Payment channels for micro-payments
- Multi-token support with price oracles
- Emergency mechanisms

#### State Variables
```solidity
contract AdvancedEscrow is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct EscrowAccount {
        address client;
        address freelancer;
        address arbitrator;
        address paymentToken;
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 disputedAmount;
        EscrowStatus status;
        uint256 createdAt;
        uint256[] milestoneAmounts;
        mapping(uint256 => MilestoneStatus) milestoneStatuses;
        mapping(uint256 => ReleaseApproval) milestoneApprovals;
    }

    struct ReleaseApproval {
        mapping(address => bool) approvals;
        uint256 approvalCount;
        uint256 requiredApprovals; // Usually 2 out of 3
    }

    struct YieldInfo {
        uint256 principalAmount;
        uint256 yieldEarned;
        address yieldToken;
        uint256 lastUpdateTime;
    }

    mapping(bytes32 => EscrowAccount) public escrows;
    mapping(bytes32 => YieldInfo) public escrowYields;

    // DeFi Integration
    ICErc20 public constant cUSDC = ICErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    ILendingPool public constant aavePool = ILendingPool(0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9);
}
```

#### Key Functions

##### createEscrow()
```solidity
function createEscrow(
    address client,
    address freelancer,
    address paymentToken,
    uint256 totalAmount,
    uint256[] memory milestoneAmounts
) external returns (bytes32 escrowId)
```

**Process**:
1. Validate parameters
2. Transfer funds to contract
3. Deposit in yield-generating protocol
4. Create escrow account
5. Emit creation event

##### releaseMilestonePayment()
```solidity
function releaseMilestonePayment(
    bytes32 escrowId,
    uint256 milestoneIndex
) external nonReentrant
```

**Multi-signature Process**:
1. Record approval from caller
2. Check if required approvals met (2/3)
3. If approved, withdraw from yield protocol
4. Calculate and distribute yield
5. Transfer payment to freelancer
6. Update escrow state

##### raiseDispute()
```solidity
function raiseDispute(
    bytes32 escrowId,
    uint256 milestoneIndex,
    string memory reason
) external nonReentrant
```

**Requirements**:
- Only client or freelancer can raise dispute
- Milestone must be in appropriate status
- Dispute fee must be paid
- Lock disputed funds until resolution

---

### 4. ArbitratorRegistry Contract

**File**: `contracts/core/ArbitratorRegistry.sol`

#### Purpose
Manages arbitrator registration, selection, and reputation tracking with geographic exclusion.

#### Key Features
- Geographic exclusion algorithm
- VRF-based random selection
- Reputation scoring system
- Stake-based registration
- Decision tracking and validation

#### State Variables
```solidity
contract ArbitratorRegistry is VRFConsumerBase, Ownable {
    struct Arbitrator {
        address arbitratorAddress;
        bytes32 locationHash;
        bytes32 expertiseHash;
        uint256 reputation;
        uint256 totalCases;
        uint256 correctDecisions;
        uint256 stakedAmount;
        bool isActive;
        uint256 lastActiveTime;
        uint256 averageDecisionTime;
    }

    struct DisputeAssignment {
        uint256 disputeId;
        address arbitrator;
        uint256 assignedAt;
        uint256 deadline;
        bool isCompleted;
    }

    mapping(address => Arbitrator) public arbitrators;
    mapping(uint256 => DisputeAssignment) public disputeAssignments;
    address[] public arbitratorList;

    // VRF Configuration
    bytes32 internal keyHash;
    uint256 internal fee;
    mapping(bytes32 => uint256) public randomnessRequests;

    // Constants
    uint256 public constant MINIMUM_ARBITRATOR_STAKE = 1000 * 10**18; // 1000 tokens
    uint256 public constant INITIAL_REPUTATION = 500; // 0-1000 scale
    uint256 public constant DECISION_DEADLINE = 7 days;
}
```

#### Key Functions

##### registerArbitrator()
```solidity
function registerArbitrator(
    bytes32 locationHash,
    bytes32 expertiseHash,
    uint256 stakeAmount
) external
```

**Requirements**:
- Minimum stake amount
- Valid location and expertise hashes
- Not already registered
- Pass KYC verification (off-chain)

**Process**:
1. Transfer stake to contract
2. Create arbitrator record
3. Add to active arbitrator list
4. Emit registration event

##### selectArbitratorForDispute()
```solidity
function selectArbitratorForDispute(
    uint256 disputeId,
    bytes32 clientLocationHash,
    bytes32 freelancerLocationHash,
    bytes32 requiredExpertise
) external returns (bytes32 requestId)
```

**Selection Algorithm**:
1. Filter by geographic exclusion
2. Match required expertise
3. Check reputation threshold
4. Check availability
5. Request randomness from Chainlink VRF
6. Select from eligible pool

##### submitArbitrationDecision()
```solidity
function submitArbitrationDecision(
    uint256 disputeId,
    DisputeOutcome outcome,
    uint256 clientAward,
    uint256 freelancerAward,
    string memory reasoning
) external
```

**Requirements**:
- Only assigned arbitrator
- Within decision deadline
- Valid award amounts
- Detailed reasoning provided

---

### 5. StakingContract

**File**: `contracts/core/StakingContract.sol`

#### Purpose
Manages staking requirements for freelancers and arbitrators with slashing mechanisms.

#### Key Features
- Multi-tier staking levels
- Automatic slashing conditions
- Reward distribution
- Stake delegation
- Emergency withdrawal

#### State Variables
```solidity
contract StakingContract is Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct StakeInfo {
        uint256 stakedAmount;
        uint256 lockedAmount;
        uint256 rewardDebt;
        uint256 lastStakeTime;
        StakeType stakeType;
        bool isActive;
    }

    enum StakeType { FREELANCER, ARBITRATOR, VALIDATOR }

    mapping(address => StakeInfo) public stakes;
    mapping(StakeType => uint256) public minimumStakes;

    IERC20 public immutable platformToken;

    // Staking parameters
    uint256 public totalStaked;
    uint256 public rewardPool;
    uint256 public accRewardPerShare;
    uint256 public lastRewardBlock;

    // Slashing parameters
    uint256 public constant SLASHING_RATIO_MINOR = 1000; // 10%
    uint256 public constant SLASHING_RATIO_MAJOR = 5000; // 50%
    uint256 public constant SLASHING_RATIO_SEVERE = 10000; // 100%
}
```

#### Key Functions

##### stake()
```solidity
function stake(uint256 amount, StakeType stakeType) external nonReentrant
```

##### slash()
```solidity
function slash(
    address staker,
    uint256 amount,
    string memory reason
) external onlyAuthorized
```

---

### 6. PaymentHandler Contract

**File**: `contracts/core/PaymentHandler.sol`

#### Purpose
Handles multi-token payments with price oracle integration and automatic conversions.

#### Key Features
- Multi-token support (ETH, USDC, USDT, DAI)
- Chainlink price feed integration
- Automatic fee calculation
- Slippage protection
- Emergency token recovery

#### State Variables
```solidity
contract PaymentHandler is Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct TokenInfo {
        bool isSupported;
        address priceFeed;
        uint8 decimals;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 feePercentage; // in basis points
    }

    mapping(address => TokenInfo) public supportedTokens;
    address public treasury;

    // Fee structure
    uint256 public constant PLATFORM_FEE_BP = 250; // 2.5%
    uint256 public constant MAX_SLIPPAGE_BP = 300; // 3%
}
```

## 🔍 Security Considerations

### Access Control
- Role-based permissions using OpenZeppelin's AccessControl
- Multi-signature requirements for critical operations
- Time-locked administrative functions
- Emergency stop mechanisms

### Economic Security
- Minimum stake requirements prevent spam
- Slashing mechanisms punish malicious behavior
- Yield generation incentivizes long-term participation
- Progressive fee structures discourage abuse

### Technical Security
- Reentrancy guards on all state-changing functions
- Overflow protection with SafeMath
- Input validation and sanitization
- Formal verification of critical properties

### Operational Security
- Upgradeable contracts with governance control
- Circuit breakers for emergency situations
- Monitoring and alerting systems
- Regular security audits

## 📊 Gas Usage Estimates

| Function | Estimated Gas | Optimization Level |
|----------|---------------|-------------------|
| createJob() | 180,000 | High |
| submitBid() | 85,000 | High |
| acceptBid() | 120,000 | Medium |
| releaseMilestonePayment() | 95,000 | High |
| submitArbitrationDecision() | 110,000 | Medium |
| registerArbitrator() | 75,000 | High |

## 🧪 Testing Requirements

### Unit Tests
- 95% code coverage minimum
- All edge cases covered
- Gas usage regression tests
- Access control validation

### Integration Tests
- End-to-end workflow testing
- Cross-contract interaction validation
- Event emission verification
- State consistency checks

### Property-Based Tests
- Invariant testing
- Fuzz testing with random inputs
- Economic model validation
- Game theory scenario testing

### Security Tests
- Reentrancy attack prevention
- Overflow/underflow protection
- Access control bypass attempts
- Economic exploit scenarios

This comprehensive specification ensures all smart contracts are built to professional standards with security, efficiency, and scalability as primary concerns.