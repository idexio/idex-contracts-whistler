import { v1 as uuidv1, v4 as uuidv4 } from 'uuid';

import { uuidToHexString } from '../lib';

contract('UUID', (accounts) => {
  const UUIDMock = artifacts.require('UUIDMock');

  describe.only('getTimestampFromUuidV1', () => {
    it('should work for current timestamp', async () => {
      const uuidMock = await UUIDMock.new();

      const inputTimestamp = new Date().getTime();
      const outputTimestamp = (
        await uuidMock.getTimestampFromUuidV1(
          uuidToHexString(uuidv1({ msecs: inputTimestamp })),
        )
      ).toNumber();

      expect(outputTimestamp).to.equal(inputTimestamp);
    });

    it('should work for 0', async () => {
      const uuidMock = await UUIDMock.new();

      const inputTimestamp = 0;
      const outputTimestamp = (
        await uuidMock.getTimestampFromUuidV1(
          uuidToHexString(uuidv1({ msecs: inputTimestamp })),
        )
      ).toNumber();

      expect(outputTimestamp).to.equal(inputTimestamp);
    });

    it('should revert for wrong UUID version', async () => {
      const uuidMock = await UUIDMock.new();

      let error;
      try {
        await uuidMock.getTimestampFromUuidV1(uuidToHexString(uuidv4()));
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be v1 uuid/i);
    });
  });
});
