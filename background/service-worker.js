/**
 * PrompthaKCer Background Service Worker v2.0
 * Handles context menus, keyboard shortcuts, and dynamic script injection
 */

// ============================================================================
// INSTALLATION & SETUP
// ============================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize default settings
    await chrome.storage.sync.set({
      enabled: true,
      compressionPreset: 'medium',
      showNotifications: true,
      autoSaveHistory: true
    });

    await chrome.storage.local.set({
      promptHistory: [],
      totalStats: {
        promptsOptimized: 0,
        promptsApplied: 0,
        tokensSaved: 0,
        charactersSaved: 0,
        rulesApplied: {}
      }
    });

    console.log('PrompthaKCer installed and initialized');
  }

  // Setup context menus
  setupContextMenus();
});

// ============================================================================
// DYNAMIC SCRIPT INJECTION
// ============================================================================

async function injectContentScripts(tabId) {
  try {
    // Check if already injected
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__PROMPTFORGE_INJECTED__
    });

    if (results[0]?.result) {
      return true; // Already injected
    }

    // Inject CSS first
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/modal.css']
    });

    // Inject scripts in order
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/rules-engine.js']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/site-detector.js']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/history-manager.js']
    });

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js']
    });

    // Mark as injected
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => { window.__PROMPTFORGE_INJECTED__ = true; }
    });

    return true;
  } catch (e) {
    console.log('Could not inject scripts:', e.message);
    return false;
  }
}

// Inject on extension icon click (popup open)
chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id) {
    await injectContentScripts(tab.id);
  }
});

// ============================================================================
// CONTEXT MENUS
// ============================================================================

function setupContextMenus() {
  // Remove existing menus first
  chrome.contextMenus.removeAll(() => {
    // Main optimization menu
    chrome.contextMenus.create({
      id: 'prompthakcer-optimize',
      title: 'Optimize with PrompthaKCer',
      contexts: ['selection']
    });

    // Copy optimized
    chrome.contextMenus.create({
      id: 'prompthakcer-copy',
      title: 'Optimize and Copy',
      contexts: ['selection']
    });

    // Separator
    chrome.contextMenus.create({
      id: 'prompthakcer-separator',
      type: 'separator',
      contexts: ['selection']
    });

    // Compression presets submenu
    chrome.contextMenus.create({
      id: 'prompthakcer-presets',
      title: 'Compression Level',
      contexts: ['selection']
    });

    const presets = [
      { id: 'none', title: '[1] None (formatting only)' },
      { id: 'light', title: '[2] Light' },
      { id: 'medium', title: '[3] Medium (recommended)' },
      { id: 'heavy', title: '[4] Heavy' },
      { id: 'maximum', title: '[5] Maximum' }
    ];

    presets.forEach(preset => {
      chrome.contextMenus.create({
        id: `prompthakcer-preset-${preset.id}`,
        title: preset.title,
        parentId: 'prompthakcer-presets',
        contexts: ['selection']
      });
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText;
  if (!selectedText) return;

  if (info.menuItemId === 'prompthakcer-optimize') {
    // Try to inject and send to content script
    if (tab?.id) {
      await injectContentScripts(tab.id);
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'optimizeText',
          text: selectedText
        });
      } catch (e) {
        // Content script not responding, optimize in background and copy
        const optimized = await optimizeInBackground(selectedText);
        await copyToClipboard(optimized.optimized);
        showNotification('Optimized & Copied!', `Saved ${optimized.stats.tokensSaved} tokens`);
      }
    }
  }

  if (info.menuItemId === 'prompthakcer-copy') {
    const optimized = await optimizeInBackground(selectedText);
    await copyToClipboard(optimized.optimized);
    showNotification('Optimized & Copied!', `Saved ${optimized.stats.tokensSaved} tokens`);
  }

  if (info.menuItemId.startsWith('prompthakcer-preset-')) {
    const preset = info.menuItemId.replace('prompthakcer-preset-', '');
    await chrome.storage.sync.set({ compressionPreset: preset });
    showNotification('Compression Changed', `Set to ${preset}`);
  }
});

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'optimize-prompt') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      // Inject scripts first, then trigger
      await injectContentScripts(tab.id);
      try {
        await chrome.tabs.sendMessage(tab.id, { action: 'triggerOptimize' });
      } catch (e) {
        console.log('Content script not available');
      }
    }
  }
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'injectScripts':
      // Request to inject from popup
      if (message.tabId) {
        const success = await injectContentScripts(message.tabId);
        return { success };
      }
      return { success: false };

    case 'saveToHistory':
      return await saveToHistory(message.data);

    case 'getHistory':
      return await getHistory(message.options);

    case 'getStats':
      return await getStats();

    case 'clearHistory':
      return await clearHistory();

    case 'optimize':
      return await optimizeInBackground(message.text, message.options);

    case 'updateStats':
      return await updateStats(message.stats);

    default:
      return { error: 'Unknown action' };
  }
}

// ============================================================================
// OPTIMIZATION
// ============================================================================

async function optimizeInBackground(text, options = {}) {
  const stored = await chrome.storage.sync.get(['compressionPreset', 'ruleSettings', 'customRules']);
  const preset = options.preset || stored.compressionPreset || 'medium';

  // Simple rule-based optimization (subset of full engine for background use)
  let optimized = text;
  const appliedRules = [];

  // Define compression levels
  const compressionLevels = {
    none: [],
    light: ['fluff'],
    medium: ['fluff', 'redundancy', 'qualifiers'],
    heavy: ['fluff', 'redundancy', 'qualifiers', 'verbosity', 'structure'],
    maximum: ['fluff', 'redundancy', 'qualifiers', 'verbosity', 'structure', 'aggressive']
  };

  const enabledCategories = compressionLevels[preset] || compressionLevels.medium;

  // Basic rules (simplified for background script)
  const rules = [
    // Fluff
    { category: 'fluff', find: /\bplease\s+/gi, replace: '' },
    { category: 'fluff', find: /\bcould you (please\s+)?/gi, replace: '' },
    { category: 'fluff', find: /\bwould you (please\s+)?/gi, replace: '' },
    { category: 'fluff', find: /\bjust\s+/gi, replace: '' },
    { category: 'fluff', find: /\breally\s+/gi, replace: '' },
    { category: 'fluff', find: /\bvery\s+/gi, replace: '' },
    { category: 'fluff', find: /\bactually,?\s*/gi, replace: '' },
    { category: 'fluff', find: /\bbasically,?\s*/gi, replace: '' },

    // Redundancy
    { category: 'redundancy', find: /\bI want you to\s+/gi, replace: '' },
    { category: 'redundancy', find: /\bI need you to\s+/gi, replace: '' },
    { category: 'redundancy', find: /\bI'd like you to\s+/gi, replace: '' },
    { category: 'redundancy', find: /\bin order to\s+/gi, replace: 'to ' },
    { category: 'redundancy', find: /\bdue to the fact that\s+/gi, replace: 'because ' },

    // Qualifiers
    { category: 'qualifiers', find: /\bperhaps\s+/gi, replace: '' },
    { category: 'qualifiers', find: /\bmaybe\s+/gi, replace: '' },
    { category: 'qualifiers', find: /\bI think (that\s+)?/gi, replace: '' },
    { category: 'qualifiers', find: /\bI believe (that\s+)?/gi, replace: '' },

    // Verbosity
    { category: 'verbosity', find: /\bmake sure (that\s+)?/gi, replace: 'ensure ' },
    { category: 'verbosity', find: /\ba lot of\s+/gi, replace: 'many ' },
    { category: 'verbosity', find: /\bis able to\s+/gi, replace: 'can ' },

    // Structure
    { category: 'structure', find: /\bI have a question(:|,)?\s*/gi, replace: '' },
    { category: 'structure', find: /\bprovide a detailed explanation of\s+/gi, replace: 'explain in detail: ' },

    // Aggressive
    { category: 'aggressive', find: /\bfor example\b/gi, replace: 'e.g.' },
    { category: 'aggressive', find: /\bin other words\b/gi, replace: 'i.e.' }
  ];

  // Apply enabled rules
  for (const rule of rules) {
    if (enabledCategories.includes(rule.category)) {
      const before = optimized;
      optimized = optimized.replace(rule.find, rule.replace);
      if (optimized !== before) {
        appliedRules.push(rule.category);
      }
    }
  }

  // Cleanup whitespace
  optimized = optimized.replace(/\s{2,}/g, ' ').trim();

  // Capitalize first letter
  if (optimized.length > 0) {
    optimized = optimized.charAt(0).toUpperCase() + optimized.slice(1);
  }

  // Calculate stats
  const originalTokens = Math.ceil(text.length / 4);
  const optimizedTokens = Math.ceil(optimized.length / 4);

  return {
    original: text,
    optimized,
    stats: {
      originalLength: text.length,
      optimizedLength: optimized.length,
      charsSaved: text.length - optimized.length,
      originalTokens,
      optimizedTokens,
      tokensSaved: originalTokens - optimizedTokens,
      percentSaved: originalTokens > 0 ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100) : 0
    },
    appliedRules: [...new Set(appliedRules)],
    hasChanges: text !== optimized
  };
}

// ============================================================================
// HISTORY MANAGEMENT
// ============================================================================

async function saveToHistory(entry) {
  try {
    const stored = await chrome.storage.local.get(['promptHistory', 'totalStats']);
    const history = stored.promptHistory || [];
    const stats = stored.totalStats || {
      promptsOptimized: 0,
      promptsApplied: 0,
      tokensSaved: 0,
      charactersSaved: 0,
      rulesApplied: {}
    };

    // Create history entry
    const historyEntry = {
      id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      site: entry.site || 'unknown',
      siteIcon: entry.siteIcon || '[WEB]',
      original: entry.original,
      optimized: entry.optimized,
      applied: entry.applied || false,
      stats: entry.stats || {},
      appliedRules: entry.appliedRules || [],
      compressionPreset: entry.compressionPreset || 'medium'
    };

    // Add to history (limit to 500 entries)
    history.push(historyEntry);
    if (history.length > 500) {
      history.splice(0, history.length - 500);
    }

    // Update stats
    stats.promptsOptimized++;
    if (entry.applied) stats.promptsApplied++;
    stats.tokensSaved += entry.stats?.tokensSaved || 0;
    stats.charactersSaved += entry.stats?.charsSaved || 0;

    await chrome.storage.local.set({ promptHistory: history, totalStats: stats });

    return { success: true, entry: historyEntry };
  } catch (e) {
    console.error('Error saving to history:', e);
    return { success: false, error: e.message };
  }
}

async function getHistory(options = {}) {
  const stored = await chrome.storage.local.get(['promptHistory']);
  let history = stored.promptHistory || [];

  // Apply filters
  if (options.site) {
    history = history.filter(e => e.site === options.site);
  }

  if (options.search) {
    const search = options.search.toLowerCase();
    history = history.filter(e =>
      e.original.toLowerCase().includes(search) ||
      e.optimized.toLowerCase().includes(search)
    );
  }

  // Sort
  if (options.sortBy === 'oldest') {
    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  } else if (options.sortBy === 'tokensSaved') {
    history.sort((a, b) => (b.stats?.tokensSaved || 0) - (a.stats?.tokensSaved || 0));
  } else {
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Limit
  if (options.limit) {
    history = history.slice(0, options.limit);
  }

  return history;
}

async function getStats() {
  const stored = await chrome.storage.local.get(['totalStats']);
  return stored.totalStats || {
    promptsOptimized: 0,
    promptsApplied: 0,
    tokensSaved: 0,
    charactersSaved: 0,
    rulesApplied: {}
  };
}

async function clearHistory() {
  await chrome.storage.local.set({
    promptHistory: [],
    totalStats: {
      promptsOptimized: 0,
      promptsApplied: 0,
      tokensSaved: 0,
      charactersSaved: 0,
      rulesApplied: {}
    }
  });
  return { success: true };
}

async function updateStats(newStats) {
  const stored = await chrome.storage.local.get(['totalStats']);
  const stats = stored.totalStats || {};

  Object.keys(newStats).forEach(key => {
    if (typeof newStats[key] === 'number') {
      stats[key] = (stats[key] || 0) + newStats[key];
    }
  });

  await chrome.storage.local.set({ totalStats: stats });
  return stats;
}

// ============================================================================
// UTILITIES
// ============================================================================

async function copyToClipboard(text) {
  // Use offscreen document for clipboard access in MV3
  try {
    await chrome.offscreen?.createDocument?.({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Copy optimized text to clipboard'
    });
  } catch (e) {
    // Document might already exist
  }

  // Fallback: write to storage for popup to handle
  await chrome.storage.local.set({ clipboardText: text });
  return true;
}

function showNotification(title, message) {
  // Check if notifications are enabled
  chrome.storage.sync.get(['showNotifications'], (result) => {
    if (result.showNotifications !== false) {
      chrome.notifications?.create?.({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `${title}`,
        message: message
      });
    }
  });
}

// ============================================================================
// STARTUP
// ============================================================================

// Ensure context menus are set up on startup
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

console.log('PrompthaKCer service worker loaded');
