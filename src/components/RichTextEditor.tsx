"use client";

import { useEffect, useRef, useState } from "react";
import EquationEditorModal from "./EquationEditorModal";
import EquationOcrModal from "./EquationOcrModal";
import { latexToMathML } from "./MathParser";
import LinkModal from "./LinkModal";

import {
  escapeHtml,
  getCaretCharacterOffsetWithin,
  setCaretCharacterOffsetWithin,
  indentListItem,
  outdentListItem,
} from "./EditorHelpers";
import EditorToolbar from "./EditorToolbar";

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
  const [cleanLatexHtml, setCleanLatexHtml] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLatexView, setShowLatexView] = useState(false);

  // Window width tracking for responsiveness
  const [windowWidth, setWindowWidth] = useState<number>(1200);

  useEffect(() => {
    setWindowWidth(window.innerWidth);
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
    saveSelection();
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
        minHeight: 0,
        boxSizing: "border-box",
        padding: 0,
      }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        {/* EDITOR AND TOOLBAR COLUMN */}
        {/* This column is always visible unless in 'html' only mode */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minWidth: 0,
        }}>
          {/* RICH TEXT TOOLBAR */}
          <EditorToolbar
            isMobile={isMobile}
            activeFormats={activeFormats}
            execFormat={execFormat}
            handleFontChange={handleFontChange}
            handleSizeChange={handleSizeChange}
            handleHeadingChange={handleHeadingChange}
            insertLink={insertLink}
            insertImage={insertImage}
            handleOpenMathModal={handleOpenMathModal}
            showLatexView={showLatexView}
            handleShowLatex={handleShowLatex}
            saveSelection={saveSelection}
            setIsOcrModalOpen={setIsOcrModalOpen}
            isFullscreen={isFullscreen}
            toggleFullscreen={toggleFullscreen}
          />

          {/* EDITOR AREA (SHEET LAYOUT) */}
          <div
            className="editor-content-area"
            style={{
              display: "block",
              flex: 1,
              backgroundColor: "#fff",
              overflowY: "auto",
              overflowX: "hidden",
              minHeight: 0,
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
                minHeight: "100%",
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
      <LinkModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        linkText={linkText}
        setLinkText={setLinkText}
        linkUrl={linkUrl}
        setLinkUrl={setLinkUrl}
        onSave={handleSaveLink}
      />
    </div>
  );
}
