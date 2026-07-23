/**
 * CommandTree.js
 *
 * A generic command trie that reproduces two hallmark behaviors of the
 * Cisco IOS parser:
 *
 *   1. Minimum unique abbreviation — `conf t` resolves to
 *      `configure terminal`, `sh ip int br` to `show ip interface brief`,
 *      as long as each abbreviated word is unambiguous at its position.
 *   2. Context-sensitive completion — pressing Tab (or `?`) offers the
 *      literal keywords valid at the cursor.
 *
 * Commands are registered with `add(path, handler)` where `path` is the
 * canonical space-separated command. Placeholders are written `<name>` for
 * a single token, or `<name...>` for "the rest of the line" (used by things
 * like `description <text...>`). Nothing here touches the DOM or the device
 * model — handlers receive whatever context the caller passes to `resolve`.
 */

class CommandNode {
  constructor() {
    /** @type {Map<string, CommandNode>} literal keyword → child */
    this.literals = new Map();
    /** @type {Set<string>} keywords in `literals` that are aliases of another */
    this.aliasKeys = new Set();
    /** @type {{ name: string, rest: boolean, node: CommandNode }|null} */
    this.param = null;
    /** @type {Function|null} */
    this.handler = null;
    /** @type {string|null} full canonical path terminating here */
    this.path = null;
  }
}

/** Result of a failed resolution, distinguishable by `error` kind. */
export const ResolveError = Object.freeze({
  EMPTY: 'empty',
  INVALID: 'invalid',
  AMBIGUOUS: 'ambiguous',
  INCOMPLETE: 'incomplete',
});

export class CommandTree {
  constructor() {
    this.root = new CommandNode();
  }

  /**
   * Walks (creating nodes as needed) to the node for a command path.
   * @param {string} path
   * @returns {CommandNode}
   */
  _nodeFor(path) {
    const tokens = path.trim().split(/\s+/);
    let node = this.root;
    for (const token of tokens) {
      const paramMatch = token.match(/^<(\w+)(\.\.\.)?>$/);
      if (paramMatch) {
        const [, name, rest] = paramMatch;
        if (!node.param) node.param = { name, rest: Boolean(rest), node: new CommandNode() };
        node = node.param.node;
      } else {
        if (!node.literals.has(token)) node.literals.set(token, new CommandNode());
        node = node.literals.get(token);
      }
    }
    return node;
  }

  /**
   * Registers a command.
   * @param {string} path - e.g. "show ip interface brief" or "hostname <name>".
   * @param {Function} handler - `(context, args) => string | {output?, error?}`.
   * @param {string} [description] - IOS-style one-line help for `?` output.
   */
  add(path, handler, description = null) {
    const node = this._nodeFor(path);
    node.handler = handler;
    node.path = path;
    if (description) node.description = description;
  }

  /**
   * Attaches an IOS-style help description to a keyword node (which may be an
   * intermediate category like `show ip`, not a full command), so `?` lists
   * it. Creates the node if it does not exist yet.
   * @param {string} path
   * @param {string} description
   */
  describe(path, description) {
    this._nodeFor(path).description = description;
  }

  /**
   * Registers `alias` as an alternate spelling of an existing keyword under
   * the same parent, sharing the very same node. IOS does this for a handful
   * of keywords — `show interface` and `show interfaces` are one command, so
   * `sh int status` must resolve rather than come back ambiguous.
   *
   * The alias is hidden from `?`/Tab so help output still shows one spelling.
   * @param {string} path - the canonical keyword path, e.g. "show interfaces".
   * @param {string} alias - the alternate final keyword, e.g. "interface".
   */
  alias(path, alias) {
    const tokens = path.trim().split(/\s+/);
    const keyword = tokens.pop();
    const parent = tokens.length ? this._nodeFor(tokens.join(' ')) : this.root;
    const target = parent.literals.get(keyword);
    if (!target) throw new Error(`Cannot alias unknown keyword "${path}"`);
    parent.literals.set(alias, target);
    parent.aliasKeys.add(alias);
  }

  /**
   * Resolves a tokenized command line to a handler + captured args.
   * @param {string[]} tokens
   * @returns {{handler: Function, args: object, path: string}|{error: string, kind: string, token?: string, matches?: string[]}}
   */
  resolve(tokens) {
    if (tokens.length === 0) return { error: 'empty', kind: ResolveError.EMPTY };

    let node = this.root;
    const args = {};

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const matches = this._literalMatches(node, token);

      if (matches.length === 1) {
        node = node.literals.get(matches[0]);
        continue;
      }
      if (matches.length > 1) {
        // Several spellings of the same keyword (see `alias`) are not a real
        // ambiguity — they all lead to the very same node.
        const targets = new Set(matches.map((word) => node.literals.get(word)));
        if (targets.size === 1) {
          node = node.literals.get(matches[0]);
          continue;
        }
        return {
          error: `% Ambiguous command: "${tokens.slice(0, i + 1).join(' ')}"`,
          kind: ResolveError.AMBIGUOUS,
          token,
          matches,
        };
      }
      // No literal matched — try a parameter slot.
      if (node.param) {
        if (node.param.rest) {
          args[node.param.name] = tokens.slice(i).join(' ');
          node = node.param.node;
          i = tokens.length; // consumed the remainder
          break;
        }
        args[node.param.name] = token;
        node = node.param.node;
        continue;
      }
      return { error: this._invalidInputMarker(tokens, i), kind: ResolveError.INVALID, token };
    }

    if (typeof node.handler !== 'function') {
      return { error: '% Incomplete command.', kind: ResolveError.INCOMPLETE };
    }
    return { handler: node.handler, args, path: node.path };
  }

  /**
   * Returns the literal keywords valid at the position after `tokens`, for
   * tab/`?` completion. If `tokens` ends mid-word, that partial word filters
   * the suggestions.
   * @param {string[]} tokens
   * @param {boolean} [trailingSpace] - true if the line ends in whitespace
   *   (i.e. the user finished the previous word and wants the next one).
   * @returns {{completions: string[], param: string|null, exact: boolean}}
   */
  complete(tokens, trailingSpace = false) {
    let node = this.root;

    const fullWords = trailingSpace ? tokens : tokens.slice(0, -1);
    const partial = trailingSpace ? '' : (tokens[tokens.length - 1] ?? '');

    for (const token of fullWords) {
      const matches = this._literalMatches(node, token);
      if (matches.length >= 1 && new Set(matches.map((w) => node.literals.get(w))).size === 1) {
        node = node.literals.get(matches[0]);
      } else if (node.param) {
        node = node.param.node;
      } else {
        return { completions: [], param: null, exact: false };
      }
    }

    const completions = [...node.literals.keys()]
      .filter((word) => word.startsWith(partial) && !node.aliasKeys.has(word))
      .sort();
    const descriptions = {};
    for (const word of completions) {
      const child = node.literals.get(word);
      if (child && child.description) descriptions[word] = child.description;
    }
    const param = node.param && completions.length === 0 ? node.param.name : null;
    const exact = completions.length === 1 && completions[0] === partial;
    return { completions, descriptions, param, exact };
  }

  /**
   * Literal keywords under `node` that `token` abbreviates. An exact match
   * always wins (so `int` doesn't collide with a hypothetical `int`+`interface`).
   * @param {CommandNode} node
   * @param {string} token
   * @returns {string[]}
   */
  _literalMatches(node, token) {
    if (node.literals.has(token)) return [token];
    return [...node.literals.keys()].filter((word) => word.startsWith(token));
  }

  /**
   * Builds the classic IOS caret-marker error for an unrecognized token.
   * @param {string[]} tokens
   * @param {number} index
   * @returns {string}
   */
  _invalidInputMarker(tokens, index) {
    const prefix = tokens.slice(0, index).join(' ');
    const caretColumn = prefix.length === 0 ? 0 : prefix.length + 1;
    return `${' '.repeat(caretColumn)}^\n% Invalid input detected at '^' marker.`;
  }
}
