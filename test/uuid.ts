import { v1 as uuidv1, v4 as uuidv4 } from 'uuid';

import { uuidToHexString } from '../lib';

contract('UUID', () => {
  const UUIDMock = artifacts.require('UUIDMock');

  describe('getTimestampInMsFromUuidV1', () => {
    it('should work for current timestamp', async () => {
      const uuidMock = await UUIDMock.new();

      const inputTimestamp = new Date().getTime();
      const outputTimestamp = (
        await uuidMock.getTimestampInMsFromUuidV1(
          uuidToHexString(uuidv1({ msecs: inputTimestamp })),
        )
      ).toNumber();

      expect(outputTimestamp).to.equal(inputTimestamp);
    });

    it('should work for 0', async () => {
      const uuidMock = await UUIDMock.new();

      const inputTimestamp = 0;
      const outputTimestamp = (
        await uuidMock.getTimestampInMsFromUuidV1(
          uuidToHexString(uuidv1({ msecs: inputTimestamp })),
        )
      ).toNumber();

      expect(outputTimestamp).to.equal(inputTimestamp);
    });

    it('should revert for wrong UUID version', async () => {
      const uuidMock = await UUIDMock.new();

      let error;
      try {
        await uuidMock.getTimestampInMsFromUuidV1(uuidToHexString(uuidv4()));
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/must be v1 uuid/i);
    });

    it('should revert for timestamp before Unix epoch', async () => {
      const uuidMock = await UUIDMock.new();

      const zeroTimeAndVersion1Mask = '0x0000000000001000';
      const uuid = uuidToHexString(uuidv1());
      const earliestUuid = `${zeroTimeAndVersion1Mask}${uuid.slice(
        zeroTimeAndVersion1Mask.length,
      )}`;

      let error;
      try {
        await uuidMock.getTimestampInMsFromUuidV1(earliestUuid);
      } catch (e) {
        error = e;
      }

      expect(error).to.not.be.undefined;
      expect(error.message).to.match(/subtraction overflow/i);
    });
  });
});
