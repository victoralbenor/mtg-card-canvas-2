import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, Minus, Move, Loader2, Trash2, X, StickyNote, HelpCircle, MousePointer2, Hand, Download, Upload, AlertTriangle, Layers, CheckCircle2, AlertCircle, RefreshCw, Tag, ArrowRight, ArrowDown, Check, LayoutTemplate, List, AlignJustify } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig, appId } from './firebase-config.js';
import {
  SCRYFALL_AUTOCOMPLETE_URL,
  SCRYFALL_NAMED_URL,
  SCRYFALL_COLLECTION_URL,
  CARD_WIDTH,
  CARD_HEIGHT,
  STICKY_SIZE,
  ELEMENT_GAP,
  PLACEHOLDER_IMAGE_URL,
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_SENSITIVITY,
  TOUCH_ZOOM_SENSITIVITY,
  SAVE_DEBOUNCE_MS,
  BULK_VALIDATION_DELAY_MS,
  SEARCH_DEBOUNCE_MS,
  CONTEXT_MENU_WIDTH,
  CONTEXT_MENU_HEIGHT,
  VIEW_MODE_CANVAS,
  VIEW_MODE_BASKETS,
  INTERACTION_MODE_SELECT,
  INTERACTION_MODE_PAN,
  STACK_OFFSET,
  INITIAL_LANDS
} from './constants.js';
import { screenToWorld, checkIntersection, getOptimalImageQuality, getScryfallImageUrl, isElementInViewport } from './utils/coordinates.js';
import { parseLine } from './utils/parsers.js';
import { 
  bringToFront, 
  removeElement, 
  updateStickyContent,
  getAllUniqueTags,
  getElementsWithTag,
  toggleTagOnElements,
  addTagToElements
} from './utils/elements.js';
import { getBasketData } from './utils/basketHelpers.js';

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export default function App() {
  // --- State ---
  const [user, setUser] = useState(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  // Canvas Viewport State
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  
  // View State Storage (to preserve position when switching modes)
  const savedViews = useRef({
      canvas: { x: 0, y: 0, scale: 1 },
      baskets: { x: 0, y: 0, scale: 1 }
  });

  // Sync viewRef with view state
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [interactionMode, setInteractionMode] = useState(INTERACTION_MODE_SELECT); // 'select' | 'pan'

  // View Mode State
  const [viewMode, setViewMode] = useState(VIEW_MODE_CANVAS); // 'canvas' | 'baskets'
  
  // Basket Column Modes (spread | stack)
  const [basketColumnModes, setBasketColumnModes] = useState({});

  // Touch State
  const lastTouchDistance = useRef(null);
  const isPinchZooming = useRef(false);

  // Elements State
  const [elements, setElements] = useState([]);
  
  // Selection & Dragging State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isDraggingElements, setIsDraggingElements] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null); 
  
  // Hover State
  const [hoveredId, setHoveredId] = useState(null);
  
  // Context Menu & Tagging State
  const [contextMenu, setContextMenu] = useState(null); // { x, y, elementId }
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState('');
  
  // Replaced single active ID with a set of editing IDs for bulk operations
  const [editingElementIds, setEditingElementIds] = useState(new Set());

  // Refs for State (To fix the snapshot race condition)
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const isEditingRef = useRef(false); // Prevent view jumps during tag editing

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingCard, setIsLoadingCard] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // UI State
  const [showHelp, setShowHelp] = useState(true);
  
  // Import/Export/Clear/Bulk State
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Bulk Add State
  const [showBulkAdd, setShowBulkAdd] = useState(false); 
  const [bulkAddText, setBulkAddText] = useState(''); 
  const [isBulkValidating, setIsBulkValidating] = useState(false); 
  const [bulkStage, setBulkStage] = useState('input'); 
  const [validatedItems, setValidatedItems] = useState([]); 

  const [pendingImportData, setPendingImportData] = useState(null);
  const fileInputRef = useRef(null);

  // Refs
  const canvasRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const basketContainerRef = useRef(null);
  const debounceTimer = useRef(null);
  const rafId = useRef(null);
  const zoomDebounceTimer = useRef(null);
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });

  // --- 1. Auth & Data Loading ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- 2. Real-time Database Sync (Read) ---
  useEffect(() => {
    if (!user) return;

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'canvas_data', 'main_board');
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.hasSeenHelp) setShowHelp(false);
        if (!isDraggingRef.current && !isPanningRef.current && !isEditingRef.current) {
            if (data.elements) setElements(data.elements);
            
            // Sync view only if in canvas mode, or handle complex sync. 
            // For now, let's trust local state for view fluidity during session
            // but load initial view if needed.
            // If we wanted to sync both views, we'd need to store both in DB.
            if (data.view && isInitialLoading) {
                setView(data.view);
                savedViews.current.canvas = data.view;
            }
        }
      } else {
        // --- INITIALIZE EMPTY BOARD ---
        const totalWidth = (INITIAL_LANDS.length * CARD_WIDTH) + ((INITIAL_LANDS.length - 1) * ELEMENT_GAP);
        
        const startX = (window.innerWidth - totalWidth) / 2;
        const startY = (window.innerHeight - CARD_HEIGHT) / 2;

        const initialLands = INITIAL_LANDS.map((name, index) => ({
             id: crypto.randomUUID(),
             type: 'card',
             name: name,
             imageUrl: `https://api.scryfall.com/cards/named?exact=${name}&format=image&version=normal`, 
             x: startX + (index * (CARD_WIDTH + ELEMENT_GAP)),
             y: startY,
             zIndex: index + 1,
             tags: [], 
        }));
        
        setElements(initialLands);
      }
      setIsInitialLoading(false); 
    }, (error) => {
      console.error("Error fetching data:", error);
      setIsInitialLoading(false); 
    });

    return () => unsubscribe();
  }, [user]); 

  // --- 3. Debounced Save (Write) ---
  useEffect(() => {
    if (!user || isInitialLoading) return;

    const saveTimer = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'canvas_data', 'main_board');
        // Only saving canvas view to DB to keep it simple
        const viewToSave = viewMode === VIEW_MODE_CANVAS ? view : savedViews.current.canvas;
        
        await setDoc(docRef, {
          elements: elements,
          view: viewToSave
        }, { merge: true });
      } catch (err) {
        console.error("Error saving board state:", err);
      }
    }, SAVE_DEBOUNCE_MS); 

    return () => clearTimeout(saveTimer);
  }, [elements, view, viewMode, user, isInitialLoading]);
  
  // --- View Switching Logic ---
  const handleSwitchView = (newMode) => {
      if (newMode === viewMode) return;
      
      // Save current view
      savedViews.current[viewMode] = view;
      
      // Restore new view
      setView(savedViews.current[newMode]);
      setViewMode(newMode);
  };

  const handleCloseHelp = async () => {
      setShowHelp(false);
      if (user) {
          try {
              const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'canvas_data', 'main_board');
              await setDoc(docRef, { hasSeenHelp: true }, { merge: true });
          } catch (err) {}
      }
  };

  // --- Export/Import/Clear (Standard) ---
  const handleExport = () => {
    const dataStr = JSON.stringify({ elements, view }, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mtg-canvas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
        fileInputRef.current.value = ''; 
        fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (Array.isArray(data.elements) && data.view) {
                setPendingImportData(data);
                setShowImportConfirm(true);
            }
        } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (pendingImportData) {
        setElements(pendingImportData.elements);
        setView(pendingImportData.view);
        savedViews.current.canvas = pendingImportData.view;
        setSelectedIds(new Set());
    }
    setShowImportConfirm(false);
    setPendingImportData(null);
  };

  const confirmClearBoard = () => {
      setElements([]);
      setSelectedIds(new Set());
      setShowClearConfirm(false);
  };

  // --- Bulk Add Logic (Standard) ---
  const openBulkModal = () => {
      setBulkStage('input');
      setBulkAddText('');
      setValidatedItems([]);
      setShowBulkAdd(true);
  };

  const handleValidateBulk = async () => {
    setIsBulkValidating(true);
    let itemsToProcess = [];
    if (bulkStage === 'input') {
        const lines = bulkAddText.split('\n').map(l => l.trim()).filter(l => l);
        itemsToProcess = lines.map(line => ({ id: crypto.randomUUID(), text: line, status: 'pending', data: null }));
    } else {
        itemsToProcess = [...validatedItems];
    }
    if (bulkStage === 'input') {
        setValidatedItems(itemsToProcess);
        setBulkStage('results');
    }
    
    const updatedItems = [...itemsToProcess];
    const itemsToValidate = updatedItems.filter(item => item.status !== 'valid');
    
    // Process in batches of 75 (Scryfall's limit)
    const BATCH_SIZE = 75;
    for (let batchStart = 0; batchStart < itemsToValidate.length; batchStart += BATCH_SIZE) {
        const batch = itemsToValidate.slice(batchStart, batchStart + BATCH_SIZE);
        
        // Prepare identifiers for Scryfall collection API
        const identifiers = batch.map(item => {
            const { name: searchName } = parseLine(item.text);
            return { name: searchName };
        });
        
        try {
            const res = await fetch(SCRYFALL_COLLECTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifiers })
            });
            
            if (res.ok) {
                const result = await res.json();
                const foundCards = result.data || [];
                const notFoundList = result.not_found || [];
                
                // Create a map of found cards by name (case-insensitive)
                const cardMap = new Map();
                foundCards.forEach(card => {
                    cardMap.set(card.name.toLowerCase(), card);
                });
                
                // Update items based on results
                batch.forEach((item, idx) => {
                    const { name: searchName } = parseLine(item.text);
                    const originalIndex = updatedItems.findIndex(u => u.id === item.id);
                    
                    const foundCard = cardMap.get(searchName.toLowerCase());
                    if (foundCard) {
                        updatedItems[originalIndex] = { ...item, status: 'valid', data: foundCard };
                    } else {
                        updatedItems[originalIndex] = { ...item, status: 'invalid', data: null };
                    }
                });
            } else {
                // If batch request fails, mark all as invalid
                batch.forEach(item => {
                    const originalIndex = updatedItems.findIndex(u => u.id === item.id);
                    updatedItems[originalIndex] = { ...item, status: 'invalid', data: null };
                });
            }
        } catch (e) {
            // If batch request fails, mark all as invalid
            batch.forEach(item => {
                const originalIndex = updatedItems.findIndex(u => u.id === item.id);
                updatedItems[originalIndex] = { ...item, status: 'invalid', data: null };
            });
        }
        
        // Update UI after each batch
        setValidatedItems([...updatedItems]);
        
        // Small delay between batches to respect rate limits
        if (batchStart + BATCH_SIZE < itemsToValidate.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }
    setIsBulkValidating(false);
  };

  const handleFinalizeBulkAdd = (mode = 'append') => {
      const validItems = validatedItems.filter(i => i.status === 'valid');
      if (validItems.length === 0) return;
      const newCards = [];
      const expandedItems = [];
      validItems.forEach(item => {
          const { count } = parseLine(item.text);
          for (let k = 0; k < count; k++) expandedItems.push(item);
      });
      const count = expandedItems.length;
      const cols = Math.ceil(Math.sqrt(count));
      const centerX = (window.innerWidth / 2 - view.x) / view.scale;
      const centerY = (window.innerHeight / 2 - view.y) / view.scale;
      const startX = centerX - ((cols * (CARD_WIDTH + ELEMENT_GAP)) / 2);
      const startY = centerY - ((Math.ceil(count / cols) * (CARD_HEIGHT + ELEMENT_GAP)) / 2);
      expandedItems.forEach((item, i) => {
          const data = item.data;
          const scryfallId = data.id;
          let imageUrl = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || PLACEHOLDER_IMAGE_URL;
          const col = i % cols;
          const row = Math.floor(i / cols);
          newCards.push({
              id: crypto.randomUUID(),
              type: 'card',
              name: data.name,
              imageUrl: imageUrl,
              scryfallId: scryfallId,
              x: startX + col * (CARD_WIDTH + ELEMENT_GAP),
              y: startY + row * (CARD_HEIGHT + ELEMENT_GAP),
              zIndex: elements.length + i + 1,
              tags: [],
          });
      });
      if (mode === 'override') {
          setElements(newCards);
          setSelectedIds(new Set());
      } else {
          setElements(prev => [...prev, ...newCards]);
      }
      setShowBulkAdd(false);
  };

  const handleBulkItemChange = (id, newText) => {
      setValidatedItems(prev => prev.map(item => item.id === id ? { ...item, text: newText, status: 'pending' } : item));
  };

  const handleRemoveBulkItem = (id) => {
      setValidatedItems(prev => prev.filter(item => item.id !== id));
  };
  
  const allValid = validatedItems.length > 0 && validatedItems.every(i => i.status === 'valid');

  // --- Tagging & Menu ---
  const allUniqueTags = getAllUniqueTags(elements);

  const handleContextMenu = (e, elementId) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = CONTEXT_MENU_WIDTH; 
    const menuHeight = CONTEXT_MENU_HEIGHT;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight;
    setContextMenu({ x, y, elementId });
  };

  const handleEditTagsClick = () => {
      if (contextMenu) {
          const isTargetInSelection = selectedIds.has(contextMenu.elementId);
          let idsToEdit = new Set();
          if (isTargetInSelection && selectedIds.size > 0) {
              idsToEdit = new Set(selectedIds);
          } else {
              idsToEdit = new Set([contextMenu.elementId]);
          }
          setEditingElementIds(idsToEdit);
          setContextMenu(null);
          setShowTagInput(true);
          isEditingRef.current = true; // Block Firebase updates during tag editing
          setTagInputValue('');
      }
  };

  const handleAlign = (direction) => {
    if (selectedIds.size < 2) return;
    const selectedElements = elements.filter(el => selectedIds.has(el.id));
    const otherElements = elements.filter(el => !selectedIds.has(el.id));
    
    // ... Alignment logic same as before ...
    if (direction === 'horizontal') {
        selectedElements.sort((a, b) => a.x - b.x);
        const minY = Math.min(...selectedElements.map(e => e.y));
        let currentX = selectedElements[0].x;
        const updated = selectedElements.map(el => {
            const n = { ...el, x: currentX, y: minY };
            currentX += 210;
            return n;
        });
        setElements([...otherElements, ...updated]);
    } else if (direction === 'vertical') {
        selectedElements.sort((a, b) => a.y - b.y);
        const minX = Math.min(...selectedElements.map(e => e.x));
        let currentY = selectedElements[0].y;
        const updated = selectedElements.map(el => {
            const h = el.type === 'sticky' ? STICKY_SIZE : CARD_HEIGHT;
            const n = { ...el, x: minX, y: currentY };
            currentY += h + 10;
            return n;
        });
        setElements([...otherElements, ...updated]);
    } else if (direction === 'stack-pile') {
        selectedElements.sort((a, b) => a.y - b.y);
        const minX = Math.min(...selectedElements.map(e => e.x));
        const minY = Math.min(...selectedElements.map(e => e.y));
        const baseZ = elements.length > 0 ? Math.max(...elements.map(e => e.zIndex)) + 1 : 1;
        const updated = selectedElements.map((el, index) => ({ ...el, x: minX, y: minY + (index * STACK_OFFSET), zIndex: baseZ + index }));
        setElements([...otherElements, ...updated]);
    }
    setContextMenu(null);
  };

  const handleToggleTag = (tag) => {
      if (editingElementIds.size === 0) return;
      setElements(prev => toggleTagOnElements(prev, editingElementIds, tag));
  };

  const handleAddNewTag = () => {
      if (editingElementIds.size > 0 && tagInputValue.trim()) {
          const newTag = tagInputValue.trim();
          setElements(prev => addTagToElements(prev, editingElementIds, newTag));
          setTagInputValue('');
      }
  };

  const handleTagClick = (e, tag) => {
      e.stopPropagation();
      setSelectedIds(getElementsWithTag(elements, tag));
  };

  useEffect(() => {
    const handleClick = () => { if (contextMenu) setContextMenu(null); };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  useEffect(() => {
    const handleKeyDown = (e) => {
        if (e.code === 'Space' && !e.repeat && !e.target.matches('input, textarea')) {
            e.preventDefault();
            setIsSpacePressed(true);
        }
        if (e.key === 'Escape') {
            setSelectedIds(new Set());
            if (showTagInput) {
                setShowTagInput(false);
                // Delay clearing ref to allow pending Firebase updates to settle
                setTimeout(() => { isEditingRef.current = false; }, 500);
            }
        }
    };
    const handleKeyUp = (e) => {
        if (e.code === 'Space') {
            setIsSpacePressed(false);
            if (!isPanningRef.current) setIsPanning(false); 
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- Search & Add ---
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    setShowResults(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (query.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    debounceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${SCRYFALL_AUTOCOMPLETE_URL}${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data.data || []);
      } catch (err) {} finally { setIsSearching(false); }
    }, SEARCH_DEBOUNCE_MS);
  };

  const addCardToCanvas = async (cardName) => {
    setIsLoadingCard(true);
    setSearchQuery(cardName);
    setShowResults(false);
    try {
      const res = await fetch(`${SCRYFALL_NAMED_URL}${encodeURIComponent(cardName)}`);
      const data = await res.json();
      if (data.object === 'error') { alert('Card not found'); return; }
      const scryfallId = data.id;
      let imageUrl = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || PLACEHOLDER_IMAGE_URL;
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, view);
      const newElement = {
        id: crypto.randomUUID(), type: 'card', name: data.name, imageUrl: imageUrl,
        scryfallId: scryfallId,
        x: center.x - 100, y: center.y - 140, zIndex: elements.length + 1, tags: [],
      };
      setElements((prev) => [...prev, newElement]);
      setSelectedIds(new Set([newElement.id])); 
      setSearchQuery('');
    } catch (err) { alert("Failed to load card data."); } finally { setIsLoadingCard(false); }
  };

  const addStickyToCanvas = () => {
      const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, view);
      const newElement = {
        id: crypto.randomUUID(), type: 'sticky', content: '',
        x: center.x - 100, y: center.y - 100, zIndex: elements.length + 1,
      };
      setElements(prev => [...prev, newElement]);
      setSelectedIds(new Set([newElement.id]));
  }

  const handleStickyDragStart = (e) => { e.dataTransfer.setData('text/plain', 'sticky-note'); e.dataTransfer.effectAllowed = 'copy'; };
  const handleCanvasDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleCanvasDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.getData('text/plain') !== 'sticky-note') return;
    const worldPos = screenToWorld(e.clientX, e.clientY, view);
    const newElement = {
      id: crypto.randomUUID(), type: 'sticky', content: '',
      x: worldPos.x - 100, y: worldPos.y - 100, zIndex: elements.length + 1,
    };
    setElements(prev => [...prev, newElement]);
    setSelectedIds(new Set([newElement.id]));
  };

  // --- Input Handlers (Modified for Global Pan/Zoom) ---

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = Math.min(Math.max(MIN_SCALE, viewRef.current.scale + delta), MAX_SCALE);
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Calculate new position based on zoom point
    const worldBefore = {
        x: (mouseX - viewRef.current.x) / viewRef.current.scale,
        y: (mouseY - viewRef.current.y) / viewRef.current.scale
    };
    const newX = mouseX - worldBefore.x * newScale;
    const newY = mouseY - worldBefore.y * newScale;

    viewRef.current = { x: newX, y: newY, scale: newScale };
    
    // Apply transform directly to DOM for instant feedback
    const transformStr = `translate(${newX}px, ${newY}px) scale(${newScale})`;
    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.transform = transformStr;
    }
    if (basketContainerRef.current) {
      basketContainerRef.current.style.transform = transformStr;
    }
    
    // Debounced React state update - only sync when zoom settles
    if (zoomDebounceTimer.current) clearTimeout(zoomDebounceTimer.current);
    zoomDebounceTimer.current = setTimeout(() => {
      setView({ x: newX, y: newY, scale: newScale });
    }, 100); // 100ms debounce
  };

  const handleMouseDown = (e) => {
    // Check UI Layer
    if (e.target.closest('.ui-layer')) return;
    if (contextMenu) return; 

    // Pan Mode Check (Global)
    if (interactionMode === INTERACTION_MODE_PAN || e.button === 1 || (e.button === 0 && isSpacePressed)) {
      e.preventDefault(); 
      setIsPanning(true);
      isPanningRef.current = true;
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    // Canvas Selection Logic (Only in Canvas Mode)
    if (viewMode === VIEW_MODE_CANVAS && e.button === 0) {
        const worldPos = screenToWorld(e.clientX, e.clientY, view);
        setIsPanning(false);
        isPanningRef.current = false;
        if (!e.shiftKey) setSelectedIds(new Set());
        setSelectionBox({ startX: worldPos.x, startY: worldPos.y, currentX: worldPos.x, currentY: worldPos.y });
    }
  };

  const handleMouseMove = (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY, viewRef.current);

    if (isPanning) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      
      viewRef.current = { 
        ...viewRef.current, 
        x: viewRef.current.x + dx, 
        y: viewRef.current.y + dy 
      };
      
      // Apply transform directly for smooth 60fps
      const transformStr = `translate(${viewRef.current.x}px, ${viewRef.current.y}px) scale(${viewRef.current.scale})`;
      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.transform = transformStr;
      }
      if (basketContainerRef.current) {
        basketContainerRef.current.style.transform = transformStr;
      }
      
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } 
    else if (isDraggingElements && viewMode === VIEW_MODE_CANVAS) {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      const worldDx = dx / view.scale;
      const worldDy = dy / view.scale;
      setElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, x: el.x + worldDx, y: el.y + worldDy } : el));
      setLastMousePos({ x: e.clientX, y: e.clientY });
    } 
    else if (selectionBox && viewMode === VIEW_MODE_CANVAS) {
      setSelectionBox(prev => ({ ...prev, currentX: worldPos.x, currentY: worldPos.y }));
      const newSelection = new Set();
      elements.forEach(el => {
        if (checkIntersection({ startX: selectionBox.startX, startY: selectionBox.startY, currentX: worldPos.x, currentY: worldPos.y }, el)) {
          newSelection.add(el.id);
        }
      });
      setSelectedIds(newSelection);
    }
  };

  const handleMouseUp = () => {
    if (isPanning || isDraggingElements) {
      // Sync ref to state when interaction ends
      setView(viewRef.current);
    }
    setIsPanning(false);
    isPanningRef.current = false;
    setIsDraggingElements(false);
    isDraggingRef.current = false;
    setSelectionBox(null);
  };

  const handleTouchStart = (e) => {
    if (e.target.closest('.ui-layer')) return;

    if (e.touches.length === 2) {
      const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      lastTouchDistance.current = dist;
      isPinchZooming.current = true;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const targetIsElement = e.target.closest('.canvas-element') || e.target.closest('.basket-card');

      if (interactionMode === INTERACTION_MODE_PAN) {
          setIsPanning(true);
          isPanningRef.current = true;
          setLastMousePos({ x: touch.clientX, y: touch.clientY });
          return;
      }
      
      // Canvas Selection
      if (viewMode === VIEW_MODE_CANVAS && interactionMode === INTERACTION_MODE_SELECT) {
          if (!targetIsElement) {
             const worldPos = screenToWorld(touch.clientX, touch.clientY, view);
             setSelectedIds(new Set());
             setSelectionBox({ startX: worldPos.x, startY: worldPos.y, currentX: worldPos.x, currentY: worldPos.y });
          }
      }
      
      // Basket Pan (Background)
      if (viewMode === VIEW_MODE_BASKETS && !targetIsElement) {
          setIsPanning(true);
          isPanningRef.current = true;
          setLastMousePos({ x: touch.clientX, y: touch.clientY });
      }
    }
  };

  const handleTouchMove = (e) => {
    e.preventDefault(); // Stop native scrolling for ALL modes now

    if (e.touches.length === 2 && isPinchZooming.current) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (lastTouchDistance.current) {
            const delta = dist - lastTouchDistance.current;
            const newScale = Math.min(Math.max(MIN_SCALE, view.scale + (delta * TOUCH_ZOOM_SENSITIVITY)), MAX_SCALE);
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const worldBefore = { x: (centerX - view.x) / view.scale, y: (centerY - view.y) / view.scale };
            const newX = centerX - worldBefore.x * newScale;
            const newY = centerY - worldBefore.y * newScale;
            setView({ x: newX, y: newY, scale: newScale });
        }
        lastTouchDistance.current = dist;
        return;
    }
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  };

  const handleTouchEnd = () => {
    lastTouchDistance.current = null;
    isPinchZooming.current = false;
    handleMouseUp();
  };

  const handleElementMouseDown = (e, id) => {
    if (viewMode === VIEW_MODE_BASKETS) return; // Canvas interactions only
    if (interactionMode === INTERACTION_MODE_PAN || isSpacePressed) return;
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.tagName.toLowerCase() === 'textarea') return;

    e.stopPropagation();
    const isSelected = selectedIds.has(id);
    if (e.shiftKey) {
      const newSelection = new Set(selectedIds);
      if (isSelected) newSelection.delete(id); else newSelection.add(id);
      setSelectedIds(newSelection);
      if (!isSelected) {
         setIsDraggingElements(true);
         isDraggingRef.current = true; 
         const clientX = e.clientX || (e.touches && e.touches[0].clientX);
         const clientY = e.clientY || (e.touches && e.touches[0].clientY);
         setLastMousePos({ x: clientX, y: clientY });
      }
      return;
    }
    if (!isSelected) {
      setSelectedIds(new Set([id]));
      setElements(prev => bringToFront(prev, id));
    }
    setIsDraggingElements(true);
    isDraggingRef.current = true;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    setLastMousePos({ x: clientX, y: clientY });
  };

  const handleRemoveElement = (e, id) => {
    e.stopPropagation();
    setElements(prev => removeElement(prev, id));
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleBasketDragStart = (e, cardId) => { e.dataTransfer.setData('cardId', cardId); e.dataTransfer.effectAllowed = 'copy'; };
  const handleBasketDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const handleBasketDrop = (e, targetTag) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData('cardId');
      if (!cardId) return;
      setElements(prev => prev.map(el => {
          if (el.id === cardId) {
              if (targetTag === 'Untagged') return { ...el, tags: [] };
              const currentTags = el.tags || [];
              if (!currentTags.includes(targetTag)) return { ...el, tags: [...currentTags, targetTag] };
          }
          return el;
      }));
  };
  const removeTagFromCard = (e, cardId, tagToRemove) => {
      e.stopPropagation();
      setElements(prev => prev.map(el => {
          if (el.id === cardId) {
               if (tagToRemove === 'Untagged') return el;
               const currentTags = el.tags || [];
               return { ...el, tags: currentTags.filter(t => t !== tagToRemove) };
          }
          return el;
      }));
  };
  
  const toggleBasketColumnMode = (columnTag, mode) => {
      setBasketColumnModes(prev => ({
          ...prev,
          [columnTag]: mode
      }));
  };

  const backgroundSize = 40 * view.scale;
  const backgroundPosition = `${view.x}px ${view.y}px`;
  
  let cursorStyle = 'default';
  if (interactionMode === INTERACTION_MODE_PAN || isSpacePressed || isPanning) cursorStyle = 'grab';
  if (isPanning) cursorStyle = 'grabbing'; 

  if (isInitialLoading) {
    return (
        <div className="w-full h-screen bg-neutral-900 flex flex-col items-center justify-center text-neutral-400">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <div className="text-xl font-medium text-neutral-200">Loading Canvas...</div>
        </div>
    );
  }

  const { baskets, columns } = getBasketData(elements);

  return (
    <div 
      className="w-full h-screen bg-neutral-900 overflow-hidden relative font-sans text-neutral-200 select-none touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      onDragOver={viewMode === VIEW_MODE_CANVAS ? handleCanvasDragOver : undefined}
      onDrop={viewMode === VIEW_MODE_CANVAS ? handleCanvasDrop : undefined}
      ref={canvasRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: cursorStyle }}
    >
      <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {viewMode === VIEW_MODE_CANVAS && (
          <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle, #888 1px, transparent 1px)',
              backgroundSize: `${backgroundSize}px ${backgroundSize}px`,
              backgroundPosition: backgroundPosition,
            }}
          />
      )}

      {/* --- UI Layer --- */}
      <div className="ui-layer absolute top-0 left-0 right-0 z-[9999] pointer-events-none p-4 flex flex-col items-center">
        <div className="flex gap-4 items-center w-full max-w-full md:max-w-6xl justify-start md:justify-center pointer-events-auto overflow-x-auto md:overflow-visible pb-2 md:pb-0 px-2 scrollbar-hide">
            <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden shrink-0">
                <button onClick={() => handleSwitchView(VIEW_MODE_CANVAS)} className={`p-3 transition-colors ${viewMode === VIEW_MODE_CANVAS ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700 text-neutral-400'}`} title="Canvas View"><Move className="w-6 h-6" /></button>
                <div className="w-px h-6 bg-neutral-700"></div>
                <button onClick={() => handleSwitchView(VIEW_MODE_BASKETS)} className={`p-3 transition-colors ${viewMode === VIEW_MODE_BASKETS ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700 text-neutral-400'}`} title="Tag Baskets View"><LayoutTemplate className="w-6 h-6" /></button>
            </div>
            <div className="w-px h-8 bg-neutral-700/50 mx-1 shrink-0"></div>
            {viewMode === VIEW_MODE_CANVAS && (
                <div className="flex items-center bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden shrink-0 animate-in fade-in duration-300">
                    <button onClick={() => setInteractionMode(INTERACTION_MODE_SELECT)} className={`p-3 transition-colors ${interactionMode === INTERACTION_MODE_SELECT ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700 text-neutral-400'}`}><MousePointer2 className="w-6 h-6" /></button>
                    <div className="w-px h-6 bg-neutral-700"></div>
                    <button onClick={() => setInteractionMode(INTERACTION_MODE_PAN)} className={`p-3 transition-colors ${interactionMode === INTERACTION_MODE_PAN ? 'bg-blue-600 text-white' : 'hover:bg-neutral-700 text-neutral-400'}`}><Hand className="w-6 h-6" /></button>
                </div>
            )}
            <div className="bg-neutral-800/90 backdrop-blur border border-neutral-700 rounded-lg shadow-2xl flex relative min-w-[250px] items-center">
                <div className="flex items-center px-4 py-3 w-full"><Search className="w-5 h-5 text-neutral-400 mr-3 shrink-0" /><input type="text" placeholder="Search Cards..." className="bg-transparent border-none outline-none text-white w-full placeholder-neutral-500 min-w-[100px]" value={searchQuery} onChange={handleSearchChange} onFocus={() => setShowResults(true)} />{isLoadingCard && <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />}</div>
                {showResults && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {searchResults.map((name) => (<button key={name} className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-sm text-neutral-200 transition-colors" onClick={() => addCardToCanvas(name)}>{name}</button>))}
                    </div>
                )}
            </div>
            <div className="bg-yellow-200 hover:bg-yellow-300 text-yellow-900 p-3 rounded-lg shadow-xl cursor-grab active:cursor-grabbing transition-transform hover:scale-105 shrink-0" draggable="true" onDragStart={handleStickyDragStart} onClick={addStickyToCanvas}><StickyNote className="w-6 h-6" /></div>
            <button onClick={openBulkModal} className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200 p-3 rounded-lg shadow-xl transition-transform hover:scale-105 shrink-0"><Layers className="w-6 h-6" /></button>
            <button onClick={handleImportClick} className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200 p-3 rounded-lg shadow-xl transition-transform hover:scale-105 shrink-0"><Upload className="w-6 h-6" /></button>
            <button onClick={handleExport} className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200 p-3 rounded-lg shadow-xl transition-transform hover:scale-105 shrink-0"><Download className="w-6 h-6" /></button>
            <button onClick={() => setShowHelp(true)} className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200 p-3 rounded-lg shadow-xl transition-transform hover:scale-105 shrink-0"><HelpCircle className="w-6 h-6" /></button>
            <button onClick={() => setShowClearConfirm(true)} className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg shadow-xl transition-all hover:scale-105 shrink-0"><Trash2 className="w-6 h-6" /></button>
        </div>

        {/* Global Zoom Controls */}
        <div className="fixed bottom-6 right-6 flex gap-2 pointer-events-auto">
          <div className="bg-neutral-800/90 backdrop-blur border border-neutral-700 rounded-lg shadow-xl flex flex-col">
              <button onClick={() => setView(v => ({...v, scale: Math.min(v.scale + 0.1, 5)}))} className="p-3 hover:bg-neutral-700 text-neutral-300 border-b border-neutral-700"><Plus className="w-5 h-5" /></button>
              <button onClick={() => setView({x:0, y:0, scale:1})} className="p-3 hover:bg-neutral-700 text-neutral-300 border-b border-neutral-700"><Move className="w-5 h-5" /></button>
              <button onClick={() => setView(v => ({...v, scale: Math.max(v.scale - 0.1, 0.1)}))} className="p-3 hover:bg-neutral-700 text-neutral-300"><Minus className="w-5 h-5" /></button>
          </div>
        </div>
        
        {viewMode === VIEW_MODE_CANVAS && (
            <div className="fixed bottom-6 left-6 text-xs text-neutral-500 pointer-events-none">
            {elements.length} items • {selectedIds.size} selected
            </div>
        )}
      </div>

      {/* --- BASKET VIEW (TRANSFORMABLE) --- */}
      {viewMode === VIEW_MODE_BASKETS && (
          <div 
            className="absolute inset-0 z-10 overflow-hidden pointer-events-none" 
          >
              <div
                ref={basketContainerRef}
                className="origin-top-left"
                style={{ 
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                  willChange: isPanning || isDraggingElements ? 'transform' : 'auto',
                  backfaceVisibility: 'hidden',
                  perspective: 1000
                }}
              >
                  <div className="pt-24 px-4 flex flex-row gap-4 items-start pb-4 pointer-events-auto">
                      {columns.map(columnTag => {
                        const mode = basketColumnModes[columnTag] || 'spread'; // 'spread' or 'stack'
                        return (
                            <div 
                                key={columnTag} 
                                className="flex-shrink-0 w-80 bg-neutral-800/90 border border-neutral-700 rounded-xl flex flex-col min-h-[400px]"
                                onDragOver={handleBasketDragOver}
                                onDrop={(e) => handleBasketDrop(e, columnTag)}
                            >
                                <div className="p-4 border-b border-neutral-700 bg-neutral-800 rounded-t-xl sticky top-0 z-20 shadow-md flex justify-between items-center group/header">
                                    <h3 className="font-bold text-lg text-white flex items-center gap-2">
                                        {columnTag === 'Untagged' ? <AlertCircle className="w-5 h-5 text-neutral-400" /> : <Tag className="w-5 h-5 text-blue-400" />}
                                        {columnTag}
                                        <span className="text-xs font-normal text-neutral-500 ml-auto bg-neutral-900 px-2 py-0.5 rounded-full">
                                            {baskets[columnTag]?.length || 0}
                                        </span>
                                    </h3>
                                    
                                    {/* View Toggle Buttons */}
                                    <div className="flex bg-neutral-900 rounded p-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => toggleBasketColumnMode(columnTag, 'spread')}
                                            className={`p-1 rounded ${mode === 'spread' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                                            title="Spread View"
                                        >
                                            <List className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => toggleBasketColumnMode(columnTag, 'stack')}
                                            className={`p-1 rounded ${mode === 'stack' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
                                            title="Stack View"
                                        >
                                            <AlignJustify className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className={`flex-1 p-4 ${mode === 'spread' ? 'space-y-3' : ''}`}>
                                    {baskets[columnTag]?.map((el, index) => {
                                        // Calculate Stack Margins
                                        const isStacked = mode === 'stack';
                                        let marginTop = 0;
                                        if (isStacked && index > 0) {
                                            // Card height 280, sticky 200.
                                            // We want visible header ~35px.
                                            // So for card: -245px. For Sticky: -165px.
                                            marginTop = el.type === 'sticky' ? -165 : -245;
                                        }

                                        return (
                                            <div 
                                                key={`${el.id}-${columnTag}`}
                                                draggable="true"
                                                onDragStart={(e) => handleBasketDragStart(e, el.id)}
                                                onContextMenu={(e) => handleContextMenu(e, el.id)}
                                                style={{ 
                                                    marginTop: isStacked ? `${marginTop}px` : undefined,
                                                    zIndex: isStacked ? index : undefined 
                                                }}
                                                className={`
                                                    relative group transition-all duration-200 basket-card
                                                    ${isStacked ? 'hover:!z-[100] hover:scale-105 origin-top' : ''}
                                                `}
                                            >
                                                {/* Card Content - Clean Look */}
                                                <div className="relative rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
                                                     {/* Tags Overlay */}
                                                    {el.tags && el.tags.length > 0 && (
                                                            <div className="absolute top-11 left-2 right-2 flex flex-col items-start gap-1 z-20 pointer-events-auto">
                                                                {el.tags.map((tag, idx) => (
                                                                    <div 
                                                                        key={idx} 
                                                                        className="text-[10px] px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap cursor-pointer backdrop-blur-md border border-white/10 transition-colors bg-black/60 text-white hover:bg-black/80"
                                                                        onClick={(e) => handleTagClick(e, tag)}
                                                                    >
                                                                        {tag}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                    )}
                                                    
                                                    {el.type === 'card' && (
                                                        <img src={el.imageUrl} alt={el.name} className="w-full h-auto block select-none pointer-events-none rounded-lg" />
                                                    )}
                                                    
                                                    {el.type === 'sticky' && (
                                                        <div className="w-full h-[200px] bg-yellow-200 text-neutral-900 p-3 rounded-lg text-lg font-medium shadow-inner overflow-hidden">
                                                            {el.content || <em className="text-neutral-500">Empty Note</em>}
                                                        </div>
                                                    )}

                                                    {/* Delete Button (Overlay) */}
                                                    {columnTag !== 'Untagged' && (
                                                        <button 
                                                                onClick={(e) => removeTagFromCard(e, el.id, columnTag)}
                                                                className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-30"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {(!baskets[columnTag] || baskets[columnTag].length === 0) && (
                                        <div className="text-center text-neutral-600 italic text-sm py-10 border-2 border-dashed border-neutral-800 rounded-lg">Drag cards here</div>
                                    )}
                                </div>
                            </div>
                        );
                      })}
                  </div>
              </div>
          </div>
      )}

      {/* --- CANVAS VIEW --- */}
      {viewMode === VIEW_MODE_CANVAS && (
        <div 
            ref={canvasContainerRef}
            className="origin-top-left absolute top-0 left-0 canvas-element"
            style={{ 
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                willChange: isPanning || isDraggingElements ? 'transform' : 'auto',
                backfaceVisibility: 'hidden',
                perspective: 1000
            }}
        >
            {elements.map(element => {
                // Viewport culling - skip rendering if not visible
                if (!isElementInViewport(element, view, window.innerWidth, window.innerHeight)) {
                    return null;
                }
                
                const isSelected = selectedIds.has(element.id);
                if (element.type === 'card') {
                    return (
                        <div
                            key={element.id}
                            className={`absolute group canvas-element transition-opacity duration-300`}
                            style={{
                                left: element.x, top: element.y,
                                zIndex: (hoveredId === element.id && !isDraggingElements && !isPanning) ? 100000 : (isSelected ? 9999 : element.zIndex),
                                width: '200px', 
                            }}
                            onMouseEnter={() => !isDraggingElements && !isPanning && setHoveredId(element.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onMouseDown={(e) => handleElementMouseDown(e, element.id)}
                            onTouchStart={(e) => handleElementMouseDown(e, element.id)}
                            onContextMenu={(e) => handleContextMenu(e, element.id)}
                        >
                            <div className={`relative rounded-xl overflow-hidden transition-all duration-200 ${isSelected ? 'ring-4 ring-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.5)]' : 'shadow-2xl hover:shadow-[0_0_20px_rgba(0,0,0,0.3)]'} bg-[#151515]`}>
                                {element.tags && element.tags.length > 0 && (
                                    <div className="absolute top-9 left-2 right-2 flex flex-col items-start gap-1 z-20 pointer-events-auto">
                                        {element.tags.map((tag, idx) => (
                                            <div key={idx} className="text-[10px] px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap cursor-pointer backdrop-blur-md border border-white/10 transition-colors bg-black/60 text-white hover:bg-black/80" onClick={(e) => handleTagClick(e, tag)}>{tag}</div>
                                        ))}
                                    </div>
                                )}
                                <img 
                                    src={element.imageUrl} 
                                    alt={element.name} 
                                    className="w-full h-auto block pointer-events-none select-none rounded-xl" 
                                    loading="lazy" 
                                    draggable={false} 
                                />
                                <div className={`absolute top-0 right-0 p-2 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity z-30`}>
                                    <button onClick={(e) => handleRemoveElement(e, element.id)} onTouchStart={(e) => handleRemoveElement(e, element.id)} className="bg-red-500/80 hover:bg-red-600 text-white p-1.5 rounded-full backdrop-blur-sm shadow-lg transform hover:scale-110 transition-all"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    );
                }
                if (element.type === 'sticky') {
                    return (
                        <div
                            key={element.id}
                            className={`absolute group canvas-element transition-opacity duration-300`}
                            style={{
                                left: element.x, top: element.y,
                                zIndex: (hoveredId === element.id && !isDraggingElements && !isPanning) ? 100000 : element.zIndex,
                                width: '200px', height: '200px',
                            }}
                            onMouseEnter={() => !isDraggingElements && !isPanning && setHoveredId(element.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            onMouseDown={(e) => handleElementMouseDown(e, element.id)}
                            onTouchStart={(e) => handleElementMouseDown(e, element.id)}
                        >
                            <div className={`relative w-full h-full p-2 flex flex-col bg-yellow-200 text-neutral-900 shadow-lg rounded-sm transition-all duration-200 ${isSelected ? 'ring-4 ring-blue-500 shadow-[0_0_30px_rgba(253,224,71,0.6)]' : 'hover:shadow-2xl'}`}>
                                <div className="h-6 w-full cursor-grab active:cursor-grabbing flex justify-end">
                                    <button onClick={(e) => handleRemoveElement(e, element.id)} onTouchStart={(e) => handleRemoveElement(e, element.id)} className={`text-yellow-800 hover:text-red-600 hover:bg-yellow-300 rounded p-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><X className="w-4 h-4" /></button>
                                </div>
                                <textarea className="flex-1 bg-transparent resize-none outline-none border-none text-lg font-medium leading-tight placeholder-yellow-800/50 cursor-text" placeholder="Write something..." value={element.content} onChange={(e) => setElements(prev => updateStickyContent(prev, element.id, e.target.value))} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} />
                            </div>
                        </div>
                    );
                }
                return null;
            })}
            {selectionBox && (
                <div 
                    className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none z-[9999]"
                    style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }}
                />
            )}
        </div>
      )}

      {/* --- Context Menu --- */}
      {contextMenu && (
         <div className="fixed z-[10001] bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden min-w-[150px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
             <button className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white flex items-center gap-2" onClick={handleEditTagsClick}><Tag className="w-4 h-4" />Edit Tags</button>
             {selectedIds.size > 1 && selectedIds.has(contextMenu.elementId) && (
                 <>
                    <div className="h-px bg-neutral-700 my-1" />
                    <button className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white flex items-center gap-2" onClick={() => handleAlign('horizontal')}><ArrowRight className="w-4 h-4" />Side-by-Side</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white flex items-center gap-2" onClick={() => handleAlign('vertical')}><ArrowDown className="w-4 h-4" />Top-to-Bottom</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-neutral-700 text-white flex items-center gap-2" onClick={() => handleAlign('stack-pile')}><Layers className="w-4 h-4" />Stack Vertically</button>
                 </>
             )}
         </div>
      )}

      {/* --- Add Tag Modal --- */}
      {showTagInput && (
         <div className="absolute inset-0 z-[10002] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onWheel={(e) => e.stopPropagation()}>
             <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[80vh]">
                 <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Tag className="w-5 h-5 text-blue-400" />Edit Tags<span className="text-sm font-normal text-neutral-500 ml-2">({editingElementIds.size} selected)</span></h3>
                 <div className="flex gap-2 mb-4">
                     <input type="text" className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg p-3 text-white outline-none focus:border-blue-500" placeholder="Create new tag..." value={tagInputValue} onChange={(e) => setTagInputValue(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && handleAddNewTag()} />
                     <button onClick={handleAddNewTag} disabled={!tagInputValue.trim()} className="bg-neutral-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors" title="Add Tag"><Plus className="w-5 h-5" /></button>
                 </div>
                 <div className="flex-1 overflow-y-auto min-h-0 mb-4">
                    <div className="text-xs text-neutral-500 mb-2 uppercase font-bold tracking-wider">Available Tags</div>
                    <div className="flex flex-wrap gap-2">
                        {allUniqueTags.length === 0 && (<div className="text-sm text-neutral-600 italic">No existing tags. Create one above!</div>)}
                        {allUniqueTags.map(tag => {
                            const relevantElements = elements.filter(el => editingElementIds.has(el.id));
                            const count = relevantElements.filter(el => el.tags?.includes(tag)).length;
                            const total = relevantElements.length;
                            let statusClass = ''; let icon = null;
                            if (count === total) { statusClass = 'bg-green-600 border-green-500 text-white hover:bg-green-700'; icon = <Check className="ml-2 w-3 h-3" />; } 
                            else if (count > 0) { statusClass = 'bg-yellow-600 border-yellow-500 text-white hover:bg-yellow-700'; icon = <Minus className="ml-2 w-3 h-3" />; } 
                            else { statusClass = 'bg-neutral-700 border-neutral-600 text-neutral-300 hover:bg-neutral-600'; icon = null; }
                            return (<button key={tag} onClick={() => handleToggleTag(tag)} className={`px-3 py-1.5 rounded-full text-sm transition-all border flex items-center ${statusClass}`}>{tag}{icon}</button>);
                        })}
                    </div>
                 </div>
                 <button onClick={() => { setShowTagInput(false); setTimeout(() => { isEditingRef.current = false; }, 500); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold flex-shrink-0">Close</button>
             </div>
         </div>
      )}

      {/* --- Bulk Add Modal --- */}
      {showBulkAdd && (
        <div className="absolute inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 touch-auto" onWheel={(e) => e.stopPropagation()}>
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 flex flex-col h-[80vh] max-h-[600px]">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2"><Layers className="w-6 h-6 text-blue-400" /><h2 className="text-xl font-bold text-white">Bulk Add Cards</h2></div>
                        <button onClick={() => setShowBulkAdd(false)} className="text-neutral-400 hover:text-white" disabled={isBulkValidating}><X className="w-6 h-6" /></button>
                    </div>
                    <p className="text-neutral-400 text-sm mb-4">{bulkStage === 'input' ? "Paste card names below (one per line). Validate them before adding." : "Review valid cards (green) and fix invalid ones (red)."}</p>
                    <div className="flex-1 overflow-hidden relative mb-4">
                        {bulkStage === 'input' ? (
                            <textarea className="w-full h-full bg-neutral-900 border border-neutral-700 rounded-lg p-4 text-neutral-200 outline-none resize-none focus:border-blue-500 font-mono text-sm" placeholder={`4 Black Lotus\n2 Mox Pearl\nAncestral Recall...`} value={bulkAddText} onChange={(e) => setBulkAddText(e.target.value)} disabled={isBulkValidating} />
                        ) : (
                            <div className="w-full h-full bg-neutral-900 border border-neutral-700 rounded-lg overflow-y-auto">
                                {validatedItems.map((item) => (
                                    <div key={item.id} className={`flex items-center p-2 border-b border-neutral-800 gap-2 ${item.status === 'valid' ? 'bg-green-900/20' : ''} ${item.status === 'invalid' ? 'bg-red-900/20' : ''} ${item.status === 'pending' ? 'bg-yellow-900/20' : ''}`}>
                                        <div className="flex-shrink-0">{item.status === 'valid' && <CheckCircle2 className="w-5 h-5 text-green-500" />}{item.status === 'invalid' && <AlertCircle className="w-5 h-5 text-red-500" />}{item.status === 'pending' && <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />}</div>
                                        <input type="text" className="bg-transparent border-none outline-none flex-1 text-sm font-mono text-white" value={item.text} onChange={(e) => handleBulkItemChange(item.id, e.target.value)} />
                                        <button onClick={() => handleRemoveBulkItem(item.id)} className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-700/50 rounded transition-colors" title="Remove item"><X className="w-4 h-4" /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setShowBulkAdd(false)} className="bg-neutral-700 hover:bg-neutral-600 text-white py-3 px-6 rounded-lg font-medium transition-colors" disabled={isBulkValidating}>Cancel</button>
                        {allValid && bulkStage === 'results' ? (
                            <>
                                <button onClick={() => handleFinalizeBulkAdd('append')} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2" title="Add these cards to the current board"><Plus className="w-5 h-5" />Add to Board</button>
                                <button onClick={() => handleFinalizeBulkAdd('override')} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2" title="Clear board and add these cards"><RefreshCw className="w-5 h-5" />Override</button>
                            </>
                        ) : (
                            <button onClick={handleValidateBulk} disabled={isBulkValidating || (bulkStage === 'input' && !bulkAddText.trim())} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2">
                                {isBulkValidating ? <><Loader2 className="w-5 h-5 animate-spin" />Validating...</> : <>{bulkStage === 'results' ? 'Re-Validate' : 'Validate'}</>}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- Import Confirmation Modal --- */}
      {showImportConfirm && (
        <div className="absolute inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 touch-auto" onWheel={(e) => e.stopPropagation()}>
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex flex-col items-center text-center mb-6"><div className="bg-red-500/10 p-3 rounded-full mb-4"><AlertTriangle className="w-8 h-8 text-red-500" /></div><h2 className="text-xl font-bold text-white mb-2">Overwrite Board?</h2><p className="text-neutral-400 text-sm">Importing this file will completely replace your current board state. This action cannot be undone.</p></div>
                    <div className="flex gap-3"><button onClick={() => {setShowImportConfirm(false); setPendingImportData(null);}} className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 rounded-lg font-medium transition-colors">Cancel</button><button onClick={confirmImport} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium transition-colors">Yes, Overwrite</button></div>
                </div>
            </div>
        </div>
      )}

      {/* --- Clear Board Confirmation Modal --- */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 touch-auto" onWheel={(e) => e.stopPropagation()}>
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex flex-col items-center text-center mb-6"><div className="bg-red-500/10 p-3 rounded-full mb-4"><Trash2 className="w-8 h-8 text-red-500" /></div><h2 className="text-xl font-bold text-white mb-2">Clear Board?</h2><p className="text-neutral-400 text-sm">This will remove all cards and notes from your board. This action cannot be undone.</p></div>
                    <div className="flex gap-3"><button onClick={() => setShowClearConfirm(false)} className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 rounded-lg font-medium transition-colors">Cancel</button><button onClick={confirmClearBoard} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-medium transition-colors">Yes, Clear All</button></div>
                </div>
            </div>
        </div>
      )}

      {/* --- Help Modal --- */}
      {showHelp && (
        <div className="absolute inset-0 z-[10000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 touch-auto" onWheel={(e) => e.stopPropagation()}>
            <div className="bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-start mb-6"><h2 className="text-2xl font-bold text-white flex items-center gap-2"><MousePointer2 className="w-6 h-6 text-blue-400" />How to use</h2><button onClick={handleCloseHelp} className="text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button></div>
                    <div className="space-y-4">
                        <div className="flex items-start gap-4 p-3 bg-neutral-700/50 rounded-lg"><div className="bg-blue-500/20 p-2 rounded text-blue-400"><Search className="w-5 h-5" /></div><div><h3 className="font-bold text-white">Add Cards</h3><p className="text-sm text-neutral-400">Type a Magic: The Gathering card name in the top bar and select it.</p></div></div>
                        <div className="flex items-start gap-4 p-3 bg-neutral-700/50 rounded-lg"><div className="bg-white/20 p-2 rounded text-white"><LayoutTemplate className="w-5 h-5" /></div><div><h3 className="font-bold text-white">Tag Baskets</h3><p className="text-sm text-neutral-400">Switch to the "Baskets" view to organize cards by columns. Pan and Zoom just like the canvas! Drag cards between columns to add tags.</p></div></div>
                        <div className="flex items-start gap-4 p-3 bg-neutral-700/50 rounded-lg"><div className="bg-yellow-500/20 p-2 rounded text-yellow-400"><StickyNote className="w-5 h-5" /></div><div><h3 className="font-bold text-white">Sticky Notes</h3><p className="text-sm text-neutral-400">Drag or Click the yellow sticky note icon to add a note.</p></div></div>
                         <div className="flex items-start gap-4 p-3 bg-neutral-700/50 rounded-lg"><div className="bg-cyan-500/20 p-2 rounded text-cyan-400"><Layers className="w-5 h-5" /></div><div><h3 className="font-bold text-white">Bulk Add Cards</h3><p className="text-sm text-neutral-400">Paste a list of cards (e.g., '4 Lightning Bolt') to validate and add them in a grid.</p></div></div>
                        <div className="flex items-start gap-4 p-3 bg-neutral-700/50 rounded-lg"><div className="bg-indigo-500/20 p-2 rounded text-indigo-400"><Tag className="w-5 h-5" /></div><div><h3 className="font-bold text-white">Tags</h3><p className="text-sm text-neutral-400">Right-click (or long press) a card to add tags. Tap a tag to highlight matches.</p></div></div>
                    </div>
                    <button onClick={handleCloseHelp} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold transition-colors">Got it!</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}