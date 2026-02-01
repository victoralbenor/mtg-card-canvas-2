// API Configuration
export const SCRYFALL_AUTOCOMPLETE_URL = 'https://api.scryfall.com/cards/autocomplete?q=';
export const SCRYFALL_NAMED_URL = 'https://api.scryfall.com/cards/named?exact=';

// Element Dimensions
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 280;
export const STICKY_SIZE = 200;
export const ELEMENT_GAP = 20;

// Placeholder & Defaults
export const PLACEHOLDER_IMAGE_URL = 'https://via.placeholder.com/488x680?text=No+Image';

// Zoom & Scale Limits
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;
export const ZOOM_SENSITIVITY = 0.001;
export const TOUCH_ZOOM_SENSITIVITY = 0.005;

// Timing Constants (in milliseconds)
export const SAVE_DEBOUNCE_MS = 1000;
export const BULK_VALIDATION_DELAY_MS = 80;
export const SEARCH_DEBOUNCE_MS = 300;

// UI Dimensions
export const CONTEXT_MENU_WIDTH = 180;
export const CONTEXT_MENU_HEIGHT = 200;

// View & Interaction Modes
export const VIEW_MODE_CANVAS = 'canvas';
export const VIEW_MODE_BASKETS = 'baskets';
export const INTERACTION_MODE_SELECT = 'select';
export const INTERACTION_MODE_PAN = 'pan';

// Layout Constants
export const STACK_OFFSET = 30;

// Initial Board Setup
export const INITIAL_LANDS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];

// Z-Index Hierarchy
export const Z_INDEX = {
  NORMAL: 'dynamic',          // Set per element
  SELECTED: 9999,
  HOVERED: 100000,
  UI_LAYER: 9999,
  BASKET_VIEW: 10,
  MODALS: 10000,
  CONTEXT_MENU: 10001,
  TAG_MODAL: 10002
};
