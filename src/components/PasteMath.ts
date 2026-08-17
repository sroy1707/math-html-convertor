import { MathMLToLaTeX } from "mathml-to-latex";
import { isMathExpressionText, autoDetectMathInText, containsProseWords } from "./MathDetector";

const MATHML_NS = "http://www.w3.org/1998/Math/MathML";
const OMML_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";

const PROP_TAGS = new Set([
  "rpr", "nor", "ctrlpr", "dpr", "accpr", "narypr", "radpr",
  "barpr", "groupchrpr", "funcpr", "limlowpr", "limuppr",
  "ssubpr", "ssuppr", "ssubsuppr", "sprepr", "matrixpr", "eqarrpr",
  "begchr", "endchr", "sepchr", "chr", "pos", "basejc", "limloc",
  "length", "document", "intlim", "subhide", "suphide", "grow",
  "ctrlpr", "cc", "mtdpr",
]);

function localName(el: Element): string {
  const ln = el.localName.toLowerCase();
  const parts = ln.split(":");
  return parts[parts.length - 1];
}

function isMathMl(el: Element): boolean {
  if (el.namespaceURI === MATHML_NS && el.localName === "math") return true;
  const ln = localName(el);
  return ln === "math";
}

function isOml(el: Element): boolean {
  if (el.namespaceURI === OMML_NS) {
    return el.localName === "oMath" || el.localName === "oMathPara";
  }
  const ln = localName(el);
  return ln === "omath" || ln === "omathpara";
}

function _isEquationElement(el: Element): boolean {
  const className = (el.className || "").toString().toLowerCase();
  const id = (el.id || "").toLowerCase();
  const src = el.getAttribute("src") || "";
  const role = el.getAttribute("role") || "";

  if (
    className.includes("equation") ||
    className.includes("formula") ||
    className.includes("math") ||
    className.includes("latex") ||
    className.includes("katex") ||
    className.includes("mathjax") ||
    className.includes("omml") ||
    className.includes("mml")
  ) {
    return true;
  }

  if (
    id.includes("equation") ||
    id.includes("formula") ||
    id.includes("math")
  ) {
    return true;
  }

  if (src.includes("equation") || src.includes("formula") || src.includes("chart?cht=tx")) {
    return true;
  }

  if (role === "math" || role === "img") {
    const ariaLabel = el.getAttribute("aria-label") || "";
    if (ariaLabel && isMathExpressionText(ariaLabel)) return true;
  }

  // Check if element has data-mathml or similar attributes
  if (el.hasAttribute("data-mathml") || el.hasAttribute("data-latex") || el.hasAttribute("data-math")) {
    return true;
  }

  // Check closest ancestor
  try {
    const ancestor = el.closest('[class*="equation" i], [class*="formula" i], [class*="math" i], [class*="latex" i]');
    if (ancestor) return true;
  } catch {
    // CSS selector not supported, skip
  }

  return false;
}

function isMathElement(el: Element): boolean {
  return isMathMl(el) || isOml(el);
}

function child(el: Element, tag: string): Element | null {
  const lowerTag = tag.toLowerCase();
  for (const c of Array.from(el.children)) {
    if (localName(c) === lowerTag) return c;
  }
  return null;
}

function children(el: Element, tag: string): Element[] {
  const lowerTag = tag.toLowerCase();
  return Array.from(el.children).filter((c) => localName(c) === lowerTag);
}

function escapeBraces(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/[{}]/g, (m) => (m === "{" ? "\\{" : "\\}"));
}

function mapChildren(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replace(/\r?\n/g, " ");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      out += ommlToLatex(node as Element);
    }
    if (out.length > 40_000) return out;
  }
  return out;
}

const NARY_MAP: Record<string, string> = {
  "\u222B": "\\int",
  "\u222C": "\\iint",
  "\u222D": "\\iiint",
  "\u222E": "\\oint",
  "\u222F": "\\oiint",
  "\u2211": "\\sum",
  "\u220F": "\\prod",
  "\u22C3": "\\bigcup",
  "\u22C2": "\\bigcap",
  "\u22C1": "\\bigvee",
  "\u22C0": "\\bigwedge",
  "\u2295": "\\bigoplus",
  "\u2297": "\\bigotimes",
  "\u2A01": "\\bigoplus",
  "\u2A02": "\\bigotimes",
  "\u2294": "\\bigsqcup",
  "\u2A0F": "\\bigsqcap",
};

const ACCENT_MAP: Record<string, string> = {
  "\u0302": "hat",
  "\u0301": "acute",
  "\u0300": "grave",
  "\u0303": "tilde",
  "\u0304": "bar",
  "\u0305": "overline",
  "\u0306": "breve",
  "\u0307": "dot",
  "\u0308": "ddot",
  "\u030A": "mathring",
  "\u20D7": "vec",
  "\u20D6": "vec",
};

function escapeLeftRight(ch: string): string {
  if (ch === "{") return "\\{";
  if (ch === "}") return "\\}";
  return ch;
}

function ommlToLatex(el: Element): string {
  const tag = localName(el);
  switch (tag) {
    case "t":
      return escapeBraces(el.textContent ?? "");

    case "r":
    case "omath":
    case "omathpara":
      return mapChildren(el);

    case "f": {
      const num = child(el, "num");
      const den = child(el, "den");
      return `\\frac{${num ? ommlToLatex(num) : ""}}{${den ? ommlToLatex(den) : ""}}`;
    }

    case "ssup": {
      const base = child(el, "e");
      const sup = child(el, "sup");
      return `{${base ? ommlToLatex(base) : ""}}^{${sup ? ommlToLatex(sup) : ""}}`;
    }

    case "ssub": {
      const base = child(el, "e");
      const sub = child(el, "sub");
      return `{${base ? ommlToLatex(base) : ""}}_{${sub ? ommlToLatex(sub) : ""}}`;
    }

    case "ssubsupp": {
      const base = child(el, "e");
      const sub = child(el, "sub");
      const sup = child(el, "sup");
      return `{${base ? ommlToLatex(base) : ""}}_{${sub ? ommlToLatex(sub) : ""}}^{${sup ? ommlToLatex(sup) : ""}}`;
    }

    case "spre": {
      const sub = child(el, "sub");
      const sup = child(el, "sup");
      const e = child(el, "e");
      return `{}_{${sub ? ommlToLatex(sub) : ""}}^{${sup ? ommlToLatex(sup) : ""}}${e ? ommlToLatex(e) : ""}`;
    }

    case "d": {
      // Delimiter characters live in begChr/endChr/sepChr child elements.
      const pr = child(el, "dpr");
      const begEl = pr ? child(pr, "begchr") : null;
      const endEl = pr ? child(pr, "endchr") : null;
      const sepEl = pr ? child(pr, "sepchr") : null;
      const readVal = (elEl: Element | null, fallback: string): string =>
        elEl ? (elEl.getAttribute("m:val") ?? elEl.getAttribute("val") ?? fallback) : fallback;
      const begValue = readVal(begEl, "(");
      const endValue = readVal(endEl, ")");
      const sepValue = readVal(sepEl, "");
      const parts = children(el, "e").map((e) => ommlToLatex(e));
      const inner = parts.join(sepValue !== "" ? ` ${sepValue} ` : parts.length > 1 ? ", " : "");
      const left = begValue === "" ? "\\left." : `\\left${escapeLeftRight(begValue)}`;
      const right = endValue === "" ? "\\right." : `\\right${escapeLeftRight(endValue)}`;
      return `${left}${inner}${right}`;
    }

    case "rad": {
      const deg = child(el, "deg");
      const e = child(el, "e");
      const inner = e ? ommlToLatex(e) : "";
      const d = deg ? ommlToLatex(deg).trim() : "";
      if (!d || d === "2") return `\\sqrt{${inner}}`;
      return `\\sqrt[${d}]{${inner}}`;
    }

    case "nary": {
      const pr = child(el, "naryPr");
      const chr = pr ? (child(pr, "chr")?.getAttribute("m:val") ?? "\u222B") : "\u222B";
      const op = NARY_MAP[chr] ?? "\\int";
      const sub = child(el, "sub");
      const sup = child(el, "sup");
      const e = child(el, "e");
      const subL = sub ? `_{${ommlToLatex(sub)}}` : "";
      const supL = sup ? `^{${ommlToLatex(sup)}}` : "";
      return `${op}${subL}${supL} ${e ? ommlToLatex(e) : ""}`;
    }

    case "func": {
      const name = child(el, "fname");
      const e = child(el, "e");
      return `${name ? ommlToLatex(name) : ""}\\left(${e ? ommlToLatex(e) : ""}\\right)`;
    }

    case "limlow": {
      const e = child(el, "e");
      const lim = child(el, "lim");
      return `${e ? ommlToLatex(e) : ""}_{${lim ? ommlToLatex(lim) : ""}}`;
    }

    case "limupp": {
      const e = child(el, "e");
      const lim = child(el, "lim");
      return `${e ? ommlToLatex(e) : ""}^{${lim ? ommlToLatex(lim) : ""}}`;
    }

    case "acc": {
      const pr = child(el, "accpr");
      const chr = pr ? (child(pr, "chr")?.getAttribute("m:val") ?? "\u0302") : "\u0302";
      const e = child(el, "e");
      const inner = e ? ommlToLatex(e) : "";
      const cmd = ACCENT_MAP[chr] ?? "hat";
      return `\\${cmd}{${inner}}`;
    }

    case "bar": {
      const pr = child(el, "barpr");
      const pos = pr ? (child(pr, "pos")?.getAttribute("m:val") ?? "top") : "top";
      const e = child(el, "e");
      const inner = e ? ommlToLatex(e) : "";
      return pos === "bot" ? `\\underline{${inner}}` : `\\overline{${inner}}`;
    }

    case "groupchr": {
      const pr = child(el, "groupchrpr");
      const chr = pr ? (child(pr, "chr")?.getAttribute("m:val") ?? "\u23DE") : "\u23DE";
      const e = child(el, "e");
      const inner = e ? ommlToLatex(e) : "";
      return chr === "\u23DF" ? `\\underbrace{${inner}}` : `\\overbrace{${inner}}`;
    }

    case "matrix": {
      const rows = children(el, "m").map((r) =>
        children(r, "e").map((c) => ommlToLatex(c)).join(" & ")
      );
      return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
    }

    case "eqarr": {
      const rows = children(el, "e").map((e) =>
        ommlToLatex(e).replace(/\\left\.?\\?\{?/g, "").replace(/\\right\.?\\?}?/g, "")
      );
      return `\\begin{cases}${rows.join(" \\\\ ")}\\end{cases}`;
    }

    case "borderbox":
    case "box": {
      const e = child(el, "e");
      const inner = e ? ommlToLatex(e) : "";
      return `\\boxed{${inner}}`;
    }

    case "phant": {
      const e = child(el, "e");
      return e ? ommlToLatex(e) : "";
    }

    default:
      if (PROP_TAGS.has(tag)) return "";
      return mapChildren(el);
  }
}

function extractTexAnnotation(mathEl: Element): string | null {
  const annotations = mathEl.querySelectorAll("annotation");
  for (const a of Array.from(annotations)) {
    const enc = (a.getAttribute("encoding") || "").toLowerCase();
    if (enc === "application/x-tex" || enc === "application/x-latex") {
      const t = (a.textContent || "").trim();
      if (t) return t;
    }
  }
  return null;
}

function mathElementToLatex(el: Element): string {
  try {
    if (isMathMl(el)) {
      const annotation = extractTexAnnotation(el);
      if (annotation) return annotation;
      let latex = MathMLToLaTeX.convert(el.outerHTML);
      if (!latex.trim()) latex = (el.textContent || "").trim();
      return latex;
    }
    return ommlToLatex(el);
  } catch {
    return (el.textContent || "").trim();
  }
}

// ---------------------------------------------------------------------
// Google Docs fallback: no <math> element in the clipboard at all, just
// spans styled with a math font. Detect those and merge consecutive
// runs into one {{...}} block, converting <sup>/<sub> and common
// Unicode math symbols/letters along the way.
// ---------------------------------------------------------------------

const _MATH_FONT_REGEX =
  /cambria\s*math|stix|asana\s*math|latin\s*modern\s*math|xits\s*math|lucida\s*bright\s*math/i;

const UNICODE_MATH_LETTER_RANGES: Array<[number, number, number]> = [
  [0x1d434, 0x1d44d, 0x1d434 - 65], // Mathematical Italic Capital A-Z
  [0x1d44e, 0x1d467, 0x1d44e - 97], // Mathematical Italic Small a-z
  [0x1d400, 0x1d419, 0x1d400 - 65], // Mathematical Bold Capital A-Z
  [0x1d41a, 0x1d433, 0x1d41a - 97], // Mathematical Bold Small a-z
];

function _normalizeUnicodeMathLetters(text: string): string {
  return Array.from(text)
    .map((ch) => {
      const cp = ch.codePointAt(0);
      if (cp === undefined) return ch;
      for (const [start, end, offset] of UNICODE_MATH_LETTER_RANGES) {
        if (cp >= start && cp <= end) return String.fromCodePoint(cp - offset);
      }
      return ch;
    })
    .join("");
}

const SYMBOL_MAP: Array<[RegExp, string]> = [
  [/×/g, "\\times "],
  [/÷/g, "\\div "],
  [/→/g, "\\to "],
  [/←/g, "\\leftarrow "],
  [/⇒/g, "\\Rightarrow "],
  [/⇔/g, "\\Leftrightarrow "],
  [/↔/g, "\\leftrightarrow "],
  [/≤/g, "\\le "],
  [/≥/g, "\\ge "],
  [/≠/g, "\\ne "],
  [/±/g, "\\pm "],
  [/∓/g, "\\mp "],
  [/≈/g, "\\approx "],
  [/≡/g, "\\equiv "],
  [/∝/g, "\\propto "],
  [/√/g, "\\sqrt{}"],
  [/∛/g, "\\sqrt[3]{}"], // Cube root
  [/∜/g, "\\sqrt[4]{}"], // Fourth root
  [/π/g, "\\pi "],
  [/θ/g, "\\theta "],
  [/α/g, "\\alpha "],
  [/β/g, "\\beta "],
  [/γ/g, "\\gamma "],
  [/δ/g, "\\delta "],
  [/ε/g, "\\epsilon "],
  [/ζ/g, "\\zeta "],
  [/η/g, "\\eta "],
  [/ι/g, "\\iota "],
  [/κ/g, "\\kappa "],
  [/λ/g, "\\lambda "],
  [/μ/g, "\\mu "],
  [/nu/g, "\\nu "],
  [/ξ/g, "\\xi "],
  [/ρ/g, "\\rho "],
  [/σ/g, "\\sigma "],
  [/τ/g, "\\tau "],
  [/υ/g, "\\upsilon "],
  [/ϕ/g, "\\phi "],
  [/χ/g, "\\chi "],
  [/ψ/g, "\\psi "],
  [/ω/g, "\\omega "],
  [/Γ/g, "\\Gamma "],
  [/Δ/g, "\\Delta "],
  [/Θ/g, "\\Theta "],
  [/Λ/g, "\\Lambda "],
  [/Ξ/g, "\\Xi "],
  [/Π/g, "\\Pi "],
  [/Σ/g, "\\Sigma "],
  [/Υ/g, "\\Upsilon "],
  [/Φ/g, "\\Phi "],
  [/Ψ/g, "\\Psi "],
  [/Ω/g, "\\Omega "],
  [/∞/g, "\\infty "],
  [/∫/g, "\\int "],
  [/∬/g, "\\iint "],
  [/∭/g, "\\iiint "],
  [/∮/g, "\\oint "],
  [/∑/g, "\\sum "],
  [/∏/g, "\\prod "],
  [/∈/g, "\\in "],
  [/∉/g, "\\notin "],
  [/⊂/g, "\\subset "],
  [/⊆/g, "\\subseteq "],
  [/∪/g, "\\cup "],
  [/∩/g, "\\cap "],
  [/∀/g, "\\forall "],
  [/∃/g, "\\exists "],
  [/∇/g, "\\nabla "],
  [/°/g, "^\\circ "],
  [/…/g, "\\dots "],
  [/·/g, "\\cdot "],
  [/²/g, "^{2}"],
  [/³/g, "^{3}"],
  [/¹/g, "^{1}"],
  [/⁴/g, "^{4}"],
  [/⁵/g, "^{5}"],
  [/⁶/g, "^{6}"],
  [/⁷/g, "^{7}"],
  [/⁸/g, "^{8}"],
  [/⁹/g, "^{9}"],
  [/⁰/g, "^{0}"],
  [/⁻/g, "^{-}"],
  [/⁺/g, "^{+}"],
  [/₀/g, "_{0}"],
  [/₁/g, "_{1}"],
  [/₂/g, "_{2}"],
  [/₃/g, "_{3}"],
  [/₄/g, "_{4}"],
  [/₅/g, "_{5}"],
  [/₆/g, "_{6}"],
  [/₇/g, "_{7}"],
  [/₈/g, "_{8}"],
  [/₉/g, "_{9}"],
  [/Å/g, "\\angstrom "],
  [/ℏ/g, "\\hbar "],
  [/⇌/g, "\\rightleftharpoons "],
  [/∙/g, "\\cdot "],
  [/⋅/g, "\\cdot "],
];

function _applySymbolMap(text: string): string {
  let out = text;
  for (const [re, replacement] of SYMBOL_MAP) out = out.replace(re, replacement);
  return out;
}

function getFontFamily(el: Element): string | null {
  const style = el.getAttribute("style") || "";
  const match = style.match(/font-family:\s*'?([^;']+)'?/i);
  return match ? match[1] : null;
}

function _isMathFontElement(el: Element): boolean {
  if (el.tagName !== "SPAN") return false;
  const font = getFontFamily(el);
  return !!font && _MATH_FONT_REGEX.test(font);
}

const BLOCK_TAGS = new Set([
  "p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "ul", "ol", "section", "header", "footer", "article",
]);

function extractMathFromHtmlElement(el: Element): string | null {
  let result: string | null = null;

  if (isMathElement(el)) {
    result = mathElementToLatex(el);
  } else {
    // Check data-mathml attribute
    const dataMathml = el.getAttribute("data-mathml");
    if (dataMathml) {
      result = convertMathMLToLatex(dataMathml);
    } else {
      // Check data-latex, data-tex, or data-math attribute
      const dataLatex = el.getAttribute("data-latex") || el.getAttribute("data-tex") || el.getAttribute("data-math");
      if (dataLatex && dataLatex.trim()) {
        result = dataLatex.trim();
      } else {
        // Check for KaTeX/MathJax TeX annotation
        const annotation = el.querySelector("annotation[encoding*='tex'], annotation[encoding*='TeX']");
        if (annotation && annotation.textContent?.trim()) {
          result = annotation.textContent.trim();
        } else {
          // Check for Google Docs equation element or role="math"
          const role = el.getAttribute("role") || "";
          const className = (el.className || "").toString().toLowerCase();
          if (role === "math" || className.includes("kix-equation") || className.includes("math-equation")) {
            const ariaLabel = el.getAttribute("aria-label") || el.getAttribute("title") || "";
            if (ariaLabel && ariaLabel.trim()) {
              result = ariaLabel.trim();
            }
          } else if (el.tagName.toLowerCase() === "img") {
            const alt = el.getAttribute("alt") || el.getAttribute("aria-label") || "";
            const imgDataLatex = el.getAttribute("data-latex") || el.getAttribute("data-tex") || "";
            if (imgDataLatex) {
              result = imgDataLatex.trim();
            } else if (alt.startsWith("\\") || alt.includes("=") || alt.includes("^") || alt.includes("_") || isMathExpressionText(alt)) {
              result = alt.trim();
            }
          } else {
            const font = getFontFamily(el);
            if (font && _MATH_FONT_REGEX.test(font)) {
              const text = el.textContent || "";
              if (text.trim()) result = text.trim();
            }
          }
        }
      }
    }
  }

  if (result) {
    const cleaned = result.replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "").trim();
    if (!isMathElement(el) && containsProseWords(cleaned)) {
      return null;
    }
    return cleaned;
  }

  return null;
}

function clipboardMathToLatexText(html: string, _plainText: string = ""): string | null {
  if (html) {
    let doc: Document | null = null;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch {
      doc = null;
    }

    if (doc && doc.body) {
      const out: string[] = [];

      const walk = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const tag = el.tagName.toLowerCase();
          if (tag === "br") {
            if (out.length > 0 && out[out.length - 1] !== "\n") out.push("\n");
            return;
          }
          const extractedLatex = extractMathFromHtmlElement(el);
          if (extractedLatex) {
            out.push(`{{${extractedLatex.trim()}}}`);
            return;
          }
          if (BLOCK_TAGS.has(tag)) {
            if (out.length > 0 && out[out.length - 1] !== "\n") out.push("\n");
            for (const child of Array.from(node.childNodes)) walk(child);
            if (out.length > 0 && out[out.length - 1] !== "\n") out.push("\n");
            return;
          }
          for (const child of Array.from(node.childNodes)) walk(child);
          return;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          out.push(node.textContent ?? "");
          return;
        }
      };

      walk(doc.body);
      const combined = out.join("");
      if (combined.trim()) {
        return autoDetectMathInText(combined);
      }
    }
  }

  // Fallback for plain text
  const textToProcess = _plainText || "";
  if (textToProcess.trim()) {
    return autoDetectMathInText(textToProcess);
  }

  return null;
}

export function convertMathMLToLatex(xmlStr: string): string | null {
  try {
    const trimmed = xmlStr.trim();
    if (!trimmed.includes("<math") && !trimmed.includes("<mml:math")) {
      return null;
    }
    
    // Parse using DOMParser to see if we can extract any embedded LaTeX annotation first
    const doc = new DOMParser().parseFromString(trimmed, "text/html");
    const mathEl = doc.querySelector("math, mml\\:math");
    if (mathEl) {
      const annotation = extractTexAnnotation(mathEl);
      if (annotation) return annotation;
    }
    
    const converted = MathMLToLaTeX.convert(trimmed);
    if (converted && converted.trim()) {
      return converted.trim();
    }
  } catch (err) {
    console.error("Failed to convert MathML string to LaTeX:", err);
  }
  return null;
}

export { clipboardMathToLatexText };
