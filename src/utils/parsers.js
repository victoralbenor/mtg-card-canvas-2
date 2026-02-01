/**
 * Parse a card list line to extract quantity and card name
 * Supports formats like:
 * - "4 Lightning Bolt"
 * - "4x Lightning Bolt"
 * - "Lightning Bolt" (defaults to 1)
 * 
 * @param {string} line - Line to parse
 * @returns {Object} {count: number, name: string}
 */
export function parseLine(line) {
  const match = line.match(/^(\d+)[x\s]+(.+)$/i);
  if (match) {
    return {
      count: Math.max(1, parseInt(match[1], 10)),
      name: match[2].trim()
    };
  }
  return {
    count: 1,
    name: line.trim()
  };
}

/**
 * Validate if a string could be a card name
 * @param {string} text - Text to validate
 * @returns {boolean} True if valid format
 */
export function isValidCardNameFormat(text) {
  return text && text.trim().length > 0;
}
