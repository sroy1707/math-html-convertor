"use client";

import { useState, useEffect } from "react";
import RichTextEditor from "@/components/RichTextEditor";
import { clipboardMathToLatexText } from "@/components/PasteMath";

export default function Home() {
  const [content, setContent] = useState("");
  const [debugHtml, setDebugHtml] = useState("");
  const [debugText, setDebugText] = useState("");
  const [debugMimes, setDebugMimes] = useState<string[]>([]);
  const [debugResult, setDebugResult] = useState<string>("—");

  useEffect(() => {
    const handleWindowPaste = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData("text/html") || "";
      const text = e.clipboardData?.getData("text/plain") || "";
      const mimes = e.clipboardData?.types ? Array.from(e.clipboardData.types) : [];
      setDebugMimes(mimes);
      setDebugHtml(html);
      setDebugText(text);

      // Run the actual math extractor and show what it produces
      if (html) {
        try {
          const result = clipboardMathToLatexText(html);
          if (result === null) {
            setDebugResult("❌ clipboardMathToLatexText → null (no math detected)");
          } else {
            setDebugResult("✅ clipboardMathToLatexText result:\n" + result.slice(0, 400));
          }
        } catch (err) {
          setDebugResult("💥 ERROR: " + String(err));
        }
      } else {
        setDebugResult("❌ No text/html in clipboard!");
      }
    };

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, []);

  const handleContentChange = (html: string, _cleanLatexHtml: string) => {
    setContent(html);
  };

  return (
    <main style={{ height: "100vh", backgroundColor: "#f8fafc", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Main Workspace */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RichTextEditor initialContent={content} onContentChange={handleContentChange} />
      </div>

      {/* Clipboard Diagnostic Panel */}
      <div
        style={{
          height: "260px",
          backgroundColor: "#0f172a",
          color: "#00ffcc",
          borderTop: "2px solid #38bdf8",
          padding: "12px",
          boxSizing: "border-box",
          fontFamily: "Consolas, monospace",
          fontSize: "0.75rem",
          display: "flex",
          gap: "12px",
        }}
      >
        {/* Left: MIME types + Result */}
        <div style={{ width: "260px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "bold" }}>MIME TYPES:</div>
          <div style={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "4px", padding: "6px", height: "60px", overflowY: "auto" }}>
            {debugMimes.length === 0 ? <span style={{ color: "#64748b" }}>—</span> : debugMimes.map(m => <div key={m} style={{ color: "#fbbf24", fontSize: "0.65rem" }}>{m}</div>)}
          </div>

          <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "bold" }}>PARSER RESULT:</div>
          <div style={{
            backgroundColor: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "4px",
            padding: "6px",
            flex: 1,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            fontSize: "0.65rem",
            color: debugResult.startsWith("✅") ? "#4ade80" : debugResult.startsWith("💥") ? "#f87171" : "#fb923c",
          }}>
            {debugResult}
          </div>
        </div>

        {/* Middle: HTML */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}>PASTED HTML:</div>
          <textarea
            readOnly
            value={debugHtml}
            style={{ flex: 1, backgroundColor: "#1e293b", color: "#38bdf8", border: "1px solid #334155", borderRadius: "4px", padding: "6px", resize: "none", fontSize: "0.65rem" }}
            placeholder="HTML payload will appear here..."
          />
        </div>

        {/* Right: Plain Text */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", color: "#94a3b8", fontWeight: "bold", marginBottom: "4px" }}>PLAIN TEXT:</div>
          <textarea
            readOnly
            value={debugText}
            style={{ flex: 1, backgroundColor: "#1e293b", color: "#34d399", border: "1px solid #334155", borderRadius: "4px", padding: "6px", resize: "none", fontSize: "0.65rem" }}
            placeholder="Plain text will appear here..."
          />
        </div>
      </div>
    </main>
  );
}