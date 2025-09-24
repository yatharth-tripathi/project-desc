/**
 * BlockchainService - Core service for blockchain interactions
 * Handles smart contract interactions, event listening, and transaction management
 */

import { ethers, BigNumber } from 'ethers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DatabaseService } from './DatabaseService';
import { IPFSService } from './IPFSService';
import { NotificationService } from './NotificationService';
import { CacheService } from './CacheService';
import {
  JobCreatedEvent,
  BidSubmittedEvent,
  MilestoneCompletedEvent,
  DisputeRaisedEvent,
  ContractAddresses
} from '../types/blockchain';

// Import ABIs
import JobFactoryABI from '../abis/JobFactory.json';
import JobContractABI from '../abis/JobContract.json';
import EscrowContractABI from '../abis/EscrowContract.json';
import ArbitratorRegistryABI from '../abis/ArbitratorRegistry.json';

export class BlockchainService {
  private provider: ethers.providers.WebSocketProvider;
  private signer?: ethers.Signer;
  private contracts: {
    jobFactory: ethers.Contract;
    arbitratorRegistry: ethers.Contract;
    stakingContract: ethers.Contract;
    paymentHandler: ethers.Contract;
  };

  private eventProcessingQueue: Map<string, any[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isConnected = false;

  constructor(
    private databaseService: DatabaseService,
    private ipfsService: IPFSService,
    private notificationService: NotificationService,
    private cacheService: CacheService,
    private contractAddresses: ContractAddresses
  ) {
    this.initializeProvider();
    this.initializeContracts();
    this.setupEventListeners();
    this.startEventProcessing();
  }

  // ============ Initialization ============

  private initializeProvider(): void {
    try {
      this.provider = new ethers.providers.WebSocketProvider(
        config.blockchain.websocketUrl,
        {
          name: config.blockchain.networkName,
          chainId: config.blockchain.chainId
        }
      );

      this.provider.on('connect', () => {
        logger.info('Connected to blockchain network');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.provider.on('disconnect', (error) => {
        logger.error('Disconnected from blockchain network', error);
        this.isConnected = false;
        this.handleReconnection();
      });

      this.provider.on('error', (error) => {
        logger.error('Blockchain provider error', error);
        this.handleReconnection();
      });

      // Initialize signer if private key provided
      if (config.blockchain.privateKey) {
        this.signer = new ethers.Wallet(config.blockchain.privateKey, this.provider);
      }

    } catch (error) {
      logger.error('Failed to initialize blockchain provider', error);
      throw error;
    }
  }

  private initializeContracts(): void {
    try {
      this.contracts = {
        jobFactory: new ethers.Contract(
          this.contractAddresses.jobFactory,
          JobFactoryABI,
          this.provider
        ),
        arbitratorRegistry: new ethers.Contract(
          this.contractAddresses.arbitratorRegistry,
          ArbitratorRegistryABI,
          this.provider
        ),
        stakingContract: new ethers.Contract(
          this.contractAddresses.stakingContract,
          [],  // Add staking contract ABI
          this.provider
        ),
        paymentHandler: new ethers.Contract(
          this.contractAddresses.paymentHandler,
          [],  // Add payment handler ABI
          this.provider
        )
      };

      logger.info('Smart contracts initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize smart contracts', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    try {
      // Job Factory Events
      this.contracts.jobFactory.on('JobCreated', this.handleJobCreated.bind(this));

      // Job Contract Events (we'll listen to all job contracts)
      const jobContractFilter = {
        topics: [
          ethers.utils.id('BidSubmitted(uint256,address,uint256,uint256,string)'),
          null, // jobId (indexed)
          null, // freelancer (indexed)
          null  // proposedBudget (indexed)
        ]
      };

      this.provider.on(jobContractFilter, this.handleBidSubmitted.bind(this));

      // Escrow Events
      const escrowFilter = {
        topics: [
          ethers.utils.id('MilestoneCompleted(bytes32,uint256,uint256,address)'),
          null, // escrowId (indexed)
          null, // milestoneIndex (indexed)
          null  // recipient (indexed)
        ]
      };

      this.provider.on(escrowFilter, this.handleMilestoneCompleted.bind(this));

      // Arbitration Events
      this.contracts.arbitratorRegistry.on('DisputeRaised', this.handleDisputeRaised.bind(this));

      logger.info('Blockchain event listeners setup successfully');
    } catch (error) {
      logger.error('Failed to setup event listeners', error);
      throw error;
    }
  }

  // ============ Event Handlers ============

  private async handleJobCreated(
    jobId: BigNumber,
    client: string,
    jobContract: string,
    ipfsHash: string,
    totalBudget: BigNumber,
    paymentToken: string,
    event: ethers.Event
  ): Promise<void> {
    try {
      logger.info(`Processing JobCreated event: jobId=${jobId.toString()}`);

      const eventData: JobCreatedEvent = {
        jobId: jobId.toString(),
        client,
        jobContract,
        ipfsHash,
        totalBudget: totalBudget.toString(),
        paymentToken,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: await this.getBlockTimestamp(event.blockNumber)
      };

      // Add to processing queue
      this.addToProcessingQueue('jobCreated', eventData);

    } catch (error) {
      logger.error('Error handling JobCreated event', error);
    }
  }

  private async handleBidSubmitted(log: ethers.providers.Log): Promise<void> {
    try {
      // Decode the log data
      const jobContractInterface = new ethers.utils.Interface(JobContractABI);
      const decodedLog = jobContractInterface.parseLog(log);

      const eventData: BidSubmittedEvent = {
        jobId: decodedLog.args.jobId.toString(),
        freelancer: decodedLog.args.freelancer,
        proposedBudget: decodedLog.args.proposedBudget.toString(),
        proposedTimeline: decodedLog.args.proposedTimeline.toString(),
        proposalHash: decodedLog.args.proposalHash,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        timestamp: await this.getBlockTimestamp(log.blockNumber)
      };

      logger.info(`Processing BidSubmitted event: jobId=${eventData.jobId}, freelancer=${eventData.freelancer}`);

      this.addToProcessingQueue('bidSubmitted', eventData);

    } catch (error) {
      logger.error('Error handling BidSubmitted event', error);
    }
  }

  private async handleMilestoneCompleted(log: ethers.providers.Log): Promise<void> {
    try {
      const escrowInterface = new ethers.utils.Interface(EscrowContractABI);
      const decodedLog = escrowInterface.parseLog(log);

      const eventData: MilestoneCompletedEvent = {
        escrowId: decodedLog.args.escrowId,
        milestoneIndex: decodedLog.args.milestoneIndex.toNumber(),
        amount: decodedLog.args.amount.toString(),
        recipient: decodedLog.args.recipient,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        timestamp: await this.getBlockTimestamp(log.blockNumber)
      };

      logger.info(`Processing MilestoneCompleted event: escrowId=${eventData.escrowId}, milestone=${eventData.milestoneIndex}`);

      this.addToProcessingQueue('milestoneCompleted', eventData);

    } catch (error) {
      logger.error('Error handling MilestoneCompleted event', error);
    }
  }

  private async handleDisputeRaised(
    disputeId: BigNumber,
    escrowId: string,
    initiator: string,
    event: ethers.Event
  ): Promise<void> {
    try {
      const eventData: DisputeRaisedEvent = {
        disputeId: disputeId.toString(),
        escrowId,
        initiator,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: await this.getBlockTimestamp(event.blockNumber)
      };

      logger.info(`Processing DisputeRaised event: disputeId=${eventData.disputeId}`);

      this.addToProcessingQueue('disputeRaised', eventData);

    } catch (error) {
      logger.error('Error handling DisputeRaised event', error);
    }
  }

  // ============ Event Processing ============

  private addToProcessingQueue(eventType: string, eventData: any): void {
    if (!this.eventProcessingQueue.has(eventType)) {
      this.eventProcessingQueue.set(eventType, []);
    }

    this.eventProcessingQueue.get(eventType)!.push(eventData);
  }

  private startEventProcessing(): void {
    // Process events every 5 seconds
    setInterval(async () => {
      for (const [eventType, events] of this.eventProcessingQueue.entries()) {
        if (events.length > 0) {
          const eventsToProcess = events.splice(0, 10); // Process up to 10 events at a time

          for (const eventData of eventsToProcess) {
            try {
              await this.processEvent(eventType, eventData);
            } catch (error) {
              logger.error(`Error processing ${eventType} event`, { eventData, error });

              // Re-queue the event for retry (with limit)
              if (!eventData.retryCount) eventData.retryCount = 0;
              if (eventData.retryCount < 3) {
                eventData.retryCount++;
                this.addToProcessingQueue(eventType, eventData);
              }
            }
          }
        }
      }
    }, 5000);
  }

  private async processEvent(eventType: string, eventData: any): Promise<void> {
    switch (eventType) {
      case 'jobCreated':
        await this.processJobCreatedEvent(eventData);
        break;
      case 'bidSubmitted':
        await this.processBidSubmittedEvent(eventData);
        break;
      case 'milestoneCompleted':
        await this.processMilestoneCompletedEvent(eventData);
        break;
      case 'disputeRaised':
        await this.processDisputeRaisedEvent(eventData);
        break;
      default:
        logger.warn(`Unknown event type: ${eventType}`);
    }
  }

  private async processJobCreatedEvent(eventData: JobCreatedEvent): Promise<void> {
    try {
      // 1. Fetch job details from IPFS
      const jobDetails = await this.ipfsService.fetchJobData(eventData.ipfsHash);

      // 2. Get token information
      const tokenInfo = await this.getTokenInfo(eventData.paymentToken);

      // 3. Convert budget to USD
      const budgetUSD = await this.convertToUSD(eventData.paymentToken, eventData.totalBudget);

      // 4. Save job to database
      await this.databaseService.saveJob({
        jobId: eventData.jobId,
        contractAddress: eventData.jobContract,
        clientAddress: eventData.client,
        title: jobDetails.title,
        description: jobDetails.description,
        requirements: jobDetails.requirements,
        budget: eventData.totalBudget,
        budgetUSD,
        paymentToken: eventData.paymentToken,
        currency: tokenInfo.symbol,
        skills: jobDetails.skills,
        milestones: jobDetails.milestones,
        ipfsHash: eventData.ipfsHash,
        status: 'OPEN',
        createdAt: new Date(eventData.timestamp * 1000),
        biddingDeadline: new Date(eventData.timestamp * 1000 + 7 * 24 * 60 * 60 * 1000), // 7 days
        blockNumber: eventData.blockNumber,
        transactionHash: eventData.transactionHash
      });

      // 5. Cache job data
      await this.cacheService.setJobData(eventData.jobId, jobDetails);

      // 6. Send notifications to matching freelancers
      await this.notificationService.notifyJobCreated(eventData.jobId, jobDetails);

      // 7. Emit real-time update
      this.notificationService.emitRealTimeUpdate('jobCreated', {
        jobId: eventData.jobId,
        title: jobDetails.title,
        budget: eventData.totalBudget,
        currency: tokenInfo.symbol
      });

      logger.info(`Successfully processed JobCreated event for jobId: ${eventData.jobId}`);

    } catch (error) {
      logger.error(`Failed to process JobCreated event`, { eventData, error });
      throw error;
    }
  }

  private async processBidSubmittedEvent(eventData: BidSubmittedEvent): Promise<void> {
    try {
      // 1. Fetch bid details from IPFS
      const bidDetails = await this.ipfsService.fetchBidData(eventData.proposalHash);

      // 2. Get job information
      const job = await this.databaseService.getJobById(eventData.jobId);
      if (!job) {
        throw new Error(`Job not found: ${eventData.jobId}`);
      }

      // 3. Convert budget to USD
      const budgetUSD = await this.convertToUSD(job.paymentToken, eventData.proposedBudget);

      // 4. Save bid to database
      await this.databaseService.saveBid({
        jobId: eventData.jobId,
        freelancerAddress: eventData.freelancer,
        proposedBudget: eventData.proposedBudget,
        proposedBudgetUSD: budgetUSD,
        proposedTimeline: parseInt(eventData.proposedTimeline),
        proposal: bidDetails.proposal,
        proposalHash: eventData.proposalHash,
        coverLetter: bidDetails.coverLetter,
        status: 'ACTIVE',
        submittedAt: new Date(eventData.timestamp * 1000),
        blockNumber: eventData.blockNumber,
        transactionHash: eventData.transactionHash
      });

      // 5. Notify job client
      await this.notificationService.notifyNewBid(job.clientAddress, {
        jobId: eventData.jobId,
        jobTitle: job.title,
        freelancerAddress: eventData.freelancer,
        proposedBudget: eventData.proposedBudget,
        currency: job.currency
      });

      // 6. Update job bid count in cache
      await this.cacheService.incrementJobBidCount(eventData.jobId);

      // 7. Emit real-time update
      this.notificationService.emitRealTimeUpdate('bidSubmitted', {
        jobId: eventData.jobId,
        freelancerAddress: eventData.freelancer,
        proposedBudget: eventData.proposedBudget
      });

      logger.info(`Successfully processed BidSubmitted event for jobId: ${eventData.jobId}`);

    } catch (error) {
      logger.error(`Failed to process BidSubmitted event`, { eventData, error });
      throw error;
    }
  }

  private async processMilestoneCompletedEvent(eventData: MilestoneCompletedEvent): Promise<void> {
    try {
      // 1. Update milestone status in database
      await this.databaseService.updateMilestoneStatus(
        eventData.escrowId,
        eventData.milestoneIndex,
        'COMPLETED',
        {
          completedAt: new Date(eventData.timestamp * 1000),
          amount: eventData.amount,
          recipient: eventData.recipient,
          transactionHash: eventData.transactionHash
        }
      );

      // 2. Get escrow and job information
      const escrow = await this.databaseService.getEscrowById(eventData.escrowId);
      const job = await this.databaseService.getJobByContractAddress(escrow.jobContract);

      // 3. Notify relevant parties
      await this.notificationService.notifyMilestoneCompleted(
        escrow.client,
        escrow.freelancer,
        {
          jobTitle: job.title,
          milestoneIndex: eventData.milestoneIndex,
          amount: eventData.amount,
          currency: job.currency
        }
      );

      // 4. Check if all milestones completed
      const allMilestonesCompleted = await this.checkAllMilestonesCompleted(eventData.escrowId);
      if (allMilestonesCompleted) {
        await this.databaseService.updateJobStatus(job.id, 'COMPLETED');
        await this.notificationService.notifyJobCompleted(job);
      }

      // 5. Emit real-time update
      this.notificationService.emitRealTimeUpdate('milestoneCompleted', {
        jobId: job.id,
        milestoneIndex: eventData.milestoneIndex,
        amount: eventData.amount
      });

      logger.info(`Successfully processed MilestoneCompleted event for escrow: ${eventData.escrowId}`);

    } catch (error) {
      logger.error(`Failed to process MilestoneCompleted event`, { eventData, error });
      throw error;
    }
  }

  private async processDisputeRaisedEvent(eventData: DisputeRaisedEvent): Promise<void> {
    try {
      // 1. Get escrow and job information
      const escrow = await this.databaseService.getEscrowById(eventData.escrowId);
      const job = await this.databaseService.getJobByContractAddress(escrow.jobContract);

      // 2. Save dispute to database
      await this.databaseService.saveDispute({
        disputeId: eventData.disputeId,
        escrowId: eventData.escrowId,
        jobId: job.id,
        initiator: eventData.initiator,
        respondent: eventData.initiator === escrow.client ? escrow.freelancer : escrow.client,
        status: 'PENDING',
        createdAt: new Date(eventData.timestamp * 1000),
        blockNumber: eventData.blockNumber,
        transactionHash: eventData.transactionHash
      });

      // 3. Update job status to disputed
      await this.databaseService.updateJobStatus(job.id, 'DISPUTED');

      // 4. Request arbitrator selection
      await this.requestArbitratorSelection(eventData.disputeId, escrow, job);

      // 5. Notify involved parties
      await this.notificationService.notifyDisputeRaised(
        escrow.client,
        escrow.freelancer,
        {
          jobTitle: job.title,
          disputeId: eventData.disputeId,
          initiator: eventData.initiator
        }
      );

      // 6. Emit real-time update
      this.notificationService.emitRealTimeUpdate('disputeRaised', {
        disputeId: eventData.disputeId,
        jobId: job.id,
        initiator: eventData.initiator
      });

      logger.info(`Successfully processed DisputeRaised event for dispute: ${eventData.disputeId}`);

    } catch (error) {
      logger.error(`Failed to process DisputeRaised event`, { eventData, error });
      throw error;
    }
  }

  // ============ Smart Contract Interactions ============

  public async createJob(
    ipfsHash: string,
    totalBudget: string,
    paymentToken: string,
    milestoneAmounts: string[],
    milestoneDeadlines: number[],
    skillsRequired: string
  ): Promise<ethers.ContractTransaction> {
    if (!this.signer) {
      throw new Error('Signer not configured');
    }

    const jobFactoryWithSigner = this.contracts.jobFactory.connect(this.signer);

    const tx = await jobFactoryWithSigner.createJob(
      ipfsHash,
      totalBudget,
      paymentToken,
      milestoneAmounts,
      milestoneDeadlines,
      ethers.utils.formatBytes32String(skillsRequired),
      { value: ethers.utils.parseEther('0.01') } // Job creation fee
    );

    return tx;
  }

  public async submitBid(
    jobContractAddress: string,
    proposedBudget: string,
    proposedTimeline: number,
    proposalHash: string
  ): Promise<ethers.ContractTransaction> {
    if (!this.signer) {
      throw new Error('Signer not configured');
    }

    const jobContract = new ethers.Contract(jobContractAddress, JobContractABI, this.signer);

    // Calculate bidding cost
    const biddingCost = await jobContract.getCurrentBiddingCost();

    const tx = await jobContract.submitBid(
      proposedBudget,
      proposedTimeline,
      proposalHash,
      { value: biddingCost }
    );

    return tx;
  }

  public async acceptBid(
    jobContractAddress: string,
    bidIndex: number
  ): Promise<ethers.ContractTransaction> {
    if (!this.signer) {
      throw new Error('Signer not configured');
    }

    const jobContract = new ethers.Contract(jobContractAddress, JobContractABI, this.signer);

    const tx = await jobContract.acceptBid(bidIndex);
    return tx;
  }

  // ============ Utility Functions ============

  private async getBlockTimestamp(blockNumber: number): Promise<number> {
    const cacheKey = `block:${blockNumber}:timestamp`;
    const cachedTimestamp = await this.cacheService.get(cacheKey);

    if (cachedTimestamp) {
      return parseInt(cachedTimestamp);
    }

    const block = await this.provider.getBlock(blockNumber);
    await this.cacheService.set(cacheKey, block.timestamp.toString(), 3600); // Cache for 1 hour

    return block.timestamp;
  }

  private async getTokenInfo(tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
    if (tokenAddress === ethers.constants.AddressZero) {
      return { symbol: 'ETH', decimals: 18 };
    }

    const cacheKey = `token:${tokenAddress}:info`;
    const cachedInfo = await this.cacheService.get(cacheKey);

    if (cachedInfo) {
      return JSON.parse(cachedInfo);
    }

    // Get token info from contract
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
      this.provider
    );

    const symbol = await tokenContract.symbol();
    const decimals = await tokenContract.decimals();
    const tokenInfo = { symbol, decimals };

    await this.cacheService.set(cacheKey, JSON.stringify(tokenInfo), 86400); // Cache for 24 hours

    return tokenInfo;
  }

  private async convertToUSD(tokenAddress: string, amount: string): Promise<string> {
    // Implementation would use Chainlink price feeds or external API
    // This is a placeholder
    return '0';
  }

  private async checkAllMilestonesCompleted(escrowId: string): Promise<boolean> {
    const milestones = await this.databaseService.getMilestonesByEscrowId(escrowId);
    return milestones.every(m => m.status === 'COMPLETED');
  }

  private async requestArbitratorSelection(disputeId: string, escrow: any, job: any): Promise<void> {
    if (!this.signer) {
      throw new Error('Signer not configured');
    }

    const arbitratorRegistryWithSigner = this.contracts.arbitratorRegistry.connect(this.signer);

    // Get location hashes (this would come from user profiles)
    const clientLocationHash = await this.databaseService.getUserLocationHash(escrow.client);
    const freelancerLocationHash = await this.databaseService.getUserLocationHash(escrow.freelancer);

    await arbitratorRegistryWithSigner.selectArbitratorForDispute(
      disputeId,
      clientLocationHash,
      freelancerLocationHash,
      ethers.utils.formatBytes32String(job.category) // Required expertise
    );
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff

      logger.info(`Attempting to reconnect to blockchain network (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`);

      setTimeout(() => {
        this.initializeProvider();
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached. Manual intervention required.');
    }
  }

  // ============ Public Status Methods ============

  public isConnected(): boolean {
    return this.isConnected && this.provider.ready;
  }

  public async getNetworkInfo(): Promise<{ chainId: number; name: string; blockNumber: number }> {
    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();

    return {
      chainId: network.chainId,
      name: network.name,
      blockNumber
    };
  }

  public async getGasPrice(): Promise<{ standard: string; fast: string; instant: string }> {
    const gasPrice = await this.provider.getGasPrice();

    return {
      standard: gasPrice.toString(),
      fast: gasPrice.mul(120).div(100).toString(), // 20% higher
      instant: gasPrice.mul(150).div(100).toString() // 50% higher
    };
  }
}