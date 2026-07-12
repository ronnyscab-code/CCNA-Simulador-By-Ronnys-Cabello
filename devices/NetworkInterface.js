/**
 * NetworkInterface.js
 *
 * One physical/logical port on a device. Holds everything the CLI (v0.3)
 * and packet engine (v0.4+) need: an IOS-style name, a burned-in MAC, an
 * optional IPv4 address/mask, administrative state (`shutdown` /
 * `no shutdown`), and switchport settings (access/trunk, VLANs).
 *
 * Link state (whether the other end is up) is *derived* from the topology
 * at simulation time and is intentionally NOT stored here — an interface
 * only knows its own configuration, never the cable it is attached to.
 */

import { generateMacAddress, isValidIpv4, isValidSubnetMask } from './net-utils.js';

export class NetworkInterface {
  /**
   * @param {object} params
   * @param {string} params.name - IOS-style name, e.g. "GigabitEthernet0/0".
   * @param {string} [params.mac] - Burned-in MAC; generated if omitted.
   * @param {string|null} [params.ipAddress]
   * @param {string|null} [params.subnetMask]
   * @param {boolean} [params.enabled] - false = administratively shut down.
   * @param {string} [params.description]
   * @param {'routed'|'access'|'trunk'} [params.switchportMode] - Layer-2
   *   role; "routed" means the port is doing L3 (router / SVI-less).
   * @param {number} [params.accessVlan]
   * @param {number[]} [params.trunkAllowedVlans]
   * @param {() => number} [params.rng] - Injectable RNG for MAC generation.
   */
  constructor({
    name,
    mac = null,
    ipAddress = null,
    subnetMask = null,
    enabled = true,
    description = '',
    switchportMode = 'routed',
    accessVlan = 1,
    trunkAllowedVlans = null,
    rng = Math.random,
  }) {
    if (!name) throw new Error('NetworkInterface requires a name');

    this.name = name;
    this.mac = mac ?? generateMacAddress(rng);
    this.ipAddress = ipAddress;
    this.subnetMask = subnetMask;
    this.enabled = enabled;
    this.description = description;
    this.switchportMode = switchportMode;
    this.accessVlan = accessVlan;
    this.trunkAllowedVlans = trunkAllowedVlans;
  }

  /**
   * Assigns an IPv4 address + mask, validating both.
   * @param {string} ipAddress
   * @param {string} subnetMask
   */
  setIp(ipAddress, subnetMask) {
    if (!isValidIpv4(ipAddress)) throw new Error(`Invalid IPv4 address: ${ipAddress}`);
    if (!isValidSubnetMask(subnetMask)) throw new Error(`Invalid subnet mask: ${subnetMask}`);
    this.ipAddress = ipAddress;
    this.subnetMask = subnetMask;
  }

  clearIp() {
    this.ipAddress = null;
    this.subnetMask = null;
  }

  /**
   * @returns {boolean} true if the port is administratively up AND has a
   *   usable L3 address. Physical link state is layered on later by the
   *   simulation engine.
   */
  hasIpConfigured() {
    return Boolean(this.ipAddress && this.subnetMask);
  }

  /**
   * @returns {object}
   */
  toJSON() {
    return {
      name: this.name,
      mac: this.mac,
      ipAddress: this.ipAddress,
      subnetMask: this.subnetMask,
      enabled: this.enabled,
      description: this.description,
      switchportMode: this.switchportMode,
      accessVlan: this.accessVlan,
      trunkAllowedVlans: this.trunkAllowedVlans,
    };
  }

  /**
   * @param {object} data
   * @returns {NetworkInterface}
   */
  static fromJSON(data) {
    return new NetworkInterface({ ...data });
  }
}
