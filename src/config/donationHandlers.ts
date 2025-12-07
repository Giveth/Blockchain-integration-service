import { NetworkId } from '../types';

/**
 * Donation handler contract addresses per network
 * These contracts are used to batch/distribute donations to multiple recipients
 */
export const DONATION_HANDLER_ADDRESSES: Record<number, string[]> = {
  [NetworkId.MAINNET]: [
    // Add Ethereum mainnet donation handler addresses here
  ],
  [NetworkId.POLYGON]: [
    '0x6e349C56F512cB4250276BF36335c8dd618944A1', // Giveth Donation Handler
  ],
  [NetworkId.OPTIMISM]: [
    // Add Optimism donation handler addresses here
  ],
  [NetworkId.ARBITRUM]: [
    // Add Arbitrum donation handler addresses here
  ],
  [NetworkId.GNOSIS]: [
    // Add Gnosis donation handler addresses here
  ],
  [NetworkId.CELO]: [
    // Add Celo donation handler addresses here
  ],
  [NetworkId.BASE]: [
    // Add Base donation handler addresses here
  ],
};

/**
 * Check if an address is a known donation handler contract
 */
export function isDonationHandlerAddress(
  networkId: number,
  address: string,
): boolean {
  const handlers = DONATION_HANDLER_ADDRESSES[networkId] || [];
  return handlers.some(
    (handler) => handler.toLowerCase() === address.toLowerCase(),
  );
}

/**
 * Get donation handler addresses for a network
 */
export function getDonationHandlerAddresses(networkId: number): string[] {
  return DONATION_HANDLER_ADDRESSES[networkId] || [];
}
