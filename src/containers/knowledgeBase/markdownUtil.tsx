/*
 * 转义 markdown 中的特殊字符, 以支持Katex和Math公式渲染
 */


  export function escapeBrackets(text: string): string {
    return text.replace(/(\\\[((?:\\[a-zA-Z]|\{[0-9]+\}|[^\]])*)\\\])|(\[((?:\\[a-zA-Z]|\{[0-9]+\}|[^\]])*)\])/g, (match, _, latexContent1, __, latexContent2) => {
      const latexContent = latexContent1 || latexContent2;
      if (/\\[a-zA-Z]|\{[0-9]+\}/.test(latexContent)) {
        return `$${latexContent}$`;
      } else {
        return match.replace(/\$/g, '\\$');
      }
    });
  }
  
  export function escapeMhchem (text: string) {
    return text.replace(/((?<!\$)\\(?:ce|pu)((?:{[^{}]*(?:{[^{}]*}[^{}]*)*})+))/g, (match, _, content) => {
      return `$${content}$`;
    });
  }
  
  /**
   * Preprocesses LaTeX content by replacing delimiters and escaping certain characters.
   *
   * @param content The input string containing LaTeX expressions.
   * @returns The processed string with replaced delimiters and escaped characters.
   */
  export function preprocessLaTeX (content: string) {
    // Step 1: Protect code blocks
    const codeBlocks: string[] = [];
    content = content.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match: string, code: string) => {
      codeBlocks.push(code);
      return `<<CODE_BLOCK_${codeBlocks.length - 1}>>`;
    });
  
    // Step 2: Protect existing LaTeX expressions
    const latexExpressions: string[] = [];
    content = content.replace(/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g, (match: string) => {
      latexExpressions.push(match);
      return `<<LATEX_${latexExpressions.length - 1}>>`;
    });
  
    // Step 3: Escape dollar signs that are likely currency indicators
    content = content.replace(/\$(?=\d)/g, '\\$');
  
    // Step 4: Restore LaTeX expressions
    content = content.replace(/<<LATEX_(\d+)>>/g, (_: string, index: string) => latexExpressions[parseInt(index)]);
  
    // Step 5: Restore code blocks
    content = content.replace(/<<CODE_BLOCK_(\d+)>>/g, (_: string, index: string) => codeBlocks[parseInt(index)]);
  
    // Step 6: Apply additional escaping functions
    content = escapeBrackets(content);
    content = escapeMhchem(content);
    return content;
  }