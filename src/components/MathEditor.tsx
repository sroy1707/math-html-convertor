"use client";

import { useEffect, useRef, useState } from "react";
import { MathfieldElement } from "mathlive";
import katex from "katex";
import { toPng } from "html-to-image";

// Teach TypeScript about the <math-field> custom element
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.DetailedHTMLProps<
        React.HTMLAttributes<MathfieldElement>,
        MathfieldElement
      >;
    }
  }
}

export default function MathEditor() {
  const mathfieldRef = useRef<MathfieldElement>(null);
  const renderRef = useRef<HTMLDivElement>(null);
  const [latex, setLatex] = useState("");

  useEffect(() => {
    if (!customElements.get("math-field")) {
      customElements.define("math-field", MathfieldElement);
    }

    setTimeout(() => {
      if (mathfieldRef.current) {
        mathfieldRef.current.setValue("\\placeholder{}");
        mathfieldRef.current.executeCommand("showVirtualKeyboard");
      }
    }, 300);
  }, []);

  useEffect(() => {
    // Remove the fallback text KaTeX renders so only MathML remains
    if (renderRef.current) {
      const fallback = renderRef.current.querySelector(".katex-html");
      if (fallback) fallback.remove();
    }
  }, [latex]);

  const handleSave = () => {
    const mf = mathfieldRef.current;
    if (mf) {
      const value = mf.getValue(); // LaTeX
      setLatex(value);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("✅ LaTeX copied to clipboard!");
  };

  const copyAsImage = async () => {
    if (!renderRef.current) return;

    try {
      const dataUrl = await toPng(renderRef.current);
      const blob = await fetch(dataUrl).then((res) => res.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      alert("🖼️ Equation image copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy image", err);
      alert("❌ Could not copy image");
    }
  };

  return (
    <div>
      <math-field
        ref={mathfieldRef}
        virtual-keyboard-mode="onfocus"
        virtual-keyboard-theme="material"
        virtual-keyboard-toolbar="true"
        style={{
          fontSize: "1.2rem",
          border: "1px solid #ccc",
          padding: "1rem",
          width: "100%",
          minHeight: "80px",
        }}
      ></math-field>

      <button style={{ marginTop: "10px" }} onClick={handleSave}>
        Convert &amp; Copy Options
      </button>

      {latex && (
        <div style={{ marginTop: "20px" }}>
          <div>
            <strong>LaTeX Code:</strong>
            <pre>{latex}</pre>
            <button onClick={() => copyToClipboard(latex)}>
              📋 Copy LaTeX
            </button>
          </div>

          <div style={{ marginTop: "15px" }}>
            <strong>Rendered Equation:</strong>
            <div
              ref={renderRef}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(latex, {
                  throwOnError: false,
                  displayMode: true,
                }),
              }}
              style={{
                padding: "10px",
                fontSize: "1.5rem",
                backgroundColor: "#fff",
                display: "inline-block",
                whiteSpace: "nowrap",
              }}
              className="katex-container"
            />
            <div style={{ marginTop: "10px" }}>
              <button onClick={copyAsImage}>🖼️ Copy Equation as Image</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
