# MTG Card Canvas - Project Reference

## Overview
An infinite canvas application for organizing Magic: The Gathering cards with pan/zoom, tagging, and basket views. Built with React, Vite, Tailwind CSS, and Firebase.

---

## Tech Stack

### Core Technologies
- **React 18.2** - UI framework
- **Vite 5.0** - Build tool & dev server
- **Tailwind CSS 3.4** - Utility-first styling
- **Firebase 10.7** - Backend (Auth + Firestore)
- **Lucide React** - Icon library

### APIs
- **Scryfall API** - MTG card data & images
  - Autocomplete: `https://api.scryfall.com/cards/autocomplete?q={query}`
  - Named card: `https://api.scryfall.com/cards/named?exact={name}`

---

## Architecture

### Data Flow
```
User Auth (Anonymous) 
  → Firestore Real-time Listener 
    → Local React State 
      → Debounced Save (1s) 
        → Firestore
```

### Firebase Structure
```
firestore/
└── artifacts/
    └── {appId}/
        └── users/
            └── {userId}/
                └── canvas_data/
                    └── main_board/
                        ├── elements: Array<Element>
                        ├── view: {x, y, scale}
                        └── hasSeenHelp: boolean
```

### Element Types
```typescript
// Card Element
{
  id: string,           // crypto.randomUUID()
  type: 'card',
  name: string,         // Card name
  imageUrl: string,     // Scryfall image URL
  x: number,            // World coordinates
  y: number,
  zIndex: number,       // Stacking order
  tags: string[]        // User tags
}

// Sticky Note Element
{
  id: string,
  type: 'sticky',
  content: string,      // Note text
  x: number,
  y: number,
  zIndex: number
}
```

---

## Core Features

### 1. Dual View Modes
- **Canvas Mode** - Infinite pan/zoom workspace with cards
- **Basket Mode** - Column-based tag organization (also pan/zoom)
- Each mode preserves its own viewport state

### 2. Canvas View Features
- **Pan/Zoom**
  - Mouse wheel zoom (centered on cursor)
  - Space + drag to pan
  - Pinch zoom on mobile
  - Pan mode toggle (select/pan modes)
  - Global zoom controls (bottom-right)

- **Element Interaction**
  - Click & drag to move elements
  - Box selection (drag on empty space)
  - Shift+click for multi-select
  - Context menu (right-click) for actions
  - Hover highlights with z-index boost

- **Alignment Tools** (multi-select context menu)
  - Side-by-Side (horizontal)
  - Top-to-Bottom (vertical)
  - Stack Vertically (with offset)

### 3. Card Search & Add
- Real-time autocomplete (300ms debounce)
- Scryfall integration
- Cards added at viewport center
- Handles double-faced cards (uses first face image)

### 4. Sticky Notes
- Drag-and-drop or click to add
- Editable text area
- Yellow visual styling
- 200x200px size

### 5. Tagging System
- **Edit Tags Modal**
  - Bulk tag editing (multi-select support)
  - Toggle existing tags (tri-state: all/some/none)
  - Create new tags
  - Tag status indicators (green check, yellow partial, gray none)
  
- **Tag Click Selection**
  - Click any tag badge to select all elements with that tag
  
- **Basket View**
  - Auto-generated columns per tag
  - "Untagged" column for elements without tags
  - Drag & drop between columns to add/remove tags
  - Two display modes per column:
    - **Spread** - Cards stacked vertically with spacing
    - **Stack** - Cards overlapped (hover to expand)

### 6. Bulk Import
- Multi-line card list input
- Quantity parsing (e.g., "4x Lightning Bolt")
- Real-time validation via Scryfall API
- Grid layout placement
- Two modes:
  - **Append** - Add to existing board
  - **Override** - Replace entire board

### 7. Export/Import
- JSON file export (elements + view state)
- Import with confirmation modal
- Filename: `mtg-canvas-{date}.json`

### 8. Persistence
- **Real-time Sync**
  - OnSnapshot listener for live updates
  - Race condition prevention (refs for dragging/panning state)
  
- **Debounced Save**
  - 1-second delay after changes
  - Only saves canvas view (not basket view)
  - Merge mode to preserve other fields

---

## State Management

### Critical State
```javascript
// User & Loading
const [user, setUser]                     // Firebase user
const [isInitialLoading, setIsInitialLoading]  // First load flag

// Viewport
const [view, setView]                     // {x, y, scale}
const savedViews = useRef({               // View preservation
  canvas: {x, y, scale},
  baskets: {x, y, scale}
})

// Elements
const [elements, setElements]             // Array of cards/stickies
const [selectedIds, setSelectedIds]       // Set<string>

// Interaction
const [viewMode, setViewMode]             // 'canvas' | 'baskets'
const [interactionMode, setInteractionMode] // 'select' | 'pan'
const [isPanning, setIsPanning]
const [isDraggingElements, setIsDraggingElements]

// Race Condition Fix
const isDraggingRef = useRef(false)       // Prevents DB overwrites
const isPanningRef = useRef(false)

// UI
const [contextMenu, setContextMenu]       // {x, y, elementId}
const [showTagInput, setShowTagInput]
const [editingElementIds, setEditingElementIds] // Set for bulk edits
```

### Key Refs
- `isDraggingRef`, `isPanningRef` - Prevent database overwrites during interaction
- `savedViews` - Preserve viewport between mode switches
- `debounceTimer` - Search autocomplete timing
- `lastTouchDistance` - Mobile pinch zoom tracking
- `fileInputRef` - Import file picker

---

## Critical Patterns

### 1. Coordinate System
```javascript
// Screen to World transformation
screenToWorld(screenX, screenY) {
  return {
    x: (screenX - view.x) / view.scale,
    y: (screenY - view.y) / view.scale
  }
}

// Zoom centered on cursor
const worldBefore = {
  x: (mouseX - view.x) / view.scale,
  y: (mouseY - view.y) / view.scale
}
const newX = mouseX - worldBefore.x * newScale
const newY = mouseY - worldBefore.y * newScale
```

### 2. Race Condition Prevention
```javascript
// In onSnapshot listener
if (!isDraggingRef.current && !isPanningRef.current) {
  // Only update from DB if not actively interacting
  setElements(data.elements)
}

// In event handlers
setIsDragging(true)
isDraggingRef.current = true  // Prevents DB sync
```

### 3. View Mode Switching
```javascript
handleSwitchView(newMode) {
  // Save current viewport
  savedViews.current[viewMode] = view
  
  // Restore new viewport
  setView(savedViews.current[newMode])
  setViewMode(newMode)
}
```

### 4. Tag Tri-State Toggle
```javascript
const count = relevant.filter(el => el.tags?.includes(tag)).length
const total = relevant.length
const shouldRemove = count === total  // All have it = remove

if (shouldRemove) remove()
else if (!has) add()  // Partial or none = add
```

---

## Event Handling

### Mouse/Touch Interactions
- **Canvas Background**
  - Left click → Box selection start
  - Space + drag → Pan
  - Middle button → Pan
  - Wheel → Zoom
  
- **Elements**
  - Click → Select & drag
  - Shift+Click → Multi-select
  - Right-click → Context menu
  
- **Mobile**
  - Two-finger pinch → Zoom
  - Single tap → Select (if on element)
  - Single drag (background) → Pan in basket mode
  - Space prevents all default browser touch behaviors

### Keyboard
- **Space** - Hold for temporary pan mode
- **Escape** - Clear selection
- **Enter** (in tag input) - Add tag

---

## UI Layers

### Z-Index Hierarchy
```
10002 - Tag Edit Modal
10001 - Context Menu
10000 - Other Modals (import/export/bulk/help)
9999  - Top UI Layer (toolbar)
100000 - Hovered element (temporary boost)
9999  - Selected elements
{dynamic} - Normal elements (zIndex property)
10    - Basket view container
```

### Responsive Design
- Mobile-first toolbar (horizontal scroll)
- Pointer events control (`.ui-layer` has `pointer-events-none`, children auto)
- Touch-action: none for custom pan/zoom

---

## Performance Optimizations

1. **Debouncing**
   - Search autocomplete: 300ms
   - Firebase save: 1000ms
   - Bulk validation: 80ms between API calls

2. **Lazy Loading**
   - Card images: `loading="lazy"`
   - Images only fetched on demand

3. **Ref-based State**
   - Prevents unnecessary re-renders during drag/pan
   - Critical for smooth 60fps interactions

4. **CSS Transforms**
   - Hardware-accelerated pan/zoom via `transform: translate() scale()`
   - `will-change-transform` hint

---

## Styling Approach

### Tailwind Utilities
- Neutral color palette (neutral-900, 800, 700, etc.)
- Shadow layering for depth
- Backdrop blur for glass effects
- Transition classes for smooth animations

### Custom CSS
```css
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

### Dynamic Styles
- Cursor changes based on mode (`grab`, `grabbing`, `default`)
- Grid pattern background (scales with zoom)
- Selection ring glow effect

---

## Firebase Configuration

### Security Rules (Recommended)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null 
                       && request.auth.uid == userId;
    }
  }
}
```

### Authentication
- Anonymous sign-in (no user credentials needed)
- Auto-creates user on first visit
- UID used for data isolation

---

## Known Patterns & Gotchas

### 1. Initial Board
- If no data exists, creates 5 basic lands as welcome
- Centered in viewport on load

### 2. Basket Column Rules
- Elements can appear in multiple columns if multi-tagged
- "Untagged" column shows elements with empty `tags` array
- Drag to "Untagged" clears all tags

### 3. View Persistence
- Only canvas view saved to Firebase
- Basket view preserved in session via ref
- Prevents unnecessary DB writes

### 4. Touch vs Mouse
- Same handlers for touch/mouse (unified via clientX/clientY)
- Touch preventDefault stops browser pan/zoom
- Two-finger detection for pinch

### 5. Help Modal
- Shows on first visit
- `hasSeenHelp` flag persisted to Firebase
- Can be re-opened via help button

---

## File Structure
```
src/
├── App.jsx              # Main component (1263 lines)
├── main.jsx             # React entry point
├── index.css            # Tailwind + custom CSS
└── firebase-config.js   # Firebase credentials

Root:
├── index.html           # HTML shell
├── vite.config.js       # Vite settings
├── tailwind.config.js   # Tailwind configuration
├── postcss.config.js    # PostCSS (for Tailwind)
├── package.json         # Dependencies
└── .gitignore          # Git exclusions
```

---

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

---

## Future Enhancement Ideas

1. **Collaborative Editing** - Real-time multi-user support
2. **Card Details Modal** - Show full card info on click
3. **Deck Stats** - CMC curve, color distribution
4. **Custom Backgrounds** - User-uploaded images
5. **Undo/Redo** - Action history
6. **Keyboard Shortcuts** - Power user features
7. **Local Storage Fallback** - Offline mode
8. **Image Export** - Canvas to PNG/JPG
9. **Filter by Tag** - Show/hide based on tags
10. **Search Within Board** - Find cards by name

---

## Questions?

None at the moment - the codebase is well-structured and follows clear patterns. The main complexity is in the coordinate transformations and race condition handling, both of which are well-implemented.

Key strengths:
- Clean separation of concerns (view modes, interaction modes)
- Robust Firebase integration with real-time sync
- Excellent mobile support (touch, pinch zoom)
- Thoughtful UX (debouncing, confirmations, tri-state tags)
- Performance-conscious (refs, transforms, lazy loading)
