import { expect } from 'chai';
import {
  isDonationHandlerAddress,
  getDonationHandlerAddresses,
  DONATION_HANDLER_ADDRESSES,
} from './donationHandlers';
import { NetworkId } from '../types';

describe('Donation Handlers Config', () => {
  describe('DONATION_HANDLER_ADDRESSES', () => {
    it('should have Polygon donation handler configured', () => {
      const polygonHandlers = DONATION_HANDLER_ADDRESSES[NetworkId.POLYGON];
      expect(polygonHandlers).to.be.an('array');
      expect(polygonHandlers.length).to.be.greaterThan(0);
      expect(polygonHandlers).to.include(
        '0x6e349C56F512cB4250276BF36335c8dd618944A1',
      );
    });
  });

  describe('isDonationHandlerAddress', () => {
    it('should return true for known donation handler on Polygon', () => {
      const result = isDonationHandlerAddress(
        NetworkId.POLYGON,
        '0x6e349C56F512cB4250276BF36335c8dd618944A1',
      );
      expect(result).to.be.true;
    });

    it('should be case-insensitive', () => {
      const resultLower = isDonationHandlerAddress(
        NetworkId.POLYGON,
        '0x6e349c56f512cb4250276bf36335c8dd618944a1',
      );
      const resultUpper = isDonationHandlerAddress(
        NetworkId.POLYGON,
        '0x6E349C56F512CB4250276BF36335C8DD618944A1',
      );

      expect(resultLower).to.be.true;
      expect(resultUpper).to.be.true;
    });

    it('should return false for unknown addresses', () => {
      const result = isDonationHandlerAddress(
        NetworkId.POLYGON,
        '0x0000000000000000000000000000000000000000',
      );
      expect(result).to.be.false;
    });

    it('should return false for unsupported networks', () => {
      const result = isDonationHandlerAddress(
        999999,
        '0x6e349C56F512cB4250276BF36335c8dd618944A1',
      );
      expect(result).to.be.false;
    });
  });

  describe('getDonationHandlerAddresses', () => {
    it('should return addresses for Polygon', () => {
      const addresses = getDonationHandlerAddresses(NetworkId.POLYGON);
      expect(addresses).to.be.an('array');
      expect(addresses.length).to.be.greaterThan(0);
    });

    it('should return empty array for networks without handlers', () => {
      const addresses = getDonationHandlerAddresses(999999);
      expect(addresses).to.be.an('array');
      expect(addresses).to.have.lengthOf(0);
    });
  });
});
