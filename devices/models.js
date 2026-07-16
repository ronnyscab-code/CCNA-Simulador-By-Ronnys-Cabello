/**
 * models.js
 *
 * Catalog of selectable Cisco hardware models for the routable/switchable
 * device types. A "model" is purely a named interface layout (port count,
 * naming scheme) plus a human label — it does NOT change what the device can
 * do (a switch still switches, a router still routes). This lets a learner
 * pick, say, a Catalyst 2960-48 (48 FastEthernet ports) or an ISR 4331
 * (three-level GigabitEthernet0/0/0 naming) and see the matching ports.
 *
 * DOM-free. The catalog is plain data; `buildModelInterfaces` turns a model's
 * port descriptors into real `NetworkInterface`s at device-creation time.
 *
 * The FIRST model of each type reproduces the historical default layout, and
 * `DEFAULT_MODEL` points at it, so devices created without an explicit model
 * (and topologies saved before models existed) keep their exact interfaces.
 */

import { NetworkInterface } from './NetworkInterface.js';

/**
 * Expands a contiguous range of ports sharing a prefix into descriptors.
 * @param {string} prefix - e.g. "FastEthernet0/".
 * @param {number} from - first index (inclusive).
 * @param {number} to - last index (inclusive).
 * @param {'switch'|'routed'} role
 * @returns {{name: string, role: string}[]}
 */
function ports(prefix, from, to, role) {
  const list = [];
  for (let i = from; i <= to; i += 1) list.push({ name: `${prefix}${i}`, role });
  return list;
}

/** @type {Record<string, {id: string, label: string, descriptors: {name: string, role: string}[]}[]>} */
export const DEVICE_MODELS = {
  switch: [
    {
      id: '2960-24TT',
      label: 'Catalyst 2960-24TT-L',
      descriptors: [
        ...ports('FastEthernet0/', 1, 24, 'switch'),
        ...ports('GigabitEthernet0/', 1, 2, 'switch'),
      ],
    },
    {
      id: '2960-48TT',
      label: 'Catalyst 2960-48TT-L',
      descriptors: [
        ...ports('FastEthernet0/', 1, 48, 'switch'),
        ...ports('GigabitEthernet0/', 1, 2, 'switch'),
      ],
    },
    {
      id: '3560-24PS',
      label: 'Catalyst 3560-24PS',
      descriptors: [
        ...ports('FastEthernet0/', 1, 24, 'switch'),
        ...ports('GigabitEthernet0/', 1, 2, 'switch'),
      ],
    },
    {
      id: '3650-24PS',
      label: 'Catalyst 3650-24PS',
      descriptors: [
        ...ports('GigabitEthernet1/0/', 1, 24, 'switch'),
        ...ports('GigabitEthernet1/1/', 1, 4, 'switch'),
      ],
    },
  ],
  router: [
    {
      id: '2901',
      label: 'ISR 2901',
      descriptors: [
        ...ports('GigabitEthernet0/', 0, 1, 'routed'),
        { name: 'Serial0/0/0', role: 'routed' },
        { name: 'Serial0/0/1', role: 'routed' },
      ],
    },
    {
      id: '1941',
      label: 'ISR 1941',
      descriptors: [
        ...ports('GigabitEthernet0/', 0, 1, 'routed'),
        { name: 'Serial0/0/0', role: 'routed' },
        { name: 'Serial0/0/1', role: 'routed' },
      ],
    },
    {
      id: '2911',
      label: 'ISR 2911',
      descriptors: [
        ...ports('GigabitEthernet0/', 0, 2, 'routed'),
        { name: 'Serial0/0/0', role: 'routed' },
        { name: 'Serial0/0/1', role: 'routed' },
      ],
    },
    {
      id: '4331',
      label: 'ISR 4331',
      descriptors: [
        ...ports('GigabitEthernet0/0/', 0, 2, 'routed'),
        { name: 'Serial0/1/0', role: 'routed' },
        { name: 'Serial0/1/1', role: 'routed' },
      ],
    },
  ],
};

/** The model used when none is specified — matches each type's legacy layout. */
export const DEFAULT_MODEL = {
  switch: '2960-24TT',
  router: '2901',
};

/**
 * @param {string} type - Device-type key ("router", "switch", ...).
 * @returns {{id: string, label: string, descriptors: object[]}[]} the models
 *   available for that type (empty if the type has no model choices).
 */
export function modelsForType(type) {
  return DEVICE_MODELS[type] ?? [];
}

/**
 * @param {string} type
 * @returns {string|null} the default model id for a type, or null.
 */
export function defaultModelId(type) {
  return DEFAULT_MODEL[type] ?? null;
}

/**
 * @param {string} type
 * @param {string} id
 * @returns {{id: string, label: string, descriptors: object[]}|null}
 */
export function getModel(type, id) {
  return modelsForType(type).find((m) => m.id === id) ?? null;
}

/**
 * @param {string} type
 * @param {string} id
 * @returns {string} a display label ("Catalyst 2960-24TT-L"), falling back to
 *   the raw id, or an empty string if the type has no models.
 */
export function modelLabel(type, id) {
  const model = getModel(type, id);
  if (model) return model.label;
  return id ?? '';
}

/**
 * Builds the `NetworkInterface` list for a model. Falls back to the type's
 * default model if the id is unknown. Returns null if the type has no models
 * at all (the caller then keeps its own default interface layout).
 * @param {string} type
 * @param {string} id
 * @param {() => number} [rng]
 * @returns {NetworkInterface[]|null}
 */
export function buildModelInterfaces(type, id, rng = Math.random) {
  const model = getModel(type, id) ?? getModel(type, defaultModelId(type));
  if (!model) return null;
  return model.descriptors.map((d) =>
    d.role === 'switch'
      ? new NetworkInterface({ name: d.name, switchportMode: 'access', accessVlan: 1, rng })
      : new NetworkInterface({ name: d.name, enabled: false, rng }),
  );
}
