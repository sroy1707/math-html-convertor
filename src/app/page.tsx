"use client";

import { useState } from "react";
import RichTextEditor from "@/components/RichTextEditor";

export default function Home() {
  const [content, setContent] = useState("");

  const handleContentChange = (html: string) => {
    setContent(html);
  };

  return (
    <main style={{ height: "100vh", backgroundColor: "#f8fafc", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <RichTextEditor initialContent={content} onContentChange={handleContentChange} />
      </div>
    </main>
  );
}