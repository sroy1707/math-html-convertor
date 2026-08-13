"use client";

import { useEffect, useRef, useState } from "react";
import EquationEditorModal from "./EquationEditorModal";
import EquationOcrModal from "./EquationOcrModal";
import { latexToMathML } from "./MathParser";

// Helper to escape HTML characters
const escapeHtml = (str: string) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Helper to get caret character offset relative to an element
const getCaretCharacterOffsetWithin = (element: HTMLElement) => {
  let caretOffset = 0;
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preCaretRange.toString().length;
  }
  return caretOffset;
};

// Helper to set caret character offset relative to an element
const setCaretCharacterOffsetWithin = (element: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);

  let currentOffset = 0;
  const nodeQueue: Node[] = [element];
  let found = false;

  while (nodeQueue.length > 0 && !found) {
    const node = nodeQueue.shift()!;
    if (node.nodeType === Node.TEXT_NODE) {
      const textLen = node.textContent?.length || 0;
      if (currentOffset + textLen >= offset) {
        range.setStart(node, offset - currentOffset);
        range.setEnd(node, offset - currentOffset);
        found = true;
      } else {
        currentOffset += textLen;
      }
    } else {
      let child = node.firstChild;
      while (child) {
        nodeQueue.push(child);
        child = child.nextSibling;
      }
    }
  }

  if (!found) {
    range.selectNodeContents(element);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
};

// Helper to indent a list item (moving it into a nested UL/OL)
const indentListItem = (li: HTMLElement) => {
  const parentList = li.parentNode as HTMLElement | null;
  if (!parentList) return;

  const prevLi = li.previousElementSibling as HTMLElement | null;
  if (!prevLi || prevLi.tagName !== "LI") {
    return; // Cannot nest without a previous sibling LI
  }

  // Find or create a sub-list inside prevLi
  let subList = prevLi.querySelector(parentList.tagName) as HTMLElement | null;
  if (!subList) {
    subList = document.createElement(parentList.tagName);
    prevLi.appendChild(subList);
  }

  subList.appendChild(li);
};

// Helper to outdent a list item (moving it to parent list or converting to P)
const outdentListItem = (li: HTMLElement): HTMLElement => {
  const currentSubList = li.parentNode as HTMLElement | null;
  if (!currentSubList) return li;

  const parentLi = currentSubList.parentNode as HTMLElement | null;

  // If we are already at the top-level list
  if (!parentLi || parentLi.tagName !== "LI") {
    const parentList = currentSubList;
    const p = document.createElement("p");
    p.innerHTML = li.innerHTML;

    parentList.parentNode?.insertBefore(p, parentList.nextSibling);
    li.remove();

    if (parentList.children.length === 0) {
      parentList.remove();
    }
    return p;
  }

  // Insert the current LI after the parent LI in the outer list
  const outerList = parentLi.parentNode as HTMLElement | null;
  if (!outerList) return li;

  outerList.insertBefore(li, parentLi.nextSibling);

  // If the nested subList is now empty, remove it
  if (currentSubList.children.length === 0) {
    currentSubList.remove();
  }

  return li;
};

interface RichTextEditorProps {
  initialContent: string;
  onContentChange: (html: string, cleanLatexHtml: string) => void;
  onStatsChange?: (stats: { words: number; chars: number; readTime: number }) => void;
  onPageStatsChange?: (pageStats: { current: number; total: number }) => void;
}

// --- Quill-like Document Model ---
interface _TextSegment {
  text: string;
  formats?: {
    bold?: boolean;
    italic?: boolean;
    // ... other formats
  };
}


export default function RichTextEditor({
  initialContent,
  onContentChange,
  onStatsChange,
  onPageStatsChange,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  // Math modal states
  const [isMathModalOpen, setIsMathModalOpen] = useState(false);
  const [mathInitialLatex, setMathInitialLatex] = useState("");
  const [editingMathElement, setEditingMathElement] = useState<HTMLElement | null>(null);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);

  // Link modal states
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkText, setLinkText] = useState("ABC");
  const [linkUrl, setLinkUrl] = useState("https://abc.com");

  // Editor configuration states
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [htmlOutput, setHtmlOutput] = useState("");
  const [cleanLatexHtml, setCleanLatexHtml] = useState("");
  const [codeOutput, setCodeOutput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showLatexView, setShowLatexView] = useState(false);

  // Window width tracking for responsiveness
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  // Set initial content when the component mounts or initialContent changes
  useEffect(() => {
    if (editorRef.current && initialContent !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = initialContent;
    }
    // TODO: We will later parse initialContent into our documentModel here.
    updateStatsAndHTML();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContent]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);


  // Convert raw editor HTML to clean {{latex}} format for the export panel
  const getCleanLatexHtml = (rawHtml: string): string => {
    // Use a temporary DOM element to parse and transform
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = rawHtml;

    // Replace each math-eq-container span with {{latex}} notation
    const mathSpans = tempDiv.querySelectorAll(".math-eq-container");
    mathSpans.forEach((span) => {
      const latex = span.getAttribute("data-latex") || "";
      const replacement = document.createTextNode(`{{${latex}}}`);
      span.parentNode?.replaceChild(replacement, span);
    });

    // Remove zero-width spaces (&#x200B;) left after equations
    const cleanHtml = tempDiv.innerHTML.replace(/\u200B/g, "");
    return cleanHtml;
  };

  // Sync editor innerHTML with HTML output & document saving
  const updateStatsAndHTML = () => {
    if (!editorRef.current) return;
    const content = editorRef.current.innerHTML;
    const cleanLatex = getCleanLatexHtml(content);
    setHtmlOutput(content);
    setCleanLatexHtml(cleanLatex);
    onContentChange(content, cleanLatex);

    // Compute stats
    const text = editorRef.current.innerText || "";
    const cleanText = text.trim();
    const chars = cleanText.length;
    const words = cleanText === "" ? 0 : cleanText.split(/\s+/).length;
    const readTime = Math.max(1, Math.ceil(words / 200)); // Average 200 WPM
    // setStats({ words, chars, readTime });
    onStatsChange?.({ words, chars, readTime });

    // Page stats based on A4 scroll height
    const total = Math.ceil(editorRef.current.scrollHeight / 1056) || 1;
    let current = 1;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      try {
        const range = selection.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        const editorRect = editorRef.current.getBoundingClientRect();
        if (rect && editorRect) {
          const caretOffset = rect.top - editorRect.top + editorRef.current.scrollTop;
          current = Math.ceil(caretOffset / 1056) || 1;
        }
      } catch {
        // Fallback
      }
    }
    onPageStatsChange?.({ current, total });
  };

  // Selection utilities
  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (savedRangeRef.current) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(savedRangeRef.current);
      }
    }
  };

  const checkSelectionFormats = () => {
    const formats: string[] = [];
    if (document.queryCommandState("bold")) formats.push("bold");
    if (document.queryCommandState("italic")) formats.push("italic");
    if (document.queryCommandState("underline")) formats.push("underline");
    if (document.queryCommandState("strikeThrough")) formats.push("strike");
    if (document.queryCommandState("insertUnorderedList")) formats.push("ul");
    if (document.queryCommandState("insertOrderedList")) formats.push("ol");
    if (document.queryCommandState("superscript")) formats.push("superscript");
    if (document.queryCommandState("subscript")) formats.push("subscript");

    // Check alignment
    if (document.queryCommandState("justifyLeft")) formats.push("left");
    if (document.queryCommandState("justifyCenter")) formats.push("center");
    if (document.queryCommandState("justifyRight")) formats.push("right");
    if (document.queryCommandState("justifyFull")) formats.push("justify");

    setActiveFormats(formats);
  };

  // Document formatting commands
  const execFormat = (command: string, value: string = "") => {
    restoreSelection();

    // --- Refactored "bold" command ---
    if (command === "bold") {
      // This is a placeholder for a real implementation.
      // A real implementation would:
      // 1. Get the current selection range.
      // 2. Find the corresponding segments in our `documentModel`.
      // 3. Toggle the `bold: true` attribute on those segments.
      // 4. Re-render the document model to the DOM.
      console.log("Applying bold format to the document model (not implemented yet).");
    } else {
      // Fallback to the old method for other commands
      document.execCommand(command, false, value);
    }
    checkSelectionFormats();
    updateStatsAndHTML();
    if (editorRef.current) editorRef.current.focus();
  };

  const handleHeadingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    execFormat("formatBlock", `<${val}>`);
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value; // Map to sizes 1 to 7
    execFormat("fontSize", val);
  };

  const handleFontChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    execFormat("fontName", val);
  };

  const insertLink = () => {
    saveSelection();
    const selectedText = savedRangeRef.current ? savedRangeRef.current.toString().trim() : "";
    setLinkText(selectedText);
    setLinkUrl("");
    setIsLinkModalOpen(true);
  };

  const handleSaveLink = () => {
    restoreSelection();
    const linkHtml = `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">${escapeHtml(linkText || linkUrl)}</a>`;
    insertHtmlAtCursor(linkHtml);
    updateStatsAndHTML();
    setIsLinkModalOpen(false);
  };

  const insertImage = () => {
    const url = prompt("Enter Image URL:");
    if (url) {
      restoreSelection();
      // Use escapeHtml to prevent XSS from the URL attribute
      const imageHtml = `<img src="${escapeHtml(url)}" alt="" style="max-width: 100%; height: auto;" />`;
      insertHtmlAtCursor(imageHtml);
      updateStatsAndHTML();
    }
  };
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;

        let targetLi: HTMLElement | null = null;
        while (node && node !== editorRef.current) {
          if (node.nodeName === "LI") {
            targetLi = node as HTMLElement;
            break;
          }
          node = node.parentNode as Node;
        }

        if (targetLi) {
          e.preventDefault();
          const offset = getCaretCharacterOffsetWithin(targetLi);
          let finalElement: HTMLElement;
          if (e.shiftKey) {
            finalElement = outdentListItem(targetLi);
          } else {
            indentListItem(targetLi);
            finalElement = targetLi;
          }
          setCaretCharacterOffsetWithin(finalElement, offset);
          updateStatsAndHTML();
        } else if (!e.shiftKey) {
          e.preventDefault();
          insertHtmlAtCursor("&nbsp;&nbsp;&nbsp;&nbsp;");
          updateStatsAndHTML();
        }
      }
    }
  };

  // Custom Inline HTML insertion at cursor
  const insertHtmlAtCursor = (html: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const div = document.createElement("div");
    div.innerHTML = html;

    const fragment = document.createDocumentFragment();
    let node;
    let lastNode;
    while ((node = div.firstChild)) {
      lastNode = fragment.appendChild(node);
    }

    range.insertNode(fragment);

    // Reposition cursor immediately after inserted element
    if (lastNode) {
      const newRange = range.cloneRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);

      // Store new cursor position
      savedRangeRef.current = newRange.cloneRange();
    }
  };

  // Parse pasted plain-text that may contain {{latex}} notation
  // and convert it into editor-compatible HTML with rendered equations.
  const parsePastedLatexText = (text: string): string => {
    // Split on real newlines to preserve line structure
    const lines = text.split(/\r?\n/);

    const processLine = (line: string): string => {
      // Match {{...}} patterns; use a non-greedy match
      const parts = line.split(/(\{\{[\s\S]*?\}\})/g);
      return parts
        .map((part) => {
          const match = part.match(/^\{\{([\s\S]*?)\}\}$/);
          if (match) {
            const latex = match[1].trim();
            const mathml = latexToMathML(latex);
            const escapedLatex = escapeHtml(latex);
            return `<span class="math-eq-container" data-latex="${escapedLatex}" contenteditable="false">${mathml}</span>`;
          }
          // Escape HTML entities in plain text parts
          return part
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        })
        .join("");
    };

    // Stack equations one-after-one on consecutive lines.
    // Blank/whitespace-only lines are dropped so equations appear
    // consecutively without empty paragraphs between them.
    // Leading question numbers (e.g. "1." / "2)") are kept on the
    // same line as their equation, e.g. "1. x² - 5x + 6 = 0".
    const htmlLines: string[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;

      // Extract a leading number marker like "1.", "2)", "(3)", "a)" etc.
      const numberMatch = line.match(/^\s*(\d+|\w)[.)]\s*(.+)$/);
      if (numberMatch) {
        const numberLabel = `${numberMatch[1]}.`;
        const rest = numberMatch[2];
        const processed = processLine(rest);
        htmlLines.push(
          `<p>${numberLabel} ${processed || "<br>"}</p>`
        );
        continue;
      }

      const processed = processLine(line);
      const isEquationOnly = /^<span class="math-eq-container"/.test(processed.trim());
      htmlLines.push(
        `<p class="${isEquationOnly ? "math-eq-display" : ""}">${processed || "<br>"}</p>`
      );
    }

    return htmlLines.join("");
  };

  // Handle paste to intercept and process {{latex}} notation
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const plainText = e.clipboardData.getData("text/plain");

    // Only intercept if the pasted text contains {{...}} patterns
    if (/\{\{[\s\S]*?\}\}/.test(plainText)) {
      e.preventDefault();
      const html = parsePastedLatexText(plainText);
      // execCommand("insertHTML") reliably inserts block-level <p>
      // elements at the caret without creating invalid nesting.
      restoreSelection();
      document.execCommand("insertHTML", false, html);
      updateStatsAndHTML();
      if (editorRef.current) editorRef.current.focus();
    }
    // Otherwise let the browser handle the paste normally
  };

  // Open math modal
  const handleOpenMathModal = () => {
    saveSelection();
    setEditingMathElement(null);
    setMathInitialLatex("");
    setIsMathModalOpen(true);
  };

  // Intercept click on formula inside editor to edit it
  const handleEditorDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const mathContainer = target.closest(".math-eq-container") as HTMLElement | null;
    if (mathContainer) {
      e.preventDefault(); // Prevent text selection on double-click
      const latexVal = mathContainer.getAttribute("data-latex") || "";
      setEditingMathElement(mathContainer);
      setMathInitialLatex(latexVal);
      setIsMathModalOpen(true);
    }
  };

  const handleSaveMath = (latex: string, mathml: string) => {
    if (editingMathElement) {
      // Edit mode: replace MathML
      editingMathElement.setAttribute("data-latex", latex);
      editingMathElement.innerHTML = mathml;
      setEditingMathElement(null);
    } else {
      // Insert mode
      restoreSelection();
      const escapedLatex = escapeHtml(latex);
      const mathHtml = `<span class="math-eq-container" data-latex="${escapedLatex}" contenteditable="false">${mathml}</span>&#x200B;`;
      insertHtmlAtCursor(mathHtml);
    }
    updateStatsAndHTML();
  };

  const handleShowLatex = () => {
    setShowLatexView(prev => !prev);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => {
        alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  const curatedColors = [
    { name: "Black", value: "#000000" },
    { name: "Slate", value: "#475569" },
    { name: "Red", value: "#ef4444" },
    { name: "Orange", value: "#f97316" },
    { name: "Amber", value: "#f59e0b" },
    { name: "Yellow", value: "#eab308" },
    { name: "Green", value: "#22c55e" },
    { name: "Emerald", value: "#10b981" },
    { name: "Teal", value: "#14b8a6" },
    { name: "Cyan", value: "#06b6d4" },
    { name: "Sky", value: "#0ea5e9" },
    { name: "Blue", value: "#3b82f6" },
    { name: "Indigo", value: "#6366f1" },
    { name: "Violet", value: "#8b5cf6" },
    { name: "Purple", value: "#a855f7" },
    { name: "Pink", value: "#ec4899" },
  ];

  const curatedHighlights = [
    { name: "None", value: "transparent" },
    { name: "Highlight Gray", value: "#f1f5f9" },
    { name: "Highlight Red", value: "#fee2e2" },
    { name: "Highlight Orange", value: "#ffedd5" },
    { name: "Highlight Amber", value: "#fef3c7" },
    { name: "Highlight Yellow", value: "#fef9c3" },
    { name: "Highlight Green", value: "#dcfce7" },
    { name: "Highlight Emerald", value: "#d1fae5" },
    { name: "Highlight Teal", value: "#ccfbf1" },
    { name: "Highlight Cyan", value: "#ecfeff" },
    { name: "Highlight Sky", value: "#e0f2fe" },
    { name: "Highlight Blue", value: "#dbeafe" },
    { name: "Highlight Indigo", value: "#e0e7ff" },
    { name: "Highlight Violet", value: "#ede9fe" },
    { name: "Highlight Purple", value: "#f3e8ff" },
    { name: "Highlight Pink", value: "#fce7f3" },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height: isFullscreen ? "100vh" : "100%",
        width: isFullscreen ? "100vw" : "100%",
        position: isFullscreen ? "fixed" : "relative",
        top: isFullscreen ? 0 : "auto",
        left: isFullscreen ? 0 : "auto",
        zIndex: isFullscreen ? 9999 : "auto",
        backgroundColor: "#f8fafc",
        gap: isMobile ? "10px" : "16px",
        minHeight: 0,
        boxSizing: "border-box",
      }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: isMobile ? "10px" : "16px" }}>
        {/* EDITOR AND TOOLBAR COLUMN */}
        {/* This column is always visible unless in 'html' only mode */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minWidth: 0
        }}>

          {/* RICH TEXT TOOLBAR */}
          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
              padding: "6px",
              backgroundColor: "#ffffff",
              borderRadius: "10px 10px 0 0",
              border: "1px solid #e2e8f0",
              borderBottom: "none",
              boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
              alignItems: "center",
            }}
          >
            {/* Font Family Dropdown */}
            <select
              onChange={handleFontChange}
              defaultValue="sans-serif"
              style={{
                padding: isMobile ? "4px 6px" : "4px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: isMobile ? "0.725rem" : "0.8rem",
                fontWeight: 500,
                outline: "none",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">Sans-Serif</option>
              <option value="Georgia, serif">Serif</option>
              <option value="Courier New, Courier, monospace">Monospace</option>
            </select>

            {/* Font Size Dropdown */}
            <select
              onChange={handleSizeChange}
              defaultValue="3"
              style={{
                padding: isMobile ? "4px 6px" : "4px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: isMobile ? "0.725rem" : "0.8rem",
                fontWeight: 500,
                outline: "none",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <option value="1">Small</option>
              <option value="3">Normal</option>
              <option value="5">Large</option>
              <option value="7">Huge</option>
            </select>

            {/* Heading Dropdown */}
            <select
              onChange={handleHeadingChange}
              defaultValue="p"
              style={{
                padding: isMobile ? "4px 6px" : "4px 8px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: isMobile ? "0.725rem" : "0.8rem",
                fontWeight: 500,
                outline: "none",
                backgroundColor: "#f8fafc",
                cursor: "pointer",
              }}
            >
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </select>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* Bold */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("bold"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("bold") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("bold") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Bold"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v16h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c1.1 0 2 .9 2 2s-.9 2-2 2h-3v-4zm3.5 11H10v-4h3.5c1.1 0 2 .9 2 2s-.9 2-2 2z" />
              </svg>
            </button>

            {/* Italic */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("italic"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("italic") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("italic") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Italic"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z" />
              </svg>
            </button>

            {/* Underline */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("underline"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("underline") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("underline") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Underline"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-8 2v2h16v-2H4z" />
              </svg>
            </button>

            {/* StrikeThrough */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("strikeThrough"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("strike") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("strike") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Strikethrough"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 19h4v-3h-4v3zM5 4v3h5v3h4V7h5V4H5zm-1 8h16v-2H4v2z" />
              </svg>
            </button>

            {/* Superscript */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("superscript"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("superscript") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("superscript") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Superscript"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20L12 8M12 20L4 8" />
                <path d="M17 5c0-1.1.9-2 2-2s2 .9 2 2c0 1.1-.9 2-2 2v2h3" />
              </svg>
            </button>

            {/* Subscript */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("subscript"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("subscript") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("subscript") ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Subscript"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 16L12 4M12 16L4 4" />
                <path d="M17 19c0-1.1.9-2 2-2s2 .9 2 2c0 1.1-.9 2-2 2v2h3" />
              </svg>
            </button>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* Text Color Curated Grid Trigger */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setShowColorPicker(!showColorPicker); setShowHighlightPicker(false); }}
                style={{
                  padding: "6px",
                  border: "none",
                  backgroundColor: showColorPicker ? "#eff6ff" : "transparent",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "#475569",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
                title="Text Color"
              >
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z" />
                </svg>
                <div style={{ width: "14px", height: "2px", backgroundColor: "#ef4444", marginTop: "1px" }} />
              </button>

              {showColorPicker && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                    borderRadius: "10px",
                    padding: "10px",
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 24px)",
                    gap: "8px",
                    zIndex: 100,
                    marginTop: "6px",
                  }}
                >
                  {curatedColors.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => {
                        execFormat("foreColor", color.value);
                        setShowColorPicker(false);
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        backgroundColor: color.value,
                        border: "1px solid #e2e8f0",
                        borderRadius: "50%",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = "scale(1.2)";
                        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.15)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
                      }}
                      title={color.name}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Highlight/Background Color Curated Grid Trigger */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => { setShowHighlightPicker(!showHighlightPicker); setShowColorPicker(false); }}
                style={{
                  padding: "6px",
                  border: "none",
                  backgroundColor: showHighlightPicker ? "#eff6ff" : "transparent",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "#475569",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
                title="Highlight Color"
              >
                {/* Highlight Marker SVG */}
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122l9.82-9.82a2.777 2.777 0 000-3.928 2.777 2.777 0 00-3.928 0l-9.82 9.82M9.53 16.122a3 3 0 11-4.243 4.243m4.243-4.243L4.878 11.45m0 0L2.25 14v4.25h4.25l2.628-2.628m-4.25-4.25L9.53 16.12" />
                </svg>
              </button>

              {showHighlightPicker && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                    borderRadius: "10px",
                    padding: "10px",
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 24px)",
                    gap: "8px",
                    zIndex: 100,
                    marginTop: "6px",
                  }}
                >
                  {curatedHighlights.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => {
                        // hiliteColor is supported standard in Chrome/Safari, back-up is backColor
                        try {
                          execFormat("hiliteColor", color.value);
                        } catch {
                          execFormat("backColor", color.value);
                        }
                        setShowHighlightPicker(false);
                      }}
                      style={{
                        width: "24px",
                        height: "24px",
                        backgroundColor: color.value === "transparent" ? "#ffffff" : color.value,
                        border: color.value === "transparent" ? "1px dashed #ef4444" : "1px solid #cbd5e1",
                        borderRadius: "50%",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.15s ease",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = "scale(1.2)";
                        e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.15)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = "scale(1)";
                        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.05)";
                      }}
                      title={color.name}
                    >
                      {color.value === "transparent" && <span style={{ color: "#ef4444", fontSize: "0.8rem", fontWeight: "bold" }}>&times;</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* Align Left */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("justifyLeft"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("left") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("left") ? "#2563eb" : "#475569",
              }}
              title="Align Left"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z" />
              </svg>
            </button>

            {/* Align Center */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("justifyCenter"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("center") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("center") ? "#2563eb" : "#475569",
              }}
              title="Align Center"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 15v2h10v-2H7zm-4 4h18v-2H3v2zm0-8h18v-2H3v2zm4-4v2h10V7H7zm-4 4h18V9H3v2z" />
              </svg>
            </button>

            {/* Align Right */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("justifyRight"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("right") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("right") ? "#2563eb" : "#475569",
              }}
              title="Align Right"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zm-6-8v2h18V3H3z" />
              </svg>
            </button>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* Unordered List */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("insertUnorderedList"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("ul") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("ul") ? "#2563eb" : "#475569",
              }}
              title="Bulleted List"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-7v2h14V6H7z" />
              </svg>
            </button>

            {/* Ordered List */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("insertOrderedList"); }}
              style={{
                padding: "6px",
                backgroundColor: activeFormats.includes("ol") ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: activeFormats.includes("ol") ? "#2563eb" : "#475569",
              }}
              title="Numbered List"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9v-.9H2v1zm5-6v2h14V6H7zm0 7h14v-2H7v2zm0 6h14v-2H7v2z" />
              </svg>
            </button>

            {/* Outdent (Decrease Indent) */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("outdent"); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Decrease Indent"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 17h10v-2H11v2zm-8-5l4 4V8l-4 4zm0 9h18v-2H3v2zM3 3v2h18V3H3zm8 6h10V7H11v2zm0 4h10v-2H11v2z" />
              </svg>
            </button>

            {/* Indent (Increase Indent) */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("indent"); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Increase Indent"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 21h18v-2H3v2zm0-18v2h18V3H3zm8 14h10v-2H11v2zM7 12l-4-4v8l4-4zm4-3h10V7H11v2zm0 4h10v-2H11v2z" />
              </svg>
            </button>

            {/* Blockquote */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<blockquote>"); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Quote"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
              </svg>
            </button>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* Insert Link */}
            <button
              onMouseDown={(e) => { e.preventDefault(); insertLink(); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Insert Link"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
              </svg>
            </button>

            {/* Insert Image */}
            <button
              onMouseDown={(e) => { e.preventDefault(); insertImage(); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Insert Image"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </button>

            {/* Insert Code Block */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("formatBlock", "<pre>"); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
              }}
              title="Code Block"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </button>

            <div style={{ width: "1px", height: "20px", backgroundColor: "#e2e8f0", margin: "0 4px" }} />

            {/* INSERT MATH EQUATION (∑) */}
            <button
              onClick={handleOpenMathModal}
              style={{
                padding: "6px 10px",
                backgroundColor: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 600,
                fontSize: "0.75rem",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
              title="Insert Equation (LaTeX)"
            >
              <span style={{ fontSize: "0.9rem" }}>&sum;</span>
              Math Equation
            </button>

            {/* SHOW LATEX IN CONSOLE */}
            <button
              onClick={handleShowLatex}
              style={{
                padding: "6px",
                backgroundColor: showLatexView ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: showLatexView ? "#2563eb" : "#475569",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title={showLatexView ? "Show Visual Editor" : "Show LaTeX Source"}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
            </button>


            {/* OCR SCAN BUTTON */}
            <button
              onClick={() => {
                saveSelection();
                setIsOcrModalOpen(true);
              }}
              style={{
                padding: "6px 10px",
                backgroundColor: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#0f172a",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 600,
                fontSize: "0.75rem",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
              title="Scan Equation from Image (OCR)"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              </svg>
              Scan Image
            </button>

            {/* Clear Formatting */}
            <button
              onMouseDown={(e) => { e.preventDefault(); execFormat("removeFormat"); }}
              style={{
                padding: "6px",
                backgroundColor: "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#475569",
                marginLeft: "auto",
              }}
              title="Clear Formatting"
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4 10-10S17.53 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
            </button>

            {/* Fullscreen Button */}
            <button
              onMouseDown={(e) => { e.preventDefault(); toggleFullscreen(); }}
              style={{
                padding: "6px",
                backgroundColor: isFullscreen ? "#eff6ff" : "transparent",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                color: isFullscreen ? "#2563eb" : "#475569",
              }}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            >
              {isFullscreen ? (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7" />
                </svg>
              ) : (
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
          </div>

          {/* EDITOR AREA (SHEET LAYOUT) */}
          <div
            className="editor-content-area"
            style={{
              display: "block",
              flex: 1,
              backgroundColor: "#fff",
              border: "1px solid #e2e8f0",
              overflowY: "auto",
              minHeight: 0,
              height: "100%",
            }}
          >
            {/* LaTeX View */}
            <div
              key="latex-editor-view"
              style={{
                backgroundColor: "#ffffff",
                height: "100%",
                display: showLatexView ? "block" : "none",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  height: "100%",
                  overflowY: "auto",
                  color: "#0f172a",
                  fontSize: "0.9rem",
                  fontFamily: "Courier New, Courier, monospace",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  lineHeight: "1.6",
                  padding: "1.5em",
                  boxSizing: "border-box",
                  background: "#fff"
                }}
              >
                {cleanLatexHtml}
              </pre>
            </div>

            {/* Visual Editor View */}
            <div
              key="visual-editor-view"
              ref={editorRef}
              suppressContentEditableWarning={true}
              contentEditable
              onInput={updateStatsAndHTML}
              onSelect={checkSelectionFormats}
              onKeyUp={checkSelectionFormats}
              onMouseUp={checkSelectionFormats}
              onDoubleClick={handleEditorDoubleClick}
              onKeyDown={handleEditorKeyDown}
              onPaste={handlePaste}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: 0,
                boxShadow: "none",
                padding: "1.5em",
                outline: "none",
                fontSize: "1rem",
                color: "#1e293b",
                lineHeight: "1.65",
                cursor: "text",
                display: showLatexView ? "none" : "block",
              }}
            />
          </div>
        </div>
      </div>

      {/* Visual Equation Editor Popover Modal */}
      <EquationEditorModal
        isOpen={isMathModalOpen}
        initialLatex={mathInitialLatex}
        onClose={() => {
          setIsMathModalOpen(false);
          setEditingMathElement(null);
        }}
        onSave={handleSaveMath}
      />

      {/* Image Equation Scanner Modal */}
      <EquationOcrModal
        isOpen={isOcrModalOpen}
        onClose={() => setIsOcrModalOpen(false)}
        onInsert={handleSaveMath}
      />

      {/* Custom Link Editor Modal */}
      {isLinkModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            animation: "fadeIn 0.2s ease-out",
          }}
          onClick={() => setIsLinkModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
              animation: "scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid #f1f5f9",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "#0f172a" }}>
                Insert Link
              </h3>
              <button
                onClick={() => setIsLinkModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#94a3b8",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#f1f5f9";
                  e.currentTarget.style.color = "#475569";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: "20px 24px" }}>
              {/* Link Text */}
              <div style={{ marginBottom: "16px" }}>
                <label
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
                  Link Text
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveLink();
                    }
                  }}
                  placeholder="e.g. ABC"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "0.95rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    outline: "none",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#cbd5e1";
                    e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.05)";
                  }}
                />
              </div>

              {/* Link URL */}
              <div style={{ marginBottom: "20px" }}>
                <label
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
                  Link URL
                </label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveLink();
                    }
                  }}
                  placeholder="e.g. https://abc.com"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: "0.95rem",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    outline: "none",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#3b82f6";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#cbd5e1";
                    e.currentTarget.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.05)";
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  onClick={() => setIsLinkModalOpen(false)}
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
                  onClick={handleSaveLink}
                  style={{
                    padding: "10px 22px",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    color: "#ffffff",
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
                  Insert Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
