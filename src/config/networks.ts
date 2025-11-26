import { NetworkConfig, NetworkId, ChainType } from '../types';

export const NETWORK_CONFIGS: Record<number, NetworkConfig> = {
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
  [NetworkId.BSC]: {
    id: NetworkId.BSC,
    name: 'BNB Smart Chain',
    chainType: ChainType.EVM,
    rpcUrl: process.env.BSC_RPC_URL,
    blockExplorerUrl: 'https://bscscan.com',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
  },
  [NetworkId.AVALANCHE]: {
    id: NetworkId.AVALANCHE,
    name: 'Avalanche',
    chainType: ChainType.EVM,
    rpcUrl: process.env.AVALANCHE_RPC_URL,
    blockExplorerUrl: 'https://snowtrace.io',
    nativeCurrency: {
      name: 'AVAX',
      symbol: 'AVAX',
      decimals: 18,
    },
  },
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
};

export const getNetworkConfig = (networkId: number): NetworkConfig => {
  const config = NETWORK_CONFIGS[networkId];
  if (!config) {
    throw new Error(`Unsupported network ID: ${networkId}`);
  }
  return config;
};

export const getChainType = (networkId: number): ChainType => {
  const config = getNetworkConfig(networkId);
  return config.chainType;
};

export const isNetworkSupported = (networkId: number): boolean => {
  return networkId in NETWORK_CONFIGS;
};
