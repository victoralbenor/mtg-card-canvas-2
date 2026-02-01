/**
 * Organize elements into basket columns based on their tags
 * @param {Array} elements - Array of elements
 * @returns {Object} {baskets, columns}
 *   - baskets: Object mapping tag names to arrays of elements
 *   - columns: Array of column names (tag names + "Untagged")
 */
export function getBasketData(elements) {
  const baskets = { 'Untagged': [] };
  const allTags = new Set();

  elements.forEach(el => {
    if (el.tags && el.tags.length > 0) {
      el.tags.forEach(tag => {
        allTags.add(tag);
        if (!baskets[tag]) {
          baskets[tag] = [];
        }
        baskets[tag].push(el);
      });
    } else {
      baskets['Untagged'].push(el);
    }
  });

  // Sort tags alphabetically, put "Untagged" first
  const columns = ['Untagged', ...Array.from(allTags).sort()];

  return { baskets, columns };
}

/**
 * Calculate basket column display mode (spread/stack)
 * @param {Object} basketColumnModes - Current column modes
 * @param {string} columnTag - Tag name
 * @returns {string} 'spread' or 'stack'
 */
export function getColumnMode(basketColumnModes, columnTag) {
  return basketColumnModes[columnTag] || 'spread';
}

/**
 * Calculate margin for stacked cards in basket view
 * @param {Object} element - Element to calculate margin for
 * @param {number} index - Index in the stack
 * @param {boolean} isStacked - Whether column is in stack mode
 * @returns {number} Margin in pixels (negative for overlap)
 */
export function calculateStackMargin(element, index, isStacked) {
  if (!isStacked || index === 0) {
    return 0;
  }
  
  // Card height 280px, sticky 200px
  // We want visible header ~35px
  // So for card: -245px, for sticky: -165px
  return element.type === 'sticky' ? -165 : -245;
}
