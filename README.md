# equawrite

A React rich text editor and math converter library with built-in KaTeX formula rendering and MathML support.

## Installation

```bash
npm install equawrite katex
# or
yarn add equawrite katex
```

## Using `KatexRenderer`

To render HTML strings containing math formulas enclosed in double curly braces (e.g. `{{ \sqrt{b^2 - 4ac} / 2a }}`), use `KatexRenderer`:

```tsx
import { KatexRenderer } from "equawrite";

export default function MyPage() {
  const htmlContent = `<p>Quadratic formula: {{x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}}}</p>`;

  return <KatexRenderer content={htmlContent} />;
}
```

## Exports

- `RichTextEditor`: Interactive rich text editor with math toolbars, OCR support, and MathML conversion.
- `KatexRenderer`: Client-side KaTeX parser & renderer for HTML containing `{{ latex }}` formulas.
- `latexToMathML`: Utility function to convert LaTeX strings directly into MathML string representation.
