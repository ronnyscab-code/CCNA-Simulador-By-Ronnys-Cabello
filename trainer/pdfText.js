/**
 * pdfText.js
 *
 * A tiny, DEPENDENCY-FREE best-effort PDF text extractor for the private
 * question importer. It reads a PDF entirely in the browser (nothing is ever
 * uploaded), inflates its FlateDecode content streams with the native
 * `DecompressionStream`, and pulls out the text-showing operators.
 *
 * It handles text-based PDFs (the common case for exported study material).
 * It does NOT handle scanned/image-only PDFs (no text to extract), encrypted
 * PDFs, or exotic font encodings — for those the learner can still copy-paste
 * the text manually. This is intentionally small and vanilla rather than
 * bundling a megabyte-scale PDF engine.
 *
 * The operator parser (`extractTextFromContent`) is pure and unit-tested; the
 * stream orchestration (`extractPdfText`) is verified in the browser.
 */

const MAX_OUTPUT = 500_000; // guard against pathological PDFs

/**
 * Extracts readable text from a single decoded PDF content stream by walking
 * its text operators (`Tj`, `TJ`, `'`, `"`) and positioning operators
 * (`Td`/`TD`/`T*`/`ET`) that imply line breaks.
 * @param {string} content - A content stream decoded as latin1.
 * @returns {string}
 */
export function extractTextFromContent(content) {
  const lines = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) lines.push(buf.replace(/\s+/g, ' ').trim());
    buf = '';
  };

  let i = 0;
  const len = content.length;
  let lastString = null;
  let arrayParts = [];
  let inArray = false;

  while (i < len) {
    const c = content[i];

    if (c === '(') {
      const r = readLiteralString(content, i);
      lastString = r.str;
      if (inArray) arrayParts.push(r.str);
      i = r.next;
      continue;
    }
    if (c === '<' && content[i + 1] !== '<') {
      const r = readHexString(content, i);
      lastString = r.str;
      if (inArray) arrayParts.push(r.str);
      i = r.next;
      continue;
    }
    if (c === '[') {
      inArray = true;
      arrayParts = [];
      i += 1;
      continue;
    }
    if (c === ']') {
      inArray = false;
      i += 1;
      continue;
    }
    // Inside a TJ array, a sufficiently negative kerning number is a word gap.
    if (inArray && (c === '-' || c === '.' || (c >= '0' && c <= '9'))) {
      let j = i;
      let num = '';
      while (j < len && /[0-9.\-]/.test(content[j])) {
        num += content[j];
        j += 1;
      }
      if (Number.parseFloat(num) < -60) arrayParts.push(' ');
      i = j;
      continue;
    }
    // Operator / keyword token.
    if (/[A-Za-z'"*]/.test(c)) {
      let j = i;
      let op = '';
      while (j < len && /[A-Za-z0-9*'"]/.test(content[j])) {
        op += content[j];
        j += 1;
      }
      i = j;
      if (op === 'Tj') {
        buf += lastString ?? '';
        lastString = null;
      } else if (op === 'TJ') {
        buf += arrayParts.join('');
        arrayParts = [];
      } else if (op === "'" || op === '"') {
        flush();
        buf += lastString ?? '';
        lastString = null;
      } else if (op === 'Td' || op === 'TD' || op === 'T*' || op === 'ET') {
        flush();
      }
      continue;
    }
    i += 1;
  }
  flush();
  return lines.join('\n');
}

/**
 * Reads a PDF literal string `( ... )` starting at `start`, handling escapes,
 * octal codes, and balanced nested parentheses.
 * @param {string} s
 * @param {number} start - index of the opening '('.
 * @returns {{str: string, next: number}}
 */
function readLiteralString(s, start) {
  let depth = 1;
  let out = '';
  let j = start + 1;
  const len = s.length;
  while (j < len && depth > 0) {
    const c = s[j];
    if (c === '\\') {
      const next = s[j + 1];
      const simple = {
        n: '\n',
        r: '\r',
        t: '\t',
        b: '\b',
        f: '\f',
        '(': '(',
        ')': ')',
        '\\': '\\',
      };
      if (next in simple) {
        out += simple[next];
        j += 2;
        continue;
      }
      if (next >= '0' && next <= '7') {
        let oct = next;
        j += 2;
        let k = 0;
        while (k < 2 && s[j] >= '0' && s[j] <= '7') {
          oct += s[j];
          j += 1;
          k += 1;
        }
        out += String.fromCharCode(Number.parseInt(oct, 8) & 0xff);
        continue;
      }
      if (next === '\n') {
        j += 2;
        continue;
      }
      if (next === '\r') {
        j += s[j + 2] === '\n' ? 3 : 2;
        continue;
      }
      out += next ?? '';
      j += 2;
      continue;
    }
    if (c === '(') {
      depth += 1;
      out += c;
      j += 1;
      continue;
    }
    if (c === ')') {
      depth -= 1;
      if (depth === 0) {
        j += 1;
        break;
      }
      out += c;
      j += 1;
      continue;
    }
    out += c;
    j += 1;
  }
  return { str: out, next: j };
}

/**
 * Reads a PDF hex string `< ... >` starting at `start`.
 * @param {string} s
 * @param {number} start - index of the opening '<'.
 * @returns {{str: string, next: number}}
 */
function readHexString(s, start) {
  let j = start + 1;
  let hex = '';
  const len = s.length;
  while (j < len && s[j] !== '>') {
    if (/[0-9a-fA-F]/.test(s[j])) hex += s[j];
    j += 1;
  }
  j += 1; // skip '>'
  if (hex.length % 2 === 1) hex += '0';
  let out = '';
  for (let k = 0; k < hex.length; k += 2) {
    out += String.fromCharCode(Number.parseInt(hex.slice(k, k + 2), 16));
  }
  return { str: out, next: j };
}

/**
 * @param {Uint8Array} bytes
 * @returns {string} the bytes decoded as latin1 (1:1 byte→char), safe for the
 *   byte-level scanning above.
 */
function bytesToLatin1(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return out;
}

/**
 * Inflates a zlib/deflate byte array using the native DecompressionStream.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array|null>} the inflated bytes, or null if it isn't
 *   deflate-compressed (or the API is unavailable).
 */
async function tryInflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch {
      // try the next format
    }
  }
  return null;
}

/**
 * Extracts text from a whole PDF file (best effort). Each `stream…endstream`
 * block is inflated when possible; blocks that look like content streams
 * (they contain text operators) are parsed and concatenated.
 * @param {ArrayBuffer} arrayBuffer - the raw PDF bytes.
 * @returns {Promise<string>}
 */
export async function extractPdfText(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const latin1 = bytesToLatin1(bytes);
  const chunks = [];
  let idx = 0;
  let total = 0;

  while (total < MAX_OUTPUT) {
    const s = latin1.indexOf('stream', idx);
    if (s === -1) break;
    const e = latin1.indexOf('endstream', s);
    if (e === -1) break;

    let dataStart = s + 'stream'.length;
    if (latin1[dataStart] === '\r') dataStart += 1;
    if (latin1[dataStart] === '\n') dataStart += 1;
    let dataEnd = e;
    if (latin1[dataEnd - 1] === '\n') dataEnd -= 1;
    if (latin1[dataEnd - 1] === '\r') dataEnd -= 1;
    idx = e + 'endstream'.length;

    if (dataEnd <= dataStart) continue;
    const raw = bytes.subarray(dataStart, dataEnd);
    const inflated = await tryInflate(raw);
    const content = bytesToLatin1(inflated ?? raw);

    if (!/BT\b|Tj|TJ/.test(content)) continue; // not a text content stream
    const text = extractTextFromContent(content);
    if (text.trim()) {
      chunks.push(text);
      total += text.length;
    }
  }

  return chunks.join('\n').slice(0, MAX_OUTPUT);
}
