import { v1 as uuidv1 } from 'uuid';

import { deployAndAssociateContracts } from './helpers';
import { uuidToHexString } from '../lib';

// TODO Test executeTrade respects invalidated order nonces
contract('Exchange (invalidations)', (accounts) => {
  describe('invalidateOrderNonce', async () => {
    it('should work first time', async () => {
      const { exchange } = await deployAndAssociateContracts();

      await exchange.invalidateOrderNonce(uuidToHexString(uuidv1()));

      const events = await exchange.getPastEvents('InvalidatedOrderNonce', {
        fromBlock: 0,
      });
      expect(events).to.be.an('array');
      expect(events.length).to.equal(1);
    });
  });
});
