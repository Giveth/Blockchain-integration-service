import axios from 'axios';
import { logger } from '../utils/logger';
import { TokenPriceInput } from '../types';

// CoinGecko network ID mapping
const COINGECKO_PLATFORM_IDS: Record<number, string> = {
  1: 'ethereum',
  137: 'polygon-pos',
  10: 'optimistic-ethereum',
  42161: 'arbitrum-one',
  100: 'xdai',
  42220: 'celo',
  8453: 'base',
  56: 'binance-smart-chain',
  43114: 'avalanche',
  101: 'solana',
};

// Symbol-based CoinGecko IDs for native tokens and selected known ERC-20s.
const SYMBOL_TOKEN_IDS: Record<string, string> = {
  ETH: 'ethereum',
  MATIC: 'polygon-ecosystem-token', // MATIC was rebranded to POL
  POL: 'polygon-ecosystem-token',
  BNB: 'binancecoin',
  AVAX: 'avalanche-2',
  CELO: 'celo',
  XDAI: 'xdai', // Native token on Gnosis Chain
  DAI: 'dai',
  SOL: 'solana',
  GIV: 'giveth',
};

export const FINN_ADDRESS_MAINNET =
  '0xb87c3637Eb7C28AaC2C918ED8EC0C3b3b5e8fB67'.toLowerCase();
export const TIK_ADDRESS_MAINNET =
  '0xCE271CA7F18fc04E6744fCF04fef3462eb3C5A94'.toLowerCase();

type FixedPriceEntry =
  | { kind: 'ratio'; baseSymbol: string; ratio: number }
  | { kind: 'usd'; price: number };

// Tokens whose USD price is derived from another token's price at a fixed
// ratio. Keyed by `${networkId}:${lowercasedAddress}`.
const FIXED_PRICE_TOKENS: Record<string, FixedPriceEntry> = {
  [`1:${FINN_ADDRESS_MAINNET}`]: {
    kind: 'ratio',
    baseSymbol: 'ETH',
    ratio: 0.001,
  },
  [`1:${TIK_ADDRESS_MAINNET}`]: {
    kind: 'usd',
    price: 1,
  },
};

export class PriceService {
  private readonly coingeckoBaseUrl = 'https://api.coingecko.com/api/v3';
  private priceCache: Map<string, { price: number; timestamp: number }> =
    new Map();
  private readonly cacheTtlMs = 60 * 1000; // 1 minute cache

  private getCacheKey(
    networkId: number,
    symbol: string,
    tokenAddress?: string | null,
  ): string {
    return `${networkId}:${symbol}:${tokenAddress || 'native'}`;
  }

  private getCachedPrice(
    networkId: number,
    symbol: string,
    tokenAddress?: string | null,
  ): number | null {
    const key = this.getCacheKey(networkId, symbol, tokenAddress);
    const cached = this.priceCache.get(key);

    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.price;
    }

    return null;
  }

  private setCachedPrice(
    networkId: number,
    symbol: string,
    price: number,
    tokenAddress?: string | null,
  ): void {
    const key = this.getCacheKey(networkId, symbol, tokenAddress);
    this.priceCache.set(key, { price, timestamp: Date.now() });
  }

  async getTokenPrice(input: TokenPriceInput): Promise<number> {
    const { networkId, symbol, tokenAddress } = input;

    logger.debug('Getting token price', { networkId, symbol, tokenAddress });

    // Check cache first
    const cachedPrice = this.getCachedPrice(networkId, symbol, tokenAddress);
    if (cachedPrice !== null) {
      logger.debug('Returning cached price', { symbol, price: cachedPrice });
      return cachedPrice;
    }

    try {
      let price: number;

      const fixedEntry = tokenAddress
        ? FIXED_PRICE_TOKENS[`${networkId}:${tokenAddress.toLowerCase()}`]
        : undefined;

      if (fixedEntry) {
        if (fixedEntry.kind === 'ratio') {
          const basePrice = await this.getPriceBySymbol(fixedEntry.baseSymbol);
          price = basePrice * fixedEntry.ratio;
        } else {
          price = fixedEntry.price;
        }
      } else if (tokenAddress) {
        // Get price by contract address
        price = await this.getPriceByContractAddress(networkId, tokenAddress);
      } else {
        // Get price by symbol (native token)
        price = await this.getPriceBySymbol(symbol);
      }

      // Cache the price
      this.setCachedPrice(networkId, symbol, price, tokenAddress);

      logger.debug('Token price fetched', { symbol, price });
      return price;
    } catch (error) {
      logger.error('Failed to fetch token price', {
        error: error instanceof Error ? error.message : 'Unknown error',
        networkId,
        symbol,
        tokenAddress,
      });

      // Return 0 on failure - let the calling service decide how to handle
      return 0;
    }
  }

  private async getPriceBySymbol(symbol: string): Promise<number> {
    const coinId = SYMBOL_TOKEN_IDS[symbol.toUpperCase()];

    if (!coinId) {
      logger.warn('Unknown symbol for direct price lookup', { symbol });
      return 0;
    }

    const response = await axios.get(
      `${this.coingeckoBaseUrl}/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 10000 },
    );

    return response.data[coinId]?.usd || 0;
  }

  private async getPriceByContractAddress(
    networkId: number,
    tokenAddress: string,
  ): Promise<number> {
    const platformId = COINGECKO_PLATFORM_IDS[networkId];

    if (!platformId) {
      logger.warn('Unknown network for price lookup', { networkId });
      return 0;
    }

    const response = await axios.get(
      `${this.coingeckoBaseUrl}/simple/token_price/${platformId}?contract_addresses=${tokenAddress.toLowerCase()}&vs_currencies=usd`,
      { timeout: 10000 },
    );

    return response.data[tokenAddress.toLowerCase()]?.usd || 0;
  }
}

export const priceService = new PriceService();
