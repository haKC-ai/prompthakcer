/**
 * PrompthaKCer History Manager
 * Logs prompt optimizations for learning and review
 */

const MAX_HISTORY_ITEMS = 500;

class HistoryManager {
  constructor() { this.history = []; this.initialized = false; }

  async init() {
    if (this.initialized) return;
    await this.loadHistory();
    this.initialized = true;
  }

  async loadHistory() {
    try {
      const stored = await chrome.storage.local.get(['promptHistory']);
      this.history = stored.promptHistory || [];
    } catch (e) { this.history = []; }
  }

  async saveHistory() {
    try {
      if (this.history.length > MAX_HISTORY_ITEMS) this.history = this.history.slice(-MAX_HISTORY_ITEMS);
      await chrome.storage.local.set({ promptHistory: this.history });
    } catch (e) {
      console.log('Could not save history:', e.message);
    }
  }

  async addEntry(entry) {
    try {
      const historyEntry = {
        id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        site: entry.site || 'standalone',
        siteIcon: entry.siteIcon || '[OK]',
        original: entry.original,
        optimized: entry.optimized,
        stats: entry.stats,
        appliedRules: entry.appliedRules?.map(r => ({ id: r.id, name: r.name, category: r.category })) || [],
        compressionEnabled: entry.compressionEnabled || false
      };
      this.history.push(historyEntry);
      await this.saveHistory();
      return historyEntry;
    } catch (e) {
      console.error('Could not add history entry:', e);
      return null;
    }
  }

  getHistory(options = {}) {
    let results = [...this.history];
    if (options.site) results = results.filter(e => e.site === options.site);
    if (options.startDate) results = results.filter(e => new Date(e.timestamp) >= new Date(options.startDate));
    if (options.endDate) results = results.filter(e => new Date(e.timestamp) <= new Date(options.endDate));
    if (options.search) {
      const q = options.search.toLowerCase();
      results = results.filter(e => e.original.toLowerCase().includes(q) || e.optimized.toLowerCase().includes(q));
    }
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    if (options.limit) results = results.slice(0, options.limit);
    return results;
  }

  getEntry(id) { return this.history.find(e => e.id === id); }

  async deleteEntry(id) {
    this.history = this.history.filter(e => e.id !== id);
    await this.saveHistory();
  }

  async clearHistory() {
    try {
      this.history = [];
      await chrome.storage.local.remove(['promptHistory']);
    } catch (e) {
      console.log('Could not clear history:', e.message);
    }
  }

  getStats() {
    const total = this.history.length;
    const totalTokensSaved = this.history.reduce((sum, e) => sum + (e.stats?.tokensSaved || 0), 0);
    const avgPercent = total > 0 ? this.history.reduce((sum, e) => sum + (e.stats?.percentSaved || 0), 0) / total : 0;
    const bySite = {};
    for (const e of this.history) {
      if (!bySite[e.site]) bySite[e.site] = { count: 0, tokensSaved: 0 };
      bySite[e.site].count++;
      bySite[e.site].tokensSaved += e.stats?.tokensSaved || 0;
    }
    const ruleUsage = {};
    for (const e of this.history) {
      for (const r of e.appliedRules || []) {
        if (!ruleUsage[r.name]) ruleUsage[r.name] = 0;
        ruleUsage[r.name]++;
      }
    }
    return {
      totalOptimizations: total,
      promptsOptimized: total, // alias for compatibility
      totalTokensSaved,
      tokensSaved: totalTokensSaved, // alias for compatibility
      averagePercentSaved: Math.round(avgPercent),
      bySite,
      topRules: Object.entries(ruleUsage).sort((a, b) => b[1] - a[1]).slice(0, 10)
    };
  }

  getInsights() {
    const stats = this.getStats();
    const topSites = {};
    for (const [site, data] of Object.entries(stats.bySite)) {
      topSites[site] = data.count;
    }

    // Calculate recent trend (compare last 7 days to previous 7 days)
    const now = new Date();
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const thisWeek = this.history.filter(e => new Date(e.timestamp) >= oneWeekAgo).length;
    const lastWeek = this.history.filter(e => {
      const d = new Date(e.timestamp);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    }).length;

    let recentTrend = null;
    if (lastWeek > 0) {
      recentTrend = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    }

    return {
      averageTokenSavings: stats.totalOptimizations > 0
        ? Math.round(stats.totalTokensSaved / stats.totalOptimizations)
        : 0,
      topSites,
      recentTrend
    };
  }

  async exportHistory() {
    return { version: '1.0', exportDate: new Date().toISOString(), entries: this.history };
  }

  async importHistory(data) {
    if (data.version !== '1.0') throw new Error('Incompatible version');
    const existingIds = new Set(this.history.map(e => e.id));
    const newEntries = data.entries.filter(e => !existingIds.has(e.id));
    this.history = [...this.history, ...newEntries];
    await this.saveHistory();
    return { imported: newEntries.length, skipped: data.entries.length - newEntries.length };
  }
}

if (typeof window !== 'undefined') window.HistoryManager = HistoryManager;
