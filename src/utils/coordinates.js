import { CARD_WIDTH, CARD_HEIGHT, STICKY_SIZE, IMAGE_QUALITY_SMALL_THRESHOLD, IMAGE_QUALITY_LARGE_THRESHOLD } from '../constants.js';

/**
 * Get the optimal Scryfall image quality based on current zoom level
 * @param {number} scale - Current view scale
 * @returns {string} Scryfall image size ('small', 'normal', or 'large')
 */
export function getOptimalImageQuality(scale) {
  if (scale < IMAGE_QUALITY_SMALL_THRESHOLD) return 'small';  // 146x204
  if (scale > IMAGE_QUALITY_LARGE_THRESHOLD) return 'large';  // 672x936
  return 'normal';  // 488x680 (default)
}

/**
 * Construct Scryfall image URL with specific quality
 * @param {string} scryfallId - Card's Scryfall ID
 * @param {string} quality - Image quality ('small', 'normal', 'large')
 * @returns {string} Image URL
 */
export function getScryfallImageUrl(scryfallId, quality = 'normal') {
  if (!scryfallId) return null;
  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=${quality}`;
}

/**
 * Convert screen coordinates to world coordinates
 * @param {number} screenX - Screen X position
 * @param {number} screenY - Screen Y position
 * @param {Object} view - Current view state {x, y, scale}
 * @returns {Object} World coordinates {x, y}
 */
export function screenToWorld(screenX, screenY, view) {
  return {
    x: (screenX - view.x) / view.scale,
    y: (screenY - view.y) / view.scale
  };
}

/**
 * Check if a selection box intersects with an element
 * @param {Object} box - Selection box {startX, startY, currentX, currentY}
 * @param {Object} element - Element to check {x, y, type}
 * @returns {boolean} True if intersects
 */
export function checkIntersection(box, element) {
  const minX = Math.min(box.startX, box.currentX);
  const maxX = Math.max(box.startX, box.currentX);
  const minY = Math.min(box.startY, box.currentY);
  const maxY = Math.max(box.startY, box.currentY);
  
  const width = CARD_WIDTH;
  const height = element.type === 'sticky' ? STICKY_SIZE : CARD_HEIGHT;
  
  return (
    minX < element.x + width && 
    maxX > element.x && 
    minY < element.y + height && 
    maxY > element.y
  );
}

/**
 * Calculate new view for zoom centered on a point
 * @param {number} mouseX - Mouse X position
 * @param {number} mouseY - Mouse Y position
 * @param {number} newScale - New scale value
 * @param {Object} currentView - Current view state
 * @returns {Object} New view {x, y, scale}
 */
export function calculateZoomCenteredOnPoint(mouseX, mouseY, newScale, currentView) {
  const worldBefore = {
    x: (mouseX - currentView.x) / currentView.scale,
    y: (mouseY - currentView.y) / currentView.scale
  };
  
  return {
    x: mouseX - worldBefore.x * newScale,
    y: mouseY - worldBefore.y * newScale,
    scale: newScale
  };
}

/**
 * Check if an element is visible in the current viewport
 * @param {Object} element - Element to check
 * @param {Object} view - Current view state
 * @param {number} viewportWidth - Browser window width
 * @param {number} viewportHeight - Browser window height
 * @param {number} margin - Extra margin for culling (in pixels)
 * @returns {boolean} True if element is visible
 */
export function isElementInViewport(element, view, viewportWidth, viewportHeight, margin = 500) {
  // Element dimensions in screen space
  const width = element.type === 'sticky' ? STICKY_SIZE : CARD_WIDTH;
  const height = element.type === 'sticky' ? STICKY_SIZE : CARD_HEIGHT;
  
  // Element bounds in screen coordinates
  const screenLeft = element.x * view.scale + view.x;
  const screenTop = element.y * view.scale + view.y;
  const screenRight = screenLeft + (width * view.scale);
  const screenBottom = screenTop + (height * view.scale);
  
  // Check if element intersects with viewport (with margin)
  return (
    screenRight > -margin &&
    screenLeft < viewportWidth + margin &&
    screenBottom > -margin &&
    screenTop < viewportHeight + margin
  );
}
