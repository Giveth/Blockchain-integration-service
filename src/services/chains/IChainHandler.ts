import { TransactionDetailInput, NetworkTransactionInfo } from '../../types';

export interface IChainHandler {
  getTransactionInfo(
    input: TransactionDetailInput,
  ): Promise<NetworkTransactionInfo>;
  isSupported(networkId: number): boolean;
}
