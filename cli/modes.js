/**
 * modes.js
 *
 * The CLI mode enumeration and prompt construction. Cisco IOS is a modal
 * shell: the same word means different things depending on which mode you
 * are in, and the prompt suffix tells you where you are. `CliSession`
 * maintains a stack of these modes; this module names them and renders the
 * prompt string from the current mode + device hostname.
 */

/** @enum {string} */
export const Mode = Object.freeze({
  USER_EXEC: 'user-exec', // hostname>
  PRIVILEGED_EXEC: 'privileged-exec', // hostname#
  GLOBAL_CONFIG: 'global-config', // hostname(config)#
  INTERFACE_CONFIG: 'interface-config', // hostname(config-if)#
  VLAN_CONFIG: 'vlan-config', // hostname(config-vlan)#
  LINE_CONFIG: 'line-config', // hostname(config-line)#
  ROUTER_CONFIG: 'router-config', // hostname(config-router)#
});

/** Prompt suffix (inside the parentheses) for each configuration submode. */
const CONFIG_SUFFIX = Object.freeze({
  [Mode.GLOBAL_CONFIG]: 'config',
  [Mode.INTERFACE_CONFIG]: 'config-if',
  [Mode.VLAN_CONFIG]: 'config-vlan',
  [Mode.LINE_CONFIG]: 'config-line',
  [Mode.ROUTER_CONFIG]: 'config-router',
});

/**
 * @param {string} mode
 * @returns {boolean} true if the mode is any `(config...)` submode.
 */
export function isConfigMode(mode) {
  return mode in CONFIG_SUFFIX;
}

/**
 * Builds the prompt string for a given hostname and mode, e.g.
 * "Router(config-if)#".
 * @param {string} hostname
 * @param {string} mode
 * @returns {string}
 */
export function buildPrompt(hostname, mode) {
  if (mode === Mode.USER_EXEC) return `${hostname}>`;
  if (mode === Mode.PRIVILEGED_EXEC) return `${hostname}#`;
  const suffix = CONFIG_SUFFIX[mode];
  return suffix ? `${hostname}(${suffix})#` : `${hostname}#`;
}
