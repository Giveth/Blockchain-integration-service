import { NetworkId } from '../types';

/**
 * Donation handler contract addresses per network
 * These contracts are used to batch/distribute donations to multiple recipients
 */
export const DONATION_HANDLER_ADDRESSES: Record<number, string[]> = {
  [NetworkId.MAINNET]: [
    '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676', // Giveth Donation Handler on Ethereum Mainnet
  ],
  [NetworkId.POLYGON]: [
    '0x6e349C56F512cB4250276BF36335c8dd618944A1', // Giveth Donation Handler on Polygon
  ],
  [NetworkId.OPTIMISM]: [
    '0x8D685A56C51Cf54685d3dB0Ea50748D3A2c2e0dC', // Giveth Donation Handler on Optimism
  ],
  [NetworkId.ARBITRUM]: [
    '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676', // Giveth Donation Handler on Arbitrum
  ],
  [NetworkId.GNOSIS]: [
    '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676', // Giveth Donation Handler on Gnosis
  ],
  [NetworkId.CELO]: [
    '0x97b2cb568e0880B99Cd16EFc6edFF5272Aa02676', // Giveth Donation Handler on Celo
  ],
  [NetworkId.BASE]: [
    '0x7a5D2A00a25b95fd8739bc52Cd79f8F971C37Ca1', // Giveth Donation Handler on Base
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
