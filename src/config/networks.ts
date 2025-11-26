import { NetworkConfig, NetworkId, ChainType } from '../types';

/**
 * Network configurations for all supported blockchains
 */
export const NETWORK_CONFIGS: Record<number, NetworkConfig> = {
  // Ethereum Mainnet
  [NetworkId.MAINNET]: {
    id: NetworkId.MAINNET,
    name: 'Ethereum Mainnet',
    chainType: ChainType.EVM,
    rpcUrl: process.env.MAINNET_RPC_URL,
    blockExplorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  // Polygon
  [NetworkId.POLYGON]: {
    id: NetworkId.POLYGON,
    name: 'Polygon',
    chainType: ChainType.EVM,
    rpcUrl: process.env.POLYGON_RPC_URL,
    blockExplorerUrl: 'https://polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
  // Optimism
  [NetworkId.OPTIMISM]: {
    id: NetworkId.OPTIMISM,
    name: 'Optimism',
    chainType: ChainType.EVM,
    rpcUrl: process.env.OPTIMISM_RPC_URL,
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  // Arbitrum
  [NetworkId.ARBITRUM]: {
    id: NetworkId.ARBITRUM,
    name: 'Arbitrum One',
    chainType: ChainType.EVM,
    rpcUrl: process.env.ARBITRUM_RPC_URL,
    blockExplorerUrl: 'https://arbiscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  // Gnosis Chain
  [NetworkId.GNOSIS]: {
    id: NetworkId.GNOSIS,
    name: 'Gnosis Chain',
    chainType: ChainType.EVM,
    rpcUrl: process.env.GNOSIS_RPC_URL,
    blockExplorerUrl: 'https://gnosisscan.io',
    nativeCurrency: {
      name: 'xDAI',
      symbol: 'xDAI',
      decimals: 18,
    },
  },
  // Celo
  [NetworkId.CELO]: {
    id: NetworkId.CELO,
    name: 'Celo',
    chainType: ChainType.EVM,
    rpcUrl: process.env.CELO_RPC_URL,
    blockExplorerUrl: 'https://celoscan.io',
    nativeCurrency: {
      name: 'CELO',
      symbol: 'CELO',
      decimals: 18,
    },
  },
  // Base
  [NetworkId.BASE]: {
    id: NetworkId.BASE,
    name: 'Base',
    chainType: ChainType.EVM,
    rpcUrl: process.env.BASE_RPC_URL,
    blockExplorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  // Solana
  [NetworkId.SOLANA_MAINNET]: {
    id: NetworkId.SOLANA_MAINNET,
    name: 'Solana Mainnet',
    chainType: ChainType.SOLANA,
    rpcUrl: process.env.SOLANA_RPC_URL,
    blockExplorerUrl: 'https://explorer.solana.com',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
  // Stellar
  [NetworkId.STELLAR_MAINNET]: {
    id: NetworkId.STELLAR_MAINNET,
    name: 'Stellar Mainnet',
    chainType: ChainType.STELLAR,
    rpcUrl: process.env.STELLAR_NETWORK_URL,
    blockExplorerUrl: 'https://stellarchain.io',
    nativeCurrency: {
      name: 'Stellar Lumens',
      symbol: 'XLM',
      decimals: 7,
    },
  },
  // Cardano
  [NetworkId.CARDANO_MAINNET]: {
    id: NetworkId.CARDANO_MAINNET,
    name: 'Cardano Mainnet',
    chainType: ChainType.CARDANO,
    blockExplorerUrl: 'https://cardanoscan.io',
    nativeCurrency: {
      name: 'Cardano',
      symbol: 'ADA',
      decimals: 6,
    },
  },
};

/**
 * Get network configuration by network ID
 */
export const getNetworkConfig = (networkId: number): NetworkConfig => {
  const config = NETWORK_CONFIGS[networkId];
  if (!config) {
    throw new Error(`Unsupported network ID: ${networkId}`);
  }
  return config;
};

/**
 * Get chain type for a network ID
 */
export const getChainType = (networkId: number): ChainType => {
  const config = getNetworkConfig(networkId);
  return config.chainType;
};

/**
 * Check if network ID is supported
 */
export const isNetworkSupported = (networkId: number): boolean => {
  return networkId in NETWORK_CONFIGS;
};

