import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HistoryManager } from '../ui/HistoryManager.js';
import { Topology } from '../topology/Topology.js';
import { Node } from '../topology/Node.js';
import { AddNodeCommand, RenameNodeCommand } from '../topology/TopologyCommands.js';

describe('HistoryManager', () => {
  test('execute runs the command and enables undo', () => {
    const topology = new Topology();
    const history = new HistoryManager();
    const node = new Node({ id: topology.generateId(), deviceType: 'pc' });

    assert.equal(history.canUndo(), false);
    history.execute(new AddNodeCommand(topology, node));

    assert.equal(topology.getNode(node.id), node);
    assert.equal(history.canUndo(), true);
    assert.equal(history.canRedo(), false);
  });

  test('undo reverts and redo reapplies', () => {
    const topology = new Topology();
    const history = new HistoryManager();
    const node = new Node({ id: topology.generateId(), deviceType: 'router' });
    history.execute(new AddNodeCommand(topology, node));

    history.undo();
    assert.equal(topology.getNode(node.id), undefined);
    assert.equal(history.canRedo(), true);

    history.redo();
    assert.equal(topology.getNode(node.id), node);
    assert.equal(history.canRedo(), false);
  });

  test('a new execute() after undo clears the redo stack', () => {
    const topology = new Topology();
    const history = new HistoryManager();
    const nodeA = new Node({ id: topology.generateId(), deviceType: 'pc' });
    const nodeB = new Node({ id: topology.generateId(), deviceType: 'pc' });

    history.execute(new AddNodeCommand(topology, nodeA));
    history.undo();
    assert.equal(history.canRedo(), true);

    history.execute(new AddNodeCommand(topology, nodeB));
    assert.equal(history.canRedo(), false);
  });

  test('undo/redo compose across different command types', () => {
    const topology = new Topology();
    const history = new HistoryManager();
    const node = new Node({ id: topology.generateId(), deviceType: 'server', hostname: 'Server-1' });

    history.execute(new AddNodeCommand(topology, node));
    history.execute(new RenameNodeCommand(topology, node.id, 'Server-1', 'Core-Server'));
    assert.equal(topology.getNode(node.id).hostname, 'Core-Server');

    history.undo();
    assert.equal(topology.getNode(node.id).hostname, 'Server-1');

    history.undo();
    assert.equal(topology.getNode(node.id), undefined);

    history.redo();
    history.redo();
    assert.equal(topology.getNode(node.id).hostname, 'Core-Server');
  });

  test('undo on an empty stack is a no-op', () => {
    const history = new HistoryManager();
    assert.doesNotThrow(() => history.undo());
    assert.doesNotThrow(() => history.redo());
  });

  test('clear() empties both stacks', () => {
    const topology = new Topology();
    const history = new HistoryManager();
    history.execute(new AddNodeCommand(topology, new Node({ id: topology.generateId(), deviceType: 'pc' })));
    history.undo();

    history.clear();
    assert.equal(history.canUndo(), false);
    assert.equal(history.canRedo(), false);
  });
});
