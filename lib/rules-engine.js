/**
 * PrompthaKCer Rules Engine v2.1
 * Advanced configurable rule-based prompt optimization system
 * Rules and presets are fetched from GitHub for easy updates without republishing
 */

// Remote rules URL - update this repo to push rule changes to all users
const REMOTE_RULES_URL = 'https://raw.githubusercontent.com/haKC-ai/prompthakcer/refs/heads/main/rules.json';
const RULES_CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

// Default presets - will be overridden by remote rules.json if available
let COMPRESSION_PRESETS = {
  none: { name: 'None', description: 'Formatting only', icon: '[1]', enabledCategories: ['formatting'] },
  light: { name: 'Light', description: 'Light touch', icon: '[2]', enabledCategories: ['formatting', 'fluff', 'security'] },
  medium: { name: 'Medium', description: 'Recommended', icon: '[3]', enabledCategories: ['formatting', 'fluff', 'redundancy', 'security'] },
  heavy: { name: 'Heavy', description: 'Aggressive', icon: '[4]', enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'security'] },
  maximum: { name: 'Maximum', description: 'Extreme compression', icon: '[5]', enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'compression', 'security'] },
  custom: { name: 'Custom', description: 'Your configuration', icon: '[C]', enabledCategories: null }
};

let RULE_CATEGORIES = {
  fluff: { name: 'Politeness & Fluff', icon: 'FL', description: 'Removes unnecessary pleasantries' },
  redundancy: { name: 'Redundancy', icon: 'RD', description: 'Eliminates repetitive phrases' },
  verbosity: { name: 'Verbosity', icon: 'VB', description: 'Condenses wordy phrases' },
  qualifiers: { name: 'Qualifiers', icon: 'QL', description: 'Removes hedging language' },
  structure: { name: 'Structure', icon: 'ST', description: 'Optimizes prompt structure' },
  formatting: { name: 'Formatting', icon: 'FT', description: 'Cleans up whitespace/punctuation' },
  compression: { name: 'Deep Compression', icon: 'DC', description: 'Aggressive token reduction' },
  security: { name: 'Security (DLP)', icon: 'SEC', description: 'Redacts sensitive data' },
  custom: { name: 'Custom Rules', icon: 'CU', description: 'Your personal rules' }
};

// Minimal fallback rules - only used if remote fetch fails completely
const FALLBACK_RULES = [
  { id: 'cleanup-whitespace', name: 'Clean Whitespace', enabled: true, category: 'formatting', priority: 90,
    patterns: [{ find: /\s{2,}/g, replace: ' ' }, { find: /^\s+/g, replace: '' }, { find: /\s+$/g, replace: '' }] },
  { id: 'fix-punctuation', name: 'Fix Punctuation', enabled: true, category: 'formatting', priority: 91,
    patterns: [{ find: /\s+([.,!?;:])/g, replace: '$1' }, { find: /([.,!?;:])([A-Za-z])/g, replace: '$1 $2' }] }
];

class RulesEngine {
  constructor() {
    this.rules = [];
    this.customRules = [];
    this.remoteRules = [];
    this.compressionLevel = 'medium';
    this.initialized = false;

    // Pre-defined safe transforms (no eval needed)
    this.safeTransforms = {
      'capitalize-first': (text) => text.charAt(0).toUpperCase() + text.slice(1),
      'lowercase': (text) => text.toLowerCase(),
      'uppercase': (text) => text.toUpperCase(),
      'trim': (text) => text.trim(),
      'collapse-whitespace': (text) => text.replace(/\s+/g, ' '),
      'remove-trailing-punctuation': (text) => text.replace(/[.,!?;:]+$/, ''),
      'sentence-case': (text) => text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
    };
  }

  // Get a safe transform function by name
  getSafeTransform(name) {
    return this.safeTransforms[name] || null;
  }

  async init() {
    if (this.initialized) return;
    await this.loadRules();
    this.initialized = true;
  }

  // Fetch rules from GitHub repo (cached for 1 hour)
  async fetchRemoteRules(forceRefresh = false) {
    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = await chrome.storage.local.get(['remoteRulesCache', 'remoteRulesCacheTime']);
        const now = Date.now();

        if (cached.remoteRulesCache && cached.remoteRulesCacheTime &&
            (now - cached.remoteRulesCacheTime) < RULES_CACHE_DURATION) {
          console.log('Using cached remote rules');
          return cached.remoteRulesCache;
        }
      }

      // Fetch fresh rules from GitHub
      console.log('Fetching remote rules from GitHub...');
      const response = await fetch(REMOTE_RULES_URL, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const remoteData = await response.json();

      // Cache the rules
      await chrome.storage.local.set({
        remoteRulesCache: remoteData,
        remoteRulesCacheTime: Date.now()
      });

      // Update presets and categories from remote if available
      if (remoteData.presets) {
        COMPRESSION_PRESETS = { ...COMPRESSION_PRESETS, ...remoteData.presets };
      }
      if (remoteData.categories) {
        RULE_CATEGORIES = { ...RULE_CATEGORIES, ...remoteData.categories };
      }

      console.log(`Fetched ${remoteData.rules?.length || 0} remote rules (v${remoteData.version || 'unknown'})`);
      return remoteData;
    } catch (e) {
      console.log('Could not fetch remote rules, using fallback:', e.message);
      return null;
    }
  }

  // Get last update info
  async getLastUpdateInfo() {
    try {
      const cached = await chrome.storage.local.get(['remoteRulesCache', 'remoteRulesCacheTime']);
      if (cached.remoteRulesCache && cached.remoteRulesCacheTime) {
        return {
          version: cached.remoteRulesCache.version || 'unknown',
          updated: cached.remoteRulesCache.updated || null,
          cachedAt: cached.remoteRulesCacheTime,
          rulesCount: cached.remoteRulesCache.rules?.length || 0
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Convert remote rule JSON to executable rule with RegExp patterns
  parseRemoteRule(rule) {
    const parsed = { ...rule };

    // Convert pattern strings to RegExp objects
    if (rule.patterns) {
      parsed.patterns = rule.patterns.map(p => ({
        find: new RegExp(p.find, p.flags || 'gi'),
        replace: p.replace || ''
      }));
    }

    // Handle transform functions using safe pre-defined transforms (no eval)
    if (rule.transform) {
      parsed.transform = this.getSafeTransform(rule.transform);
    }

    return parsed;
  }

  async loadRules() {
    try {
      const stored = await chrome.storage.sync.get(['customRules', 'ruleSettings', 'compressionLevel']);
      this.customRules = stored.customRules || [];
      this.compressionLevel = stored.compressionLevel || 'medium';

      // Try to fetch remote rules first
      const remoteData = await this.fetchRemoteRules();

      // Use remote rules if available, otherwise fall back to minimal fallback
      let baseRules;
      if (remoteData && remoteData.rules && remoteData.rules.length > 0) {
        baseRules = remoteData.rules.map(r => this.parseRemoteRule(r));
        this.remoteRules = baseRules;
        console.log(`Loaded ${baseRules.length} rules from remote (v${remoteData.version || 'unknown'})`);
      } else {
        baseRules = FALLBACK_RULES;
        console.log('Using minimal fallback rules - remote fetch failed');
      }

      // Apply user's rule settings (enabled/disabled states)
      this.rules = baseRules.map(rule => {
        const settings = stored.ruleSettings?.[rule.id];
        return settings ? { ...rule, ...settings } : { ...rule };
      });

      // Restore custom rule patterns (user's custom rules)
      this.customRules = this.customRules.map(rule => {
        if (rule.patternString) {
          rule.patterns = [{ find: new RegExp(rule.patternString, rule.patternFlags || 'gi'), replace: rule.replaceString || '' }];
        }
        return rule;
      });

      // Merge: remote/default rules + user's custom rules
      this.rules = [...this.rules, ...this.customRules];
      this.rules.sort((a, b) => a.priority - b.priority);

      if (this.compressionLevel !== 'custom') {
        this.applyCompressionPreset(this.compressionLevel);
      }
    } catch (e) {
      console.log('Error loading rules:', e);
      this.rules = FALLBACK_RULES.map(r => ({ ...r }));
    }
  }

  // Force refresh rules from remote (ignore cache)
  async refreshRemoteRules() {
    try {
      await chrome.storage.local.remove(['remoteRulesCache', 'remoteRulesCacheTime']);
      const remoteData = await this.fetchRemoteRules(true);
      if (remoteData && remoteData.rules) {
        await this.loadRules();
        return {
          success: true,
          version: remoteData.version,
          rulesCount: remoteData.rules.length,
          updated: remoteData.updated
        };
      }
      return { success: false, error: 'No rules in response' };
    } catch (e) {
      console.log('Could not refresh rules:', e);
      return { success: false, error: e.message };
    }
  }

  applyCompressionPreset(level) {
    const preset = COMPRESSION_PRESETS[level];
    if (!preset || !preset.enabledCategories) return;
    for (const rule of this.rules) {
      if (!rule.isCustom) {
        rule.enabled = preset.enabledCategories.includes(rule.category);
      }
    }
  }

  async setCompressionLevel(level) {
    this.compressionLevel = level;
    if (level !== 'custom') {
      this.applyCompressionPreset(level);
    }
    // Save to storage (may fail if extension context is invalidated)
    try {
      await chrome.storage.sync.set({ compressionLevel: level });
      if (level !== 'custom') {
        await this.saveRules();
      }
    } catch (e) {
      console.log('Could not save compression level (extension may have been reloaded):', e.message);
    }
  }

  async saveRules() {
    try {
      const ruleSettings = {};
      for (const rule of this.rules) {
        if (!rule.isCustom) ruleSettings[rule.id] = { enabled: rule.enabled };
      }
      const serializableCustomRules = this.customRules.map(r => ({ ...r, patterns: undefined }));
      await chrome.storage.sync.set({ ruleSettings, customRules: serializableCustomRules, compressionLevel: this.compressionLevel });
    } catch (e) {
      console.log('Could not save rules (extension may have been reloaded):', e.message);
    }
  }

  analyze(text, options = {}) {
    const originalText = text;
    let currentText = text;
    const suggestions = [];
    const appliedRules = [];
    const enableCompression = options.enableCompression === true;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.category === 'compression' && !enableCompression) continue;
      const beforeText = currentText;
      if (rule.transform) {
        currentText = rule.transform(currentText);
      } else if (rule.patterns) {
        for (const pattern of rule.patterns) {
          currentText = currentText.replace(pattern.find, pattern.replace);
        }
      }
      if (currentText !== beforeText) {
        appliedRules.push(rule);
        suggestions.push({ ruleId: rule.id, ruleName: rule.name, description: rule.description, explanation: rule.explanation, example: rule.example, category: rule.category });
      }
    }

    const originalTokens = this.estimateTokens(originalText);
    const optimizedTokens = this.estimateTokens(currentText);
    return {
      original: originalText,
      optimized: currentText.trim(),
      suggestions,
      appliedRules,
      stats: {
        originalLength: originalText.length,
        optimizedLength: currentText.trim().length,
        charsSaved: originalText.length - currentText.trim().length,
        originalTokens,
        optimizedTokens,
        tokensSaved: originalTokens - optimizedTokens,
        percentSaved: originalTokens > 0 ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100) : 0
      },
      hasChanges: currentText.trim() !== originalText.trim()
    };
  }

  estimateTokens(text) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const punct = (text.match(/[.,!?;:'"()\[\]{}]/g) || []).length;
    return Math.ceil((words.length * 1.3) + (punct * 0.5));
  }

  toggleRule(ruleId, enabled) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.compressionLevel = 'custom';
      this.saveRules();
    }
  }

  addCustomRule(data) {
    const rule = { ...data, id: `custom-${Date.now()}`, isCustom: true, category: 'custom', priority: 80, enabled: true };
    if (data.patternString) {
      try {
        rule.patterns = [{ find: new RegExp(data.patternString, data.patternFlags || 'gi'), replace: data.replaceString || '' }];
      } catch (e) {
        throw new Error(`Invalid regex: ${e.message}`);
      }
    }
    this.customRules.push(rule);
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
    this.saveRules();
    return rule;
  }

  removeCustomRule(ruleId) {
    this.customRules = this.customRules.filter(r => r.id !== ruleId);
    this.rules = this.rules.filter(r => r.id !== ruleId);
    this.saveRules();
  }

  getRules() { return this.rules; }
  getRulesByCategory() {
    const cats = {};
    for (const rule of this.rules) {
      if (!cats[rule.category]) cats[rule.category] = { ...RULE_CATEGORIES[rule.category], rules: [] };
      cats[rule.category].rules.push(rule);
    }
    return cats;
  }
  getCategories() { return RULE_CATEGORIES; }
  getCompressionPresets() { return COMPRESSION_PRESETS; }
  getCurrentCompressionLevel() { return this.compressionLevel; }

  async resetToDefaults() {
    this.customRules = [];
    this.compressionLevel = 'medium';
    // Clear cache and reload from remote
    try {
      await chrome.storage.sync.remove(['customRules', 'ruleSettings', 'compressionLevel']);
      await chrome.storage.local.remove(['remoteRulesCache', 'remoteRulesCacheTime']);
      await this.loadRules();
    } catch (e) {
      console.log('Could not reset rules (extension may have been reloaded):', e.message);
      this.rules = FALLBACK_RULES.map(r => ({ ...r }));
    }
  }

  async exportConfig() {
    return { version: '1.0', compressionLevel: this.compressionLevel, customRules: this.customRules.map(r => ({ ...r, patterns: undefined })),
      ruleSettings: this.rules.reduce((acc, r) => { if (!r.isCustom) acc[r.id] = { enabled: r.enabled }; return acc; }, {}) };
  }

  async importConfig(config) {
    if (config.version !== '1.0') throw new Error('Incompatible version');
    this.compressionLevel = config.compressionLevel || 'medium';
    this.customRules = (config.customRules || []).map(r => {
      if (r.patternString) r.patterns = [{ find: new RegExp(r.patternString, r.patternFlags || 'gi'), replace: r.replaceString || '' }];
      return r;
    });
    // Reload rules from remote, then apply imported settings
    await this.loadRules();
    // Apply imported rule settings on top
    if (config.ruleSettings) {
      this.rules = this.rules.map(r => ({ ...r, ...(config.ruleSettings[r.id] || {}) }));
    }
    this.rules = [...this.rules, ...this.customRules].sort((a, b) => a.priority - b.priority);
    await this.saveRules();
  }

  // Check if extension context is still valid
  isContextValid() {
    try {
      return chrome.runtime?.id !== undefined;
    } catch (e) {
      return false;
    }
  }
}

if (typeof window !== 'undefined') {
  window.RulesEngine = RulesEngine;
  window.COMPRESSION_PRESETS = COMPRESSION_PRESETS;
  window.RULE_CATEGORIES = RULE_CATEGORIES;
  window.FALLBACK_RULES = FALLBACK_RULES;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RulesEngine, COMPRESSION_PRESETS, RULE_CATEGORIES, FALLBACK_RULES };
}
