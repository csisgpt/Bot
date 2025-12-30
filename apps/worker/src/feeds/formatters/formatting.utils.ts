const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => htmlEscapes[char] ?? char);

export const chunkMessage = (message: string, maxLength = 3800): string[] => {
  if (message.length <= maxLength) {
    return [message];
  }

  const lines = message.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = line;
      } else {
        chunks.push(line.slice(0, maxLength));
        current = line.slice(maxLength);
      }
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};
