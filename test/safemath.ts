// Adapted from https://github.com/OpenZeppelin/openzeppelin-contracts/blob/5f92adc2e76fe92d7ab952710ff3fb6d76066a35/test/math/SafeMath.test.js
//
import chai from 'chai';

import { SafeMath64MockInstance } from '../types/truffle-contracts';

/* eslint-disable-next-line @typescript-eslint/no-var-requires */
const { BN, expectRevert } = require('@openzeppelin/test-helpers');

const MAX_UINT64 = new BN('2').pow(new BN('64')).sub(new BN('1'));

describe('SafeMath64', () => {
  const SafeMathMock = artifacts.require('SafeMath64Mock');
  let safeMath: SafeMath64MockInstance;

  beforeEach(async () => {
    safeMath = await SafeMathMock.new();
  });

  async function testCommutative(
    fn: any,
    lhs: BN,
    rhs: BN,
    expected: BN,
  ): Promise<void> {
    expect((await fn(lhs, rhs)).toString()).to.equal(expected.toString());
    expect((await fn(rhs, lhs)).toString()).to.equal(expected.toString());
  }

  async function testFailsCommutative(
    fn: any,
    lhs: BN,
    rhs: BN,
    reason: string,
  ): Promise<void> {
    await expectRevert(fn(lhs, rhs), reason);
    await expectRevert(fn(rhs, lhs), reason);
  }

  describe('add', () => {
    it('adds correctly', async () => {
      const a = new BN('5678');
      const b = new BN('1234');

      await testCommutative(safeMath.add, a, b, a.add(b));
    });

    it('reverts on addition overflow', async () => {
      const a = MAX_UINT64;
      const b = new BN('1');

      await testFailsCommutative(
        safeMath.add,
        a,
        b,
        'SafeMath: addition overflow',
      );
    });
  });

  describe('sub', () => {
    it('subtracts correctly', async () => {
      const a = new BN('5678');
      const b = new BN('1234');

      expect((await safeMath.sub(a, b)).toString()).to.equal(
        a.sub(b).toString(),
      );
    });

    it('reverts if subtraction result would be negative', async () => {
      const a = new BN('1234');
      const b = new BN('5678');

      await expectRevert(safeMath.sub(a, b), 'SafeMath: subtraction overflow');
    });
  });

  describe('mul', () => {
    it('multiplies correctly', async () => {
      const a = new BN('1234');
      const b = new BN('5678');

      await testCommutative(safeMath.mul, a, b, a.mul(b));
    });

    it('multiplies by zero correctly', async () => {
      const a = new BN('0');
      const b = new BN('5678');

      await testCommutative(safeMath.mul, a, b, new BN('0'));
    });

    it('reverts on multiplication overflow', async () => {
      const a = MAX_UINT64;
      const b = new BN('2');

      await testFailsCommutative(
        safeMath.mul,
        a,
        b,
        'SafeMath: multiplication overflow',
      );
    });
  });

  describe('div', () => {
    it('divides correctly', async () => {
      const a = new BN('5678');
      const b = new BN('5678');

      expect((await safeMath.div(a, b)).toString()).to.equal(
        a.div(b).toString(),
      );
    });

    it('divides zero correctly', async () => {
      const a = new BN('0');
      const b = new BN('5678');

      expect((await safeMath.div(a, b)).toString()).to.equal('0');
    });

    it('returns complete number result on non-even division', async () => {
      const a = new BN('7000');
      const b = new BN('5678');

      expect((await safeMath.div(a, b)).toString()).to.equal('1');
    });

    it('reverts on division by zero', async () => {
      const a = new BN('5678');
      const b = new BN('0');

      await expectRevert(safeMath.div(a, b), 'SafeMath: division by zero');
    });
  });
});
