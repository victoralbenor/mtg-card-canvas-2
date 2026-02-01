/**
 * Bring an element to the front by updating its z-index
 * @param {Array} elements - Array of elements
 * @param {string} id - ID of element to bring to front
 * @returns {Array} Updated elements array
 */
export function bringToFront(elements, id) {
  const maxZ = Math.max(...elements.map(el => el.zIndex), 0);
  return elements.map(el => 
    el.id === id ? { ...el, zIndex: maxZ + 1 } : el
  );
}

/**
 * Remove an element from the array
 * @param {Array} elements - Array of elements
 * @param {string} id - ID of element to remove
 * @returns {Array} Updated elements array
 */
export function removeElement(elements, id) {
  return elements.filter(el => el.id !== id);
}

/**
 * Update sticky note content
 * @param {Array} elements - Array of elements
 * @param {string} id - ID of sticky to update
 * @param {string} newContent - New content
 * @returns {Array} Updated elements array
 */
export function updateStickyContent(elements, id, newContent) {
  return elements.map(el => 
    el.id === id ? { ...el, content: newContent } : el
  );
}

/**
 * Get all unique tags from elements
 * @param {Array} elements - Array of elements
 * @returns {Array} Sorted array of unique tags
 */
export function getAllUniqueTags(elements) {
  return Array.from(
    new Set(elements.flatMap(el => el.tags || []))
  ).sort();
}

/**
 * Select all elements with a specific tag
 * @param {Array} elements - Array of elements
 * @param {string} tag - Tag to search for
 * @returns {Set} Set of element IDs
 */
export function getElementsWithTag(elements, tag) {
  const ids = new Set();
  elements.forEach(el => {
    if (el.tags && el.tags.includes(tag)) {
      ids.add(el.id);
    }
  });
  return ids;
}

/**
 * Toggle a tag on multiple elements (tri-state logic)
 * If all have it: remove it
 * Otherwise: add it to elements that don't have it
 * 
 * @param {Array} elements - Array of elements
 * @param {Set} elementIds - IDs of elements to modify
 * @param {string} tag - Tag to toggle
 * @returns {Array} Updated elements array
 */
export function toggleTagOnElements(elements, elementIds, tag) {
  const relevant = elements.filter(el => elementIds.has(el.id));
  const count = relevant.filter(el => el.tags?.includes(tag)).length;
  const total = relevant.length;
  const shouldRemove = count === total;

  return elements.map(el => {
    if (elementIds.has(el.id)) {
      const tags = el.tags || [];
      if (shouldRemove) {
        return { ...el, tags: tags.filter(t => t !== tag) };
      }
      if (!tags.includes(tag)) {
        return { ...el, tags: [...tags, tag] };
      }
    }
    return el;
  });
}

/**
 * Add a new tag to multiple elements
 * @param {Array} elements - Array of elements
 * @param {Set} elementIds - IDs of elements to modify
 * @param {string} tag - Tag to add
 * @returns {Array} Updated elements array
 */
export function addTagToElements(elements, elementIds, tag) {
  return elements.map(el => {
    if (elementIds.has(el.id)) {
      const tags = el.tags || [];
      if (!tags.includes(tag)) {
        return { ...el, tags: [...tags, tag] };
      }
    }
    return el;
  });
}
