import { Token, tokenize } from "./MathTokenizer";
import {
  greekLetters,
  symbols,
  delimiterMap,
  matrixDelimiters,
  decoratorMap,
  mathVariantMap,
} from "./MathSymbols";

class Parser {
  private tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

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

    const tableRows = rows.map(cols =>
      `<mtr>${cols.map(c => `<mtd>${c || ""}</mtd>`).join("")}</mtr>`
    ).join("");

    if (envName === "cases") {
      return `<mrow><mo>{</mo><mtable columnalign="left left">${tableRows}</mtable></mrow>`;
    }

    const delims = matrixDelimiters[envName];
    const table = `<mtable>${tableRows}</mtable>`;
    if (delims) {
      return `<mrow><mo>${delims[0]}</mo>${table}<mo>${delims[1]}</mo></mrow>`;
    }
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

      if (cmd === "\\frac" || cmd === "\\fract" || cmd === "\\fraction" || cmd === "\\dfrac" || cmd === "\\tfrac" || cmd === "\\cfrac") {
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

      if (cmd === "\\sqrt" || cmd === "\\sqr") {
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

      if (cmd in decoratorMap) {
        const content = this.parseGroupOrPrimary();
        const { tag, char, stretchy } = decoratorMap[cmd];
        const stretchAttr = stretchy !== undefined ? ` stretchy="${stretchy}"` : "";
        return `<${tag}>${content}<mo${stretchAttr}>${char}</mo></${tag}>`;
      }

      if (cmd in mathVariantMap) {
        const content = this.parseGroupOrPrimary();
        const stripped = content.replace(/<[^>]*>/g, "");
        if (cmd === "\\mathbb") {
          const bbMap: Record<string, string> = {
            N: "\u2115", Z: "\u2124", Q: "\u211A", R: "\u211D", C: "\u2102",
            P: "\u2119", H: "\u210D", A: "\uD835\uDD38",
          };
          if (bbMap[stripped]) return `<mi>${bbMap[stripped]}</mi>`;
        }
        return `<mi mathvariant="${mathVariantMap[cmd]}">${stripped}</mi>`;
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
          const dval = this.consume().value;
          if (dval in delimiterMap) {
            const mapped = delimiterMap[dval];
            return mapped ? `<mo>${mapped}</mo>` : "";
          }
          return `<mo>${dval === "<" ? "&lt;" : dval === ">" ? "&gt;" : dval}</mo>`;
        }
        return "";
      }

      if (cmd === "\\boxed") {
        const content = this.parseGroupOrPrimary();
        return `<mrow style="border: 1px solid currentColor; padding: 2px 4px; display: inline-block;">${content}</mrow>`;
      }

      if (cmd === "\\ce") {
        const content = this.parseGroupOrPrimary();
        return `<mrow>${content}</mrow>`;
      }

      if (cmd === "\\mathrm" || cmd === "\\mbox" || cmd === "\\operatorname" || cmd === "\\textbf" || cmd === "\\textit") {
        const content = this.parseGroupOrPrimary();
        const stripped = content.replace(/<[^>]*>/g, "");
        return `<mtext>${stripped}</mtext>`;
      }

      if (cmd === "\\mathring") {
        const content = this.parseGroupOrPrimary();
        return `<mover>${content}<mo>&#x030A;</mo></mover>`;
      }

      if (cmd === "\\angstrom") {
        return `<mi>&#x212B;</mi>`;
      }

      if (cmd === "\\degree") {
        return `<mo>&#x00B0;</mo>`;
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
    if (greekLetters[cmd]) return `<mi>${greekLetters[cmd]}</mi>`;

    if (symbols[cmd]) {
      const item = symbols[cmd];
      return `<${item.tag}>${item.val}</${item.tag}>`;
    }

    const name = cmd.replace("\\", "");
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

