/**
 * Blockchain and Web3 related type definitions
 * Used across the frontend application for type safety
 */

import { BigNumber } from 'ethers';

// ============ Enum Types ============

export enum JobStatus {
  OPEN = 'OPEN',
  BIDDING_CLOSED = 'BIDDING_CLOSED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED'
}

export enum BidStatus {
  ACTIVE = 'ACTIVE',
  WITHDRAWN = 'WITHDRAWN',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum MilestoneStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DISPUTED = 'DISPUTED',
  COMPLETED = 'COMPLETED'
}

export enum EscrowStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED'
}

export enum UserType {
  CLIENT = 'CLIENT',
  FREELANCER = 'FREELANCER',
  ARBITRATOR = 'ARBITRATOR'
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// ============ Core Data Types ============

export interface User {
  id: string;
  walletAddress: string;
  userType: UserType;
  email?: string;
  name?: string;
  avatar?: string;
  reputation: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FreelancerProfile extends User {
  skills: string[];
  hourlyRate?: number;
  experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
  portfolio: PortfolioItem[];
  completedJobs: number;
  totalEarned: string; // In ETH/USD
  averageRating: number;
  availabilityStatus: 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE';
}

export interface ClientProfile extends User {
  companyName?: string;
  website?: string;
  jobsPosted: number;
  totalSpent: string; // In ETH/USD
  averageJobRating: number;
  verificationLevel: 'BASIC' | 'VERIFIED' | 'ENTERPRISE';
}

export interface ArbitratorProfile extends User {
  expertise: string[];
  casesHandled: number;
  successRate: number;
  averageResolutionTime: number; // in hours
  locationHash: string;
  stake: string; // Staked tokens
  isActive: boolean;
}

export interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  projectUrl?: string;
  technologies: string[];
  completedAt: string;
}

// ============ Job Related Types ============

export interface Job {
  id: string;
  jobId: number;
  contractAddress: string;
  client: ClientProfile;
  selectedFreelancer?: FreelancerProfile;
  title: string;
  description: string;
  requirements: string[];
  budget: string; // In Wei or token units
  budgetUSD?: string; // USD equivalent
  paymentToken: string; // Contract address, 0x0 for ETH
  currency: 'ETH' | 'USDC' | 'USDT' | 'DAI';
  skills: string[];
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  biddingDeadline: string;
  ipfsHash: string;
  milestones: Milestone[];
  bids: Bid[];
  totalBids: number;
  isUrgent?: boolean;
  estimatedDuration: number; // in days
  difficultyLevel: 'EASY' | 'MEDIUM' | 'HARD';
  category: string;
}

export interface JobCreationData {
  title: string;
  description: string;
  requirements: string[];
  budget: string;
  currency: 'ETH' | 'USDC' | 'USDT' | 'DAI';
  skills: string[];
  milestones: MilestoneCreationData[];
  isUrgent: boolean;
  estimatedDuration: number;
  difficultyLevel: 'EASY' | 'MEDIUM' | 'HARD';
  category: string;
  attachments?: File[];
}

export interface Milestone {
  id: string;
  index: number;
  title: string;
  description: string;
  amount: string; // In Wei or token units
  amountUSD?: string; // USD equivalent
  deadline: string;
  status: MilestoneStatus;
  deliverableHash?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

export interface MilestoneCreationData {
  title: string;
  description: string;
  amount: string;
  deadline: string;
}

// ============ Bidding Types ============

export interface Bid {
  id: string;
  index: number;
  jobId: string;
  freelancer: FreelancerProfile;
  proposedBudget: string; // In Wei or token units
  proposedBudgetUSD?: string; // USD equivalent
  proposedTimeline: number; // in days
  proposal: string;
  proposalHash: string; // IPFS hash
  status: BidStatus;
  submittedAt: string;
  revisionCount: number;
  coverLetter?: string;
  estimatedHours?: number;
  milestoneBreakdown?: BidMilestone[];
}

export interface BidCreationData {
  jobId: string;
  proposedBudget: string;
  proposedTimeline: number;
  proposal: string;
  coverLetter: string;
  estimatedHours: number;
  milestoneBreakdown: BidMilestone[];
  attachments?: File[];
}

export interface BidMilestone {
  milestoneIndex: number;
  proposedAmount: string;
  proposedDeadline: string;
  deliverableDescription: string;
}

// ============ Escrow Types ============

export interface EscrowAccount {
  id: string;
  jobContract: string;
  client: string;
  freelancer: string;
  arbitrator?: string;
  paymentToken: string;
  totalAmount: string;
  releasedAmount: string;
  disputedAmount: string;
  status: EscrowStatus;
  createdAt: string;
  milestonePayments: MilestonePayment[];
}

export interface MilestonePayment {
  index: number;
  amount: string;
  status: MilestoneStatus;
  deadline: string;
  submittedAt?: string;
  approvedAt?: string;
  deliverableHash?: string;
  approvals: {
    client: boolean;
    freelancer: boolean;
    arbitrator: boolean;
    approvalCount: number;
    requiredApprovals: number;
  };
}

// ============ Dispute Types ============

export interface Dispute {
  id: string;
  escrowId: string;
  jobId: string;
  milestoneIndex: number;
  initiator: string; // wallet address
  respondent: string; // wallet address
  arbitrator?: ArbitratorProfile;
  reason: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'APPEALED';
  createdAt: string;
  assignedAt?: string;
  resolvedAt?: string;
  evidence: EvidenceItem[];
  resolution?: DisputeResolution;
  appealDeadline?: string;
  disputeFee: string;
}

export interface EvidenceItem {
  id: string;
  submitter: string;
  type: 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'TEXT' | 'COMMUNICATION';
  title: string;
  description: string;
  ipfsHash: string;
  submittedAt: string;
  isVerified: boolean;
}

export interface DisputeResolution {
  outcome: 'CLIENT_WINS' | 'FREELANCER_WINS' | 'SPLIT_DECISION';
  clientAward: string;
  freelancerAward: string;
  reasoning: string; // IPFS hash
  decidedAt: string;
  arbitrator: string;
}

// ============ Transaction Types ============

export interface Transaction {
  hash: string;
  type: 'JOB_CREATION' | 'BID_SUBMISSION' | 'BID_ACCEPTANCE' | 'MILESTONE_RELEASE' | 'DISPUTE_RESOLUTION';
  status: TransactionStatus;
  from: string;
  to?: string;
  value?: string;
  gasUsed?: string;
  gasPrice?: string;
  blockNumber?: number;
  timestamp?: string;
  confirmations?: number;
  metadata?: Record<string, any>;
}

export interface GasEstimate {
  gasLimit: string;
  gasPrice: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  totalCost: string;
  totalCostUSD?: string;
}

// ============ Blockchain State Types ============

export interface BlockchainState {
  isConnected: boolean;
  network: {
    chainId: number;
    name: string;
    isSupported: boolean;
  };
  account: {
    address?: string;
    balance: {
      eth: string;
      usdc: string;
      usdt: string;
      dai: string;
      platformToken: string;
    };
    nonce?: number;
  };
  gasPrice: {
    standard: string;
    fast: string;
    instant: string;
  };
  blockNumber: number;
  pendingTransactions: Transaction[];
}

export interface ContractAddresses {
  jobFactory: string;
  escrowFactory: string;
  arbitratorRegistry: string;
  stakingContract: string;
  paymentHandler: string;
  platformToken: string;
  supportedTokens: {
    usdc: string;
    usdt: string;
    dai: string;
  };
}

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface JobSearchFilters {
  skills?: string[];
  minBudget?: string;
  maxBudget?: string;
  currency?: string;
  status?: JobStatus[];
  category?: string;
  difficultyLevel?: string[];
  isUrgent?: boolean;
  postedAfter?: string;
  clientReputation?: number;
  sortBy?: 'NEWEST' | 'BUDGET_HIGH' | 'BUDGET_LOW' | 'DEADLINE' | 'REPUTATION';
}

export interface FreelancerSearchFilters {
  skills?: string[];
  minReputation?: number;
  experienceLevel?: string[];
  availabilityStatus?: string[];
  minHourlyRate?: number;
  maxHourlyRate?: number;
  location?: string;
  sortBy?: 'REPUTATION' | 'RATE_LOW' | 'RATE_HIGH' | 'EXPERIENCE' | 'RECENT';
}

// ============ WebSocket Event Types ============

export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
}

export interface JobUpdateEvent extends WebSocketEvent {
  type: 'JOB_UPDATED' | 'JOB_CREATED';
  data: {
    jobId: string;
    job: Job;
    previousStatus?: JobStatus;
  };
}

export interface BidUpdateEvent extends WebSocketEvent {
  type: 'BID_SUBMITTED' | 'BID_ACCEPTED' | 'BID_REJECTED';
  data: {
    jobId: string;
    bid: Bid;
    affectedUsers: string[];
  };
}

export interface MilestoneUpdateEvent extends WebSocketEvent {
  type: 'MILESTONE_SUBMITTED' | 'MILESTONE_APPROVED' | 'MILESTONE_REJECTED';
  data: {
    jobId: string;
    milestoneIndex: number;
    milestone: Milestone;
    affectedUsers: string[];
  };
}

export interface DisputeUpdateEvent extends WebSocketEvent {
  type: 'DISPUTE_RAISED' | 'DISPUTE_RESOLVED' | 'ARBITRATOR_ASSIGNED';
  data: {
    disputeId: string;
    dispute: Dispute;
    affectedUsers: string[];
  };
}

// ============ Utility Types ============

export interface IPFSMetadata {
  hash: string;
  size: number;
  type: string;
  uploadedAt: string;
}

export interface FileUpload {
  file: File;
  progress: number;
  ipfsHash?: string;
  error?: string;
  status: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

// ============ Form Types ============

export interface JobFormData extends JobCreationData {
  attachments: FileUpload[];
  isDraft: boolean;
  agreedToTerms: boolean;
}

export interface BidFormData extends BidCreationData {
  attachments: FileUpload[];
  agreedToTerms: boolean;
  hasReadJobDetails: boolean;
}

export interface DisputeFormData {
  reason: string;
  description: string;
  evidence: FileUpload[];
  requestedOutcome: string;
  agreedToArbitrationTerms: boolean;
}

// ============ Analytics Types ============

export interface UserAnalytics {
  jobsCompleted: number;
  successRate: number;
  averageRating: number;
  totalEarned: string;
  totalSpent: string;
  activeJobs: number;
  responseTime: number; // in hours
  lastActive: string;
}

export interface PlatformAnalytics {
  totalJobs: number;
  activeJobs: number;
  totalUsers: number;
  activeUsers: number;
  totalVolume: string; // in USD
  averageJobValue: string;
  disputeRate: number;
  completionRate: number;
}

export default {};