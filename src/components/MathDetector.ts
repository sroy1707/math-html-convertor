/**
 * Utility for automatically detecting and wrapping mathematical expressions in plain text.
 */

// Regex to detect any LaTeX math commands starting with a backslash
const LATEX_COMMAND_REGEX = /\\[a-zA-Z]+/i;

// Set of common unicode math symbols
const UNICODE_MATH_SYMBOLS = /[\u2200-\u22FF\u2190-\u21FF]/;

// Common English words to ignore when checking if text is pure math
const COMMON_ENGLISH_WORDS = /\b(the|is|and|are|of|to|in|that|this|with|for|was|were|have|has|had|but|not|or|as|at|by|an|be|me|my|we|you|your|he|him|his|she|her|they|them|their)\b/i;

/**
 * Checks if a string looks like a math expression.
 */
export function isMathExpressionText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Explicit LaTeX wrappers
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return true;
  if (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) return true;
  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) return true;

  // 2. Contains LaTeX math commands (any backslash command)
  if (LATEX_COMMAND_REGEX.test(trimmed)) return true;

  // 3. Contains unicode math symbols
  if (UNICODE_MATH_SYMBOLS.test(trimmed)) return true;

  // 4. Contains exponents (e.g. x^2, (a+b)^2)
  const hasExponent = /[\w()]+\^[\w()]+/.test(trimmed);
  if (hasExponent) return true;

  // 5. Contains subscripts with single character variable base (e.g. x_i, y_1)
  const hasMathSubscript = /\b[a-zA-Z]_[a-zA-Z0-9]+\b/.test(trimmed) || /\b[a-zA-Z0-9]+_\{[^}]+\}/.test(trimmed);
  if (hasMathSubscript) return true;

  // 6. Common equation format (e.g. y = mx + c)
  if (/^[a-zA-Z]\s*=\s*[-+*/\w\s()]+$/.test(trimmed) && trimmed.includes(" ") && /[-+*/]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks if the entire text contains no common English words and looks like math.
 */
function isEntireTextPureMath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (COMMON_ENGLISH_WORDS.test(trimmed)) return false;
  return isMathExpressionText(trimmed);
}

/**
 * Helper to generate a placeholder key that contains only letters
 * (immune to math token scanning).
 */
function getPlaceholderKey(index: number): string {
  let key = "";
  let temp = index;
  while (temp >= 0) {
    key = String.fromCharCode(65 + (temp % 26)) + key;
    temp = Math.floor(temp / 26) - 1;
  }
  return `MATHPLACEHOLDER${key}`;
}

/**
 * Normalizes combining Unicode diacritical marks used for vector/hat/bar notation
 * into standard LaTeX commands.
 */
function normalizeUnicodeMathSymbols(text: string): string {
  if (!text) return "";
  let processed = text;
  
  // 1. Vector arrow: letter + U+20D7 or U+20D1 -> \vec{letter}
  processed = processed.replace(/([a-zA-Z])[\u20D7\u20D1]/g, "\\vec{$1}");
  
  // 2. Hat vector: letter + U+0302 -> \hat{letter}
  processed = processed.replace(/([a-zA-Z])\u0302/g, "\\hat{$1}");
  
  // 3. Bar: letter + U+0304 -> \bar{letter}
  processed = processed.replace(/([a-zA-Z])\u0304/g, "\\bar{$1}");
  
  // 4. Dot: letter + U+0307 -> \dot{letter}
  processed = processed.replace(/([a-zA-Z])\u0307/g, "\\dot{$1}");
  
  // 5. Double dot: letter + U+0308 -> \ddot{letter}
  processed = processed.replace(/([a-zA-Z])\u0308/g, "\\ddot{$1}");
  
  return processed;
}

/**
 * Normalizes plain-text physics vector formulas and common units (like cm2, A/m2)
 * into standard LaTeX vector formatting (\vec{...}) and unit block formatting (\text{...}^2).
 */
function normalizePhysicsVectorsAndUnits(text: string): string {
  if (!text) return "";
  let processed = text;

  // Normalize unicode superscripts to standard numbers
  processed = processed.replace(/²/g, "2");
  processed = processed.replace(/³/g, "3");
  processed = processed.replace(/¹/g, "1");

  // Check for physics vector context keywords
  const hasPhysicsVectorContext = /\b(density|field|force|velocity|acceleration|momentum|vector|relation)\b/i.test(processed);

  // Check if it's a math expression containing standard physics vector variables
  const isEquation = /[-+=<>]/.test(processed);
  const hasVectorVariables = /\b(J|E|B|F)\b/.test(processed);

  if (hasPhysicsVectorContext || (isEquation && hasVectorVariables)) {
    // Convert standalone J, E, B, F to vectors globally
    processed = processed.replace(/\b(J|E|B|F)\b/g, "\\vec{$1}");
  }

  // Check if the text contains standard vector unit component patterns (like 2i, +3j, -k, etc.)
  const hasVectorComponents = /\b\d*[ijk]\b/.test(processed) && /[-+=]/.test(processed);

  if (hasVectorComponents || (isEquation && hasVectorVariables)) {
    // 1. Normalize unit vectors i, j, k (preceded by numbers/operators) to \vec{i}, \vec{j}, \vec{k}
    processed = processed.replace(/\b([0-9]*)([ijk])\b/g, (match, coeff, unit) => {
      return coeff + `\\vec{${unit}}`;
    });

    // 2. Normalize standard left-hand side vector variables (A, J, F, v, E, B, u, s, a, r, p) when next to '='
    // (only matches if they haven't been converted to \vec{...} yet)
    processed = processed.replace(/\b(A|J|F|v|E|B|u|s|a|r|p)\b\s*=/g, "\\vec{$1} =");
  }

  // Normalize dot product period to \cdot when between two vectors
  processed = processed.replace(/\\vec{([a-zA-Z])}\s*\.\s*\\vec{([a-zA-Z])}/g, "\\vec{$1} \\cdot \\vec{$2}");

  // 3. Normalize common units (order: most specific first)
  processed = processed.replace(/\bA\/m2\b/gi, "\\text{ A/m}^2");
  processed = processed.replace(/\bcm2\b/gi, "\\text{ cm}^2");
  processed = processed.replace(/\bm2\b/gi, "\\text{ m}^2");
  processed = processed.replace(/\bmA\b/gi, "\\text{ mA}");

  return processed;
}

/**
 * Scans the input plain text and wraps auto-detected math expressions in `{{latex}}`.
 */
export function autoDetectMathInText(text: string): string {
  if (!text) return "";

  // Normalize combining diacritical marks (vectors, hats, bars) to LaTeX
  const normalizedSymbols = normalizeUnicodeMathSymbols(text);

  // Normalize plain-text physics vector formulas and units to LaTeX
  const normalized = normalizePhysicsVectorsAndUnits(normalizedSymbols);

  // If the entire text is pure math, wrap it as a single block
  if (isEntireTextPureMath(normalized)) {
    // Avoid double wrapping if it's already wrapped in delimiters handled in Step 1
    const trimmed = normalized.trim();
    const isAlreadyDelimited = 
      (trimmed.startsWith("$$") && trimmed.endsWith("$$")) ||
      (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) ||
      (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) ||
      (trimmed.startsWith("$") && trimmed.endsWith("$") && !/^\$\d+(?:[.,]\d+)?\$/.test(trimmed));
    
    if (!isAlreadyDelimited) {
      return `{{${trimmed}}}`;
    }
  }

  // Step 1: Handle explicit LaTeX block delimiters first
  // Display Math: $$ ... $$
  let processed = normalized.replace(/\$\$([\s\S]+?)\$\$/g, (_, eq) => `{{${eq.trim()}}}`);

  // Display Math: \[ ... \]
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, eq) => `{{${eq.trim()}}}`);

  // Inline Math: \( ... \)
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, eq) => `{{${eq.trim()}}}`);

  // Inline Math: $ ... $ (avoid matching single dollar signs like "$10 and $20")
  processed = processed.replace(/\$([^$\n\s]+(?:[^$\n]*?[^$\n\s]+)?)\$/g, (match, eq) => {
    // If it looks like a currency amount, do not convert
    if (/^\d+(?:[.,]\d+)?$/.test(eq.trim())) {
      return match;
    }
    return `{{${eq.trim()}}}`;
  });

  // Step 2: Extract already processed {{...}} blocks using placeholders
  // to avoid double processing or modifying already correct formulas
  const placeholders: string[] = [];
  processed = processed.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    placeholders.push(match);
    const key = getPlaceholderKey(placeholders.length - 1);
    return key;
  });

  // Step 3: Run implicit math detection on the remaining text
  // We define a regex that matches a math token:
  // - a number: \d+(?:\.\d+)?
  // - a math operator or punctuation: [-+*/=<>()[\]{}^_.,&]
  // - double backslash for LaTeX line break: \\\\
  // - a single letter variable: (?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])
  // - a LaTeX command: \\[a-zA-Z*]+
  // - common math functions: sin, cos, tan, log, ln, lim, etc.
  // - a unicode math symbol: [\u2200-\u22FF\u2190-\u21FF]
  const mathTokenPattern = /(?:\d+(?:\.\d+)?|[-+*/=<>()[\]{}^_.,&]|\\\\|(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])|\\[a-zA-Z*]+|\b(?:sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lim|max|min|sup|inf|det|dim|ker|deg|arg|gcd|exp)\b|[\u2200-\u22FF\u2190-\u21FF])/g;

  // Let's process the text line by line to locate math expressions
  const lines = processed.split(/\r?\n/);
  const processedLines = lines.map((line) => {
    let tempLine = line;
    const mathSpans: { start: number; end: number; text: string }[] = [];

    // Let's find all contiguous spans of math tokens
    let currentSpan: { start: number; end: number; tokens: string[] } | null = null;
    
    // We walk the line to find where math tokens start and end, allowing spaces between them.
    let braceDepth = 0;
    let index = 0;
    while (index < line.length) {
      const char = line[index];
      // Skip whitespace
      if (/\s/.test(char)) {
        index++;
        continue;
      }

      // Track brace depth
      if (char === "{") {
        braceDepth++;
      } else if (char === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      }

      // If we are inside curly braces, allow any sequence of alphanumeric chars as a single math token
      if (braceDepth > 0 && /[a-zA-Z0-9]/.test(char)) {
        const wordMatch = line.substring(index).match(/^[a-zA-Z0-9]+/);
        if (wordMatch) {
          const word = wordMatch[0];
          const wordLength = word.length;
          if (!currentSpan) {
            currentSpan = { start: index, end: index + wordLength, tokens: [word] };
          } else {
            currentSpan.end = index + wordLength;
            currentSpan.tokens.push(word);
          }
          index += wordLength;
          continue;
        }
      }

      // Check if there is a math token at this position
      mathTokenPattern.lastIndex = index;
      const match = mathTokenPattern.exec(line);
      if (match && match.index === index) {
        const token = match[0];
        const tokenLength = token.length;
        if (!currentSpan) {
          currentSpan = { start: index, end: index + tokenLength, tokens: [token] };
        } else {
          currentSpan.end = index + tokenLength;
          currentSpan.tokens.push(token);
        }
        index += tokenLength;
      } else {
        // Not a math token. If we have a current span, save it
        if (currentSpan) {
          let spanText = line.substring(currentSpan.start, currentSpan.end);
          
          // Strip trailing punctuation like commas and periods from the math span
          let endAdjustment = 0;
          while (spanText.length > 0 && /[,.;:?!]$/.test(spanText)) {
            spanText = spanText.substring(0, spanText.length - 1);
            endAdjustment++;
          }

          if (isValidMathSpan(spanText, currentSpan.tokens.slice(0, currentSpan.tokens.length - endAdjustment))) {
            mathSpans.push({ start: currentSpan.start, end: currentSpan.end - endAdjustment, text: spanText });
          }
          currentSpan = null;
        }
        index++;
      }
    }
    
    if (currentSpan) {
      let spanText = line.substring(currentSpan.start, currentSpan.end);
      
      let endAdjustment = 0;
      while (spanText.length > 0 && /[,.;:?!]$/.test(spanText)) {
        spanText = spanText.substring(0, spanText.length - 1);
        endAdjustment++;
      }

      if (isValidMathSpan(spanText, currentSpan.tokens.slice(0, currentSpan.tokens.length - endAdjustment))) {
        mathSpans.push({ start: currentSpan.start, end: currentSpan.end - endAdjustment, text: spanText });
      }
    }

    // Replace the math spans in reverse order to keep character offsets correct
    for (let i = mathSpans.length - 1; i >= 0; i--) {
      const span = mathSpans[i];
      // Wrap it in {{latex}}
      tempLine = tempLine.substring(0, span.start) + `{{${span.text.trim()}}}` + tempLine.substring(span.end);
    }

    return tempLine;
  });

  processed = processedLines.join("\n");

  // Step 4: Restore placeholders
  for (let i = 0; i < placeholders.length; i++) {
    const key = getPlaceholderKey(i);
    processed = processed.split(key).join(placeholders[i]);
  }

  return processed;
}

/**
 * Checks if a span of math tokens is a valid math expression.
 * We want to filter out single numbers, single letters (like 'a' or 'I'),
 * or strings that don't actually contain any mathematical context.
 */
function isValidMathSpan(text: string, tokens: string[]): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Rule 1: Must contain at least one characteristic math symbol/operator
  // (e.g. ^, _, \, +, -, =, *, /, <, >, &, or unicode symbols)
  const hasOperatorOrCommand = /[\^_\\+\-=*/<>&|\u2200-\u22FF\u2190-\u21FF]/.test(trimmed);
  if (!hasOperatorOrCommand) return false;

  // Rule 2: If it has subscript '_', verify it's not a common programming snake_case name (like my_variable)
  if (trimmed.includes("_")) {
    // If it contains only letters, numbers, and underscores (no +, -, =, ^, *, / etc.)
    if (/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      // Only allow if it's a single letter followed by digit/letter (e.g. x_1, y_i, a_10)
      // or a single letter followed by a curly brace index (e.g. x_{init})
      if (!/^[a-zA-Z]_[a-zA-Z0-9]+$/.test(trimmed) && !/^[a-zA-Z]_[{][a-zA-Z0-9]+[}]$/.test(trimmed)) {
        return false;
      }
    }
  }

  // Rule 3: Avoid wrapping single characters or simple lone operators
  if (tokens.length === 1) {
    const singleToken = tokens[0];
    // A single token must be a LaTeX command, or contain ^
    if (!singleToken.startsWith("\\") && !singleToken.includes("^")) {
      return false;
    }
  }

  return true;
}
