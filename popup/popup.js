/**
 * PromptForge Popup Script v2.0
 * Standalone optimizer with history and learning features
 */

// Global instances
let rulesEngine;
let historyManager;
let currentTab = null;
let isOnSupportedSite = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize engines
  rulesEngine = new RulesEngine();
  historyManager = new HistoryManager();

  await Promise.all([
    rulesEngine.init(),
    historyManager.init()
  ]);

  // Check current tab and inject scripts
  await checkCurrentTab();

  // Inject content scripts on current tab
  if (currentTab?.id) {
    try {
      await chrome.runtime.sendMessage({ action: 'injectScripts', tabId: currentTab.id });
    } catch (e) {
      console.log('Could not inject scripts:', e);
    }
  }

  // Load settings
  await loadSettings();
  
  // Setup UI
  setupTabs();
  setupPresetSelector();
  setupOptimizer();
  setupHistory();
  setupEventListeners();
  
  // Load history stats
  updateHistoryStats();
});

// ============================================================================
// TAB CHECKING
// ============================================================================

async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    
    if (!tab?.url) {
      showStandaloneMode();
      return;
    }
    
    // Check if on supported site
    const stored = await chrome.storage.sync.get(['customSites', 'siteSettings']);
    const sites = await getSupportedSites(stored);
    
    const matchedSite = sites.find(site => {
      if (!site.enabled) return false;
      return site.patterns.some(pattern => tab.url.includes(pattern));
    });
    
    if (matchedSite) {
      isOnSupportedSite = true;
      showSiteStatus(matchedSite);

      // Show apply button
      const applyBtn = document.getElementById('applyBtn');
      if (applyBtn) applyBtn.style.display = 'flex';
    } else {
      showStandaloneMode();
    }
  } catch (e) {
    console.error('Error checking tab:', e);
    showStandaloneMode();
  }
}

async function getSupportedSites(stored) {
  const defaultSites = [
    { id: 'chatgpt', name: 'ChatGPT', icon: 'GPT', patterns: ['chat.openai.com', 'chatgpt.com'], enabled: true },
    { id: 'claude', name: 'Claude', icon: 'C', patterns: ['claude.ai'], enabled: true },
    { id: 'gemini', name: 'Gemini', icon: 'G', patterns: ['gemini.google.com', 'bard.google.com'], enabled: true },
    { id: 'grok', name: 'Grok', icon: 'X', patterns: ['grok.x.ai', 'x.com/i/grok'], enabled: true },
    { id: 'perplexity', name: 'Perplexity', icon: 'P', patterns: ['perplexity.ai'], enabled: true },
    { id: 'copilot', name: 'Copilot', icon: 'MS', patterns: ['copilot.microsoft.com', 'bing.com/chat'], enabled: true },
    { id: 'poe', name: 'Poe', icon: 'POE', patterns: ['poe.com'], enabled: true }
  ];
  
  // Merge with stored settings
  const sites = defaultSites.map(site => {
    const settings = stored.siteSettings?.[site.id];
    return settings ? { ...site, ...settings } : site;
  });
  
  // Add custom sites
  if (stored.customSites) {
    sites.push(...stored.customSites);
  }
  
  return sites;
}

function showStandaloneMode() {
  const statusEl = document.getElementById('siteStatus');
  if (statusEl) {
    statusEl.classList.remove('active');
  }

  const siteIcon = document.getElementById('siteIcon');
  const siteName = document.getElementById('siteName');
  const siteDesc = document.getElementById('siteDesc');

  if (siteIcon) siteIcon.textContent = '[OK]';
  if (siteName) siteName.textContent = 'Standalone Mode';
  if (siteDesc) siteDesc.textContent = 'Type or paste your prompt below';
}

function showSiteStatus(site) {
  const statusEl = document.getElementById('siteStatus');
  if (statusEl) {
    statusEl.classList.add('active');
  }

  const siteIcon = document.getElementById('siteIcon');
  const siteName = document.getElementById('siteName');
  const siteDesc = document.getElementById('siteDesc');

  if (siteIcon) siteIcon.textContent = site.icon || '[WEB]';
  if (siteName) siteName.textContent = `Active on ${site.name}`;
  if (siteDesc) siteDesc.textContent = 'Optimize here or on the page';
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const stored = await chrome.storage.sync.get(['compressionPreset']);
  const preset = stored.compressionPreset || 'medium';
  
  // Update preset selector
  updatePresetSelector(preset);
}

// ============================================================================
// TABS
// ============================================================================

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.tab;
      
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active content
      contents.forEach(c => c.classList.remove('active'));
      document.getElementById(`${targetId}-tab`).classList.add('active');
      
      // Refresh content if needed
      if (targetId === 'history') {
        renderHistory();
      } else if (targetId === 'learn') {
        renderInsights();
      }
    });
  });
}

// ============================================================================
// PRESET SELECTOR
// ============================================================================

function setupPresetSelector() {
  // HTML uses 'compression-btn' class not 'preset-btn'
  const buttons = document.querySelectorAll('.compression-btn, .preset-btn');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // HTML uses 'data-level' not 'data-preset'
      const preset = btn.dataset.level || btn.dataset.preset;
      updatePresetSelector(preset);
      // RulesEngine uses setCompressionLevel, not setCompressionPreset
      if (rulesEngine.setCompressionLevel) {
        rulesEngine.setCompressionLevel(preset);
      }
    });
  });
}

function updatePresetSelector(presetId) {
  // HTML uses 'compression-btn' class not 'preset-btn'
  const buttons = document.querySelectorAll('.compression-btn, .preset-btn');
  const nameEl = document.getElementById('presetName');

  buttons.forEach(btn => {
    // HTML uses 'data-level' not 'data-preset'
    const btnPreset = btn.dataset.level || btn.dataset.preset;
    btn.classList.toggle('active', btnPreset === presetId);
  });

  const presets = {
    none: 'None',
    light: 'Light',
    medium: 'Medium',
    heavy: 'Heavy',
    maximum: 'Maximum',
    // HTML uses these level names
    minimal: 'Minimal',
    balanced: 'Balanced',
    aggressive: 'Aggressive'
  };

  if (nameEl) nameEl.textContent = presets[presetId] || 'Medium';
}

// ============================================================================
// OPTIMIZER
// ============================================================================

function setupOptimizer() {
  const input = document.getElementById('promptInput');
  // HTML uses 'inputCount' not 'inputCharCount'
  const charCount = document.getElementById('inputCount') || document.getElementById('inputCharCount');
  const tokenCount = document.getElementById('inputTokenCount');

  // Update counts on input
  input.addEventListener('input', () => {
    const text = input.value;
    if (charCount) charCount.textContent = `${text.length} chars`;
    if (tokenCount) tokenCount.textContent = `~${rulesEngine.estimateTokens(text)} tokens`;
  });
  
  // Optimize button
  document.getElementById('optimizeBtn').addEventListener('click', optimizePrompt);

  // Copy button
  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyOptimized);

  // Apply button (may not exist in HTML)
  const applyBtn = document.getElementById('applyBtn');
  if (applyBtn) applyBtn.addEventListener('click', applyToPage);
}

async function optimizePrompt() {
  const input = document.getElementById('promptInput');
  const text = input.value.trim();
  
  if (!text) {
    showToast('Please enter a prompt to optimize', 'error');
    return;
  }
  
  if (text.length < 10) {
    showToast('Prompt is too short to optimize', 'error');
    return;
  }
  
  // Analyze the prompt
  const result = rulesEngine.analyze(text, { showExplanations: true });
  
  if (!result.hasChanges) {
    showToast('Prompt is already optimized! [OK]', 'success');
    return;
  }
  
  // Show results section
  const resultsSection = document.getElementById('resultsSection');
  resultsSection.style.display = 'block';
  
  // Update stats
  const tokensSavedEl = document.getElementById('tokensSaved');
  const percentSavedEl = document.getElementById('percentSaved');
  const rulesAppliedEl = document.getElementById('rulesApplied');
  if (tokensSavedEl) tokensSavedEl.textContent = result.stats.tokensSaved;
  if (percentSavedEl) percentSavedEl.textContent = `${result.stats.percentSaved}%`;
  if (rulesAppliedEl) rulesAppliedEl.textContent = result.appliedRules.length;
  
  // Update output
  const outputEl = document.getElementById('optimizedOutput');
  outputEl.textContent = result.optimized;
  
  // HTML uses 'outputCount' not 'outputCharCount'
  const outputCharCount = document.getElementById('outputCount') || document.getElementById('outputCharCount');
  const outputTokenCount = document.getElementById('outputTokenCount');
  if (outputCharCount) outputCharCount.textContent = `${result.stats.optimizedLength} chars`;
  if (outputTokenCount) outputTokenCount.textContent = `~${result.stats.optimizedTokens} tokens`;
  
  // Render applied rules
  renderAppliedRules(result.appliedRules);
  
  // Save to history
  const siteNameEl = document.getElementById('siteName');
  const siteIconEl = document.getElementById('siteIcon');
  const site = isOnSupportedSite && siteNameEl
    ? siteNameEl.textContent.replace('Active on ', '')
    : 'Standalone';
  const siteIcon = siteIconEl ? siteIconEl.textContent : '[OK]';
  
  await historyManager.addEntry({
    site,
    siteIcon,
    original: text,
    optimized: result.optimized,
    stats: result.stats,
    appliedRules: result.appliedRules.map(r => ({ id: r.id, name: r.name })),
    // RulesEngine uses compressionLevel not compressionPreset
    compressionEnabled: rulesEngine.compressionLevel || rulesEngine.getCurrentCompressionLevel?.() || 'balanced'
  });
  
  // Update stats
  updateHistoryStats();
  
  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
  
  showToast(`Saved ${result.stats.tokensSaved} tokens! `, 'success');
}

function renderAppliedRules(rules) {
  // HTML uses 'rulesList' not 'appliedRulesList'
  const container = document.getElementById('rulesList') || document.getElementById('appliedRulesList');
  if (!container) return;

  container.innerHTML = rules.map(rule => `
    <div class="rule-item">
      <span class="rule-icon">+</span>
      <span class="rule-name">${escapeHtml(rule.name)}</span>
      <span class="rule-category">${rule.category}</span>
    </div>
  `).join('');

  // Also update rules count if it exists
  const rulesCount = document.getElementById('rulesCount');
  if (rulesCount) rulesCount.textContent = rules.length;
}

async function copyOptimized() {
  const output = document.getElementById('optimizedOutput').textContent;
  
  try {
    await navigator.clipboard.writeText(output);
    showToast('Copied to clipboard! ', 'success');
  } catch (e) {
    showToast('Failed to copy', 'error');
  }
}

async function applyToPage() {
  if (!currentTab?.id) {
    showToast('Cannot access current tab', 'error');
    return;
  }
  
  const optimized = document.getElementById('optimizedOutput').textContent;
  
  try {
    await chrome.tabs.sendMessage(currentTab.id, {
      action: 'applyOptimized',
      text: optimized
    });
    showToast('Applied to page! ', 'success');
  } catch (e) {
    // Content script might not be loaded
    showToast('Could not apply - try refreshing the page', 'error');
  }
}

// ============================================================================
// HISTORY
// ============================================================================

function setupHistory() {
  // Search
  const historySearch = document.getElementById('historySearch');
  if (historySearch) {
    historySearch.addEventListener('input', (e) => {
      renderHistory({ search: e.target.value });
    });
  }

  // Sort (may not exist in HTML)
  const historySort = document.getElementById('historySort');
  if (historySort) {
    historySort.addEventListener('change', (e) => {
      renderHistory({ sortBy: e.target.value });
    });
  }

  // Export (may not exist in HTML)
  const exportBtn = document.getElementById('exportHistoryBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportHistory);

  // Clear history button
  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await historyManager.clearHistory();
      renderHistory();
      updateHistoryStats();
      showToast('History cleared', 'success');
    });
  }
}

function renderHistory(options = {}) {
  const historySearchEl = document.getElementById('historySearch');
  const historySortEl = document.getElementById('historySort');
  const search = options.search || (historySearchEl ? historySearchEl.value : '');
  const sortBy = options.sortBy || (historySortEl ? historySortEl.value : 'date');
  
  const history = historyManager.getHistory({
    search,
    sortBy,
    limit: 50
  });
  
  const container = document.getElementById('historyList');
  const exportBtn = document.getElementById('exportHistoryBtn');

  if (history.length === 0) {
    if (container) {
      container.innerHTML = `
        <div class="history-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <p>No history yet</p>
          <span>Optimize some prompts to see them here</span>
        </div>
      `;
    }
    if (exportBtn) exportBtn.style.display = 'none';
    return;
  }

  if (exportBtn) exportBtn.style.display = 'flex';
  if (!container) return;
  
  container.innerHTML = history.map(entry => `
    <div class="history-item" data-id="${entry.id}">
      <div class="history-item-header">
        <div class="history-item-site">
          <span class="site-emoji">${entry.siteIcon || '[WEB]'}</span>
          <span class="site-name">${escapeHtml(entry.site)}</span>
        </div>
        <span class="history-item-date">${formatDate(entry.timestamp)}</span>
      </div>
      <div class="history-item-preview">${escapeHtml(truncate(entry.original, 100))}</div>
      <div class="history-item-stats">
        <span>-${entry.stats.tokensSaved} tokens</span>
        <span>-${entry.stats.percentSaved}%</span>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      showHistoryDetail(item.dataset.id);
    });
  });
}

async function updateHistoryStats() {
  const stats = await historyManager.getStats();

  const totalOptimized = document.getElementById('totalOptimized');
  const totalTokensSaved = document.getElementById('totalTokensSaved');

  if (totalOptimized) totalOptimized.textContent = stats.promptsOptimized || 0;
  if (totalTokensSaved) totalTokensSaved.textContent = stats.tokensSaved || 0;
}

function showHistoryDetail(entryId) {
  const entry = historyManager.getEntry(entryId);
  if (!entry) return;
  
  // Populate the prompt input with the original
  document.getElementById('promptInput').value = entry.original;
  
  // Trigger the input event to update counts
  document.getElementById('promptInput').dispatchEvent(new Event('input'));
  
  // Switch to optimize tab
  document.querySelector('.tab[data-tab="optimize"]').click();
  
  showToast('Loaded prompt from history', 'success');
}

async function exportHistory() {
  const data = await historyManager.exportHistory();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `promptforge-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast('History exported!', 'success');
}

// ============================================================================
// LEARN TAB
// ============================================================================

async function renderInsights() {
  const stats = await historyManager.getStats();
  const insights = historyManager.getInsights();

  // Element may not exist in simplified HTML
  const container = document.getElementById('insightCards');
  if (!container) return;

  if (stats.promptsOptimized < 5) {
    container.innerHTML = '<p class="no-insights">Optimize more prompts to see personalized insights!</p>';
    return;
  }
  
  let html = '';
  
  // Average savings
  html += `
    <div class="tip-card">
      <div class="tip-icon">[i]</div>
      <div class="tip-content">
        <h4>Average Savings</h4>
        <p>You save about <strong>${insights.averageTokenSavings}</strong> tokens per prompt on average.</p>
      </div>
    </div>
  `;
  
  // Most used site
  const topSite = Object.entries(insights.topSites)
    .sort((a, b) => b[1] - a[1])[0];
  
  if (topSite) {
    html += `
      <div class="tip-card">
        <div class="tip-icon">[TIP]</div>
        <div class="tip-content">
          <h4>Most Used</h4>
          <p>You use PromptForge most on <strong>${topSite[0]}</strong> (${topSite[1]} prompts).</p>
        </div>
      </div>
    `;
  }
  
  // Trend
  if (insights.recentTrend !== null) {
    const trend = insights.recentTrend > 0 ? 'up' : 'down';
    const trendIcon = insights.recentTrend > 0 ? '[+]' : '[-]';
    
    html += `
      <div class="tip-card">
        <div class="tip-icon">${trendIcon}</div>
        <div class="tip-content">
          <h4>Weekly Trend</h4>
          <p>Your usage is ${trend} <strong>${Math.abs(insights.recentTrend)}%</strong> compared to last week.</p>
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Settings button
  document.getElementById('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // History button (shortcut)
  document.getElementById('historyBtn').addEventListener('click', () => {
    document.querySelector('.tab[data-tab="history"]').click();
  });
  
  // Handle messages from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'promptFromPage') {
      document.getElementById('promptInput').value = message.text;
      document.getElementById('promptInput').dispatchEvent(new Event('input'));
      optimizePrompt();
    }
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
  // HTML uses 'toast' directly, not 'toastContainer'
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.display = 'block';
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 300);
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text, length) {
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;
  
  // Less than a minute
  if (diff < 60000) return 'Just now';
  
  // Less than an hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // Less than a week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
  
  // Default to date
  return date.toLocaleDateString();
}
