"use client";
import { useState, useRef } from "react";
import "katex/dist/katex.min.css";
import katex from "katex";

const MathEditor = () => {
  const [expression, setExpression] = useState("E=mc^3");
  const [htmlOutput, setHtmlOutput] = useState("");
  const [copySuccess, setCopySuccess] = useState("");
  const htmlRef = useRef(null);

  const convertToHTML = () => {
    try {
      const formattedExpression = expression.trim();
      const fullHtml = katex.renderToString(formattedExpression, {
        throwOnError: false,
      });

      const parser = new DOMParser();
      const doc = parser.parseFromString(fullHtml, "text/html");
      const mathML = doc.querySelector("math");

      setHtmlOutput(
        mathML
          ? mathML.outerHTML
          : "<span style='color: red;'>Invalid Expression</span>"
      );
      setCopySuccess("");
    } catch (error: unknown) {
      console.log({ error });
      setHtmlOutput('<span style="color: red;">Invalid Expression</span>');
    }
  };

  const copyToClipboard = () => {
    if (!htmlRef.current || !htmlOutput) return;

    const textarea = document.createElement("textarea");
    textarea.value = htmlOutput;
    document.body.appendChild(textarea);

    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);

    setCopySuccess("Copied to clipboard! ✅");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "auto" }}>
      <h2>Math to HTML Converter</h2>

      {/* LaTeX Expression Input */}
      <textarea
        rows={4}
        style={{
          width: "100%",
          padding: "10px",
          fontSize: "16px",
          borderRadius: "5px",
          marginBottom: "10px",
        }}
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        placeholder="Enter LaTeX expression (e.g., E=mc^3)"
      />
      <button
        onClick={convertToHTML}
        style={{
          marginTop: "10px",
          padding: "10px",
          fontSize: "16px",
          cursor: "pointer",
        }}
      >
        Convert to HTML
      </button>

      {/* Display Generated HTML Output */}
      <h3>Generated HTML:</h3>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <textarea
          rows={6}
          ref={htmlRef}
          readOnly
          style={{
            width: "100%",
            padding: "10px",
            fontSize: "16px",
            borderRadius: "5px",
            backgroundColor: "#f4f4f4",
          }}
          value={htmlOutput}
        />
        <button
          onClick={copyToClipboard}
          style={{
            padding: "10px",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          📋 Copy HTML
        </button>
      </div>

      {copySuccess && <p style={{ color: "green" }}>{copySuccess}</p>}

      {/* Rendered LaTeX Preview (Real-time rendering) */}
      <h3>Preview:</h3>
      <div
        style={{
          padding: "10px",
          border: "1px solid #ccc",
          minHeight: "50px",
          fontSize: "18px",
          backgroundColor: "#f9f9f9",
          borderRadius: "5px",
        }}
        dangerouslySetInnerHTML={{ __html: htmlOutput }}
      />
    </div>
  );
};

export default MathEditor;
