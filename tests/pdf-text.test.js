import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { extractTextFromContent } from '../trainer/pdfText.js';
import { parseQuestions } from '../trainer/parseQuestions.js';

describe('PDF content-stream text extraction', () => {
  test('extracts simple Tj literal strings', () => {
    const content = 'BT /F1 12 Tf 72 700 Td (Hello world) Tj ET';
    assert.equal(extractTextFromContent(content), 'Hello world');
  });

  test('joins TJ array fragments and inserts a gap on large kerning', () => {
    const content = 'BT [(Hola)-350(mundo)] TJ ET';
    assert.equal(extractTextFromContent(content), 'Hola mundo');
  });

  test('Td/T*/ET operators split lines', () => {
    const content = 'BT (Linea uno) Tj 0 -14 Td (Linea dos) Tj ET';
    assert.equal(extractTextFromContent(content), 'Linea uno\nLinea dos');
  });

  test('decodes escapes and octal codes in literal strings', () => {
    const content = 'BT (A\\(B\\) \\101\\102) Tj ET'; // \101=A \102=B
    assert.equal(extractTextFromContent(content), 'A(B) AB');
  });

  test('reads hex strings', () => {
    const content = 'BT <48656C6C6F> Tj ET'; // "Hello"
    assert.equal(extractTextFromContent(content), 'Hello');
  });
});

describe('parseQuestions accepts exam-style text (from a PDF)', () => {
  test('unprefixed numbered prompt + A. choices + Answer:', () => {
    const text = [
      '1. Which command assigns an IP address to an interface?',
      'A. ip address 10.0.0.1 255.255.255.0',
      'B. ip 10.0.0.1',
      'C. address 10.0.0.1',
      'Answer: A',
    ].join('\n');
    const { questions, errors } = parseQuestions(text);
    assert.equal(errors.length, 0, errors.join('; '));
    assert.equal(questions.length, 1);
    assert.equal(questions[0].prompt, 'Which command assigns an IP address to an interface?');
    assert.deepEqual(questions[0].correct, ['a']);
  });

  test('still supports the Q:/R: format', () => {
    const { questions, errors } = parseQuestions('Q: prueba\nA) uno\nB) dos\nR: B');
    assert.equal(errors.length, 0);
    assert.deepEqual(questions[0].correct, ['b']);
  });

  test('a multi-line unprefixed prompt is kept together', () => {
    const text = [
      'What is the result',
      'of this configuration?',
      'A. Works',
      'B. Fails',
      'Answer: A',
    ].join('\n');
    const { questions } = parseQuestions(text);
    assert.equal(questions[0].prompt, 'What is the result of this configuration?');
  });
});
