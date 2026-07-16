/**
 * Router.js
 *
 * A layer-3 device. Ships with routed GigabitEthernet ports plus a couple
 * of Serial WAN interfaces, all administratively shut down by default just
 * like real IOS (the learner must `no shutdown` them).
 */

import { Device } from './Device.js';
import { buildModelInterfaces, defaultModelId } from './models.js';

export class Router extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {string} [params.model] - Hardware-model id (e.g. "2911");
   *   defaults to the ISR 2901 layout (2x GigabitEthernet + 2x Serial).
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, model, rng = Math.random }) {
    const modelId = model ?? defaultModelId('router');
    super({
      hostname,
      type: 'router',
      model: modelId,
      capabilities: { routing: true },
      interfaces: interfaces ?? buildModelInterfaces('router', modelId, rng),
    });
  }

  /**
   * @param {object} data
   * @returns {Router}
   */
  static fromJSON(data) {
    return new Router({
      hostname: data.hostname,
      model: data.model ?? undefined,
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
