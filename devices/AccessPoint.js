/**
 * AccessPoint.js
 *
 * A wireless bridge: one wired uplink (GigabitEthernet0) into the switched
 * infrastructure and a wireless side identified by an SSID. It bridges,
 * rather than routes, between the two, so it carries no IP for forwarding
 * (a management IP can still be set on the uplink).
 */

import { Device } from './Device.js';
import { NetworkInterface } from './NetworkInterface.js';

export class AccessPoint extends Device {
  /**
   * @param {object} params
   * @param {string} params.hostname
   * @param {NetworkInterface[]} [params.interfaces]
   * @param {string} [params.ssid]
   * @param {() => number} [params.rng]
   */
  constructor({ hostname, interfaces, ssid = 'OpenCCNA-WiFi', rng = Math.random }) {
    super({
      hostname,
      type: 'accesspoint',
      capabilities: { switching: true, wireless: true },
      interfaces: interfaces ?? [
        new NetworkInterface({
          name: 'GigabitEthernet0',
          switchportMode: 'access',
          accessVlan: 1,
          rng,
        }),
        new NetworkInterface({ name: 'WLAN0', switchportMode: 'access', accessVlan: 1, rng }),
      ],
    });
    this.ssid = ssid;
  }

  toJSON() {
    return { ...super.toJSON(), ssid: this.ssid };
  }

  /**
   * @param {object} data
   * @returns {AccessPoint}
   */
  static fromJSON(data) {
    return new AccessPoint({
      hostname: data.hostname,
      ssid: data.ssid ?? 'OpenCCNA-WiFi',
      interfaces: Device.hydrateInterfaces(data.interfaces),
    });
  }
}
