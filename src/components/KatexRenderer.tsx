"use client";

import { useEffect, useRef, HTMLAttributes } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export interface KatexRendererProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  className?: string;
  displayMode?: boolean;
}

/**
 * Finds the closing "}}" delimiter matching the "{{" at startPos.
 * Uses brace counting so nested LaTeX braces like \frac{a}{b} don't trigger false positives.
 */
function findClosingDelimiter(text: string, startPos: number): number {
  let position = startPos + 2;
  let braceDepth = 0;

  while (position < text.length) {
    const char = text[position];
    const prevChar = position > 0 ? text[position - 1] : "";

    // Check if backslash-escaped (e.g. \{ or \})
    const isEscaped = prevChar === "\\" && (position < 2 || text[position - 2] !== "\\");

    if (!isEscaped) {
      if (char === "{") {
        braceDepth++;
      } else if (char === "}") {
        if (braceDepth > 0) {
          braceDepth--;
        } else if (position + 1 < text.length && text[position + 1] === "}") {
          // Found closing "}}" when brace depth is 0
          return position;
        }
      }
    }
    position++;
  }

  return -1;
}

export default function KatexRenderer({
  content,
  className,
  displayMode = false,
  ...props
}: KatexRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clean zero-width spaces (\u200B) often added by rich text editors
    const cleanContent = (content || "").replace(/\u200B/g, "");

    // Render initial HTML into container
    container.innerHTML = cleanContent;

    // 1. Transform any existing editor math containers ([data-latex] or .math-eq-container)
    const mathContainers = container.querySelectorAll(".math-eq-container, [data-latex]");
    mathContainers.forEach((mathSpan) => {
      const latex = mathSpan.getAttribute("data-latex") || "";
      const isBlock =
        mathSpan.classList.contains("math-eq-display") ||
        mathSpan.getAttribute("data-display") === "true";

      const mathElement = document.createElement("span");
      mathElement.className = "katex-rendered-math";
      try {
        katex.render(latex, mathElement, {
          throwOnError: false,
          displayMode: isBlock || displayMode,
        });
        mathSpan.parentNode?.replaceChild(mathElement, mathSpan);
      } catch {
        const textFallback = document.createTextNode(`{{${latex}}}`);
        mathSpan.parentNode?.replaceChild(textFallback, mathSpan);
      }
    });

    // 2. Find and replace {{ latex }} patterns in text nodes
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
      // Don't process text inside already rendered KaTeX elements
      if (node.parentElement?.closest(".katex, .katex-rendered-math")) {
        continue;
      }
      textNodes.push(node as Text);
    }

    textNodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      if (!text.includes("{{")) return;

      const fragment = document.createDocumentFragment();
      let position = 0;

      while (position < text.length) {
        const start = text.indexOf("{{", position);

        // No more equations
        if (start === -1) {
          fragment.appendChild(document.createTextNode(text.slice(position)));
          break;
        }

        // Normal text before equation
        if (start > position) {
          fragment.appendChild(document.createTextNode(text.slice(position, start)));
        }

        // Find closing }} using brace counting
        const end = findClosingDelimiter(text, start);

        // No closing delimiter found
        if (end === -1) {
          fragment.appendChild(document.createTextNode(text.slice(start)));
          break;
        }

        // Extract LaTeX inside {{ ... }}
        const latex = text.slice(start + 2, end).trim();
        const mathElement = document.createElement("span");
        mathElement.className = "katex-rendered-math";

        try {
          katex.render(latex, mathElement, {
            throwOnError: false,
            displayMode: displayMode,
          });
        } catch {
          mathElement.textContent = `{{${latex}}}`;
        }

        fragment.appendChild(mathElement);
        position = end + 2;
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    });
  }, [content, displayMode]);

  return <div ref={containerRef} className={className} {...props} />;
}
