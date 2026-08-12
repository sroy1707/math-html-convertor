"use client";

import { useState } from "react";
import Tesseract from "tesseract.js";
import "katex/dist/katex.min.css";
import { renderToString } from "katex";

export default function MathImageUploader() {
  const [image, setImage] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [katexHTML, setKatexHTML] = useState("");

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImage(URL.createObjectURL(file));
      extractMathText(file);
    }
  };

  const extractMathText = async (file) => {
    setLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      Tesseract.recognize(reader.result, "eng", {
        logger: (m) => console.log(m), // Logs progress
      }).then(({ data: { text } }) => {
        setText(text);
        try {
          // Convert extracted text to KaTeX-rendered HTML
          const renderedKatex = renderToString(text, {
            throwOnError: false,
          });
          setKatexHTML(renderedKatex);
        } catch (error) {
          console.error("KaTeX rendering error:", error);
        }
        setLoading(false);
      });
    };
  };

  return (
    <div className="p-4">
      <input type="file" accept="image/*" onChange={handleFileChange} />
      {image && <img src={image} alt="Uploaded" className="mt-2 w-60" />}
      {loading && <p>Processing...</p>}
      {text && (
        <div className="mt-4">
          <h2>Extracted Text:</h2>
          <pre>{text}</pre>
          <h3>Rendered Math:</h3>
          <div dangerouslySetInnerHTML={{ __html: katexHTML }} />
        </div>
      )}
    </div>
  );
}
