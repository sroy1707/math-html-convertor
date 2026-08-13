// Helper to escape HTML characters
export const escapeHtml = (str: string) => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// Helper to get caret character offset relative to an element
export const getCaretCharacterOffsetWithin = (element: HTMLElement) => {
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
export const setCaretCharacterOffsetWithin = (element: HTMLElement, offset: number) => {
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
export const indentListItem = (li: HTMLElement) => {
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
export const outdentListItem = (li: HTMLElement): HTMLElement => {
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
