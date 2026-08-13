"use client";

import { useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";


export default function Home() {
  const [content, setContent] = useState("");

  const handleContentChange = (html: string, _cleanLatexHtml: string) => {
    setContent(html);
    // The cleanLatexHtml is also available here if you need it.
  };

  return (
    <main
      style={{
        height: "100vh",
        backgroundColor: "#f8fafc",
        overflow: "hidden",
      }}
    >
      {/* Main Workspace */}
      <RichTextEditor
        initialContent={content}
        onContentChange={handleContentChange}
      />
    </main>
  );
}