interface Token {
  type:
    | "COMMAND"
    | "GROUP_START"
    | "GROUP_END"
    | "INDEX_START"
    | "INDEX_END"
    | "SUPER"
    | "SUB"
    | "NUMBER"
    | "OPERATOR"
    | "CHAR"
    | "TEXT_LITERAL"
    | "AMPERSAND"
    | "EOF";
  value: string;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "\\") {
      let word = "\\";
      i++;
      while (i < input.length && /[a-zA-Z*]/.test(input[i])) {
        word += input[i];
        i++;
      }
      // Special case: \text{...} literal content
      if (word === "\\text") {
        while (i < input.length && /\s/.test(input[i])) {
          i++;
        }
        if (i < input.length && input[i] === "{") {
          i++;
          let textVal = "";
          let braceCount = 1;
          while (i < input.length && braceCount > 0) {
            const nextChar = input[i];
            if (nextChar === "{") braceCount++;
            else if (nextChar === "}") braceCount--;
            if (braceCount > 0) {
              textVal += nextChar;
              i++;
            }
          }
          if (i < input.length && input[i] === "}") {
            i++;
          }
          tokens.push({ type: "TEXT_LITERAL", value: textVal });
          continue;
        }
      }
      tokens.push({ type: "COMMAND", value: word });
      continue;
    }
    if (char === "{") { tokens.push({ type: "GROUP_START", value: "{" }); i++; continue; }
    if (char === "}") { tokens.push({ type: "GROUP_END", value: "}" }); i++; continue; }
    if (char === "[") { tokens.push({ type: "INDEX_START", value: "[" }); i++; continue; }
    if (char === "]") { tokens.push({ type: "INDEX_END", value: "]" }); i++; continue; }
    if (char === "^") { tokens.push({ type: "SUPER", value: "^" }); i++; continue; }
    if (char === "_") { tokens.push({ type: "SUB", value: "_" }); i++; continue; }
    if (char === "&") { tokens.push({ type: "AMPERSAND", value: "&" }); i++; continue; }
    if (/\d/.test(char)) {
      let num = char; i++;
      while (i < input.length && /[\d.]/.test(input[i])) { num += input[i]; i++; }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }
    if (/[\+\-\=\<\>\/\*()!:,.;|']/.test(char)) {
      tokens.push({ type: "OPERATOR", value: char }); i++; continue;
    }
    tokens.push({ type: "CHAR", value: char });
    i++;
  }
  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.index]; }

  private consume(): Token {
    const t = this.tokens[this.index];
    if (t.type !== "EOF") this.index++;
    return t;
  }

  public parseExpression(stopAtAmp = false): string {
    const children: string[] = [];
    while (
      this.peek().type !== "EOF" &&
      this.peek().type !== "GROUP_END" &&
      this.peek().type !== "INDEX_END"
    ) {
      if (stopAtAmp && this.peek().type === "AMPERSAND") break;
      if (stopAtAmp && this.peek().type === "COMMAND" && this.peek().value === "\\") break;
      if (stopAtAmp && this.peek().type === "COMMAND" && this.peek().value === "\\end") break;
      const node = this.parseTerm();
      if (node) children.push(node);
    }
    if (children.length === 0) return "";
    if (children.length === 1) return children[0];
    return `<mrow>${children.join("")}</mrow>`;
  }

  private parseTerm(): string {
    let base = this.parsePrimary();
    if (!base) return "";
    while (this.peek().type === "SUB" || this.peek().type === "SUPER") {
      const type = this.consume().type;
      if (type === "SUB") {
        const subContent = this.parseGroupOrPrimary();
        if (this.peek().type === "SUPER") {
          this.consume();
          const supContent = this.parseGroupOrPrimary();
          base = this.makeSubSup(base, subContent, supContent);
        } else {
          base = this.makeSub(base, subContent);
        }
      } else {
        const supContent = this.parseGroupOrPrimary();
        if (this.peek().type === "SUB") {
          this.consume();
          const subContent = this.parseGroupOrPrimary();
          base = this.makeSubSup(base, subContent, supContent);
        } else {
          base = this.makeSup(base, supContent);
        }
      }
    }
    return base;
  }

  private parseGroupOrPrimary(): string {
    const next = this.peek();
    if (next.type === "GROUP_START") {
      this.consume();
      const expr = this.parseExpression();
      if (this.peek().type === "GROUP_END") this.consume();
      if (!expr || expr.trim() === "") return `<mtext class="math-placeholder">&#9633;</mtext>`;
      return expr;
    }
    const prim = this.parsePrimary();
    if (!prim || prim.trim() === "") return `<mtext class="math-placeholder">&#9633;</mtext>`;
    return prim;
  }

  private parseMatrix(envName: string): string {
    const rows: string[][] = [];
    let currentRow: string[] = [];

    while (this.peek().type !== "EOF") {
      const tok = this.peek();
      if (tok.type === "COMMAND" && tok.value === "\\end") {
        this.consume();
        if (this.peek().type === "GROUP_START") {
          this.consume();
          while (this.peek().type !== "GROUP_END" && this.peek().type !== "EOF") this.consume();
          if (this.peek().type === "GROUP_END") this.consume();
        }
        break;
      }
      if (tok.type === "COMMAND" && tok.value === "\\") {
        this.consume();
        if (this.peek().type === "COMMAND" && this.peek().value === "\\") this.consume();
        rows.push(currentRow);
        currentRow = [];
        continue;
      }
      if (tok.type === "AMPERSAND") {
        this.consume();
        continue;
      }
      const cell = this.parseExpression(true);
      currentRow.push(cell);
    }
    if (currentRow.length > 0) rows.push(currentRow);

    let openDelim = "", closeDelim = "";
    if (envName === "pmatrix") { openDelim = "("; closeDelim = ")"; }
    else if (envName === "bmatrix") { openDelim = "["; closeDelim = "]"; }
    else if (envName === "Bmatrix") { openDelim = "{"; closeDelim = "}"; }
    else if (envName === "vmatrix") { openDelim = "|"; closeDelim = "|"; }
    else if (envName === "Vmatrix") { openDelim = "\u2016"; closeDelim = "\u2016"; }
    else if (envName === "cases") {
      const tableRows = rows.map(cols =>
        `<mtr>${cols.map(c => `<mtd>${c || ""}</mtd>`).join("")}</mtr>`
      ).join("");
      return `<mrow><mo>{</mo><mtable columnalign="left left">${tableRows}</mtable></mrow>`;
    }

    const tableRows = rows.map(cols =>
      `<mtr>${cols.map(c => `<mtd>${c || ""}</mtd>`).join("")}</mtr>`
    ).join("");
    const table = `<mtable>${tableRows}</mtable>`;
    if (openDelim) return `<mrow><mo>${openDelim}</mo>${table}<mo>${closeDelim}</mo></mrow>`;
    return `<mrow>${table}</mrow>`;
  }

  private parsePrimary(): string {
    const token = this.peek();
    if (token.type === "EOF") return "";

    if (token.type === "GROUP_START") {
      this.consume();
      const expr = this.parseExpression();
      if (this.peek().type === "GROUP_END") this.consume();
      return expr;
    }

    this.consume();

    if (token.type === "NUMBER") return `<mn>${token.value}</mn>`;
    if (token.type === "CHAR") return `<mi>${token.value}</mi>`;
    if (token.type === "TEXT_LITERAL") return `<mtext>${token.value}</mtext>`;
    if (token.type === "OPERATOR") {
      let val = token.value;
      if (val === "<") val = "&lt;";
      if (val === ">") val = "&gt;";
      return `<mo>${val}</mo>`;
    }

    if (token.type === "COMMAND") {
      const cmd = token.value;

      if (cmd === "\\frac") {
        const num = this.parseGroupOrPrimary();
        const den = this.parseGroupOrPrimary();
        return `<mfrac>${num}${den}</mfrac>`;
      }

      if (cmd === "\\chemfig") {
        const content = this.parseGroupOrPrimary();
        const stripped = content.replace(/<[^>]*>/g, "").trim();
        if (stripped.includes("*6") || stripped.includes("**6")) {
          return `<mrow><mi>⌬</mi><mo>(</mo>${content}<mo>)</mo></mrow>`;
        }
        return `<mrow><mtext>ChemFig</mtext><mo>(</mo>${content}<mo>)</mo></mrow>`;
      }

      if (cmd === "\\sqrt") {
        if (this.peek().type === "INDEX_START") {
          this.consume();
          const indexExpr = this.parseExpression();
          if (this.peek().type === "INDEX_END") this.consume();
          const content = this.parseGroupOrPrimary();
          return `<mroot>${content}${indexExpr}</mroot>`;
        } else {
          const content = this.parseGroupOrPrimary();
          return `<msqrt>${content}</msqrt>`;
        }
      }

      if (cmd === "\\binom" || cmd === "\\dbinom" || cmd === "\\tbinom") {
        const top = this.parseGroupOrPrimary();
        const bot = this.parseGroupOrPrimary();
        return `<mrow><mo>(</mo><mfrac linethickness="0">${top}${bot}</mfrac><mo>)</mo></mrow>`;
      }

      if (cmd === "\\vec") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo stretchy="false">&#x2192;</mo></mover>`;
      }

      if (cmd === "\\hat") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo stretchy="false">^</mo></mover>`;
      }

      if (cmd === "\\overline") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo stretchy="true">&#x00AF;</mo></mover>`;
      }

      if (cmd === "\\underline") {
        const content = this.parseGroupOrPrimary();
        return `<munder>${content}<mo stretchy="true">_</mo></munder>`;
      }

      if (cmd === "\\bar") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo>&#x00AF;</mo></mover>`;
      }

      if (cmd === "\\tilde") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo>~</mo></mover>`;
      }

      if (cmd === "\\dot") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo>.</mo></mover>`;
      }

      if (cmd === "\\ddot") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo>..</mo></mover>`;
      }

      if (cmd === "\\overrightarrow") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo stretchy="true">&#x2192;</mo></mover>`;
      }

      if (cmd === "\\underbrace") {
        const content = this.parseGroupOrPrimary();
        return `<munder>${content}<mo stretchy="true">&#x23DF;</mo></munder>`;
      }

      if (cmd === "\\overbrace") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo stretchy="true">&#x23DE;</mo></mover>`;
      }

      if (cmd === "\\mathbb") {
        const content = this.parseGroupOrPrimary();
        const bbMap: Record<string, string> = {
          N: "\u2115", Z: "\u2124", Q: "\u211A", R: "\u211D", C: "\u2102",
          P: "\u2119", H: "\u210D", A: "\uD835\uDD38",
        };
        const stripped = content.replace(/<[^>]*>/g, "");
        if (bbMap[stripped]) return `<mi>${bbMap[stripped]}</mi>`;
        return `<mi mathvariant="double-struck">${stripped}</mi>`;
      }

      if (cmd === "\\mathcal") {
        const content = this.parseGroupOrPrimary();
        const stripped = content.replace(/<[^>]*>/g, "");
        return `<mi mathvariant="script">${stripped}</mi>`;
      }

      if (cmd === "\\mathbf") {
        const content = this.parseGroupOrPrimary();
        const stripped = content.replace(/<[^>]*>/g, "");
        return `<mi mathvariant="bold">${stripped}</mi>`;
      }

      if (cmd === "\\begin") {
        let envName = "";
        if (this.peek().type === "GROUP_START") {
          this.consume();
          while (this.peek().type !== "GROUP_END" && this.peek().type !== "EOF") {
            envName += this.consume().value;
          }
          if (this.peek().type === "GROUP_END") this.consume();
        }
        return this.parseMatrix(envName);
      }

      if (cmd === "\\lfloor") return `<mo>&#x230A;</mo>`;
      if (cmd === "\\rfloor") return `<mo>&#x230B;</mo>`;
      if (cmd === "\\lceil") return `<mo>&#x2308;</mo>`;
      if (cmd === "\\rceil") return `<mo>&#x2309;</mo>`;
      if (cmd === "\\langle") return `<mo>&#x27E8;</mo>`;
      if (cmd === "\\rangle") return `<mo>&#x27E9;</mo>`;
      if (cmd === "\\vert" || cmd === "\\|") return `<mo>|</mo>`;

      if (cmd === "\\left" || cmd === "\\right") {
        if (this.peek().type !== "EOF") {
          const delim = this.consume();
          const dval = delim.value;
          if (dval === "\\lfloor") return `<mo>&#x230A;</mo>`;
          if (dval === "\\rfloor") return `<mo>&#x230B;</mo>`;
          if (dval === "\\lceil") return `<mo>&#x2308;</mo>`;
          if (dval === "\\rceil") return `<mo>&#x2309;</mo>`;
          if (dval === "\\langle") return `<mo>&#x27E8;</mo>`;
          if (dval === "\\rangle") return `<mo>&#x27E9;</mo>`;
          if (dval === ".") return "";
          return `<mo>${dval === "<" ? "&lt;" : dval === ">" ? "&gt;" : dval}</mo>`;
        }
        return "";
      }

      if (cmd === "\\xrightarrow") {
        const content = this.parseGroupOrPrimary();
        return `<mover><mo stretchy="true">&#x2192;</mo>${content}</mover>`;
      }

      return this.mapCommandToMathML(cmd);
    }

    return "";
  }

  private makeSub(base: string, sub: string): string {
    return this.isLargeOperator(base) ? `<munder>${base}${sub}</munder>` : `<msub>${base}${sub}</msub>`;
  }

  private makeSup(base: string, sup: string): string {
    return this.isLargeOperator(base) ? `<mover>${base}${sup}</mover>` : `<msup>${base}${sup}</msup>`;
  }

  private makeSubSup(base: string, sub: string, sup: string): string {
    return this.isLargeOperator(base) ? `<munderover>${base}${sub}${sup}</munderover>` : `<msubsup>${base}${sub}${sup}</msubsup>`;
  }

  private isLargeOperator(mathml: string): boolean {
    return /[∑∫∬∭∮∏]/.test(mathml);
  }

  private mapCommandToMathML(cmd: string): string {
    const greekLetters: Record<string, string> = {
      "\\alpha": "α", "\\beta": "β", "\\gamma": "γ",
      "\\delta": "δ", "\\epsilon": "ε", "\\varepsilon": "ε",
      "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ",
      "\\vartheta": "ϑ", "\\iota": "ι", "\\kappa": "κ",
      "\\lambda": "λ", "\\mu": "μ", "\\nu": "ν",
      "\\xi": "ξ", "\\pi": "π", "\\varpi": "ϖ",
      "\\rho": "ρ", "\\varrho": "ϱ", "\\sigma": "σ",
      "\\varsigma": "ς", "\\tau": "τ", "\\upsilon": "υ",
      "\\phi": "φ", "\\varphi": "φ", "\\chi": "χ",
      "\\psi": "ψ", "\\omega": "ω",
      "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ",
      "\\Lambda": "Λ", "\\Xi": "Ξ", "\\Pi": "Π",
      "\\Sigma": "Σ", "\\Upsilon": "Υ", "\\Phi": "Φ",
      "\\Psi": "Ψ", "\\Omega": "Ω",
    };

    const symbols: Record<string, { val: string; tag: "mo" | "mi" }> = {
      "\\pm": { val: "±", tag: "mo" },
      "\\mp": { val: "∓", tag: "mo" },
      "\\times": { val: "×", tag: "mo" },
      "\\div": { val: "÷", tag: "mo" },
      "\\cdot": { val: "·", tag: "mo" },
      "\\cdots": { val: "⋯", tag: "mo" },
      "\\ldots": { val: "…", tag: "mo" },
      "\\vdots": { val: "⋮", tag: "mo" },
      "\\ddots": { val: "⋱", tag: "mo" },
      "\\neq": { val: "≠", tag: "mo" },
      "\\ne": { val: "≠", tag: "mo" },
      "\\approx": { val: "≈", tag: "mo" },
      "\\le": { val: "≤", tag: "mo" },
      "\\leq": { val: "≤", tag: "mo" },
      "\\ge": { val: "≥", tag: "mo" },
      "\\geq": { val: "≥", tag: "mo" },
      "\\ll": { val: "≪", tag: "mo" },
      "\\gg": { val: "≫", tag: "mo" },
      "\\equiv": { val: "≡", tag: "mo" },
      "\\sim": { val: "~", tag: "mo" },
      "\\simeq": { val: "≃", tag: "mo" },
      "\\cong": { val: "≅", tag: "mo" },
      "\\propto": { val: "∝", tag: "mo" },
      "\\infty": { val: "∞", tag: "mi" },
      "\\partial": { val: "∂", tag: "mi" },
      "\\nabla": { val: "∇", tag: "mi" },
      "\\sum": { val: "∑", tag: "mo" },
      "\\int": { val: "∫", tag: "mo" },
      "\\iint": { val: "∬", tag: "mo" },
      "\\iiint": { val: "∭", tag: "mo" },
      "\\oint": { val: "∮", tag: "mo" },
      "\\prod": { val: "∏", tag: "mo" },
      "\\sin": { val: "sin", tag: "mi" },
      "\\cos": { val: "cos", tag: "mi" },
      "\\tan": { val: "tan", tag: "mi" },
      "\\csc": { val: "csc", tag: "mi" },
      "\\sec": { val: "sec", tag: "mi" },
      "\\cot": { val: "cot", tag: "mi" },
      "\\arcsin": { val: "arcsin", tag: "mi" },
      "\\arccos": { val: "arccos", tag: "mi" },
      "\\arctan": { val: "arctan", tag: "mi" },
      "\\sinh": { val: "sinh", tag: "mi" },
      "\\cosh": { val: "cosh", tag: "mi" },
      "\\tanh": { val: "tanh", tag: "mi" },
      "\\coth": { val: "coth", tag: "mi" },
      "\\log": { val: "log", tag: "mi" },
      "\\ln": { val: "ln", tag: "mi" },
      "\\exp": { val: "exp", tag: "mi" },
      "\\lim": { val: "lim", tag: "mo" },
      "\\max": { val: "max", tag: "mi" },
      "\\min": { val: "min", tag: "mi" },
      "\\sup": { val: "sup", tag: "mi" },
      "\\inf": { val: "inf", tag: "mi" },
      "\\det": { val: "det", tag: "mi" },
      "\\gcd": { val: "gcd", tag: "mi" },
      "\\deg": { val: "deg", tag: "mi" },
      "\\dim": { val: "dim", tag: "mi" },
      "\\ker": { val: "ker", tag: "mi" },
      "\\Pr": { val: "Pr", tag: "mi" },
      "\\arg": { val: "arg", tag: "mi" },
      "\\mod": { val: "mod", tag: "mo" },
      "\\forall": { val: "∀", tag: "mo" },
      "\\exists": { val: "∃", tag: "mo" },
      "\\nexists": { val: "∄", tag: "mo" },
      "\\neg": { val: "¬", tag: "mo" },
      "\\lnot": { val: "¬", tag: "mo" },
      "\\land": { val: "∧", tag: "mo" },
      "\\wedge": { val: "∧", tag: "mo" },
      "\\lor": { val: "∨", tag: "mo" },
      "\\vee": { val: "∨", tag: "mo" },
      "\\oplus": { val: "⊕", tag: "mo" },
      "\\otimes": { val: "⊗", tag: "mo" },
      "\\vdash": { val: "⊢", tag: "mo" },
      "\\models": { val: "⊨", tag: "mo" },
      "\\because": { val: "∵", tag: "mo" },
      "\\therefore": { val: "∴", tag: "mo" },
      "\\rightarrow": { val: "→", tag: "mo" },
      "\\leftarrow": { val: "←", tag: "mo" },
      "\\leftrightarrow": { val: "↔", tag: "mo" },
      "\\Rightarrow": { val: "⇒", tag: "mo" },
      "\\Leftarrow": { val: "⇐", tag: "mo" },
      "\\Leftrightarrow": { val: "⇔", tag: "mo" },
      "\\longrightarrow": { val: "⟶", tag: "mo" },
      "\\longleftarrow": { val: "⟵", tag: "mo" },
      "\\Longrightarrow": { val: "⟹", tag: "mo" },
      "\\Longleftrightarrow": { val: "⟺", tag: "mo" },
      "\\to": { val: "→", tag: "mo" },
      "\\gets": { val: "←", tag: "mo" },
      "\\mapsto": { val: "↦", tag: "mo" },
      "\\hookrightarrow": { val: "↪", tag: "mo" },
      "\\uparrow": { val: "↑", tag: "mo" },
      "\\downarrow": { val: "↓", tag: "mo" },
      "\\nearrow": { val: "↗", tag: "mo" },
      "\\searrow": { val: "↘", tag: "mo" },
      "\\rightleftharpoons": { val: "⇌", tag: "mo" },
      "\\leftharpoonup": { val: "↼", tag: "mo" },
      "\\rightharpoonup": { val: "⇀", tag: "mo" },
      "\\in": { val: "∈", tag: "mo" },
      "\\notin": { val: "∉", tag: "mo" },
      "\\ni": { val: "∋", tag: "mo" },
      "\\subset": { val: "⊂", tag: "mo" },
      "\\supset": { val: "⊃", tag: "mo" },
      "\\subseteq": { val: "⊆", tag: "mo" },
      "\\supseteq": { val: "⊇", tag: "mo" },
      "\\nsubseteq": { val: "⊄", tag: "mo" },
      "\\cap": { val: "∩", tag: "mo" },
      "\\cup": { val: "∪", tag: "mo" },
      "\\emptyset": { val: "∅", tag: "mi" },
      "\\varnothing": { val: "∅", tag: "mi" },
      "\\setminus": { val: "∖", tag: "mo" },
      "\\mid": { val: "|", tag: "mo" },
      "\\nmid": { val: "∤", tag: "mo" },
      "\\angle": { val: "∠", tag: "mo" },
      "\\perp": { val: "⊥", tag: "mo" },
      "\\parallel": { val: "∥", tag: "mo" },
      "\\triangle": { val: "△", tag: "mi" },
      "\\square": { val: "□", tag: "mi" },
      "\\circ": { val: "∘", tag: "mo" },
      "\\hbar": { val: "ℏ", tag: "mi" },
      "\\ell": { val: "ℓ", tag: "mi" },
      "\\dagger": { val: "†", tag: "mo" },
      "\\ddagger": { val: "‡", tag: "mo" },
      "\\star": { val: "⋆", tag: "mo" },
      "\\bullet": { val: "•", tag: "mo" },
      "\\prime": { val: "′", tag: "mo" },
      "\\aleph": { val: "ℵ", tag: "mi" },
      "\\Re": { val: "ℜ", tag: "mi" },
      "\\Im": { val: "ℑ", tag: "mi" },
    };

    if (greekLetters[cmd]) return `<mi>${greekLetters[cmd]}</mi>`;

    if (symbols[cmd]) {
      const item = symbols[cmd];
      // Multi-char <mi> is upright by default in MathML — no mathvariant needed
      return `<${item.tag}>${item.val}</${item.tag}>`;
    }

    const name = cmd.replace("\\", "");
    if (name === "iff") return `<mo>⇔</mo>`;
    if (name === "implies") return `<mo>⇒</mo>`;
    if (name === "rightarrow") return `<mo>→</mo>`;
    if (name === "leftarrow") return `<mo>←</mo>`;
    if (name === "cap") return `<mo>∩</mo>`;
    if (name === "cup") return `<mo>∪</mo>`;
    if (name === "subset") return `<mo>⊂</mo>`;
    if (name === "subseteq") return `<mo>⊆</mo>`;
    if (name === "in") return `<mo>∈</mo>`;
    if (name === "notin") return `<mo>∉</mo>`;
    if (name === "circ") return `<mo>∘</mo>`;
    if (name === "forall") return `<mo>∀</mo>`;
    if (name === "exists") return `<mo>∃</mo>`;
    if (name === "because") return `<mo>∵</mo>`;
    if (name === "therefore") return `<mo>∴</mo>`;

    return `<mi>${name}</mi>`;
  }
}

export function latexToMathML(latex: string): string {
  if (!latex || latex.trim() === "") {
    return `<math display="inline"><mtext>Equation</mtext></math>`;
  }
  try {
    const tokens = tokenize(latex);
    const parser = new Parser(tokens);
    const mathml = parser.parseExpression();
    return `<math display="inline">${mathml}</math>`;
  } catch (err) {
    console.error(err);
    return `<span style="color:red; font-size: 0.9em;">Syntax Error</span>`;
  }
}
