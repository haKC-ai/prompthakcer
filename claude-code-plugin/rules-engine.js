#!/usr/bin/env node
/**
 * PrompthaKCer Rules Engine for Claude Code
 * Adapted from the Chrome extension's rules engine for Node.js
 * Provides DLP scanning, prompt optimization, and token estimation
 */

const fs = require('fs');
const path = require('path');

// Load rules from the project's rules.json
const RULES_PATH = path.join(__dirname, '..', 'rules.json');
const STATS_PATH = path.join(__dirname, 'stats.json');

// Compression presets
const COMPRESSION_PRESETS = {
  none: { name: 'None', enabledCategories: ['formatting'] },
  light: { name: 'Light', enabledCategories: ['formatting', 'fluff', 'security'] },
  medium: { name: 'Medium', enabledCategories: ['formatting', 'fluff', 'redundancy', 'security'] },
  heavy: { name: 'Heavy', enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'security'] },
  maximum: { name: 'Maximum', enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'compression', 'security'] }
};

// Safe transforms (no eval)
const SAFE_TRANSFORMS = {
  'capitalize-first': (text) => text.charAt(0).toUpperCase() + text.slice(1),
  'lowercase': (text) => text.toLowerCase(),
  'uppercase': (text) => text.toUpperCase(),
  'trim': (text) => text.trim(),
  'collapse-whitespace': (text) => text.replace(/\s+/g, ' '),
  'sentence-case': (text) => text.toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, c => c.toUpperCase())
};

class RulesEngine {
  constructor(compressionLevel = 'medium') {
    this.rules = [];
    this.compressionLevel = compressionLevel;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.loadRules();
    this.initialized = true;
  }

  loadRules() {
    try {
      const raw = fs.readFileSync(RULES_PATH, 'utf8');
      const data = JSON.parse(raw);

      if (data.presets) {
        Object.assign(COMPRESSION_PRESETS, data.presets);
      }

      this.rules = (data.rules || []).map(rule => this.parseRule(rule));
      this.rules.sort((a, b) => a.priority - b.priority);
      this.applyPreset(this.compressionLevel);
    } catch (e) {
      // Fallback rules if rules.json can't be loaded
      this.rules = [
        {
          id: 'cleanup-whitespace', name: 'Clean Whitespace', enabled: true,
          category: 'formatting', priority: 90,
          patterns: [{ find: /\s{2,}/g, replace: ' ' }, { find: /^\s+/g, replace: '' }, { find: /\s+$/g, replace: '' }]
        }
      ];
    }
  }

  parseRule(rule) {
    const parsed = { ...rule };
    if (rule.patterns) {
      parsed.patterns = rule.patterns.map(p => ({
        find: new RegExp(p.find, p.flags || 'gi'),
        replace: p.replace || ''
      }));
    }
    if (rule.transform && SAFE_TRANSFORMS[rule.transform]) {
      parsed.transform = SAFE_TRANSFORMS[rule.transform];
    }
    return parsed;
  }

  applyPreset(level) {
    const preset = COMPRESSION_PRESETS[level];
    if (!preset || !preset.enabledCategories) return;
    for (const rule of this.rules) {
      rule.enabled = preset.enabledCategories.includes(rule.category);
    }
  }

  /**
   * Run DLP-only scan - checks for sensitive data without modifying text
   * Returns list of findings
   */
  scanDLP(text) {
    const findings = [];
    const dlpRules = this.rules.filter(r => r.category === 'security');

    for (const rule of dlpRules) {
      if (!rule.patterns) continue;
      for (const pattern of rule.patterns) {
        // Reset regex state
        pattern.find.lastIndex = 0;
        const matches = text.match(pattern.find);
        if (matches) {
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            description: rule.description,
            explanation: rule.explanation,
            matchCount: matches.length,
            matches: matches.map(m => m.substring(0, 20) + (m.length > 20 ? '...' : ''))
          });
        }
      }
    }
    return findings;
  }

  /**
   * Full prompt optimization - applies all enabled rules
   */
  optimize(text, options = {}) {
    const originalText = text;
    let currentText = text;
    const appliedRules = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.category === 'compression' && !options.enableCompression) continue;

      const beforeText = currentText;

      if (rule.transform) {
        currentText = rule.transform(currentText);
      } else if (rule.patterns) {
        for (const pattern of rule.patterns) {
          // Reset regex lastIndex for global patterns
          pattern.find.lastIndex = 0;
          currentText = currentText.replace(pattern.find, pattern.replace);
        }
      }

      if (currentText !== beforeText) {
        appliedRules.push({
          id: rule.id,
          name: rule.name,
          category: rule.category,
          description: rule.description
        });
      }
    }

    const originalTokens = this.estimateTokens(originalText);
    const optimizedTokens = this.estimateTokens(currentText.trim());

    return {
      original: originalText,
      optimized: currentText.trim(),
      appliedRules,
      stats: {
        originalLength: originalText.length,
        optimizedLength: currentText.trim().length,
        charsSaved: originalText.length - currentText.trim().length,
        originalTokens,
        optimizedTokens,
        tokensSaved: originalTokens - optimizedTokens,
        percentSaved: originalTokens > 0
          ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100)
          : 0
      },
      hasChanges: currentText.trim() !== originalText.trim()
    };
  }

  estimateTokens(text) {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const punct = (text.match(/[.,!?;:'"()\[\]{}]/g) || []).length;
    return Math.ceil((words.length * 1.3) + (punct * 0.5));
  }

  /**
   * Get only security rules for DLP checking
   */
  getSecurityRules() {
    return this.rules.filter(r => r.category === 'security');
  }

  /**
   * Get all rules by category
   */
  getRulesByCategory() {
    const cats = {};
    for (const rule of this.rules) {
      if (!cats[rule.category]) cats[rule.category] = [];
      cats[rule.category].push({ id: rule.id, name: rule.name, enabled: rule.enabled });
    }
    return cats;
  }
}

// Stats persistence
class StatsTracker {
  constructor() {
    this.statsPath = STATS_PATH;
    this.stats = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.statsPath, 'utf8'));
    } catch {
      return {
        totalScans: 0,
        totalOptimizations: 0,
        totalTokensSaved: 0,
        totalCharsSaved: 0,
        dlpBlocks: 0,
        findingsByType: {},
        history: []
      };
    }
  }

  save() {
    fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2));
  }

  recordScan(findings) {
    this.stats.totalScans++;
    if (findings.length > 0) {
      this.stats.dlpBlocks++;
      for (const f of findings) {
        this.stats.findingsByType[f.ruleId] = (this.stats.findingsByType[f.ruleId] || 0) + f.matchCount;
      }
    }
    this.save();
  }

  recordOptimization(result) {
    this.stats.totalOptimizations++;
    this.stats.totalTokensSaved += result.stats.tokensSaved;
    this.stats.totalCharsSaved += result.stats.charsSaved;

    // Keep last 100 history entries
    this.stats.history.push({
      timestamp: new Date().toISOString(),
      tokensSaved: result.stats.tokensSaved,
      percentSaved: result.stats.percentSaved,
      rulesApplied: result.appliedRules.length
    });
    if (this.stats.history.length > 100) {
      this.stats.history = this.stats.history.slice(-100);
    }
    this.save();
  }

  getSummary() {
    return {
      totalScans: this.stats.totalScans,
      totalOptimizations: this.stats.totalOptimizations,
      totalTokensSaved: this.stats.totalTokensSaved,
      totalCharsSaved: this.stats.totalCharsSaved,
      dlpBlocks: this.stats.dlpBlocks,
      topFindings: Object.entries(this.stats.findingsByType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      recentHistory: (this.stats.history || []).slice(-10)
    };
  }

  reset() {
    this.stats = {
      totalScans: 0,
      totalOptimizations: 0,
      totalTokensSaved: 0,
      totalCharsSaved: 0,
      dlpBlocks: 0,
      findingsByType: {},
      history: []
    };
    this.save();
  }
}

module.exports = { RulesEngine, StatsTracker, COMPRESSION_PRESETS };
