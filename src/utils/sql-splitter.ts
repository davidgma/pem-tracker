/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Splits a SQL script into individual executable statements by semicolon,
 * respecting:
 * - Single-quoted strings ('...') and escaped single quotes ('')
 * - Double-quoted identifiers ("...") and escaped double quotes ("")
 * - Bracketed identifiers ([...])
 * - Backtick identifiers (`...`)
 * - Single-line comments (-- ...)
 * - Multi-line block comments (/* ... * /)
 * - BEGIN ... END blocks in triggers
 */
export function splitSqlStatements(sql: string): string[] {
  if (!sql || !sql.trim()) return [];

  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;
  let blockDepth = 0; // for CREATE TRIGGER ... BEGIN ... END

  const len = sql.length;
  for (let i = 0; i < len; i++) {
    const char = sql[i];
    const nextChar = i + 1 < len ? sql[i + 1] : '';

    // Inside single-line comment: ignores everything until newline
    if (inLineComment) {
      current += char;
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // Inside block comment: ignores everything until */
    if (inBlockComment) {
      current += char;
      if (char === '*' && nextChar === '/') {
        current += nextChar;
        i++;
        inBlockComment = false;
      }
      continue;
    }

    // Inside single-quoted string
    if (inSingleQuote) {
      current += char;
      if (char === "'") {
        if (nextChar === "'") {
          // Escaped quote in SQL: ''
          current += nextChar;
          i++;
        } else {
          inSingleQuote = false;
        }
      }
      continue;
    }

    // Inside double-quoted identifier
    if (inDoubleQuote) {
      current += char;
      if (char === '"') {
        if (nextChar === '"') {
          current += nextChar;
          i++;
        } else {
          inDoubleQuote = false;
        }
      }
      continue;
    }

    // Inside bracketed identifier [col name]
    if (inBracket) {
      current += char;
      if (char === ']') {
        inBracket = false;
      }
      continue;
    }

    // Inside backtick identifier `col`
    if (inBacktick) {
      current += char;
      if (char === '`') {
        inBacktick = false;
      }
      continue;
    }

    // Check for comment starts
    if (char === '-' && nextChar === '-') {
      inLineComment = true;
      current += char + nextChar;
      i++;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      current += char + nextChar;
      i++;
      continue;
    }

    // Check for quote / bracket starts
    if (char === "'") {
      inSingleQuote = true;
      current += char;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      current += char;
      continue;
    }

    if (char === '[') {
      inBracket = true;
      current += char;
      continue;
    }

    if (char === '`') {
      inBacktick = true;
      current += char;
      continue;
    }

    // Track trigger BEGIN ... END nesting so semicolons inside trigger body aren't split
    // Simple word boundary check
    if (char === 'b' || char === 'B') {
      const word = sql.slice(i, i + 5);
      if (/^begin\b/i.test(word) && /trigger\b/i.test(current)) {
        blockDepth++;
      }
    } else if (char === 'e' || char === 'E') {
      const word = sql.slice(i, i + 3);
      if (/^end\b/i.test(word) && blockDepth > 0) {
        blockDepth--;
      }
    }

    // Statement delimiter
    if (char === ';' && blockDepth === 0) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed.length > 0) {
    statements.push(lastTrimmed);
  }

  return statements;
}
