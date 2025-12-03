/**
 * PrompthaKCer Site Detector
 * Configurable AI chatbot site detection
 */

const DEFAULT_SITES = [
  { id: 'chatgpt', name: 'ChatGPT', icon: 'GPT', enabled: true, patterns: ['chat.openai.com', 'chatgpt.com'],
    inputSelectors: ['#prompt-textarea', 'textarea[data-id]', 'div.ProseMirror[contenteditable="true"]', 'div[contenteditable="true"]'] },
  { id: 'claude', name: 'Claude', icon: 'C', enabled: true, patterns: ['claude.ai'],
    inputSelectors: ['div.ProseMirror', 'div[contenteditable="true"]', 'fieldset div[contenteditable]'] },
  { id: 'gemini', name: 'Gemini', icon: 'G', enabled: true, patterns: ['gemini.google.com'],
    inputSelectors: ['div[contenteditable="true"]', 'rich-textarea div[contenteditable]', '.ql-editor'] },
  { id: 'grok', name: 'Grok', icon: 'X', enabled: true, patterns: ['grok.x.ai'],
    inputSelectors: ['textarea', 'div[contenteditable="true"]'] },
  { id: 'copilot', name: 'Microsoft Copilot', icon: 'MS', enabled: true, patterns: ['copilot.microsoft.com'],
    inputSelectors: ['textarea', '#searchbox', 'cib-serp'] },
  { id: 'perplexity', name: 'Perplexity', icon: 'P', enabled: true, patterns: ['perplexity.ai'],
    inputSelectors: ['textarea', 'div[contenteditable="true"]'] },
  { id: 'poe', name: 'Poe', icon: 'POE', enabled: true, patterns: ['poe.com'],
    inputSelectors: ['textarea', 'div[contenteditable="true"]'] },
  { id: 'deepseek', name: 'DeepSeek', icon: 'DS', enabled: true, patterns: ['chat.deepseek.com'],
    inputSelectors: ['textarea', 'div[contenteditable="true"]'] },
  { id: 'mistral', name: 'Mistral', icon: 'M', enabled: true, patterns: ['chat.mistral.ai'],
    inputSelectors: ['textarea', 'div[contenteditable="true"]'] }
];

class SiteDetector {
  constructor() { this.sites = []; this.customSites = []; this.currentSite = null; this.initialized = false; }

  async init() {
    if (this.initialized) return;
    await this.loadSites();
    this.detectCurrentSite();
    this.initialized = true;
  }

  async loadSites() {
    try {
      const stored = await chrome.storage.sync.get(['customSites', 'siteSettings']);
      this.customSites = stored.customSites || [];
      this.sites = DEFAULT_SITES.map(site => {
        const settings = stored.siteSettings?.[site.id];
        return settings ? { ...site, ...settings } : { ...site };
      });
      this.sites = [...this.sites, ...this.customSites];
    } catch (e) { this.sites = [...DEFAULT_SITES]; }
  }

  async saveSites() {
    const siteSettings = {};
    for (const site of this.sites) {
      if (!site.isCustom) siteSettings[site.id] = { enabled: site.enabled, inputSelectors: site.inputSelectors };
    }
    await chrome.storage.sync.set({ siteSettings, customSites: this.customSites });
  }

  detectCurrentSite() {
    const url = window.location.href;
    for (const site of this.sites) {
      if (!site.enabled) continue;
      for (const pattern of site.patterns) {
        if (url.includes(pattern)) { this.currentSite = site; return site; }
      }
    }
    this.currentSite = null;
    return null;
  }

  getCurrentSite() { return this.currentSite; }
  getInputSelectors() { return this.currentSite?.inputSelectors || []; }
  isOnSupportedSite() { return this.currentSite !== null; }
  getSites() { return this.sites; }
  getEnabledSites() { return this.sites.filter(s => s.enabled); }

  toggleSite(siteId, enabled) {
    const site = this.sites.find(s => s.id === siteId);
    if (site) { site.enabled = enabled; this.saveSites(); }
  }

  addCustomSite(data) {
    const site = { ...data, id: `custom-${Date.now()}`, isCustom: true, enabled: true };
    if (typeof site.patterns === 'string') site.patterns = site.patterns.split(',').map(p => p.trim());
    if (typeof site.inputSelectors === 'string') site.inputSelectors = site.inputSelectors.split(',').map(s => s.trim());
    this.customSites.push(site);
    this.sites.push(site);
    this.saveSites();
    return site;
  }

  updateSite(siteId, updates) {
    const site = this.sites.find(s => s.id === siteId);
    if (site) {
      Object.assign(site, updates);
      if (site.isCustom) {
        const idx = this.customSites.findIndex(s => s.id === siteId);
        if (idx !== -1) this.customSites[idx] = site;
      }
      this.saveSites();
    }
  }

  removeCustomSite(siteId) {
    this.customSites = this.customSites.filter(s => s.id !== siteId);
    this.sites = this.sites.filter(s => s.id !== siteId);
    this.saveSites();
  }

  findInput() {
    if (!this.currentSite) return null;
    for (const sel of this.currentSite.inputSelectors) {
      try { const el = document.querySelector(sel); if (el) return el; } catch (e) {}
    }
    return null;
  }

  findAllInputs() {
    if (!this.currentSite) return [];
    const inputs = [];
    for (const sel of this.currentSite.inputSelectors) {
      try { inputs.push(...document.querySelectorAll(sel)); } catch (e) {}
    }
    return [...new Set(inputs)];
  }

  async resetToDefaults() {
    this.customSites = [];
    this.sites = DEFAULT_SITES.map(s => ({ ...s }));
    await chrome.storage.sync.remove(['customSites', 'siteSettings']);
    this.detectCurrentSite();
  }
}

if (typeof window !== 'undefined') {
  window.SiteDetector = SiteDetector;
  window.DEFAULT_SITES = DEFAULT_SITES;
}
