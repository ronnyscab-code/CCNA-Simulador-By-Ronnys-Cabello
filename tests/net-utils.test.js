import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateMacAddress,
  isValidMacAddress,
  normalizeMacAddress,
  isValidIpv4,
  ipv4ToInt,
  intToIpv4,
  isValidSubnetMask,
  maskToPrefix,
  prefixToMask,
  networkAddress,
  broadcastAddress,
  sameSubnet,
} from '../devices/net-utils.js';

describe('MAC addresses', () => {
  test('generated MAC is valid, unicast, and locally administered', () => {
    for (let i = 0; i < 100; i += 1) {
      const mac = generateMacAddress();
      assert.ok(isValidMacAddress(mac), `invalid: ${mac}`);
      const firstOctet = parseInt(mac.slice(0, 2), 16);
      assert.equal(firstOctet & 0x01, 0, 'should be unicast');
      assert.equal(firstOctet & 0x02, 0x02, 'should be locally administered');
    }
  });

  test('generateMacAddress is deterministic under an injected RNG', () => {
    const rng = () => 0.5;
    assert.equal(generateMacAddress(rng), generateMacAddress(rng));
  });

  test('isValidMacAddress accepts colon and hyphen forms, rejects junk', () => {
    assert.ok(isValidMacAddress('02:1a:2b:3c:4d:5e'));
    assert.ok(isValidMacAddress('02-1A-2B-3C-4D-5E'));
    assert.ok(!isValidMacAddress('02:1a:2b:3c:4d'));
    assert.ok(!isValidMacAddress('zz:1a:2b:3c:4d:5e'));
  });

  test('normalizeMacAddress lowercases and uses colons', () => {
    assert.equal(normalizeMacAddress('02-1A-2B-3C-4D-5E'), '02:1a:2b:3c:4d:5e');
  });
});

describe('IPv4 validation and conversion', () => {
  test('isValidIpv4 accepts valid and rejects invalid', () => {
    assert.ok(isValidIpv4('0.0.0.0'));
    assert.ok(isValidIpv4('255.255.255.255'));
    assert.ok(isValidIpv4('192.168.1.10'));
    assert.ok(!isValidIpv4('256.1.1.1'));
    assert.ok(!isValidIpv4('192.168.1'));
    assert.ok(!isValidIpv4('192.168.1.1.1'));
    assert.ok(!isValidIpv4('a.b.c.d'));
  });

  test('ipv4ToInt / intToIpv4 round-trip', () => {
    const addresses = ['0.0.0.0', '192.168.1.1', '10.0.0.1', '255.255.255.255'];
    for (const ip of addresses) {
      assert.equal(intToIpv4(ipv4ToInt(ip)), ip);
    }
  });

  test('ipv4ToInt produces the expected integer', () => {
    assert.equal(ipv4ToInt('0.0.0.1'), 1);
    assert.equal(ipv4ToInt('255.255.255.255'), 4294967295);
    assert.equal(ipv4ToInt('192.168.1.1'), 3232235777);
  });
});

describe('Subnet masks', () => {
  test('isValidSubnetMask accepts contiguous masks only', () => {
    assert.ok(isValidSubnetMask('255.255.255.0'));
    assert.ok(isValidSubnetMask('255.255.255.255'));
    assert.ok(isValidSubnetMask('0.0.0.0'));
    assert.ok(isValidSubnetMask('255.255.254.0'));
    assert.ok(!isValidSubnetMask('255.0.255.0'));
    assert.ok(!isValidSubnetMask('255.255.255.1'));
  });

  test('maskToPrefix and prefixToMask are inverses', () => {
    const cases = [
      ['0.0.0.0', 0],
      ['128.0.0.0', 1],
      ['255.0.0.0', 8],
      ['255.255.0.0', 16],
      ['255.255.255.0', 24],
      ['255.255.255.252', 30],
      ['255.255.255.255', 32],
    ];
    for (const [mask, prefix] of cases) {
      assert.equal(maskToPrefix(mask), prefix, `maskToPrefix(${mask})`);
      assert.equal(prefixToMask(prefix), mask, `prefixToMask(${prefix})`);
    }
  });

  test('prefixToMask rejects out-of-range prefixes', () => {
    assert.throws(() => prefixToMask(-1));
    assert.throws(() => prefixToMask(33));
  });
});

describe('Subnet math', () => {
  test('networkAddress masks off host bits', () => {
    assert.equal(networkAddress('192.168.1.130', '255.255.255.0'), '192.168.1.0');
    assert.equal(networkAddress('10.20.30.40', '255.0.0.0'), '10.0.0.0');
    assert.equal(networkAddress('192.168.1.130', '255.255.255.192'), '192.168.1.128');
  });

  test('broadcastAddress sets host bits', () => {
    assert.equal(broadcastAddress('192.168.1.10', '255.255.255.0'), '192.168.1.255');
    assert.equal(broadcastAddress('192.168.1.130', '255.255.255.192'), '192.168.1.191');
  });

  test('sameSubnet distinguishes local from remote', () => {
    assert.ok(sameSubnet('192.168.1.10', '192.168.1.20', '255.255.255.0'));
    assert.ok(!sameSubnet('192.168.1.10', '192.168.2.20', '255.255.255.0'));
    assert.ok(!sameSubnet('192.168.1.10', '192.168.1.130', '255.255.255.192'));
  });
});
