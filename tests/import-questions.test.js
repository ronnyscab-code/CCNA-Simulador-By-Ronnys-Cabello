import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseQuestions } from '../trainer/parseQuestions.js';
import { TrainerStore } from '../trainer/TrainerStore.js';
import { TrainerEngine } from '../trainer/TrainerEngine.js';

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
}

describe('parseQuestions — text format', () => {
  test('parses a two-question block with single and multiple answers', () => {
    const text = [
      'Q: ¿Qué comando asigna una IP?',
      'A) ip address 10.0.0.1 255.255.255.0',
      'B) ip 10.0.0.1',
      'R: A',
      'E: sintaxis IOS',
      '---',
      'Q: ¿Cuáles son direcciones privadas?',
      'A) 10.0.0.1',
      'B) 8.8.8.8',
      'C) 192.168.1.1',
      'R: A,C',
    ].join('\n');
    const { questions, errors } = parseQuestions(text);
    assert.equal(errors.length, 0, errors.join('; '));
    assert.equal(questions.length, 2);
    assert.deepEqual(questions[0].correct, ['a']);
    assert.equal(questions[0].explanation, 'sintaxis IOS');
    assert.equal(questions[1].multi, true);
    assert.deepEqual(questions[1].correct.sort(), ['a', 'c']);
  });

  test('reports blocks that are missing pieces', () => {
    const { questions, errors } = parseQuestions('Q: sin opciones\nR: A');
    assert.equal(questions.length, 0);
    assert.ok(errors.length >= 1);
  });
});

describe('parseQuestions — JSON format', () => {
  test('accepts an array of objects with string choices', () => {
    const json = JSON.stringify([
      {
        prompt: '¿Máscara de un /30?',
        choices: ['255.255.255.252', '255.255.255.0'],
        correct: 'a',
        explanation: '2 bits de host',
      },
    ]);
    const { questions, errors } = parseQuestions(json);
    assert.equal(errors.length, 0);
    assert.equal(questions.length, 1);
    assert.equal(questions[0].choices.length, 2);
    assert.deepEqual(questions[0].correct, ['a']);
    assert.equal(questions[0].imported, true);
  });

  test('rejects malformed JSON with a clear error', () => {
    const { questions, errors } = parseQuestions('[{bad json');
    assert.equal(questions.length, 0);
    assert.match(errors[0], /JSON/);
  });
});

describe('imported questions integrate with the store and engine', () => {
  test('stored imports are merged into the trainer pool and persist', () => {
    const store = new TrainerStore(memoryStorage());
    const { questions } = parseQuestions('Q: test\nA) uno\nB) dos\nR: B');
    store.addImportedQuestions(questions);
    assert.equal(store.getImportedQuestions().length, 1);

    const engine = new TrainerEngine({ store, questions });
    const exam = engine.buildExam({ count: 1 });
    assert.equal(exam.length, 1);
    assert.equal(exam[0].imported, true);

    store.clearImportedQuestions();
    assert.equal(store.getImportedQuestions().length, 0);
  });
});
