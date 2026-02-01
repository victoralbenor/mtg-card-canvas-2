import { CARD_WIDTH, CARD_HEIGHT, STICKY_SIZE } from '../constants.js';

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
