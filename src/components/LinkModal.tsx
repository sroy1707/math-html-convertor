import React from "react";
import Modal from "./Modal";

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  linkText: string;
  setLinkText: (text: string) => void;
  linkUrl: string;
  setLinkUrl: (url: string) => void;
  onSave: () => void;
}

export default function LinkModal({
  isOpen,
  onClose,
  linkText,
  setLinkText,
  linkUrl,
  setLinkUrl,
  onSave,
}: LinkModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Insert Link"
      maxWidth="420px"
    >
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
                onSave();
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
                onSave();
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
            onClick={onClose}
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
            onClick={onSave}
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
    </Modal>
  );
}
