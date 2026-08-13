"use client";

import { useEffect, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import { latexToMathML } from "./MathParser";

interface EquationOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latex: string, mathml: string) => void;
}

export default function EquationOcrModal({
  isOpen,
  onClose,
  onInsert,
}: EquationOcrModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste image from clipboard support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || loading) return;
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              const url = URL.createObjectURL(blob);
              setImageSrc(url);
              processImage(blob);
              break;
            }
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      processImage(file);
    }
  };

  const reconstructMathFromMultiline = (text: string): string => {
    const lines = text.split("\n").map(l => l.trimRight());
    let i = 0;
    const resultLines: string[] = [];

    while (i < lines.length) {
      const line = lines[i];
      const fractionBarRegex = /[-_—=]{3,}/g;
      
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        fractionBarRegex.lastIndex = 0;
        const match = fractionBarRegex.exec(nextLine);
        
        if (match) {
          const barIndex = match.index;
          const barLength = match[0].length;
          
          if (i + 2 < lines.length) {
            const numLine = lines[i];
            const denLine = lines[i + 2];
            const paddedNumLine = numLine.padEnd(barIndex + barLength, " ");
            const paddedDenLine = denLine.padEnd(barIndex + barLength, " ");
            
            const numerator = paddedNumLine.substring(barIndex, barIndex + barLength).trim();
            const denominator = paddedDenLine.substring(barIndex, barIndex + barLength).trim();
            
            const fractionLatex = `\\frac{${numerator || "num"}}{${denominator || "den"}}`;
            const leftOfBar = nextLine.substring(0, barIndex).trim();
            const rightOfBar = nextLine.substring(barIndex + barLength).trim();
            
            const assembledBlock = (leftOfBar ? leftOfBar + " " : "") + fractionLatex + (rightOfBar ? " " + rightOfBar : "");
            resultLines.push(assembledBlock);
            i += 3;
            continue;
          }
        }
      }
      
      resultLines.push(line);
      i++;
    }
    
    return resultLines.join("\n");
  };

  const processImage = async (file: File) => {
    setLoading(true);
    setProgress(0);
    setStatus("Initializing Tesseract OCR worker...");
    setOcrText("");

    try {
      const worker = await createWorker("eng");
      
      setStatus("Analyzing image and extracting characters...");
      setProgress(30);
      
      const { data: { text } } = await worker.recognize(file);
      setProgress(90);
      setStatus("Formatting equations...");

      // 1. Reconstruct multi-line fractions from layout columns
      let cleaned = reconstructMathFromMultiline(text);

      // 2. Clean up common OCR text readings to standard LaTeX
      cleaned = cleaned
        .replace(/divided by/gi, "\\div")
        .replace(/plus or minus/gi, "\\pm")
        .replace(/infinity/gi, "\\infty")
        .replace(/times/gi, "\\times")
        .replace(/([0-9]+)\/([0-9]+)/g, "\\frac{$1}{$2}") // convert a/b to \frac{a}{b}
        .replace(/([a-zA-Z])([0-9])\b/g, "$1^$2")        // convert x3 -> x^3, x0 -> x^0
        .replace(/([a-zA-Z])([0-9])/g, "$1^$2")          // convert x3 -> x^3 (even without boundaries, e.g. x3+y)
        .replace(/⁰/g, "^0").replace(/¹/g, "^1").replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4")
        .replace(/⁵/g, "^5").replace(/⁶/g, "^6").replace(/⁷/g, "^7").replace(/⁸/g, "^8").replace(/⁹/g, "^9")
        .replace(/₀/g, "_0").replace(/₁/g, "_1").replace(/₂/g, "_2").replace(/₃/g, "_3").replace(/₄/g, "_4")
        .replace(/₅/g, "_5").replace(/₆/g, "_6").replace(/₇/g, "_7").replace(/₈/g, "_8").replace(/₉/g, "_9")
        .replace(/\balpha\b/gi, "\\alpha")
        .replace(/\bbeta\b/gi, "\\beta")
        .replace(/\bgamma\b/gi, "\\gamma")
        .replace(/\btheta\b/gi, "\\theta")
        .replace(/\bpi\b/gi, "\\pi")
        .replace(/\bsigma\b/gi, "\\sigma")
        .replace(/\bomega\b/gi, "\\omega");

      setOcrText(cleaned);
      setProgress(100);
      setStatus("OCR Completed successfully!");
      await worker.terminate();
    } catch (err) {
      console.error(err);
      setStatus("Error: Failed to process image OCR.");
      alert("❌ OCR processing failed. Please verify the image file.");
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    const mathml = latexToMathML(ocrText);
    onInsert(ocrText, mathml);
    handleClose();
  };

  const handleClose = () => {
    setImageSrc(null);
    setOcrText("");
    setProgress(0);
    setStatus("");
    setLoading(false);
    onClose();
  };

  const triggerUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
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
          width: "560px",
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
            Scan Equation from Image (OCR)
          </h3>
          <button
            onClick={handleClose}
            disabled={loading}
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
              if (!loading) e.currentTarget.style.backgroundColor = "#e2e8f0";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            &times;
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* DRAG AND DROP AREA */}
          {!imageSrc ? (
            <div
              onClick={triggerUpload}
              style={{
                border: "2px dashed #cbd5e1",
                borderRadius: "12px",
                padding: "40px 20px",
                textAlign: "center",
                cursor: "pointer",
                backgroundColor: "#f8fafc",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.backgroundColor = "#eff6ff";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.borderColor = "#cbd5e1";
                e.currentTarget.style.backgroundColor = "#f8fafc";
              }}
            >
              {/* Scan Icon SVG */}
              <svg
                style={{ color: "#64748b", margin: "0 auto 12px", width: "48px", height: "48px" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
              <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                Upload or Paste Image
              </p>
              <p style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "12px" }}>
                Click to browse files, or press Ctrl+V to paste an image
              </p>
              <span
                style={{
                  fontSize: "0.75rem", // Neutralize button color
                  color: "#0f172a",
                  fontWeight: 600,
                  backgroundColor: "#f1f5f9",
                  padding: "4px 8px",
                  borderRadius: "6px",
                  border: "1px solid #e2e8f0",
                }}
              >
                Select Image File
              </span>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: "none" }}
              />
            </div>
          ) : (
            /* IMAGE PREVIEW & LOADING PROGRESS */
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#64748b" }}>Image Preview</span>
                <button
                  onClick={() => setImageSrc(null)}
                  disabled={loading}
                  style={{
                    fontSize: "0.75rem",
                    color: "#ef4444",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Clear Image
                </button>
              </div>
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "8px",
                  backgroundColor: "#f8fafc",
                  display: "flex",
                  justifyContent: "center",
                  maxHeight: "150px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageSrc} alt="Equation scan" style={{ maxHeight: "130px", maxWidth: "100%", objectFit: "contain" }} />
              </div>

              {/* PROGRESS BAR */}
              {loading && (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "#475569", marginBottom: "6px" }}>
                    <span>{status}</span>
                    <span style={{ fontWeight: 600 }}>{progress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${progress}%`,
                        height: "100%", // Neutralize progress bar color
                        backgroundColor: "#475569",
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EXTRACTED TEXT & PREVIEW AREA */}
          {ocrText !== "" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label
                  htmlFor="ocr-output-input"
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
                  Extracted Equation (LaTeX) - Feel free to Edit
                </label>
                <textarea
                  id="ocr-output-input"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "10px",
                    fontSize: "0.9rem",
                    fontFamily: "Courier New, monospace",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
              </div>

              {/* Rendered Math Preview */}
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f1f5f9",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minHeight: "80px",
                  justifyContent: "center",
                  position: "relative",
                  border: "1px solid #e2e8f0",
                }}
              >
                <span style={{ position: "absolute", top: "6px", left: "10px", fontSize: "0.7rem", color: "#94a3b8", fontWeight: 600 }}>
                  Equation Preview
                </span>
                <div
                  style={{ fontSize: "1.4rem", color: "#0f172a", textAlign: "center", width: "100%", overflowX: "auto" }}
                  dangerouslySetInnerHTML={{ __html: latexToMathML(ocrText) }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={handleClose}
            disabled={loading}
            style={{
              padding: "10px 18px",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: "#475569",
              backgroundColor: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={loading || ocrText === ""}
            style={{
              padding: "10px 22px",
              fontSize: "0.9rem",
              fontWeight: 600,
              color: "#ffffff",
              backgroundColor: ocrText === "" ? "#94a3b8" : "#1e293b",
              border: "none",
              borderRadius: "8px",
              cursor: ocrText === "" ? "default" : "pointer",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
          >
            Insert Equation
          </button>
        </div>
      </div>
    </div>
  );
}
