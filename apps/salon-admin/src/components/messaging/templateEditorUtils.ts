export function replaceTemplateTokens(input: string, values: Record<string, string>) {
  return input.replace(/\{\{([^}]+)\}\}/g, (_, rawToken) => {
    const token = String(rawToken).trim();
    return values[token] ?? `{{${token}}}`;
  });
}

export function prettifyTokenLabel(token: string) {
  return token
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function htmlToEditableText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textToBasicEmailHtml(text: string) {
  const convertInlineFormatting = (value: string) =>
    value
      .replace(/\[Button:\s*([^\]]+)\]/g, '<a href="{{cta_link}}" style="display:inline-block;padding:12px 18px;border-radius:9999px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">$1</a>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:underline;">$1</a>')
      .replace(/__([^_]+)__/g, '<span style="text-decoration:underline;">$1</span>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>");

  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trimEnd());
      const isBulletBlock = lines.every((line) => line.startsWith("• "));
      const isNumberedBlock = lines.every((line) => /^\d+\.\s/.test(line));

      if (isBulletBlock) {
        return `<ul>${lines
          .map((line) => `<li>${convertInlineFormatting(line.replace(/^•\s/, ""))}</li>`)
          .join("")}</ul>`;
      }

      if (isNumberedBlock) {
        return `<ol>${lines
          .map((line) => `<li>${convertInlineFormatting(line.replace(/^\d+\.\s/, ""))}</li>`)
          .join("")}</ol>`;
      }

      const joined = lines.join("<br />");
      if (joined.trim() === "---") {
        return '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />';
      }

      return `<p>${convertInlineFormatting(joined)}</p>`;
    })
    .join("");
}

export function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
) {
  const selectedText = value.slice(selectionStart, selectionEnd) || "your text";
  const nextValue = `${value.slice(0, selectionStart)}${before}${selectedText}${after}${value.slice(selectionEnd)}`;
  const nextCursor = selectionStart + before.length + selectedText.length + after.length;
  return { nextValue, nextCursor };
}
