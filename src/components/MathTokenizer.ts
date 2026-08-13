export interface Token {
  type:
    | "COMMAND"
    | "GROUP_START"
    | "GROUP_END"
    | "INDEX_START"
    | "INDEX_END"
    | "SUPER"
    | "SUB"
    | "NUMBER"
    | "OPERATOR"
    | "CHAR"
    | "TEXT_LITERAL"
    | "AMPERSAND"
    | "EOF";
  value: string;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (char === "\\") {
      let word = "\\";
      i++;
      while (i < input.length && /[a-zA-Z*]/.test(input[i])) {
        word += input[i];
        i++;
      }
      // Special case: \text{...} literal content
      if (word === "\\text") {
        while (i < input.length && /\s/.test(input[i])) {
          i++;
        }
        if (i < input.length && input[i] === "{") {
          i++;
          let textVal = "";
          let braceCount = 1;
          while (i < input.length && braceCount > 0) {
            const nextChar = input[i];
            if (nextChar === "{") braceCount++;
            else if (nextChar === "}") braceCount--;
            if (braceCount > 0) {
              textVal += nextChar;
              i++;
            }
          }
          if (i < input.length && input[i] === "}") {
            i++;
          }
          tokens.push({ type: "TEXT_LITERAL", value: textVal });
          continue;
        }
      }
      tokens.push({ type: "COMMAND", value: word });
      continue;
    }
    if (char === "{") { tokens.push({ type: "GROUP_START", value: "{" }); i++; continue; }
    if (char === "}") { tokens.push({ type: "GROUP_END", value: "}" }); i++; continue; }
    if (char === "[") { tokens.push({ type: "INDEX_START", value: "[" }); i++; continue; }
    if (char === "]") { tokens.push({ type: "INDEX_END", value: "]" }); i++; continue; }
    if (char === "^") { tokens.push({ type: "SUPER", value: "^" }); i++; continue; }
    if (char === "_") { tokens.push({ type: "SUB", value: "_" }); i++; continue; }
    if (char === "&") { tokens.push({ type: "AMPERSAND", value: "&" }); i++; continue; }
    if (/\d/.test(char)) {
      let num = char; i++;
      while (i < input.length && /[\d.]/.test(input[i])) { num += input[i]; i++; }
      tokens.push({ type: "NUMBER", value: num });
      continue;
    }
    if (/[\+\-\=\<\>\/\*()!:,.;|']/.test(char)) {
      tokens.push({ type: "OPERATOR", value: char }); i++; continue;
    }
    tokens.push({ type: "CHAR", value: char });
    i++;
  }
  tokens.push({ type: "EOF", value: "" });
  return tokens;
}
