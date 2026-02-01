# MTG Card Canvas - AI Agent Instructions

## Architecture Overview

This is a single-page React app for organizing Magic: The Gathering cards on an infinite pan/zoom canvas. The application has been **modularized for maintainability** with a clean separation of concerns.

### Tech Stack
- **React 18** with hooks (no class components)
- **Firebase** - Anonymous auth + Firestore real-time sync
- **Vite** - Dev server & build tool
- **Tailwind CSS** - All styling via utility classes
- **Scryfall API** - Card search & images

### Project Structure
```
src/
├── App.jsx              # Main React component (~800 lines, UI only)
├── constants.js         # All configuration values and constants
├── firebase-config.js   # Firebase credentials
├── utils/
│   ├── coordinates.js   # Screen/world transformations, zoom logic
│   ├── parsers.js       # Text parsing utilities
│   ├── elements.js      # Element manipulation, tagging logic
│   └── basketHelpers.js # Basket view organization
├── main.jsx             # React entry point
└── index.css            # Tailwind directives + custom CSS
```

### Data Model
```javascript
// Firestore path: artifacts/{appId}/users/{userId}/canvas_data/main_board
{
  elements: [
    {id, type: 'card'|'sticky', x, y, zIndex, tags: [], ...},
  ],
  view: {x, y, scale},  // Only canvas view persisted
  hasSeenHelp: boolean
}
```

## Critical Patterns

### 1. Race Condition Prevention (DO NOT BREAK)
Firebase's `onSnapshot` listener runs in parallel with user interactions. Without protection, dragging elements would be overwritten by database updates:

```javascript
// In onSnapshot callback - NEVER remove these guards
if (!isDraggingRef.current && !isPanningRef.current) {
  setElements(data.elements);
}

// In drag/pan handlers - ALWAYS set both state AND ref
setIsDragging(true);
isDraggingRef.current = true;  // Blocks DB overwrites
```

**Rule:** Any interaction that modifies position/viewport must set `isDraggingRef` or `isPanningRef` to `true` before updating state.

### 2. Coordinate Transformations
The canvas uses world coordinates (infinite space) with viewport transformations:

```javascript
// Screen → World (for placing elements)
const worldPos = {
  x: (screenX - view.x) / view.scale,
  y: (screenY - view.y) / view.scale
};

// Zoom centered on cursor (preserve point under mouse)
const worldBefore = {x: (mouseX - view.x) / view.scale, ...};
const newView = {
  x: mouseX - worldBefore.x * newScale,
  y: mouseY - worldBefore.y * newScale,
  scale: newScale
};
```

### 3. View Mode State Preservation
Canvas and basket modes maintain separate viewports via `savedViews` ref:

```javascript
// When switching modes
savedViews.current[viewMode] = view;  // Save current
setView(savedViews.current[newMode]);  // Restore new
```

**Only canvas view persists to Firebase** - basket view is session-only.

### 4. Debounced Firebase Writes
All state changes trigger a 1-second debounced save to prevent excessive writes:

```javascript
useEffect(() => {
  const timer = setTimeout(() => saveToFirebase(), 1000);
  return () => clearTimeout(timer);
}, [elements, view, /* deps */]);
```

## Development Workflow

### Running the App
```bash
npm install       # First time setup
npm run dev       # Start dev server (localhost:5173)
```

**Common Issue:** If dev server fails, check:
1. Node modules installed (`node_modules/` exists)
2. Firebase config valid in [src/firebase-config.js](../src/firebase-config.js)
3. No port conflicts on 5173

### Testing Firebase Integration
- Uses **anonymous auth** - no login required
- Each browser gets unique UID
- Data scoped per user: `artifacts/mtg-canvas-v1/users/{uid}/...`
- Test multi-device sync by opening different browsers

### Debugging Tips
1. **Elements disappearing?** Check `isDraggingRef`/`isPanningRef` guards in `onSnapshot`
2. **Zoom/pan janky?** Ensure CSS transforms use hardware acceleration (`will-change: transform`)
3. **Tags not saving?** Verify element modification triggers debounced save
4. **Import errors from './constants.js'?** These are phantom imports - code is inline in App.jsx

## Code Conventions

### Module Organization
- **constants.js** - Add new configuration values here (dimensions, timing, URLs, modes)
- **utils/coordinates.js** - Coordinate transformations, zoom calculations
- **utils/parsers.js** - Text parsing (card lists, validation)
- **utils/elements.js** - Pure functions for element manipulation (immutable patterns)
- **utils/basketHelpers.js** - Basket view data organization
- **App.jsx** - React component only, minimal business logic

### State Management
- **useState** for UI state (triggers re-renders)
- **useRef** for interaction state that needs synchronous access (`isDraggingRef`, `lastTouchDistance`)
- **Set objects** for selections (`selectedIds`) - check membership with `.has(id)`
 documented in constants.js
- Use `pointer-events-none` on container + `pointer-events-auto` on children for UI overlays

### Utility Functions
All utility functions follow these patterns:
- **Pure functions** - no side effects, return new arrays/objects
- **Immutable updates** - use array.map(), spread operators
- **Clear naming** - function names describe action (toggleTagOnElements, screenToWorld)
- **JSDoc comments** - document parameters and return values

Example from [utils/elements.js](../src/utils/elements.js):
```javascript
/**
 * Toggle a tag on multiple elements (tri-state logic)
 * @param {Array} elements - Array of elements
 * @param {Set} elementIds - IDs to modify
All API constants defined in [constants.js](../src/constants.js):
```javascript
SCRYFALL_AUTOCOMPLETE_URL  // Autocomplete with 300ms debounce
SCRYFALL_NAMED_URL         // Named card lookup
```

Response handling:
```javascript
// Response: {image_uris: {normal: '...'}, card_faces: [...]}
const imageUrl = data.image_uris?.normal || 
                 data.card_faces?.[0]?.image_uris?.normal || 
                 PLACEHOLDER_IMAGE_URL;
### Styling
- **Tailwind only** - no CSS modules or styled-components
- Z-index hierarchy:
  - 10002: Modals
  - 10000: Context menus
  - 9999: Selected elements
  - Dynamic: Normal elements (via `zIndex` property)
- Use `pointer-events-none` on container + `pointer-events-auto` on children for UI overlays

### API Integration
```javascript
// Scryfall autocomplete (300ms debounce)
const url = `https://api.scryfall.com/cards/autocomplete?q=${query}`;

// Named card lookup
const url = `https://api.scryfall.com/cards/named?exact=${cardName}`;
// Response: {image_uris: {normal: '...'}, card_faces: [...]}
```

## Feature Areas

### Canvas Interaction
- Box selection: Drag on background with mouse down
- Element drag: Click element, then drag (supports multi-select)
- Pan: Space+drag, middle mouse, or pan mode toggle
- Zoom: Mouse wheel (centered on cursor), pinch gesture

### Tag System
- Tags are string arrays on elements: `element.tags = ['red', 'aggro']`
- Tri-state toggle logic:
  ```javascript
  const allHaveTag = selectedElements.every(el => el.tags?.includes(tag));
  if (allHaveTag) removeTag(); 
  else addTag();
  ```
- Clicking tag badge selects all elements with that tag

### Basket View
- Auto-generates columns per unique tag + "Untagged" column
- Column modes: "spread" (vertical spacing) vs "stack" (overlapped)
**Core Application:**
- [src/App.jsx](../src/App.jsx) - Main React component (~800 lines)
- [src/constants.js](../src/constants.js) - All configuration constants
- [src/firebase-config.js](../src/firebase-config.js) - Firebase credentials

**Utilities:**
- [src/utils/coordinates.js](../src/utils/coordinates.js) - Coordinate transformations
- [src/utils/parsers.js](../src/utils/parsers.js) - Text parsing functions
- [src/utils/elements.js](../src/utils/elements.js) - Element manipulation
- [src/utils/basketHelpers.js](../src/utils/basketHelpers.js) - Basket view logic

**Documentation:**
- [PROJECT_REFERENCE.md](../PROJECT_REFERENCE.md) - Detailed feature documentation
- [README.md](../README.md) - Setup instructions

## What NOT to Do

❌ **Don't inline constants** - use constants.js for all configuration  
❌ **Don't add logic to App.jsx** - extract to appropriate utility module  
❌ **Don't mutate state directly** - always use immutable patterns  
❌ **Don't remove ref guards** in `onSnapshot` - causes race conditions  
❌ **Don't use CSS-in-JS** - project uses Tailwind exclusively  
❌ **Don't persist basket view** to Firebase - intentionally session-only  

## Quick Wins for New Features

- **Add constants:** Add to [constants.js](../src/constants.js) - timing, dimensions, modes
- **Add utility function:** Add to appropriate utils/ file with JSDoc
- **New element type:** Extend `type` field validation, add rendering in App.jsx
- **New tag operation:** Add pure function to [utils/elements.js](../src/utils/elements.js)
- **Coordinate logic:** Add to [utils/coordinates.js](../src/utils/coordinates.js)
- **Card parsing:** Extend [utils/parsers.js](../src/utils/parsers.js)
- **Add element types:** Extend `type` field ('card' | 'sticky' | 'YOUR_TYPE')
- **New tags UI:** Modify tag rendering in basket columns (search "basket view" in App.jsx)
- **Keyboard shortcuts:** Add handlers in main `onKeyDown` effect
- **Export formats:** Extend `handleExportBoard()` with new serialization
- **Card details modal:** Use Scryfall's full card object in search results
