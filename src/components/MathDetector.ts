/**
 * Utility for automatically detecting and wrapping mathematical expressions in plain text.
 */

// Regex to detect any LaTeX math commands starting with a backslash
const LATEX_COMMAND_REGEX = /\\[a-zA-Z]+/i;

// Set of common unicode math symbols (including Greek letters, sub/superscripts, symbols)
const UNICODE_MATH_SYMBOLS = /[\u2200-\u22FF\u2190-\u21FF\u0370-\u03FF\u2070-\u209F\u00B0\u00B1\u00B2\u00B3\u00B9\u00D7\u00F7\u00B5\u2100-\u214F\u2A00-\u2AFF\u27C0-\u27EF\u2980-\u29FF]/;

// Known math function & unit keywords to ignore when checking for prose words
const MATH_KEYWORDS = new Set([
  "sin", "cos", "tan", "csc", "sec", "cot", "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "log", "ln", "lim", "max", "min", "sup", "inf",
  "det", "dim", "ker", "deg", "arg", "gcd", "exp", "frac", "fract", "fraction",
  "dfrac", "tfrac", "cfrac", "sqrt", "sqr", "vec",
  "hat", "bar", "text", "cdot", "int", "sum", "prod", "rad", "mol", "cm",
  "mm", "km", "ma", "mv", "hz", "pa"
]);

/**
 * Checks if text contains non-math prose words of length 2 or more
 * in English or Unicode scripts (e.g. Hindi Devanagari \u0900-\u097F).
 */
export function containsProseWords(text: string): boolean {
  if (!text) return false;
  const words = text.match(/[\p{L}\u0900-\u097F]{2,}/gu);
  if (!words) return false;
  for (const w of words) {
    if (!MATH_KEYWORDS.has(w.toLowerCase())) {
      return true;
    }
  }
  return false;
}

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
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) return true;

  // If text contains prose words (e.g. Hindi/English sentence), the text as a whole is NOT a standalone math expression
  if (containsProseWords(trimmed)) return false;

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
 * Checks if the entire text contains no common prose words and looks like math.
 */
function isEntireTextPureMath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Question numbers or Option labels (English/Hindi) mean the line is a question or options line
  if (/^\s*(?:[\d\u0966-\u096F]+[.)]|\([\d\u0966-\u096F\p{L}\u0900-\u097F]+\)|[\p{L}\u0900-\u097F][.)])\s*/u.test(trimmed)) return false;

  if (containsProseWords(trimmed)) return false;
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

  // Normalize unicode superscripts to standard LaTeX exponents
  processed = processed.replace(/²/g, "^{2}");
  processed = processed.replace(/³/g, "^{3}");
  processed = processed.replace(/¹/g, "^{1}");
  processed = processed.replace(/⁴/g, "^{4}");
  processed = processed.replace(/⁵/g, "^{5}");
  processed = processed.replace(/⁶/g, "^{6}");
  processed = processed.replace(/⁷/g, "^{7}");
  processed = processed.replace(/⁸/g, "^{8}");
  processed = processed.replace(/⁹/g, "^{9}");
  processed = processed.replace(/⁰/g, "^{0}");
  processed = processed.replace(/⁻/g, "^{-}");
  processed = processed.replace(/⁺/g, "^{+}");
  processed = processed.replace(/µ/g, "\\mu ");
  processed = processed.replace(/μ/g, "\\mu ");

  // 1. Mobility and physics unit fractions (e.g. m2V•s, cm2V•s, mm2V•s, μm2V•s, (μm)2/V.s, m2/V.s)
  // Handles bullet '•' (U+2022), middle dot '·', '.', '/', '*', space
  processed = processed.replace(
    /(\(\\mu\s*m\)|\\mu\s*m|um|μm|\(μm\)|cm|mm|km|m)\s*\^{?2}?\s*[\/]*\s*([Vv])[\s\.\+\*•·∙⋅]*([ss]|sec)\b/gi,
    "\\frac{$1^2}{V \\cdot s}"
  );
  processed = processed.replace(
    /(\(\\mu\s*m\)|\\mu\s*m|um|μm|\(μm\)|cm|mm|km|m)2\s*[\/]*\s*([Vv])[\s\.\+\*•·∙⋅]*([ss]|sec)\b/gi,
    "\\frac{$1^2}{V \\cdot s}"
  );
  processed = processed.replace(
    /(\(\\mu\s*m\)|\\mu\s*m|um|μm|\(μm\)|cm|mm|km|m)\s*[\/]*\s*([Vv])[\s\.\+\*•·∙⋅]*([ss]|sec)\b/gi,
    "\\frac{$1}{V \\cdot s}"
  );

  // 2. Current density & area units: A/m2, A/cm2, cm2, mm2, m2 when used as units
  processed = processed.replace(/\bA\/m2\b/gi, "\\text{A/m}^2");
  processed = processed.replace(/\bA\/cm2\b/gi, "\\text{A/cm}^2");
  processed = processed.replace(/\bA\/m\^2\b/gi, "\\text{A/m}^2");
  processed = processed.replace(/\bA\/cm\^2\b/gi, "\\text{A/cm}^2");
  processed = processed.replace(/(?<=\d|\b[ijk]|\b\s)(cm|mm|km|m)2\b/gi, "\\text{ $1}^2");

  // 3. Separate unit vectors (i, j, k) from area units (cm2, m2, A/m2, cm^2, m^2, A/m^2)
  processed = processed.replace(/\b([0-9]*)([ijk])\s*(cm2|mm2|m2|A\/m2|A\/cm2|cm\^2|mm\^2|m\^2|A\/m\^2)\b/gi, (match, coeff, unit, area) => {
    const c = coeff ? coeff : "";
    const cleanArea = area.replace(/2$/, "^2");
    return `${c}\\hat{${unit}} \\text{${cleanArea}}`;
  });

  // 4. Normalize unit vectors i, j, k (standalone or after +, -, =, or numbers) to \hat{i}, \hat{j}, \hat{k}
  processed = processed.replace(/(?<=[=+\-\s(]|^)(\d*)\s*([ijk])\b(?![a-zA-Z])/g, (match, coeff, unit) => {
    return (coeff ? coeff : "") + `\\hat{${unit}}`;
  });

  // 5. Normalize standalone physics vector variables (Z, J, E, B, F, A, v, a, p, r) when in vector context or equation
  const hasPhysicsContext = /\b(density|field|force|velocity|acceleration|momentum|vector|relation|current|area)\b/i.test(processed);
  const isEq = /[-+=<>]/.test(processed);

  if (hasPhysicsContext || isEq) {
    processed = processed.replace(/(?<=[=+\-\s(]|^)\b(Z|J|E|B|F|A|v|a|p|r)\b(?=\s*[-+=<>.]|\s+[i|j|k]|\s*\\hat|\s*\\vec|\s*$)/g, "\\vec{$1}");
    processed = processed.replace(/\b(Z|J|E|B|F)\s*=/g, "\\vec{$1} =");
  }

  // 6. Plain-text dot product (J . E) and cross product (J x E)
  processed = processed.replace(/(?<=\\vec{[a-zA-Z]}|\\hat{[a-zA-Z]}|[a-zA-Z])\s*[\.·∙⋅•]\s*(?=\\vec{[a-zA-Z]}|\\hat{[a-zA-Z]}|[a-zA-Z])/g, " \\cdot ");
  processed = processed.replace(/(?<=\\vec{[a-zA-Z]}|\\hat{[a-zA-Z]}|[a-zA-Z])\s+[xX×]\s+(?=\\vec{[a-zA-Z]}|\\hat{[a-zA-Z]}|[a-zA-Z])/g, " \\times ");

  // 7. Simple fractions like (1/f), 1/2, a/b, V/R, Q/V
  processed = processed.replace(/(?<=[=+\-\s(])([0-9a-zA-Z]+)\/([0-9a-zA-Z]+)(?=[=+\-\s).,;]|$)/g, "\\frac{$1}{$2}");

  // 8. Chemistry ionic charges & formula subscripts
  processed = processed.replace(/\b([A-Z][a-z]?)(?:_?(\d+))?\s*([2-9])?([+-])\b/g, (match, elem, sub, num, sign) => {
    const s = sub ? `_${sub}` : "";
    const n = num ? num : "";
    return `${elem}${s}^{${n}${sign}}`;
  });
  processed = processed.replace(/\b([A-Z][a-z]?)([2-9]|\d{2,})(?=[A-Z\s+=\-()]|$)/g, "$1_$2");
  processed = processed.replace(/\((NH4|SO4|NO3|CO3|PO4|OH)\)([2-9]|\d{2,})/g, "($1)_$2");
  processed = processed.replace(/<==>|<=>|<->/g, "\\rightleftharpoons ");
  processed = processed.replace(/-->|->|==>/g, "\\rightarrow ");

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
      (trimmed.startsWith("{{") && trimmed.endsWith("}}")) ||
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
  // - a placeholder: MATHPLACEHOLDER[A-Z]+
  // - a number: \d+(?:\.\d+)?
  // - a math operator or punctuation: [-+*/=<>()[\]{}^_.,&]
  // - double backslash for LaTeX line break: \\\\
  // - a single letter variable: (?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])
  // - a LaTeX command: \\[a-zA-Z*]+
  // - common math functions: sin, cos, tan, log, ln, lim, etc.
  // - a unicode math symbol: [\u2200-\u22FF\u2190-\u21FF]
  const mathTokenPattern = /(?:MATHPLACEHOLDER[A-Z]+|[\d\u0966-\u096F]+(?:\.[\d\u0966-\u096F]+)?|[-+*/=<>()[\]{}^_.,&]|\\\\|(?<![\p{L}\u0900-\u097F])[a-zA-Z](?![\p{L}\u0900-\u097F])|\\[a-zA-Z*]+|\b(?:cm|mm|km|um|μm|mA|mV|sec|Hz|Pa|mol|rad|deg|sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lim|max|min|sup|inf|det|dim|ker|arg|gcd|exp)\b|[\u2200-\u22FF\u2190-\u21FF\u0370-\u03FF\u2070-\u209F\u00B0\u00B1\u00B2\u00B3\u00B9\u00D7\u00F7\u00B5\u2100-\u214F\u2A00-\u2AFF\u27C0-\u27EF\u2980-\u29FF])/gu;

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

      // Skip option markers like "(a)", "(b)", "(c)", "(d)" or question numbers like "4." or Hindi "(क)" / "१."
      const sub = line.substring(index);
      const optionMatch = sub.match(/^(?:\([\d\u0966-\u096F\p{L}\u0900-\u097F]+\)|[\d\u0966-\u096F\p{L}\u0900-\u097F]+[.)])(?:\s+|$)/u);
      if (optionMatch) {
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
          currentSpan = null;
        }
        index += optionMatch[0].length;
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
    const originalMath = placeholders[i]; // e.g. "{{ \frac{a}{b} }}"
    const innerContent = originalMath.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");

    // If key is inside a newly created {{...}} block (e.g. "{{ y = MATHPLACEHOLDERA }}"),
    // unwrap the inner {{ }} so it becomes {{ y = \frac{a}{b} }} instead of {{ y = {{\frac{a}{b}}} }}
    const blockRegex = new RegExp(`\\{\\{([^}]*?)${key}([^}]*?)\\}\\}`, "g");
    if (blockRegex.test(processed)) {
      processed = processed.replace(blockRegex, (_, before, after) => {
        return `{{${before}${innerContent}${after}}}`;
      });
    }
    processed = processed.split(key).join(originalMath);
  }

  // Clean up any double/nested delimiters
  processed = processed.replace(/\{\{\s*\{\{/g, "{{").replace(/\}\}\s*\}\}/g, "}}");

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

  // Rule 0: Avoid option labels ((a), (b), (c), (d)) or question numbers (4.) or Hindi ((क), १.)
  if (/^\s*(?:\([\d\u0966-\u096F\p{L}\u0900-\u097F]+\)|[\d\u0966-\u096F\p{L}\u0900-\u097F]+[.)])\s*/u.test(trimmed)) return false;

  // If it contains MATHPLACEHOLDER, it's definitely a valid math span!
  if (/MATHPLACEHOLDER[A-Z]+/.test(trimmed)) return true;

  // Rule 1: If span contains non-math prose words (in English, Hindi, etc.), it's a sentence/phrase, NOT a math formula!
  if (containsProseWords(trimmed)) {
    return false;
  }

  // Rule 2: Must contain at least one characteristic math symbol/operator
  // (e.g. ^, _, \, +, -, =, *, /, <, >, &, or unicode symbols)
  const hasOperatorOrCommand = /(?:MATHPLACEHOLDER[A-Z]+|[\^_\\+\-=*/<>&|\u2200-\u22FF\u2190-\u21FF])/.test(trimmed);
  if (!hasOperatorOrCommand) return false;

  // Rule 3: If it has subscript '_', verify it's not a common programming snake_case name (like my_variable)
  if (trimmed.includes("_")) {
    if (/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      if (!/^[a-zA-Z]_[a-zA-Z0-9]+$/.test(trimmed) && !/^[a-zA-Z]_[{][a-zA-Z0-9]+[}]$/.test(trimmed)) {
        return false;
      }
    }
  }

  // Rule 4: Avoid wrapping single characters or simple lone operators
  if (tokens.length === 1) {
    const singleToken = tokens[0];
    if (!singleToken.startsWith("\\") && !singleToken.includes("^")) {
      return false;
    }
  }

  return true;
}
