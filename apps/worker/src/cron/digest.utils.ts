export const truncateDigestMessage = (text: string, maxLen = 3800): string => {
  const stripped = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (stripped.length <= maxLen) {
    return stripped;
  }

  return `${stripped.slice(0, Math.max(0, maxLen - 1))}…`;
};
