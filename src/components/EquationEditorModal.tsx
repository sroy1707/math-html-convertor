"use client";

import { useEffect, useRef, useState } from "react";
import { latexToMathML } from "./MathParser";

interface EquationEditorModalProps {
  isOpen: boolean;
  initialLatex: string;
  onClose: () => void;
  onSave: (latex: string, mathml: string) => void;
}

export default function EquationEditorModal({
  isOpen,
  initialLatex,
  onClose,
  onSave,
}: EquationEditorModalProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [activeTab, setActiveTab] = useState<
    "structures" | "greek" | "operators" | "functions" | "physics" |
    "chemistry" | "vectors" | "logic" | "arrows" | "geometry" | "sets" | "accents" |
    "calculus" | "statistics" | "matrices"
  >("structures");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setLatex(initialLatex);
      // Autofocus textarea when modal opens
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(initialLatex.length, initialLatex.length);
        }
      }, 50);
    }
  }, [isOpen, initialLatex]);

  if (!isOpen) return null;

  const insertAtCursor = (templateLatex: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setLatex((prev) => prev + templateLatex);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selectedText = currentVal.substring(start, end);

    let textToInsert = templateLatex;
    let selectStartOffset = 0;
    let selectLength = 0;

    // Check templates and define select offsets
    if (templateLatex === "\\frac{}{}") {
      if (selectedText) {
        textToInsert = `\\frac{${selectedText}}{den}`;
        selectStartOffset = `\\frac{${selectedText}}{`.length;
        selectLength = 3; // 'den'
      } else {
        textToInsert = "\\frac{num}{den}";
        selectStartOffset = "\\frac{".length;
        selectLength = 3; // 'num'
      }
    } else if (templateLatex === "^{}") {
      if (selectedText) {
        textToInsert = `^{${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "^{power}";
        selectStartOffset = "^{".length;
        selectLength = 5; // 'power'
      }
    } else if (templateLatex === "_{}") {
      if (selectedText) {
        textToInsert = `_{${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "_{sub}";
        selectStartOffset = "_{".length;
        selectLength = 3; // 'sub'
      }
    } else if (templateLatex === "\\sqrt{}") {
      if (selectedText) {
        textToInsert = `\\sqrt{${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "\\sqrt{x}";
        selectStartOffset = "\\sqrt{".length;
        selectLength = 1; // 'x'
      }
    } else if (templateLatex === "\\sqrt[]{}") {
      if (selectedText) {
        textToInsert = `\\sqrt[n]{${selectedText}}`;
        selectStartOffset = "\\sqrt[".length;
        selectLength = 1; // 'n'
      } else {
        textToInsert = "\\sqrt[n]{x}";
        selectStartOffset = "\\sqrt[".length;
        selectLength = 1; // 'n'
      }
    } else if (templateLatex === "\\sum_{i=1}^{n} {}") {
      if (selectedText) {
        textToInsert = `\\sum_{i=1}^{n} {${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "\\sum_{i=1}^{n} {expr}";
        selectStartOffset = "\\sum_{i=1}^{n} {".length;
        selectLength = 4; // 'expr'
      }
    } else if (templateLatex === "\\int_{a}^{b} {} \\, dx") {
      if (selectedText) {
        textToInsert = `\\int_{a}^{b} {${selectedText}} \\, dx`;
        selectStartOffset = textToInsert.indexOf("\\, dx");
        selectLength = 0;
      } else {
        textToInsert = "\\int_{a}^{b} {expr} \\, dx";
        selectStartOffset = "\\int_{a}^{b} {".length;
        selectLength = 4; // 'expr'
      }
    } else if (templateLatex === "\\prod_{i=1}^{n} {}") {
      if (selectedText) {
        textToInsert = `\\prod_{i=1}^{n} {${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "\\prod_{i=1}^{n} {expr}";
        selectStartOffset = "\\prod_{i=1}^{n} {".length;
        selectLength = 4; // 'expr'
      }
    } else if (templateLatex === "\\lim_{x \\to \\infty} {}") {
      if (selectedText) {
        textToInsert = `\\lim_{x \\to \\infty} {${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "\\lim_{x \\to \\infty} {expr}";
        selectStartOffset = "\\lim_{x \\to \\infty} {".length;
        selectLength = 4; // 'expr'
      }
    } else if (templateLatex === "\\text{}") {
      if (selectedText) {
        textToInsert = `\\text{${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = "\\text{text}";
        selectStartOffset = "\\text{".length;
        selectLength = 4; // 'text'
      }
    } else if (["\\hat{}", "\\bar{}", "\\tilde{}", "\\dot{}", "\\ddot{}", "\\overline{}", "\\underline{}"].includes(templateLatex)) {
      const command = templateLatex.slice(0, -2);
      if (selectedText) {
        textToInsert = `${command}{${selectedText}}`;
        selectStartOffset = textToInsert.length;
        selectLength = 0;
      } else {
        textToInsert = `${command}{a}`;
        selectStartOffset = command.length + 1; // after "{""
        selectLength = 1; // "a"
      }
    } else {
      textToInsert = templateLatex;
      selectStartOffset = templateLatex.length;
      selectLength = 0;
    }

    const newVal = currentVal.substring(0, start) + textToInsert + currentVal.substring(end);
    setLatex(newVal);

    // Apply caret placement selection
    setTimeout(() => {
      textarea.focus();
      const newSelStart = start + selectStartOffset;
      const newSelEnd = newSelStart + selectLength;
      textarea.setSelectionRange(newSelStart, newSelEnd);
    }, 50);
  };

  const handleSave = () => {
    const mathml = latexToMathML(latex);
    onSave(latex, mathml);
    onClose();
  };

  const categories = {
    structures: [
      { label: "Fraction", latex: "\\frac{}{}", display: "a/b" },
      { label: "Power", latex: "^{}", display: "x²" },
      { label: "Subscript", latex: "_{}", display: "x_i" },
      { label: "Square Root", latex: "\\sqrt{}", display: "√x" },
      { label: "N-th Root", latex: "\\sqrt[]{}", display: "ⁿ√x" },
      { label: "Sum", latex: "\\sum_{i=1}^{n} {}", display: "∑" },
      { label: "Integral", latex: "\\int_{a}^{b} {} \\, dx", display: "∫" },
      { label: "Product", latex: "\\prod_{i=1}^{n} {}", display: "∏" },
      { label: "Limit", latex: "\\lim_{x \\to \\infty} {}", display: "lim" },
      { label: "Text Block", latex: "\\text{}", display: "text" },
    ],
    accents: [
      { label: "Hat", latex: "\\hat{}", display: "â" },
      { label: "Bar", latex: "\\bar{}", display: "ā" },
      { label: "Tilde", latex: "\\tilde{}", display: "ã" },
      { label: "Dot", latex: "\\dot{}", display: "ȧ" },
      { label: "Double Dot", latex: "\\ddot{}", display: "ä" },
      { label: "Overline", latex: "\\overline{}", display: "Ā" },
      { label: "Underline", latex: "\\underline{}", display: "A" },
      { label: "Vector", latex: "\\vec{}", display: "a⃗" },
    ],
    greek: [
      { label: "alpha", latex: "\\alpha", display: "α" },
      { label: "beta", latex: "\\beta", display: "β" },
      { label: "gamma", latex: "\\gamma", display: "γ" },
      { label: "delta", latex: "\\delta", display: "δ" },
      { label: "epsilon", latex: "\\epsilon", display: "ε" },
      { label: "theta", latex: "\\theta", display: "θ" },
      { label: "lambda", latex: "\\lambda", display: "λ" },
      { label: "pi", latex: "\\pi", display: "π" },
      { label: "sigma", latex: "\\sigma", display: "σ" },
      { label: "phi", latex: "\\phi", display: "φ" },
      { label: "omega", latex: "\\omega", display: "ω" },
      { label: "Delta (Caps)", latex: "\\Delta", display: "Δ" },
      { label: "Sigma (Caps)", latex: "\\Sigma", display: "Σ" },
      { label: "Omega (Caps)", latex: "\\Omega", display: "Ω" },
    ],
    operators: [
      { label: "plus-minus", latex: "\\pm", display: "±" },
      { label: "times", latex: "\\times", display: "×" },
      { label: "divide", latex: "\\div", display: "÷" },
      { label: "not equal", latex: "\\neq", display: "≠" },
      { label: "approximate", latex: "\\approx", display: "≈" },
      { label: "less-equal", latex: "\\le", display: "≤" },
      { label: "greater-equal", latex: "\\ge", display: "≥" },
      { label: "infinity", latex: "\\infty", display: "∞" },
      { label: "arrow right", latex: "\\to", display: "→" },
      { label: "partial diff", latex: "\\partial", display: "∂" },
      { label: "nabla", latex: "\\nabla", display: "∇" },
      { label: "belongs to", latex: "\\in", display: "∈" },
      { label: "subset", latex: "\\subset", display: "⊂" },
      { label: "intersection", latex: "\\cap", display: "∩" },
      { label: "union", latex: "\\cup", display: "∪" },
    ],
    functions: [
      { label: "sine", latex: "\\sin", display: "sin" },
      { label: "cosine", latex: "\\cos", display: "cos" },
      { label: "tangent", latex: "\\tan", display: "tan" },
      { label: "logarithm", latex: "\\log", display: "log" },
      { label: "natural log", latex: "\\ln", display: "ln" },
    ],
    physics: [
      { label: "Planck h-bar", latex: "\\hbar", display: "ℏ" },
      { label: "wavelength", latex: "\\lambda", display: "λ" },
      { label: "permeability", latex: "\\mu", display: "μ" },
      { label: "resistance", latex: "\\Omega", display: "Ω" },
      { label: "density", latex: "\\rho", display: "ρ" },
      { label: "partial diff", latex: "\\partial", display: "∂" },
      { label: "nabla (Del)", latex: "\\nabla", display: "∇" },
      { label: "infinity", latex: "\\infty", display: "∞" },
      { label: "degree", latex: "^{\\circ}", display: "°" },
      { label: "angstrom", latex: "\\text{Å}", display: "Å" },
      { label: "vector arrow", latex: "\\vec{}", display: "x⃗" },
      { label: "delta change", latex: "\\Delta", display: "Δ" },
      { label: "microsecond", latex: "\\mu s", display: "μs" },
      { label: "electronvolt", latex: "eV", display: "eV" },
    ],
    chemistry: [
      { label: "reaction arrow", latex: "\\rightarrow", display: "→" },
      { label: "reversible arrow", latex: "\\rightleftharpoons", display: "⇌" },
      { label: "gas release", latex: "\\uparrow", display: "↑" },
      { label: "precipitate", latex: "\\downarrow", display: "↓" },
      { label: "single bond", latex: "\\text{-}", display: "—" },
      { label: "double bond", latex: "\\text{=}", display: "=" },
      { label: "triple bond", latex: "\\equiv", display: "≡" },
      { label: "hydrate dot", latex: "\\cdot", display: "•" },
      { label: "positive charge", latex: "^{+}", display: "x⁺" },
      { label: "negative charge", latex: "^{-}", display: "x⁻" },
      { label: "2- charge", latex: "^{2-}", display: "x²⁻" },
      { label: "2+ charge", latex: "^{2+}", display: "x²⁺" },
      { label: "reaction heat", latex: "\\xrightarrow{\\Delta}", display: "→(Δ)" },
      { label: "benzene ring", latex: "\\chemfig{*6(-=-=-=)}", display: "⌬ Benzene" },
      { label: "benzene ring (aromatic)", latex: "\\chemfig{**6(------)}", display: "⌬ Aromatic" },
      { label: "aspirin structure", latex: "\\chemfig{*6(-=-(-[1]O-[0]C(=[2]O)-[0]CH_3)=-(-[3]C(=[3]O)-[1]OH)=)}", display: "Aspirin" },
      { label: "tylenol structure", latex: "\\chemfig{*6(-(-[6]NH-[5]C(=[6]O)-[3]CH_3)=-(-[2]OH)=-=)}", display: "Tylenol" },
      { label: "advil structure", latex: "\\chemfig{*6(-(-[6]CH_2-[5]CH(-[5]CH_3)-[6]CH_3)=-(-[2]CH(-[3]CH_3)-[1]C(=[2]O)-[7]OH)=-=)}", display: "Advil" },
    ],
    vectors: [
      { label: "vec (any)", latex: "\\vec{}", display: "v⃗" },
      { label: "vec v", latex: "\\vec{v}", display: "v⃗" },
      { label: "vec F", latex: "\\vec{F}", display: "F⃗" },
      { label: "vec a", latex: "\\vec{a}", display: "a⃗" },
      { label: "vec r", latex: "\\vec{r}", display: "r⃗" },
      { label: "vec E", latex: "\\vec{E}", display: "E⃗" },
      { label: "vec B", latex: "\\vec{B}", display: "B⃗" },
      { label: "dot product", latex: "\\vec{A} \\cdot \\vec{B}", display: "A⃗·B⃗" },
      { label: "cross product", latex: "\\vec{A} \\times \\vec{B}", display: "A⃗×B⃗" },
      { label: "magnitude", latex: "|\\vec{}", display: "|v|" },
      { label: "unit vector", latex: "\\hat{}", display: "v̂" },
      { label: "unit i", latex: "\\hat{i}", display: "î" },
      { label: "unit j", latex: "\\hat{j}", display: "ĵ" },
      { label: "unit k", latex: "\\hat{k}", display: "k̂" },
      { label: "F = ma", latex: "\\vec{F} = m\\vec{a}", display: "F⃗=ma⃗" },
      { label: "v = u + at", latex: "\\vec{v} = \\vec{u} + \\vec{a}t", display: "v⃗=u⃗+a⃗t" },
      { label: "displacement", latex: "\\vec{s} = \\vec{u}t + \\frac{1}{2}\\vec{a}t^{2}", display: "s⃗=ut+½at²" },
      { label: "work done", latex: "W = \\vec{F} \\cdot \\vec{d}", display: "W=F⃗·d⃗" },
    ],
    logic: [
      { label: "for all", latex: "\\forall", display: "∀" },
      { label: "there exists", latex: "\\exists", display: "∃" },
      { label: "not exists", latex: "\\nexists", display: "∄" },
      { label: "negation ¬", latex: "\\neg", display: "¬" },
      { label: "and ∧", latex: "\\land", display: "∧" },
      { label: "or ∨", latex: "\\lor", display: "∨" },
      { label: "implies ⇒", latex: "\\Rightarrow", display: "⇒" },
      { label: "iff ⇔", latex: "\\Leftrightarrow", display: "⇔" },
      { label: "XOR ⊕", latex: "\\oplus", display: "⊕" },
      { label: "therefore ∴", latex: "\\therefore", display: "∴" },
      { label: "because ∵", latex: "\\because", display: "∵" },
      { label: "provable ⊢", latex: "\\vdash", display: "⊢" },
      { label: "models ⊨", latex: "\\models", display: "⊨" },
      { label: "NAND", latex: "\\neg(A \\land B)", display: "N∧" },
      { label: "NOR", latex: "\\neg(A \\lor B)", display: "N∨" },
    ],
    arrows: [
      { label: "right →", latex: "\\rightarrow", display: "→" },
      { label: "left ←", latex: "\\leftarrow", display: "←" },
      { label: "left-right ↔", latex: "\\leftrightarrow", display: "↔" },
      { label: "up ↑", latex: "\\uparrow", display: "↑" },
      { label: "down ↓", latex: "\\downarrow", display: "↓" },
      { label: "dbl right ⇒", latex: "\\Rightarrow", display: "⇒" },
      { label: "dbl left ⇐", latex: "\\Leftarrow", display: "⇐" },
      { label: "dbl iff ⇔", latex: "\\Leftrightarrow", display: "⇔" },
      { label: "long right", latex: "\\longrightarrow", display: "⟶" },
      { label: "long iff", latex: "\\Longleftrightarrow", display: "⟺" },
      { label: "maps to ↦", latex: "\\mapsto", display: "↦" },
      { label: "hook right", latex: "\\hookrightarrow", display: "↪" },
      { label: "harpoon", latex: "\\rightharpoonup", display: "⇀" },
      { label: "reversible", latex: "\\rightleftharpoons", display: "⇌" },
      { label: "NE arrow", latex: "\\nearrow", display: "↗" },
      { label: "SE arrow", latex: "\\searrow", display: "↘" },
    ],
    geometry: [
      { label: "angle ∠", latex: "\\angle", display: "∠" },
      { label: "right angle", latex: "90^{\\circ}", display: "90°" },
      { label: "perp ⊥", latex: "\\perp", display: "⊥" },
      { label: "parallel ∥", latex: "\\parallel", display: "∥" },
      { label: "congruent ≅", latex: "\\cong", display: "≅" },
      { label: "similar ~", latex: "\\sim", display: "~" },
      { label: "approx ≈", latex: "\\approx", display: "≈" },
      { label: "triangle △", latex: "\\triangle", display: "△" },
      { label: "square □", latex: "\\square", display: "□" },
      { label: "circle", latex: "\\circ", display: "∘" },
      { label: "degree", latex: "^{\\circ}", display: "°" },
      { label: "overline AB", latex: "\\overline{AB}", display: "AB̅" },
      { label: "ray AB", latex: "\\overrightarrow{AB}", display: "AB→" },
      { label: "arc AB", latex: "\\overset{\\frown}{AB}", display: "AB⌒" },
      { label: "proportional", latex: "\\propto", display: "∝" },
    ],
    sets: [
      { label: "element ∈", latex: "\\in", display: "∈" },
      { label: "not element", latex: "\\notin", display: "∉" },
      { label: "subset ⊂", latex: "\\subset", display: "⊂" },
      { label: "subset eq", latex: "\\subseteq", display: "⊆" },
      { label: "superset ⊃", latex: "\\supset", display: "⊃" },
      { label: "superset eq", latex: "\\supseteq", display: "⊇" },
      { label: "intersect", latex: "\\cap", display: "∩" },
      { label: "union", latex: "\\cup", display: "∪" },
      { label: "empty set", latex: "\\emptyset", display: "∅" },
      { label: "set minus", latex: "\\setminus", display: "∖" },
      { label: "Naturals ℕ", latex: "\\mathbb{N}", display: "ℕ" },
      { label: "Integers ℤ", latex: "\\mathbb{Z}", display: "ℤ" },
      { label: "Rationals", latex: "\\mathbb{Q}", display: "ℚ" },
      { label: "Reals ℝ", latex: "\\mathbb{R}", display: "ℝ" },
      { label: "Complex ℂ", latex: "\\mathbb{C}", display: "ℂ" },
      { label: "for all", latex: "\\forall", display: "∀" },
      { label: "there exists", latex: "\\exists", display: "∃" },
      { label: "divides |", latex: "\\mid", display: "|" },
    ],
    calculus: [
      { label: "integral", latex: "\\int_{a}^{b} {} \\, dx", display: "∫" },
      { label: "double int", latex: "\\iint_{D} {} \\, dA", display: "∬" },
      { label: "triple int", latex: "\\iiint_{V} {} \\, dV", display: "∭" },
      { label: "line int", latex: "\\oint_{C} {} \\, ds", display: "∮" },
      { label: "d/dx", latex: "\\frac{d}{dx}", display: "d/dx" },
      { label: "dⁿ/dxⁿ", latex: "\\frac{d^{n}}{dx^{n}}", display: "dⁿ/dxⁿ" },
      { label: "partial", latex: "\\frac{\\partial}{\\partial x}", display: "∂/∂x" },
      { label: "2nd partial", latex: "\\frac{\\partial^{2}}{\\partial x^{2}}", display: "∂²/∂x²" },
      { label: "lim x→∞", latex: "\\lim_{x \\to \\infty}", display: "lim∞" },
      { label: "lim x→0", latex: "\\lim_{x \\to 0}", display: "lim₀" },
      { label: "Laplacian", latex: "\\nabla^{2}", display: "∇²" },
      { label: "gradient", latex: "\\nabla", display: "∇" },
      { label: "divergence", latex: "\\nabla \\cdot \\vec{F}", display: "∇·F" },
      { label: "curl", latex: "\\nabla \\times \\vec{F}", display: "∇×F" },
      { label: "sum", latex: "\\sum_{n=1}^{\\infty}", display: "∑" },
      { label: "product", latex: "\\prod_{n=1}^{N}", display: "∏" },
    ],
    statistics: [
      { label: "mean x̅", latex: "\\bar{x}", display: "x̅" },
      { label: "std dev σ", latex: "\\sigma", display: "σ" },
      { label: "variance σ²", latex: "\\sigma^{2}", display: "σ²" },
      { label: "mean μ", latex: "\\mu", display: "μ" },
      { label: "prob P(A)", latex: "P({})", display: "P()" },
      { label: "cond prob", latex: "P({} | {})", display: "P(A|B)" },
      { label: "C(n,k)", latex: "\\binom{n}{k}", display: "C(n,k)" },
      { label: "P(n,r)", latex: "\\frac{n!}{(n-r)!}", display: "P(n,r)" },
      { label: "factorial n!", latex: "n!", display: "n!" },
      { label: "summation", latex: "\\sum_{i=1}^{n} x_{i}", display: "Σxᵢ" },
      { label: "expected E[]", latex: "E[{}]", display: "E[]" },
      { label: "normal N", latex: "\\mathcal{N}(\\mu, \\sigma^{2})", display: "퓩" },
      { label: "chi-square", latex: "\\chi^{2}", display: "χ²" },
      { label: "z-score", latex: "z = \\frac{x - \\mu}{\\sigma}", display: "z-score" },
      { label: "correlation", latex: "r = \\frac{\\sum(x-\\bar{x})(y-\\bar{y})}{\\sqrt{\\sum(x-\\bar{x})^{2}\\sum(y-\\bar{y})^{2}}}", display: "corr" },
    ],
    matrices: [
      { label: "2×2 matrix", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", display: "[⋅]²" },
      { label: "3×3 matrix", latex: "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}", display: "[⋅]³" },
      { label: "column vec", latex: "\\begin{pmatrix} a \\\\ b \\\\ c \\end{pmatrix}", display: "col" },
      { label: "row vec", latex: "\\begin{pmatrix} a & b & c \\end{pmatrix}", display: "row" },
      { label: "det 2×2", latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}", display: "|A|" },
      { label: "identity", latex: "I_{n}", display: "Iₙ" },
      { label: "transpose", latex: "A^{T}", display: "Aᵀ" },
      { label: "inverse", latex: "A^{-1}", display: "A⁻¹" },
      { label: "trace", latex: "\\text{tr}(A)", display: "tr(A)" },
      { label: "norm", latex: "\\|\\vec{v}\\|", display: "‖v‖" },
      { label: "dot product", latex: "\\vec{u} \\cdot \\vec{v}", display: "u·v" },
      { label: "cross product", latex: "\\vec{u} \\times \\vec{v}", display: "u×v" },
      { label: "cases", latex: "\\begin{cases} a & \\text{if } x > 0 \\\\ b & \\text{otherwise} \\end{cases}", display: "{...}" },
    ],
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          width: "820px",
          maxWidth: "100%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f8fafc",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600, color: "#0f172a" }}>
            {initialLatex ? "Edit Equation" : "Insert Mathematical Equation"}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "1.5rem",
              color: "#64748b",
              lineHeight: 1,
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#e2e8f0";
              e.currentTarget.style.color = "#0f172a";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "#64748b";
            }}
          >
            &times;
          </button>
        </div>

        {/* Live Preview Area */}
        <div
          style={{
            padding: "24px",
            backgroundColor: "#f1f5f9",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "120px",
            maxHeight: "200px",
            overflowY: "auto",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "8px",
              left: "12px",
              fontSize: "0.75rem",
              fontWeight: 500,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Live Preview
          </div>
          <div
            style={{
              fontSize: "1.6rem",
              color: "#0f172a",
              textAlign: "center",
              padding: "16px",
              width: "100%",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
            dangerouslySetInnerHTML={{ __html: latexToMathML(latex) }}
          />
        </div>

        {/* Symbol Toolbar Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            padding: "0 8px",
            overflowX: "auto",
            flexWrap: "nowrap",
          }}
        >
          {(["structures", "accents", "greek", "operators", "functions", "physics", "chemistry", "vectors", "logic", "arrows", "geometry", "sets", "calculus", "statistics", "matrices"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "12px 16px",
                fontSize: "0.85rem",
                fontWeight: activeTab === tab ? 700 : 500,
                color: activeTab === tab ? "#0f172a" : "#64748b",
                border: "none",
                background: "none",
                cursor: "pointer",
                borderBottom: activeTab === tab ? "2px solid #0f172a" : "2px solid transparent",
                textTransform: "capitalize",
                transition: "all 0.2s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Symbol Buttons Container */}
        <div
          style={{
            padding: "16px 24px",
            maxHeight: "160px",
            overflowY: "auto",
            borderBottom: "1px solid #e2e8f0",
            backgroundColor: "#ffffff",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(68px, 1fr))",
              gap: "8px",
            }}
          >
            {categories[activeTab].map((sym, index) => (
              <button
                key={index}
                title={sym.label}
                onClick={() => insertAtCursor(sym.latex)}
                style={{
                  padding: "10px 4px",
                  fontSize: "1rem",
                  color: "#334155",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.borderColor = "#cbd5e1";
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.backgroundColor = "#f8fafc";
                  e.currentTarget.style.transform = "none";
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>{sym.display}</span>
                <span
                  style={{
                    fontSize: "0.65rem",
                    color: "#64748b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sym.latex.startsWith("\\") ? sym.latex : sym.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Textarea and Actions */}
        <div style={{ padding: "20px 24px 24px", backgroundColor: "#ffffff" }}>
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="latex-input"
              style={{
                display: "block",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "#475569",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              LaTeX Command Input
            </label>
            <textarea
              id="latex-input"
              ref={textareaRef}
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              placeholder="e.g. \frac{a^2 + b^2}{c}"
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: "0.95rem",
                fontFamily: "Courier New, Courier, monospace",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                outline: "none",
                resize: "vertical",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#a0aec0";
                e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.05), 0 0 0 3px rgba(0, 0, 0, 0.05)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.05)";
              }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "10px 18px",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "#475569",
                backgroundColor: "#f1f5f9",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{
                padding: "10px 22px",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "#ffffff", // Keep text white for contrast on dark button
                backgroundColor: "#1e293b",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#0f172a";
                e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.15)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#1e293b";
                e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              }}
            >
              {initialLatex ? "Update Equation" : "Insert Equation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
