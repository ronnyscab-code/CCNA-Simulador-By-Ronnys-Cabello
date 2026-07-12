import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { Edge } from '../topology/Edge.js';

function makeNode(topology, deviceType = 'pc', overrides = {}) {
  return new Node({ id: topology.generateId(), deviceType, ...overrides });
}

describe('Topology nodes', () => {
  test('addNode stores the node and dispatches nodeAdded', () => {
    const topology = new Topology();
    const node = makeNode(topology, 'router');
    let eventNode = null;
    topology.addEventListener('nodeAdded', (e) => (eventNode = e.detail.node));

    topology.addNode(node);

    assert.equal(topology.getNode(node.id), node);
    assert.equal(topology.getNodes().length, 1);
    assert.equal(eventNode, node);
  });

  test('addNode rejects a duplicate id', () => {
    const topology = new Topology();
    const node = makeNode(topology);
    topology.addNode(node);
    assert.throws(() => topology.addNode(node));
  });

  test('updateNode merges changes and dispatches nodeUpdated', () => {
    const topology = new Topology();
    const node = makeNode(topology, 'pc', { x: 0, y: 0 });
    topology.addNode(node);

    let detail = null;
    topology.addEventListener('nodeUpdated', (e) => (detail = e.detail));
    topology.updateNode(node.id, { x: 50, y: 75 });

    assert.equal(node.x, 50);
    assert.equal(node.y, 75);
    assert.deepEqual(detail.changes, { x: 50, y: 75 });
  });

  test('removeNode cascades to incident edges', () => {
    const topology = new Topology();
    const a = makeNode(topology, 'router');
    const b = makeNode(topology, 'switch');
    topology.addNode(a);
    topology.addNode(b);
    const edge = new Edge({ id: topology.generateId(), sourceNodeId: a.id, targetNodeId: b.id });
    topology.addEdge(edge);

    const removedEdgeIds = [];
    topology.addEventListener('edgeRemoved', (e) => removedEdgeIds.push(e.detail.id));

    topology.removeNode(a.id);

    assert.equal(topology.getNode(a.id), undefined);
    assert.equal(topology.getEdge(edge.id), undefined);
    assert.deepEqual(removedEdgeIds, [edge.id]);
  });

  test('removeNode returns false for an unknown id', () => {
    const topology = new Topology();
    assert.equal(topology.removeNode('does-not-exist'), false);
  });
});

describe('Topology edges', () => {
  test('addEdge rejects edges referencing missing nodes', () => {
    const topology = new Topology();
    const a = makeNode(topology);
    topology.addNode(a);
    const edge = new Edge({ id: topology.generateId(), sourceNodeId: a.id, targetNodeId: 'ghost' });
    assert.throws(() => topology.addEdge(edge));
  });

  test('areConnected reflects direct cables', () => {
    const topology = new Topology();
    const a = makeNode(topology);
    const b = makeNode(topology);
    const c = makeNode(topology);
    topology.addNode(a);
    topology.addNode(b);
    topology.addNode(c);
    topology.addEdge(
      new Edge({ id: topology.generateId(), sourceNodeId: a.id, targetNodeId: b.id }),
    );

    assert.equal(topology.areConnected(a.id, b.id), true);
    assert.equal(topology.areConnected(a.id, c.id), false);
  });
});

describe('Topology serialization', () => {
  test('toJSON / loadFromJSON round-trips nodes and edges', () => {
    const topology = new Topology();
    const a = makeNode(topology, 'router', { x: 10, y: 20 });
    const b = makeNode(topology, 'pc', { x: 100, y: 200 });
    topology.addNode(a);
    topology.addNode(b);
    topology.addEdge(
      new Edge({ id: topology.generateId(), sourceNodeId: a.id, targetNodeId: b.id }),
    );

    const serialized = topology.toJSON();
    const restored = Topology.fromJSON(serialized);

    assert.equal(restored.getNodes().length, 2);
    assert.equal(restored.getEdges().length, 1);
    assert.deepEqual(restored.getNode(a.id).toJSON(), a.toJSON());
  });

  test('clear empties nodes and edges and dispatches cleared', () => {
    const topology = new Topology();
    const a = makeNode(topology);
    topology.addNode(a);

    let clearedFired = false;
    topology.addEventListener('cleared', () => (clearedFired = true));
    topology.clear();

    assert.equal(topology.getNodes().length, 0);
    assert.equal(clearedFired, true);
  });
});
