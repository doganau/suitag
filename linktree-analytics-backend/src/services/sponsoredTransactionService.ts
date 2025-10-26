import { EnokiClient } from '@mysten/enoki';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import logger from '../utils/logger';

interface SponsoredTransactionConfig {
  apiKey: string;
  network: 'testnet' | 'mainnet';
  suiClient: SuiClient;
}

class SponsoredTransactionService {
  private enokiClient: EnokiClient | null = null;
  private suiClient: SuiClient;
  private enabled: boolean = false;

  constructor(config: SponsoredTransactionConfig) {
    this.suiClient = config.suiClient;

    // Initialize Enoki client if API key is provided
    if (config.apiKey && config.apiKey.length > 0) {
      try {
        this.enokiClient = new EnokiClient({
          apiKey: config.apiKey,
        });
        this.enabled = true;
        logger.info('Sponsored Transaction Service initialized successfully');
      } catch (error) {
        logger.error('Failed to initialize Enoki client:', error);
        this.enabled = false;
      }
    } else {
      logger.warn('Enoki API key not provided. Sponsored transactions disabled.');
    }
  }

  /**
   * Check if sponsored transactions are enabled
   */
  isEnabled(): boolean {
    return this.enabled && this.enokiClient !== null;
  }

  /**
   * Create a sponsored transaction (Step 1)
   * Returns transaction bytes and digest for user to sign
   */
  async createSponsoredTransaction(
    transactionKindBytes: string,
    sender: string
  ): Promise<{
    success: boolean;
    bytes?: string;
    digest?: string;
    error?: string;
  }> {
    if (!this.isEnabled() || !this.enokiClient) {
      return {
        success: false,
        error: 'Sponsored transactions not enabled',
      };
    }

    try {
      logger.info('Creating sponsored transaction', { sender });

      const result = await this.enokiClient.createSponsoredTransaction({
        network: 'testnet',
        transactionKindBytes,
        sender,
        // Optional: Add allowed targets/addresses for security
        // allowedMoveCallTargets: ['0x2::...'],
        // allowedAddresses: [recipient],
      });

      logger.info('Sponsored transaction created', {
        digest: result.digest,
      });

      return {
        success: true,
        bytes: result.bytes,
        digest: result.digest,
      };
    } catch (error: any) {
      logger.error('Failed to create sponsored transaction:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Execute a sponsored transaction with user signature (Step 2)
   */
  async executeSponsoredTransaction(
    digest: string,
    signature: string
  ): Promise<{
    success: boolean;
    digest?: string;
    effects?: any;
    error?: string;
  }> {
    if (!this.isEnabled() || !this.enokiClient) {
      return {
        success: false,
        error: 'Sponsored transactions not enabled',
      };
    }

    try {
      logger.info('Executing sponsored transaction', { digest });

      const result = await this.enokiClient.executeSponsoredTransaction({
        digest,
        signature,
      });

      logger.info('Sponsored transaction executed successfully', {
        digest: result.digest,
      });

      return {
        success: true,
        digest: result.digest,
        effects: result.effects,
      };
    } catch (error: any) {
      logger.error('Failed to execute sponsored transaction:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Get sponsor balance (if available)
   */
  async getSponsorBalance(): Promise<{
    balance: string;
    decimals: number;
  } | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      // This would need to be implemented based on Enoki's API
      // For now, return placeholder
      return {
        balance: '0',
        decimals: 9,
      };
    } catch (error) {
      logger.error('Failed to get sponsor balance:', error);
      return null;
    }
  }

  /**
   * Estimate gas cost for a transaction
   */
  async estimateGasCost(transactionBytes: string): Promise<{
    gasCost: string;
    gasPrice: string;
  } | null> {
    try {
      const tx = TransactionBlock.from(transactionBytes);
      const dryRunResult = await this.suiClient.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: this.suiClient }),
      });

      const gasCost = dryRunResult.effects.gasUsed?.computationCost || '0';
      const gasPrice = '1000'; // Default gas price

      return {
        gasCost,
        gasPrice,
      };
    } catch (error) {
      logger.error('Failed to estimate gas cost:', error);
      return null;
    }
  }

  /**
   * Validate JWT token
   */
  validateJWT(jwt: string): boolean {
    try {
      const parts = jwt.split('.');
      if (parts.length !== 3) {
        return false;
      }

      // Decode payload
      const payload = JSON.parse(atob(parts[1]));

      // Check expiration
      if (payload.exp && payload.exp < Date.now() / 1000) {
        logger.warn('JWT token expired');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to validate JWT:', error);
      return false;
    }
  }

  /**
   * Get transaction limits
   */
  getTransactionLimits(): {
    maxGasPerTransaction: string;
    maxTransactionsPerDay: number;
    enabled: boolean;
  } {
    return {
      maxGasPerTransaction: '100000000', // 0.1 SUI
      maxTransactionsPerDay: 100,
      enabled: this.enabled,
    };
  }
}

export default SponsoredTransactionService;

