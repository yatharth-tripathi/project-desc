/**
 * Web3Service - Frontend service for blockchain interactions
 * Handles wallet connections, contract interactions, and transaction management
 */

import { ethers, BigNumber } from 'ethers';
import { toast } from 'react-toastify';
import {
  User,
  Job,
  Bid,
  Transaction,
  TransactionStatus,
  BlockchainState,
  ContractAddresses,
  GasEstimate
} from '../types/blockchain';

// Import ABIs
import JobFactoryABI from '../abis/JobFactory.json';
import JobContractABI from '../abis/JobContract.json';
import EscrowContractABI from '../abis/EscrowContract.json';
import ERC20ABI from '../abis/ERC20.json';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export class Web3Service {
  private provider?: ethers.providers.Web3Provider;
  private signer?: ethers.Signer;
  private contracts?: {
    jobFactory: ethers.Contract;
    platformToken: ethers.Contract;
    usdc: ethers.Contract;
    usdt: ethers.Contract;
    dai: ethers.Contract;
  };

  private currentAccount?: string;
  private currentChainId?: number;
  private listeners: Map<string, Function[]> = new Map();
  private pendingTransactions: Map<string, Transaction> = new Map();

  constructor(private contractAddresses: ContractAddresses) {
    this.setupEventListeners();
  }

  // ============ Wallet Connection ============

  public async connectWallet(): Promise<{ address: string; chainId: number }> {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not installed. Please install MetaMask to continue.');
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock your wallet.');
      }

      // Initialize provider and signer
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      this.signer = this.provider.getSigner();
      this.currentAccount = accounts[0];

      // Get network information
      const network = await this.provider.getNetwork();
      this.currentChainId = network.chainId;

      // Validate network
      await this.validateNetwork();

      // Initialize contracts
      this.initializeContracts();

      // Setup account and network change listeners
      this.setupWalletListeners();

      toast.success('Wallet connected successfully!');

      this.emit('walletConnected', {
        address: this.currentAccount,
        chainId: this.currentChainId
      });

      return {
        address: this.currentAccount,
        chainId: this.currentChainId
      };

    } catch (error: any) {
      console.error('Error connecting wallet:', error);
      toast.error(error.message || 'Failed to connect wallet');
      throw error;
    }
  }

  public async disconnectWallet(): Promise<void> {
    try {
      this.provider = undefined;
      this.signer = undefined;
      this.contracts = undefined;
      this.currentAccount = undefined;
      this.currentChainId = undefined;

      // Clear pending transactions
      this.pendingTransactions.clear();

      this.emit('walletDisconnected', {});
      toast.info('Wallet disconnected');

    } catch (error) {
      console.error('Error disconnecting wallet:', error);
    }
  }

  // ============ Network Management ============

  private async validateNetwork(): Promise<void> {
    const supportedChainIds = [1, 5, 137, 80001]; // Mainnet, Goerli, Polygon, Mumbai

    if (!this.currentChainId || !supportedChainIds.includes(this.currentChainId)) {
      throw new Error(`Unsupported network. Please switch to a supported network.`);
    }
  }

  public async switchNetwork(chainId: number): Promise<void> {
    try {
      const chainIdHex = `0x${chainId.toString(16)}`;

      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });

      // Update current chain ID
      this.currentChainId = chainId;

      // Reinitialize contracts for new network
      this.initializeContracts();

      this.emit('networkChanged', { chainId });

    } catch (error: any) {
      if (error.code === 4902) {
        // Network not added to wallet, add it
        await this.addNetwork(chainId);
      } else {
        console.error('Error switching network:', error);
        throw error;
      }
    }
  }

  private async addNetwork(chainId: number): Promise<void> {
    const networkConfigs = {
      137: {
        chainId: '0x89',
        chainName: 'Polygon Mainnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon-rpc.com'],
        blockExplorerUrls: ['https://polygonscan.com/']
      },
      80001: {
        chainId: '0x13881',
        chainName: 'Polygon Mumbai Testnet',
        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://rpc-mumbai.maticvigil.com'],
        blockExplorerUrls: ['https://mumbai.polygonscan.com/']
      }
    };

    const config = networkConfigs[chainId as keyof typeof networkConfigs];
    if (!config) {
      throw new Error('Network configuration not found');
    }

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [config],
    });

    this.currentChainId = chainId;
    this.initializeContracts();
  }

  // ============ Contract Initialization ============

  private initializeContracts(): void {
    if (!this.provider) return;

    this.contracts = {
      jobFactory: new ethers.Contract(
        this.contractAddresses.jobFactory,
        JobFactoryABI,
        this.signer || this.provider
      ),
      platformToken: new ethers.Contract(
        this.contractAddresses.platformToken,
        ERC20ABI,
        this.signer || this.provider
      ),
      usdc: new ethers.Contract(
        this.contractAddresses.supportedTokens.usdc,
        ERC20ABI,
        this.signer || this.provider
      ),
      usdt: new ethers.Contract(
        this.contractAddresses.supportedTokens.usdt,
        ERC20ABI,
        this.signer || this.provider
      ),
      dai: new ethers.Contract(
        this.contractAddresses.supportedTokens.dai,
        ERC20ABI,
        this.signer || this.provider
      )
    };
  }

  // ============ Job Management ============

  public async createJob(jobData: {
    ipfsHash: string;
    totalBudget: string;
    paymentToken: string;
    milestoneAmounts: string[];
    milestoneDeadlines: number[];
    skillsRequired: string;
  }): Promise<Transaction> {
    try {
      if (!this.contracts || !this.signer) {
        throw new Error('Wallet not connected');
      }

      // Estimate gas
      const gasEstimate = await this.estimateGasForJobCreation(jobData);

      // Create transaction
      const tx = await this.contracts.jobFactory.createJob(
        jobData.ipfsHash,
        jobData.totalBudget,
        jobData.paymentToken,
        jobData.milestoneAmounts,
        jobData.milestoneDeadlines,
        ethers.utils.formatBytes32String(jobData.skillsRequired),
        {
          value: ethers.utils.parseEther('0.01'), // Job creation fee
          gasLimit: gasEstimate.gasLimit,
          gasPrice: gasEstimate.gasPrice
        }
      );

      // Track transaction
      const transaction: Transaction = {
        hash: tx.hash,
        type: 'JOB_CREATION',
        status: TransactionStatus.PENDING,
        from: this.currentAccount!,
        value: ethers.utils.parseEther('0.01').toString(),
        gasUsed: gasEstimate.gasLimit,
        gasPrice: gasEstimate.gasPrice,
        metadata: {
          ipfsHash: jobData.ipfsHash,
          totalBudget: jobData.totalBudget,
          paymentToken: jobData.paymentToken
        }
      };

      this.trackTransaction(transaction);

      // Show pending toast
      toast.info('Job creation transaction submitted. Please wait for confirmation...');

      return transaction;

    } catch (error: any) {
      console.error('Error creating job:', error);
      toast.error(error.reason || error.message || 'Failed to create job');
      throw error;
    }
  }

  public async submitBid(bidData: {
    jobContractAddress: string;
    proposedBudget: string;
    proposedTimeline: number;
    proposalHash: string;
  }): Promise<Transaction> {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected');
      }

      const jobContract = new ethers.Contract(
        bidData.jobContractAddress,
        JobContractABI,
        this.signer
      );

      // Calculate bidding cost
      const biddingCost = await jobContract.getCurrentBiddingCost();

      // Estimate gas
      const gasEstimate = await this.estimateGasForBidSubmission(jobContract, bidData, biddingCost);

      // Submit bid
      const tx = await jobContract.submitBid(
        bidData.proposedBudget,
        bidData.proposedTimeline,
        bidData.proposalHash,
        {
          value: biddingCost,
          gasLimit: gasEstimate.gasLimit,
          gasPrice: gasEstimate.gasPrice
        }
      );

      const transaction: Transaction = {
        hash: tx.hash,
        type: 'BID_SUBMISSION',
        status: TransactionStatus.PENDING,
        from: this.currentAccount!,
        to: bidData.jobContractAddress,
        value: biddingCost.toString(),
        gasUsed: gasEstimate.gasLimit,
        gasPrice: gasEstimate.gasPrice,
        metadata: {
          proposedBudget: bidData.proposedBudget,
          proposedTimeline: bidData.proposedTimeline,
          proposalHash: bidData.proposalHash
        }
      };

      this.trackTransaction(transaction);

      toast.info('Bid submission transaction submitted. Please wait for confirmation...');

      return transaction;

    } catch (error: any) {
      console.error('Error submitting bid:', error);
      toast.error(error.reason || error.message || 'Failed to submit bid');
      throw error;
    }
  }

  public async acceptBid(jobContractAddress: string, bidIndex: number): Promise<Transaction> {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected');
      }

      const jobContract = new ethers.Contract(jobContractAddress, JobContractABI, this.signer);

      // Estimate gas
      const gasEstimate = await jobContract.estimateGas.acceptBid(bidIndex);

      const tx = await jobContract.acceptBid(bidIndex, {
        gasLimit: gasEstimate.mul(120).div(100), // Add 20% buffer
      });

      const transaction: Transaction = {
        hash: tx.hash,
        type: 'BID_ACCEPTANCE',
        status: TransactionStatus.PENDING,
        from: this.currentAccount!,
        to: jobContractAddress,
        gasUsed: gasEstimate.toString(),
        metadata: {
          bidIndex,
          jobContractAddress
        }
      };

      this.trackTransaction(transaction);

      toast.info('Bid acceptance transaction submitted. Please wait for confirmation...');

      return transaction;

    } catch (error: any) {
      console.error('Error accepting bid:', error);
      toast.error(error.reason || error.message || 'Failed to accept bid');
      throw error;
    }
  }

  // ============ Token Operations ============

  public async getTokenBalance(tokenAddress: string): Promise<string> {
    try {
      if (!this.provider || !this.currentAccount) {
        return '0';
      }

      if (tokenAddress === ethers.constants.AddressZero) {
        // ETH balance
        const balance = await this.provider.getBalance(this.currentAccount);
        return balance.toString();
      } else {
        // ERC20 token balance
        const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.provider);
        const balance = await tokenContract.balanceOf(this.currentAccount);
        return balance.toString();
      }

    } catch (error) {
      console.error('Error getting token balance:', error);
      return '0';
    }
  }

  public async approveToken(
    tokenAddress: string,
    spender: string,
    amount: string
  ): Promise<Transaction> {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20ABI, this.signer);

      const tx = await tokenContract.approve(spender, amount);

      const transaction: Transaction = {
        hash: tx.hash,
        type: 'BID_SUBMISSION', // Generic type for token operations
        status: TransactionStatus.PENDING,
        from: this.currentAccount!,
        to: tokenAddress,
        metadata: {
          type: 'token_approval',
          spender,
          amount
        }
      };

      this.trackTransaction(transaction);

      return transaction;

    } catch (error: any) {
      console.error('Error approving token:', error);
      throw error;
    }
  }

  // ============ Gas Estimation ============

  private async estimateGasForJobCreation(jobData: any): Promise<GasEstimate> {
    if (!this.contracts) {
      throw new Error('Contracts not initialized');
    }

    try {
      const gasLimit = await this.contracts.jobFactory.estimateGas.createJob(
        jobData.ipfsHash,
        jobData.totalBudget,
        jobData.paymentToken,
        jobData.milestoneAmounts,
        jobData.milestoneDeadlines,
        ethers.utils.formatBytes32String(jobData.skillsRequired),
        { value: ethers.utils.parseEther('0.01') }
      );

      const gasPrice = await this.provider!.getGasPrice();

      return {
        gasLimit: gasLimit.mul(120).div(100).toString(), // Add 20% buffer
        gasPrice: gasPrice.toString(),
        totalCost: gasLimit.mul(gasPrice).toString()
      };

    } catch (error) {
      console.error('Error estimating gas for job creation:', error);

      // Fallback gas estimates
      return {
        gasLimit: '200000',
        gasPrice: ethers.utils.parseUnits('20', 'gwei').toString(),
        totalCost: ethers.utils.parseUnits('4', 'finney').toString() // 0.004 ETH
      };
    }
  }

  private async estimateGasForBidSubmission(
    jobContract: ethers.Contract,
    bidData: any,
    biddingCost: BigNumber
  ): Promise<GasEstimate> {
    try {
      const gasLimit = await jobContract.estimateGas.submitBid(
        bidData.proposedBudget,
        bidData.proposedTimeline,
        bidData.proposalHash,
        { value: biddingCost }
      );

      const gasPrice = await this.provider!.getGasPrice();

      return {
        gasLimit: gasLimit.mul(120).div(100).toString(),
        gasPrice: gasPrice.toString(),
        totalCost: gasLimit.mul(gasPrice).toString()
      };

    } catch (error) {
      console.error('Error estimating gas for bid submission:', error);

      return {
        gasLimit: '100000',
        gasPrice: ethers.utils.parseUnits('20', 'gwei').toString(),
        totalCost: ethers.utils.parseUnits('2', 'finney').toString()
      };
    }
  }

  // ============ Transaction Management ============

  private trackTransaction(transaction: Transaction): void {
    this.pendingTransactions.set(transaction.hash, transaction);

    // Wait for transaction confirmation
    if (this.provider) {
      this.provider.waitForTransaction(transaction.hash, 1).then((receipt) => {
        const updatedTransaction: Transaction = {
          ...transaction,
          status: receipt.status === 1 ? TransactionStatus.CONFIRMED : TransactionStatus.FAILED,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          confirmations: receipt.confirmations
        };

        this.pendingTransactions.set(transaction.hash, updatedTransaction);

        if (receipt.status === 1) {
          toast.success('Transaction confirmed successfully!');
          this.emit('transactionConfirmed', updatedTransaction);
        } else {
          toast.error('Transaction failed!');
          this.emit('transactionFailed', updatedTransaction);
        }

        // Remove from pending after 10 seconds
        setTimeout(() => {
          this.pendingTransactions.delete(transaction.hash);
        }, 10000);

      }).catch((error) => {
        console.error('Transaction failed:', error);

        const failedTransaction: Transaction = {
          ...transaction,
          status: TransactionStatus.FAILED
        };

        this.pendingTransactions.set(transaction.hash, failedTransaction);
        toast.error('Transaction failed!');
        this.emit('transactionFailed', failedTransaction);
      });
    }
  }

  // ============ Event Listeners ============

  private setupEventListeners(): void {
    // Setup wallet event listeners when wallet is connected
  }

  private setupWalletListeners(): void {
    if (window.ethereum) {
      // Account changed
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnectWallet();
        } else if (accounts[0] !== this.currentAccount) {
          this.currentAccount = accounts[0];
          this.emit('accountChanged', { address: accounts[0] });
          toast.info('Account changed');
        }
      });

      // Network changed
      window.ethereum.on('chainChanged', (chainId: string) => {
        const newChainId = parseInt(chainId, 16);
        this.currentChainId = newChainId;
        this.initializeContracts();
        this.emit('networkChanged', { chainId: newChainId });
        toast.info('Network changed');
      });
    }
  }

  // ============ Event System ============

  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // ============ Utility Methods ============

  public isConnected(): boolean {
    return !!(this.provider && this.currentAccount);
  }

  public getCurrentAccount(): string | undefined {
    return this.currentAccount;
  }

  public getCurrentChainId(): number | undefined {
    return this.currentChainId;
  }

  public getPendingTransactions(): Transaction[] {
    return Array.from(this.pendingTransactions.values());
  }

  public async getBlockchainState(): Promise<BlockchainState> {
    if (!this.provider || !this.currentAccount) {
      return {
        isConnected: false,
        network: { chainId: 0, name: '', isSupported: false },
        account: { balance: { eth: '0', usdc: '0', usdt: '0', dai: '0', platformToken: '0' } },
        gasPrice: { standard: '0', fast: '0', instant: '0' },
        blockNumber: 0,
        pendingTransactions: []
      };
    }

    const network = await this.provider.getNetwork();
    const blockNumber = await this.provider.getBlockNumber();
    const gasPrice = await this.provider.getGasPrice();

    // Get token balances
    const ethBalance = await this.getTokenBalance(ethers.constants.AddressZero);
    const usdcBalance = await this.getTokenBalance(this.contractAddresses.supportedTokens.usdc);
    const usdtBalance = await this.getTokenBalance(this.contractAddresses.supportedTokens.usdt);
    const daiBalance = await this.getTokenBalance(this.contractAddresses.supportedTokens.dai);
    const platformTokenBalance = await this.getTokenBalance(this.contractAddresses.platformToken);

    return {
      isConnected: true,
      network: {
        chainId: network.chainId,
        name: network.name,
        isSupported: [1, 5, 137, 80001].includes(network.chainId)
      },
      account: {
        address: this.currentAccount,
        balance: {
          eth: ethBalance,
          usdc: usdcBalance,
          usdt: usdtBalance,
          dai: daiBalance,
          platformToken: platformTokenBalance
        }
      },
      gasPrice: {
        standard: gasPrice.toString(),
        fast: gasPrice.mul(120).div(100).toString(),
        instant: gasPrice.mul(150).div(100).toString()
      },
      blockNumber,
      pendingTransactions: this.getPendingTransactions()
    };
  }

  // ============ Authentication ============

  public async signMessage(message: string): Promise<string> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.signer.signMessage(message);
      return signature;
    } catch (error: any) {
      console.error('Error signing message:', error);
      throw error;
    }
  }

  public async authenticate(): Promise<{ address: string; signature: string; message: string }> {
    if (!this.currentAccount) {
      throw new Error('Wallet not connected');
    }

    const timestamp = Date.now();
    const nonce = Math.random().toString(36);
    const message = `Login to FreelancingPlatform\nTimestamp: ${timestamp}\nNonce: ${nonce}`;

    const signature = await this.signMessage(message);

    return {
      address: this.currentAccount,
      signature,
      message
    };
  }
}