/**
 * PromptForge Options Page Script v2.0
 */

let rulesEngine;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  rulesEngine = new RulesEngine();
  await rulesEngine.init();
  
  setupNavigation();
  await loadSettings();
  renderSites();
  renderRules();
  await loadDataStats();
  setupEventListeners();
});

// ============================================================================
// NAVIGATION
// ============================================================================

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const sections = document.querySelectorAll('.section');
  
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.section;
      
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      sections.forEach(s => s.classList.remove('active'));
      document.getElementById(`${sectionId}-section`).classList.add('active');
    });
  });
  
  // Handle shortcuts link
  document.getElementById('shortcutsLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'enabled',
    'compressionPreset',
    'showNotifications',
    'autoSaveHistory'
  ]);
  
  document.getElementById('enabled').checked = settings.enabled !== false;
  document.getElementById('compressionPreset').value = settings.compressionPreset || 'medium';
  document.getElementById('showNotifications').checked = settings.showNotifications !== false;
  document.getElementById('autoSaveHistory').checked = settings.autoSaveHistory !== false;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: document.getElementById('enabled').checked,
    compressionPreset: document.getElementById('compressionPreset').value,
    showNotifications: document.getElementById('showNotifications').checked,
    autoSaveHistory: document.getElementById('autoSaveHistory').checked
  });
  
  showToast('Settings saved', 'success');
}

// ============================================================================
// SITES
// ============================================================================

async function renderSites() {
  const stored = await chrome.storage.sync.get(['customSites', 'siteSettings']);
  const siteSettings = stored.siteSettings || {};
  const customSites = stored.customSites || [];
  
  const defaultSites = [
    { id: 'chatgpt', name: 'ChatGPT', icon: 'GPT', patterns: ['chat.openai.com', 'chatgpt.com'], enabled: true },
    { id: 'claude', name: 'Claude', icon: 'C', patterns: ['claude.ai'], enabled: true },
    { id: 'gemini', name: 'Gemini', icon: 'G', patterns: ['gemini.google.com', 'bard.google.com'], enabled: true },
    { id: 'grok', name: 'Grok', icon: 'X', patterns: ['grok.x.ai', 'x.com/i/grok'], enabled: true },
    { id: 'perplexity', name: 'Perplexity', icon: 'P', patterns: ['perplexity.ai'], enabled: true },
    { id: 'copilot', name: 'Microsoft Copilot', icon: 'MS', patterns: ['copilot.microsoft.com', 'bing.com/chat'], enabled: true },
    { id: 'poe', name: 'Poe', icon: 'POE', patterns: ['poe.com'], enabled: true },
    { id: 'huggingface', name: 'HuggingFace Chat', icon: 'HF', patterns: ['huggingface.co/chat'], enabled: true }
  ];
  
  // Merge with settings
  const sites = defaultSites.map(site => ({
    ...site,
    enabled: siteSettings[site.id]?.enabled !== false
  }));
  
  // Add custom sites
  customSites.forEach(site => {
    sites.push({ ...site, isCustom: true });
  });
  
  const container = document.getElementById('sitesList');
  container.innerHTML = sites.map(site => `
    <div class="site-item ${site.enabled ? '' : 'disabled'}" data-site-id="${site.id}">
      <div class="site-icon">${site.icon || '[S]'}</div>
      <div class="site-info">
        <div class="site-name">${escapeHtml(site.name)}</div>
        <div class="site-patterns">${site.patterns.join(', ')}</div>
      </div>
      <div class="site-actions">
        <label class="toggle">
          <input type="checkbox" ${site.enabled ? 'checked' : ''} onchange="toggleSite('${site.id}', this.checked)">
          <span class="toggle-slider"></span>
        </label>
        ${site.isCustom ? `
          <button class="delete-btn" onclick="deleteSite('${site.id}')" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

async function toggleSite(siteId, enabled) {
  const stored = await chrome.storage.sync.get(['siteSettings']);
  const siteSettings = stored.siteSettings || {};
  siteSettings[siteId] = { enabled };
  await chrome.storage.sync.set({ siteSettings });
  renderSites();
}

async function addSite() {
  const name = document.getElementById('customSiteName').value.trim();
  const icon = document.getElementById('customSiteIcon').value.trim() || '[S]';
  const patterns = document.getElementById('customSitePatterns').value.trim();
  const selectors = document.getElementById('customSiteSelectors').value.trim();
  
  if (!name || !patterns) {
    showToast('Please enter a name and URL patterns', 'error');
    return;
  }
  
  const newSite = {
    id: `custom-${Date.now()}`,
    name,
    icon,
    patterns: patterns.split(',').map(p => p.trim()),
    inputSelectors: selectors ? selectors.split(',').map(s => s.trim()) : ['textarea', 'div[contenteditable="true"]'],
    enabled: true,
    isCustom: true
  };
  
  const stored = await chrome.storage.sync.get(['customSites']);
  const customSites = stored.customSites || [];
  customSites.push(newSite);
  await chrome.storage.sync.set({ customSites });
  
  // Clear form
  document.getElementById('customSiteName').value = '';
  document.getElementById('customSiteIcon').value = '';
  document.getElementById('customSitePatterns').value = '';
  document.getElementById('customSiteSelectors').value = '';
  
  renderSites();
  showToast('Site added successfully', 'success');
}

async function deleteSite(siteId) {
  if (!confirm('Delete this custom site?')) return;
  
  const stored = await chrome.storage.sync.get(['customSites']);
  const customSites = (stored.customSites || []).filter(s => s.id !== siteId);
  await chrome.storage.sync.set({ customSites });
  
  renderSites();
  showToast('Site deleted', 'success');
}

// ============================================================================
// RULES
// ============================================================================

function renderRules() {
  const filter = document.getElementById('categoryFilter').value;
  let rules = rulesEngine.getRules();
  
  if (filter !== 'all') {
    rules = rules.filter(r => r.category === filter);
  }
  
  const container = document.getElementById('rulesList');
  container.innerHTML = rules.map(rule => `
    <div class="rule-item ${rule.enabled ? '' : 'disabled'}" data-rule-id="${rule.id}">
      <label class="toggle">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} onchange="toggleRule('${rule.id}', this.checked)">
        <span class="toggle-slider"></span>
      </label>
      <div class="rule-info">
        <div class="rule-name">${escapeHtml(rule.name)}</div>
        <div class="rule-desc">${escapeHtml(rule.description)}</div>
      </div>
      <span class="rule-category">${rule.category}</span>
      ${rule.isCustom ? `
        <div class="rule-actions">
          <button class="delete-btn" onclick="deleteRule('${rule.id}')" title="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}

function toggleRule(ruleId, enabled) {
  rulesEngine.toggleRule(ruleId, enabled);
  renderRules();
}

async function addRule() {
  const name = document.getElementById('customRuleName').value.trim();
  const description = document.getElementById('customRuleDesc').value.trim();
  const pattern = document.getElementById('customRulePattern').value.trim();
  const replace = document.getElementById('customRuleReplace').value;
  const flags = document.getElementById('customRuleFlags').value.trim() || 'gi';
  
  if (!name || !pattern) {
    showToast('Please enter a name and pattern', 'error');
    return;
  }
  
  // Validate regex
  try {
    new RegExp(pattern, flags);
  } catch (e) {
    showToast(`Invalid regex: ${e.message}`, 'error');
    return;
  }
  
  const rule = {
    name,
    description,
    patternString: pattern,
    patternFlags: flags,
    replaceString: replace,
    patterns: [{ find: new RegExp(pattern, flags), replace }]
  };
  
  rulesEngine.addCustomRule(rule);
  
  // Clear form
  document.getElementById('customRuleName').value = '';
  document.getElementById('customRuleDesc').value = '';
  document.getElementById('customRulePattern').value = '';
  document.getElementById('customRuleReplace').value = '';
  
  renderRules();
  showToast('Rule added successfully', 'success');
}

function deleteRule(ruleId) {
  if (!confirm('Delete this custom rule?')) return;
  
  rulesEngine.removeCustomRule(ruleId);
  renderRules();
  showToast('Rule deleted', 'success');
}

async function resetRules() {
  if (!confirm('Reset all rules to defaults? Custom rules will be deleted.')) return;
  
  await rulesEngine.resetToDefaults();
  renderRules();
  showToast('Rules reset to defaults', 'success');
}

function testRules() {
  const input = document.getElementById('testInput').value;
  
  if (!input.trim()) {
    showToast('Please enter text to test', 'error');
    return;
  }
  
  const result = rulesEngine.analyze(input);
  
  const resultsEl = document.getElementById('testResults');
  resultsEl.style.display = 'block';
  
  document.getElementById('testStats').innerHTML = `
    <span>Tokens saved: ${result.stats.tokensSaved}</span>
    <span>Reduction: ${result.stats.percentSaved}%</span>
    <span>Rules applied: ${result.appliedRules.length}</span>
  `;
  
  document.getElementById('testOutput').textContent = result.optimized;
}

// ============================================================================
// DATA MANAGEMENT
// ============================================================================

async function loadDataStats() {
  const stored = await chrome.storage.local.get(['promptHistory', 'totalStats']);
  const history = stored.promptHistory || [];
  const stats = stored.totalStats || {};
  
  document.getElementById('historyCount').textContent = history.length;
  document.getElementById('totalTokensSaved').textContent = stats.tokensSaved || 0;
}

async function exportHistory() {
  const stored = await chrome.storage.local.get(['promptHistory']);
  const history = stored.promptHistory || [];
  
  if (history.length === 0) {
    showToast('No history to export', 'error');
    return;
  }
  
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `promptforge-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast('History exported', 'success');
}

async function importHistory() {
  document.getElementById('importFile').click();
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    
    if (!Array.isArray(imported)) {
      throw new Error('Invalid format');
    }
    
    const stored = await chrome.storage.local.get(['promptHistory']);
    const existing = stored.promptHistory || [];
    const existingIds = new Set(existing.map(e => e.id));
    
    const newEntries = imported.filter(e => !existingIds.has(e.id));
    const merged = [...existing, ...newEntries];
    
    await chrome.storage.local.set({ promptHistory: merged });
    
    loadDataStats();
    showToast(`Imported ${newEntries.length} entries`, 'success');
  } catch (e) {
    showToast(`Import failed: ${e.message}`, 'error');
  }
  
  event.target.value = '';
}

async function clearHistory() {
  if (!confirm('Clear all history? This cannot be undone.')) return;
  
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
  
  loadDataStats();
  showToast('History cleared', 'success');
}

async function resetAll() {
  if (!confirm('Reset ALL settings and data? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure?')) return;
  
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  
  // Reload page
  location.reload();
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
  // Settings
  document.getElementById('enabled').addEventListener('change', saveSettings);
  document.getElementById('compressionPreset').addEventListener('change', saveSettings);
  document.getElementById('showNotifications').addEventListener('change', saveSettings);
  document.getElementById('autoSaveHistory').addEventListener('change', saveSettings);
  
  // Sites
  document.getElementById('addSiteBtn').addEventListener('click', addSite);
  
  // Rules
  document.getElementById('categoryFilter').addEventListener('change', renderRules);
  document.getElementById('resetRulesBtn').addEventListener('click', resetRules);
  document.getElementById('addRuleBtn').addEventListener('click', addRule);
  document.getElementById('testRulesBtn').addEventListener('click', testRules);
  
  // Data
  document.getElementById('exportHistoryBtn').addEventListener('click', exportHistory);
  document.getElementById('importHistoryBtn').addEventListener('click', importHistory);
  document.getElementById('importFile').addEventListener('change', handleImport);
  document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
  document.getElementById('resetAllBtn').addEventListener('click', resetAll);
}

// ============================================================================
// UTILITIES
// ============================================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Expose functions globally
window.toggleSite = toggleSite;
window.deleteSite = deleteSite;
window.toggleRule = toggleRule;
window.deleteRule = deleteRule;
