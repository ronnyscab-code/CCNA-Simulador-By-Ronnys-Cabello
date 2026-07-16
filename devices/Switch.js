/**
 * Switch.js
 *
 * A layer-2 device. Ships with FastEthernet access ports plus two Gigabit
 * uplinks. All ports are switched (mode "access", VLAN 1) and — like real
 * Catalyst switches — administratively up by default.
 */

import { Device } from './Device.js';
import { buildModelInterfaces, defaultModelId } from './models.js';

export class Switch extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {string} [params.model] - Hardware-model id (e.g. "2960-48TT");
   *   defaults to the 24-port Catalyst layout.
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, model, rng = Math.random }) {
    const modelId = model ?? defaultModelId('switch');
    super({
      hostname,
      type: 'switch',
      model: modelId,
      capabilities: { switching: true },
      interfaces: interfaces ?? buildModelInterfaces('switch', modelId, rng),
    });
  }

  /**
   * @param {object} data
   * @returns {Switch}
   */
  static fromJSON(data) {
    return new Switch({
      hostname: data.hostname,
      model: data.model ?? undefined,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
