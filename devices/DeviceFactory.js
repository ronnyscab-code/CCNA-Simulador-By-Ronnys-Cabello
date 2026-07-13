/**
 * DeviceFactory.js
 *
 * Single place that maps a device-type key to its concrete `Device`
 * subclass — for both fresh creation (`create`) and deserialization
 * (`fromJSON`). Everything else (the topology `Node`, the editor, the CLI)
 * goes through here instead of importing nine subclasses and switching on
 * the type itself. Adding a new device type means editing this one table.
 */

import { Router } from './Router.js';
import { Switch } from './Switch.js';
import { PC } from './PC.js';
import { Laptop } from './Laptop.js';
import { Server } from './Server.js';
import { Firewall } from './Firewall.js';
import { AccessPoint } from './AccessPoint.js';
import { Cloud } from './Cloud.js';
import { Printer } from './Printer.js';

/** @type {Record<string, typeof import('./Device.js').Device>} */
const REGISTRY = {
  router: Router,
  switch: Switch,
  pc: PC,
  laptop: Laptop,
  server: Server,
  firewall: Firewall,
  accesspoint: AccessPoint,
  cloud: Cloud,
  printer: Printer,
};

export class DeviceFactory {
  /**
   * @returns {string[]} the list of supported device-type keys.
   */
  static supportedTypes() {
    return Object.keys(REGISTRY);
  }

  /**
   * @param {string} type
   * @returns {boolean}
   */
  static isSupported(type) {
    return Object.prototype.hasOwnProperty.call(REGISTRY, type);
  }

  /**
   * Creates a fresh device of the given type with default interfaces.
   * @param {string} type
   * @param {string} hostname
   * @param {{rng?: () => number}} [options]
   * @returns {import('./Device.js').Device}
   */
  static create(type, hostname, { rng = Math.random } = {}) {
    const Ctor = REGISTRY[type];
    if (!Ctor) throw new Error(`Unknown device type: ${type}`);
    return new Ctor({ hostname, rng });
  }

  /**
   * Rehydrates a device from serialized data (`Device#toJSON`). Concrete
   * subclasses restore their own interfaces and type-specific fields; the
   * base-level bags (`config`, `startupConfig`) are restored here so every
   * subclass doesn't have to repeat that logic.
   * @param {object} data
   * @returns {import('./Device.js').Device}
   */
  static fromJSON(data) {
    const Ctor = REGISTRY[data.type];
    if (!Ctor) throw new Error(`Unknown device type: ${data.type}`);
    const device = Ctor.fromJSON(data);
    if (data.config) device.config = data.config;
    if (data.startupConfig !== undefined) device.startupConfig = data.startupConfig;
    return device;
  }
}
