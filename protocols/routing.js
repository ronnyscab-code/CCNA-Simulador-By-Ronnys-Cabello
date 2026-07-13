/**
 * routing.js
 *
 * The IPv4 forwarding decision: given a device and a destination IP, which
 * interface does the packet leave through, and what is the next-hop IP on
 * that link? This is the longest-prefix-match logic every router (and, via a
 * default route, every host) runs on each packet.
 *
 * Route sources considered:
 *   - connected  — every enabled interface with an IP owns its subnet;
 *   - static     — `ip route <prefix> <mask> <next-hop>` entries;
 *   - default    — an endpoint's `default gateway`, modeled as 0.0.0.0/0.
 *
 * OSPF-learned routes join this table in v0.8. DOM-free.
 */

import { networkAddress, maskToPrefix, sameSubnet } from '../devices/net-utils.js';

export const RouteType = Object.freeze({
  CONNECTED: 'connected',
  STATIC: 'static',
  DEFAULT: 'default',
});

/**
 * Builds the list of routes a device knows, each normalized to
 * { network, prefix, mask, type, nextHop|null, iface|null }.
 * @param {import('../devices/Device.js').Device} device
 * @returns {Array<object>}
 */
export function buildRoutes(device) {
  const routes = [];

  for (const iface of device.interfaces) {
    if (iface.enabled && iface.ipAddress && iface.subnetMask) {
      routes.push({
        network: networkAddress(iface.ipAddress, iface.subnetMask),
        prefix: maskToPrefix(iface.subnetMask),
        mask: iface.subnetMask,
        type: RouteType.CONNECTED,
        nextHop: null,
        iface,
      });
    }
  }

  for (const route of device.config?.staticRoutes ?? []) {
    routes.push({
      network: networkAddress(route.prefix, route.mask),
      prefix: maskToPrefix(route.mask),
      mask: route.mask,
      type: RouteType.STATIC,
      nextHop: route.nextHop,
      iface: null,
    });
  }

  if (device.capabilities?.endpoint && device.defaultGateway) {
    routes.push({
      network: '0.0.0.0',
      prefix: 0,
      mask: '0.0.0.0',
      type: RouteType.DEFAULT,
      nextHop: device.defaultGateway,
      iface: null,
    });
  }

  return routes;
}

/**
 * Resolves the forwarding decision for `dstIp` on `device` using
 * longest-prefix match. For non-connected routes, the next hop must itself
 * fall in one of the device's connected subnets so we can pick an egress
 * interface — otherwise the route is unusable.
 * @param {import('../devices/Device.js').Device} device
 * @param {string} dstIp
 * @returns {{type: string, egressIface: object, nextHopIp: string}|null}
 */
export function routeLookup(device, dstIp) {
  const routes = buildRoutes(device);

  const matches = routes
    .filter((route) => networkAddress(dstIp, route.mask) === route.network)
    .sort((a, b) => b.prefix - a.prefix);

  for (const route of matches) {
    if (route.type === RouteType.CONNECTED) {
      return { type: route.type, egressIface: route.iface, nextHopIp: dstIp };
    }
    // Static/default: the next hop must be reachable over a connected subnet.
    const egressIface = connectedInterfaceFor(device, route.nextHop);
    if (egressIface) {
      return { type: route.type, egressIface, nextHopIp: route.nextHop };
    }
  }

  return null;
}

/**
 * The enabled interface whose connected subnet contains `ip`, or null.
 * @param {import('../devices/Device.js').Device} device
 * @param {string} ip
 * @returns {object|null}
 */
export function connectedInterfaceFor(device, ip) {
  return (
    device.interfaces.find(
      (iface) =>
        iface.enabled &&
        iface.ipAddress &&
        iface.subnetMask &&
        sameSubnet(iface.ipAddress, ip, iface.subnetMask),
    ) ?? null
  );
}
