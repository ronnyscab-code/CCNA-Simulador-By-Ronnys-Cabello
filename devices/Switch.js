/**
 * Switch.js
 *
 * A layer-2 device. Ships with FastEthernet access ports plus two Gigabit
 * uplinks. All ports are switched (mode "access", VLAN 1) and — like real
 * Catalyst switches — administratively up by default.
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

const ACCESS_PORT_COUNT = 24;

export class Switch extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, rng = Math.random }) {
    super({
      hostname,
      type: 'switch',
      capabilities: { switching: true },
      interfaces: interfaces ?? Switch.defaultInterfaces(rng),
    });
  }

  /**
   * @param {() => number} rng
   * @returns {NetworkInterface[]}
   */
  static defaultInterfaces(rng) {
    const ports = [];
    for (let i = 1; i <= ACCESS_PORT_COUNT; i += 1) {
      ports.push(
        new NetworkInterface({
          name: `FastEthernet0/${i}`,
          switchportMode: 'access',
          accessVlan: 1,
          rng,
        }),
      );
    }
    ports.push(
      new NetworkInterface({
        name: 'GigabitEthernet0/1',
        switchportMode: 'access',
        accessVlan: 1,
        rng,
      }),
      new NetworkInterface({
        name: 'GigabitEthernet0/2',
        switchportMode: 'access',
        accessVlan: 1,
        rng,
      }),
    );
    return ports;
  }

  /**
   * @param {object} data
   * @returns {Switch}
   */
  static fromJSON(data) {
    return new Switch({
      hostname: data.hostname,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
