/**
 * parseQuestions.js
 *
 * Parses user-supplied question banks into the Trainer's question schema, so
 * a learner can import THEIR OWN study material privately (it is stored only
 * in their browser, never published). Two input formats are accepted:
 *
 *   1. JSON — an array of question objects (or `{ questions: [...] }`).
 *   2. A forgiving plain-text format, one question per block:
 *
 *        Q: ¿Qué comando asigna una IP a una interfaz?
 *        A) ip address 10.0.0.1 255.255.255.0
 *        B) ip 10.0.0.1
 *        C) address 10.0.0.1
 *        R: A
 *        E: (explicación opcional)
 *        ---
 *
 *      Blocks are separated by a line of `---` or a blank line. `R:` (or
 *      `Respuesta:`) accepts one or several letters (`R: A,C`). `E:` is an
 *      optional explanation.
 *
 * DOM-free. Returns `{ questions, errors }`.
 */

const DEFAULT_DOMAIN = 'Importadas';

/**
 * @param {string} text - JSON or plain-text question bank.
 * @returns {{questions: object[], errors: string[]}}
 */
export function parseQuestions(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { questions: [], errors: ['El texto está vacío.'] };

  // JSON path.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJson(trimmed);
  }
  return parseText(trimmed);
}

/**
 * @param {string} raw
 * @returns {{questions: object[], errors: string[]}}
 */
function parseJson(raw) {
  const errors = [];
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { questions: [], errors: [`JSON inválido: ${e.message}`] };
  }
  const list = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : null;
  if (!list) return { questions: [], errors: ['El JSON debe ser un array de preguntas.'] };

  const questions = [];
  list.forEach((item, i) => {
    const q = normalize(item, i);
    if (q.error) errors.push(q.error);
    else questions.push(q.question);
  });
  return { questions, errors };
}

/**
 * @param {object} item
 * @param {number} index
 * @returns {{question: object}|{error: string}}
 */
function normalize(item, index) {
  const prompt = item.prompt ?? item.question ?? item.q;
  if (!prompt) return { error: `Pregunta ${index + 1}: falta el enunciado.` };

  // choices may be [{id,text}] or ["a","b",...]
  let choices = [];
  if (Array.isArray(item.choices)) {
    choices = item.choices.map((c, j) =>
      typeof c === 'string' ? { id: letter(j), text: c } : { id: c.id ?? letter(j), text: c.text },
    );
  }
  if (choices.length < 2) return { error: `Pregunta ${index + 1}: necesita al menos 2 opciones.` };

  const correct = normalizeCorrect(item.correct ?? item.answer ?? item.r, choices);
  if (correct.length === 0) {
    return { error: `Pregunta ${index + 1}: respuesta correcta no válida.` };
  }

  return {
    question: {
      id: `imp-${index}-${slug(prompt)}`,
      domain: item.domain ?? DEFAULT_DOMAIN,
      difficulty: item.difficulty ?? 'Beginner',
      prompt,
      choices,
      correct,
      multi: correct.length > 1,
      explanation: item.explanation ?? item.e ?? '',
      reference: item.reference ?? 'Importada',
      imported: true,
    },
  };
}

/**
 * @param {*} value
 * @param {{id: string}[]} choices
 * @returns {string[]}
 */
function normalizeCorrect(value, choices) {
  const ids = new Set(choices.map((c) => c.id));
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,\s]+/);
  const out = [];
  for (const token of raw) {
    const t = String(token).trim().toLowerCase();
    if (ids.has(t)) out.push(t);
  }
  return out;
}

/**
 * @param {string} raw
 * @returns {{questions: object[], errors: string[]}}
 */
function parseText(raw) {
  const errors = [];
  const questions = [];
  const blocks = raw
    .split(/\n\s*---+\s*\n|\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map((l) => l.trim());
    let prompt = null;
    const choices = [];
    let correct = null;
    let explanation = '';

    for (const line of lines) {
      if (!line) continue;
      const qm = line.match(/^(?:Q|P|Pregunta)\s*[:.\-)]\s*(.+)/i);
      const cm = line.match(/^([A-Ha-h])\s*[).:-]\s*(.+)/);
      const rm = line.match(/^(?:R|Respuesta|Answer|Correct(?:\s+answer)?)\s*[:.\-)]\s*(.+)/i);
      const em = line.match(/^(?:E|Explicaci[oó]n|Explanation)\s*[:.\-)]\s*(.+)/i);
      if (qm) prompt = qm[1].trim();
      else if (rm) correct = rm[1].trim();
      else if (em) explanation = em[1].trim();
      else if (cm) choices.push({ id: cm[1].toLowerCase(), text: cm[2].trim() });
      else if (choices.length === 0) {
        // A line before any choice, with no marker, is the prompt (or its
        // continuation). Supports exam-style blocks with no "Q:" prefix, e.g.
        // "1. What command…" followed by "A. …" / "B. …" / "Answer: A".
        prompt = prompt ? `${prompt} ${line}` : line;
      }
    }

    // Drop a leading question number ("1." / "12)") from an unprefixed prompt.
    if (prompt) prompt = prompt.replace(/^\s*\d+\s*[.)]\s*/, '').trim();

    if (!prompt) {
      errors.push(`Bloque ${index + 1}: no se encontró el enunciado.`);
      return;
    }
    if (choices.length < 2) {
      errors.push(`Bloque ${index + 1}: necesita al menos 2 opciones (A) B) ...).`);
      return;
    }
    const correctIds = normalizeCorrect(correct, choices);
    if (correctIds.length === 0) {
      errors.push(`Bloque ${index + 1}: indica la respuesta con "R: A" (o "R: A,C").`);
      return;
    }

    questions.push({
      id: `imp-${index}-${slug(prompt)}`,
      domain: DEFAULT_DOMAIN,
      difficulty: 'Beginner',
      prompt,
      choices,
      correct: correctIds,
      multi: correctIds.length > 1,
      explanation,
      reference: 'Importada',
      imported: true,
    });
  });

  return { questions, errors };
}

/**
 * @param {number} index
 * @returns {string}
 */
function letter(index) {
  return String.fromCharCode(97 + index); // 0 -> 'a'
}

/**
 * @param {string} text
 * @returns {string}
 */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}
