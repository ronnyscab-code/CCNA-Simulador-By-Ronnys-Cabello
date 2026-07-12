/**
 * DeviceIcons.js
 *
 * Maps a device type key (used throughout `topology/`, the palette, and
 * persisted JSON) to its display metadata: icon asset path and label. All
 * icons are original SVG artwork under `assets/icons/` — no Cisco assets.
 *
 * This is the single place that needs updating when a new device type is
 * introduced, so `CanvasRenderer` and `Toolbar` never hard-code the list
 * themselves.
 */

export const DEVICE_TYPES = Object.freeze({
  router: { label: 'Router', icon: 'assets/icons/router.svg' },
  switch: { label: 'Switch', icon: 'assets/icons/switch.svg' },
  pc: { label: 'PC', icon: 'assets/icons/pc.svg' },
  laptop: { label: 'Laptop', icon: 'assets/icons/laptop.svg' },
  server: { label: 'Server', icon: 'assets/icons/server.svg' },
  firewall: { label: 'Firewall', icon: 'assets/icons/firewall.svg' },
  accesspoint: { label: 'Access Point', icon: 'assets/icons/accesspoint.svg' },
  cloud: { label: 'Cloud', icon: 'assets/icons/cloud.svg' },
  printer: { label: 'Printer', icon: 'assets/icons/printer.svg' },
});

/**
 * @param {string} deviceType
 * @returns {{label: string, icon: string}}
 */
export function getDeviceMeta(deviceType) {
  return DEVICE_TYPES[deviceType] ?? { label: deviceType, icon: 'assets/icons/pc.svg' };
}
