import { expect } from 'chai';
import {
  getNetworkConfig,
  getChainType,
  isNetworkSupported,
  NETWORK_CONFIGS,
} from './networks';
import { NetworkId, ChainType } from '../types';

describe('Network Configuration', () => {
  describe('NETWORK_CONFIGS', () => {
    it('should contain configuration for Ethereum Mainnet', () => {
      const config = NETWORK_CONFIGS[NetworkId.MAINNET];
      expect(config).to.exist;
      expect(config.name).to.equal('Ethereum Mainnet');
      expect(config.chainType).to.equal(ChainType.EVM);
      expect(config.nativeCurrency.symbol).to.equal('ETH');
    });

    it('should contain configuration for Solana', () => {
      const config = NETWORK_CONFIGS[NetworkId.SOLANA_MAINNET];
      expect(config).to.exist;
      expect(config.name).to.equal('Solana Mainnet');
      expect(config.chainType).to.equal(ChainType.SOLANA);
      expect(config.nativeCurrency.symbol).to.equal('SOL');
    });

    it('should contain configuration for all major EVM chains', () => {
      expect(NETWORK_CONFIGS[NetworkId.POLYGON]).to.exist;
      expect(NETWORK_CONFIGS[NetworkId.OPTIMISM]).to.exist;
      expect(NETWORK_CONFIGS[NetworkId.ARBITRUM]).to.exist;
      expect(NETWORK_CONFIGS[NetworkId.BASE]).to.exist;
    });
  });

  describe('getNetworkConfig', () => {
    it('should return correct config for valid network ID', () => {
      const config = getNetworkConfig(NetworkId.MAINNET);
      expect(config.id).to.equal(NetworkId.MAINNET);
      expect(config.chainType).to.equal(ChainType.EVM);
    });

    it('should throw error for invalid network ID', () => {
      expect(() => getNetworkConfig(99999)).to.throw(
        'Unsupported network ID: 99999',
      );
    });
  });

  describe('getChainType', () => {
    it('should return EVM for Ethereum networks', () => {
      expect(getChainType(NetworkId.MAINNET)).to.equal(ChainType.EVM);
      expect(getChainType(NetworkId.POLYGON)).to.equal(ChainType.EVM);
    });

    it('should return SOLANA for Solana network', () => {
      expect(getChainType(NetworkId.SOLANA_MAINNET)).to.equal(ChainType.SOLANA);
    });

    it('should throw error for unsupported network', () => {
      expect(() => getChainType(99999)).to.throw();
    });
  });

  describe('isNetworkSupported', () => {
    it('should return true for supported networks', () => {
      expect(isNetworkSupported(NetworkId.MAINNET)).to.be.true;
      expect(isNetworkSupported(NetworkId.POLYGON)).to.be.true;
      expect(isNetworkSupported(NetworkId.SOLANA_MAINNET)).to.be.true;
    });

    it('should return false for unsupported networks', () => {
      expect(isNetworkSupported(99999)).to.be.false;
    });
  });
});
