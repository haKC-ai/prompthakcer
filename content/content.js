/**
 * PrompthaKCer Content Script v2.0
 * Detects AI chatbot inputs and provides optimization
 */

class PrompthaKCer {
  constructor() {
    this.rulesEngine = null;
    this.siteDetector = null;
    this.historyManager = null;
    this.modal = null;
    this.currentInput = null;
    this.isEnabled = true;
    this.initialized = false;
    this.buttonOpacity = 1;
    this.buttonPosition = null; // { x, y } - saved position
  }

  async init() {
    if (this.initialized) return;
    
    // Initialize engines
    this.rulesEngine = new RulesEngine();
    this.siteDetector = new SiteDetector();
    
    await Promise.all([
      this.rulesEngine.init(),
      this.siteDetector.init()
    ]);
    
    // Check if on supported site
    if (!this.siteDetector.isOnSupportedSite()) {
      // console.log('PrompthaKCer: Not on a supported AI chat site');
      return;
    }
    
    // Load settings
    await this.loadSettings();
    
    if (!this.isEnabled) {
      console.log('PrompthaKCer: Disabled');
      return;
    }
    
    // Create modal
    this.createModal();
    
    // Attach to inputs
    this.attachInputListeners();
    
    // Watch for dynamic content
    this.observeDOMChanges();
    
    // Listen for keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    // Listen for messages from popup
    this.setupMessageListener();
    
    this.initialized = true;
    console.log(` PrompthaKCer active on ${this.siteDetector.getCurrentSite().name}`);
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get(['enabled', 'buttonOpacity', 'buttonPosition']);
      this.isEnabled = settings.enabled !== false;
      this.buttonOpacity = settings.buttonOpacity !== undefined ? settings.buttonOpacity : 1;
      this.buttonPosition = settings.buttonPosition || null;
    } catch (e) {
      this.isEnabled = true;
      this.buttonOpacity = 1;
      this.buttonPosition = null;
    }
  }

  attachInputListeners() {
    const site = this.siteDetector.getCurrentSite();
    if (!site) return;

    const attachToInput = (input) => {
      if (input.dataset.prompthakcerAttached) return;
      input.dataset.prompthakcerAttached = 'true';
      
      // Add the haKC button
      this.addHaKCButton(input);
      
      // Track focus
      input.addEventListener('focus', () => {
        this.currentInput = input;
      });
    };

    // Initial attachment - SiteDetector uses findAllInputs(), not getAllInputElements()
    const inputs = this.siteDetector.findAllInputs();
    inputs.forEach(attachToInput);

    // Store for reattachment
    this.attachToInput = attachToInput;
  }

  addHaKCButton(input) {
    // Find appropriate container
    const container = this.findButtonContainer(input);
    if (!container || container.querySelector('.prompthakcer-trigger')) return;

    const button = document.createElement('button');
    button.className = 'prompthakcer-trigger';
    button.innerHTML = `<pre class="pf-trigger-ascii">░█░█░█▀█░█░█░█▀▀
░█▀█░█▀█░█▀▄░█░░
░▀░▀░▀░▀░▀░▀░▀▀▀</pre>`;
    button.title = 'PrompthaKCer: haKC (Ctrl+Shift+O) - Drag to move';

    // Apply saved opacity
    button.style.opacity = this.buttonOpacity;

    // Apply saved position if exists
    if (this.buttonPosition) {
      button.style.position = 'fixed';
      button.style.right = 'auto';
      button.style.top = 'auto';
      button.style.left = `${this.buttonPosition.x}px`;
      button.style.top = `${this.buttonPosition.y}px`;
      button.style.transform = 'none';
      button.classList.add('prompthakcer-trigger-fixed');
    }

    // Dragging state
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, initialX, initialY;

    const onMouseDown = (e) => {
      if (e.button !== 0) return; // Only left click
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = button.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      button.style.cursor = 'grabbing';
      button.classList.add('prompthakcer-dragging');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      // Only consider it a drag if moved more than 5px
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;

        // Switch to fixed positioning for dragging
        button.style.position = 'fixed';
        button.style.right = 'auto';
        button.style.transform = 'none';
        button.classList.add('prompthakcer-trigger-fixed');

        const newX = initialX + deltaX;
        const newY = initialY + deltaY;

        // Clamp to viewport
        const clampedX = Math.max(0, Math.min(window.innerWidth - 40, newX));
        const clampedY = Math.max(0, Math.min(window.innerHeight - 40, newY));

        button.style.left = `${clampedX}px`;
        button.style.top = `${clampedY}px`;
      }
    };

    const onMouseUp = async (e) => {
      if (!isDragging) return;
      isDragging = false;
      button.style.cursor = '';
      button.classList.remove('prompthakcer-dragging');

      if (hasMoved) {
        // Save the new position
        const rect = button.getBoundingClientRect();
        this.buttonPosition = { x: rect.left, y: rect.top };
        try {
          await chrome.storage.sync.set({ buttonPosition: this.buttonPosition });
        } catch (e) {
          console.log('Could not save button position:', e);
        }
      }
    };

    const onClick = (e) => {
      // Only trigger if not dragged
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        hasMoved = false;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this.showOptimizationModal(input);
    };

    button.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    button.addEventListener('click', onClick);

    container.appendChild(button);

    // Make container relative if needed (only if not using fixed position)
    if (!this.buttonPosition) {
      const containerStyle = getComputedStyle(container);
      if (containerStyle.position === 'static') {
        container.style.position = 'relative';
      }
    }
  }

  findButtonContainer(input) {
    // Try to find the best container for the button
    let container = input.parentElement;
    
    // Walk up a few levels to find a good container
    for (let i = 0; i < 5; i++) {
      if (!container) break;
      
      // Check if this is a good container (has some size)
      const rect = container.getBoundingClientRect();
      if (rect.width > 100 && rect.height > 40) {
        return container;
      }
      
      container = container.parentElement;
    }
    
    return input.parentElement;
  }

  getInputText(input) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      return input.value;
    } else if (input.contentEditable === 'true') {
      return input.innerText || input.textContent;
    }
    return '';
  }

  setInputText(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (input.contentEditable === 'true') {
      input.innerText = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Move cursor to end
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  createModal() {
    if (document.getElementById('prompthakcer-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'prompthakcer-modal';
    modal.innerHTML = `
      <div class="pf-modal-backdrop"></div>
      <div class="pf-modal-container">
        <div class="pf-modal-header">
          <div class="pf-logo">
            <span class="pf-logo-icon">⬡</span>
            <span>PrompthaKCer</span>
          </div>
          
          <div class="pf-preset-selector">
            <button class="pf-preset-btn" data-preset="none" title="No compression">1</button>
            <button class="pf-preset-btn" data-preset="light" title="Light">2</button>
            <button class="pf-preset-btn active" data-preset="medium" title="Medium">3</button>
            <button class="pf-preset-btn" data-preset="heavy" title="Heavy">4</button>
            <button class="pf-preset-btn" data-preset="maximum" title="Maximum">5</button>
          </div>
          
          <button class="pf-close-btn">&times;</button>
        </div>
        
        <div class="pf-modal-body">
          <div class="pf-stats-bar">
            <div class="pf-stat">
              <span class="pf-stat-value" id="pf-tokens-saved">0</span>
              <span class="pf-stat-label">tokens saved</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-value" id="pf-percent-saved">0%</span>
              <span class="pf-stat-label">reduction</span>
            </div>
            <div class="pf-stat">
              <span class="pf-stat-value" id="pf-rules-applied">0</span>
              <span class="pf-stat-label">rules applied</span>
            </div>
          </div>
          
          <div class="pf-comparison">
            <div class="pf-panel pf-original">
              <div class="pf-panel-header">
                <span>Original</span>
                <span class="pf-char-count" id="pf-original-chars">0 chars</span>
              </div>
              <div class="pf-panel-content" id="pf-original-text"></div>
            </div>
            
            <div class="pf-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            
            <div class="pf-panel pf-optimized">
              <div class="pf-panel-header">
                <span>Optimized</span>
                <span class="pf-char-count" id="pf-optimized-chars">0 chars</span>
              </div>
              <div class="pf-panel-content" id="pf-optimized-text" contenteditable="true"></div>
            </div>
          </div>
          
          <details class="pf-rules-accordion">
            <summary>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              View Applied Optimizations
            </summary>
            <div class="pf-rules-list" id="pf-rules-list"></div>
          </details>
        </div>
        
        <div class="pf-modal-footer">
          <button class="pf-btn pf-btn-secondary" id="pf-cancel-btn">Cancel</button>
          <button class="pf-btn pf-btn-secondary" id="pf-copy-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy
          </button>
          <button class="pf-btn pf-btn-primary" id="pf-apply-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            Apply
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.modal = modal;
    
    // Event listeners
    modal.querySelector('.pf-modal-backdrop').addEventListener('click', () => this.hideModal());
    modal.querySelector('.pf-close-btn').addEventListener('click', () => this.hideModal());
    modal.querySelector('#pf-cancel-btn').addEventListener('click', () => this.hideModal());
    modal.querySelector('#pf-copy-btn').addEventListener('click', () => this.copyOptimized());
    modal.querySelector('#pf-apply-btn').addEventListener('click', () => this.applyOptimized());
    
    // Preset buttons
    modal.querySelectorAll('.pf-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setPreset(btn.dataset.preset);
      });
    });
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('pf-visible')) {
        this.hideModal();
      }
    });
    
    // Load current preset
    this.updatePresetButtons();
  }

  async setPreset(presetId) {
    // RulesEngine uses setCompressionLevel
    if (this.rulesEngine.setCompressionLevel) {
      await this.rulesEngine.setCompressionLevel(presetId);
    }
    this.updatePresetButtons();

    // Re-analyze if modal is open
    if (this.modal.classList.contains('pf-visible') && this.currentAnalysis) {
      const text = this.currentAnalysis.original;
      this.analyzeAndDisplay(text);
    }
  }

  updatePresetButtons() {
    const preset = this.rulesEngine.compressionLevel || 'medium';
    this.modal.querySelectorAll('.pf-preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === preset);
    });
  }

  showOptimizationModal(input) {
    const text = this.getInputText(input);
    
    if (text.length < 10) {
      this.showToast('Prompt too short to optimize');
      return;
    }
    
    this.currentInput = input;
    this.analyzeAndDisplay(text);
    this.modal.classList.add('pf-visible');
  }

  analyzeAndDisplay(text) {
    const analysis = this.rulesEngine.analyze(text, { showExplanations: true });
    this.currentAnalysis = analysis;
    
    if (!analysis.hasChanges) {
      this.showToast('Prompt is already optimized! [OK]');
      return;
    }
    
    // Update stats
    this.modal.querySelector('#pf-tokens-saved').textContent = analysis.stats.tokensSaved;
    this.modal.querySelector('#pf-percent-saved').textContent = `${analysis.stats.percentSaved}%`;
    this.modal.querySelector('#pf-rules-applied').textContent = analysis.appliedRules.length;
    this.modal.querySelector('#pf-original-chars').textContent = `${analysis.stats.originalLength} chars`;
    this.modal.querySelector('#pf-optimized-chars').textContent = `${analysis.stats.optimizedLength} chars`;
    this.modal.querySelector('#pf-original-text').textContent = analysis.original;
    this.modal.querySelector('#pf-optimized-text').textContent = analysis.optimized;
    
    // Render applied rules
    const rulesList = this.modal.querySelector('#pf-rules-list');
    rulesList.innerHTML = analysis.appliedRules.map(rule => `
      <div class="pf-rule-item">
        <span class="pf-rule-icon">+</span>
        <div class="pf-rule-info">
          <span class="pf-rule-name">${rule.name}</span>
          <span class="pf-rule-desc">${rule.explanation || rule.description}</span>
        </div>
        <span class="pf-rule-category">${rule.category}</span>
      </div>
    `).join('');
  }

  hideModal() {
    this.modal.classList.remove('pf-visible');
    this.currentAnalysis = null;
  }

  async copyOptimized() {
    const optimizedText = this.modal.querySelector('#pf-optimized-text').textContent;
    
    try {
      await navigator.clipboard.writeText(optimizedText);
      this.showToast('Copied to clipboard! ');
    } catch (e) {
      this.showToast('Failed to copy');
    }
  }

  async applyOptimized() {
    if (!this.currentInput) return;
    
    const optimizedText = this.modal.querySelector('#pf-optimized-text').textContent;
    this.setInputText(this.currentInput, optimizedText);
    
    // Save to history via background script
    try {
      const site = this.siteDetector.getCurrentSite();
      await chrome.runtime.sendMessage({
        action: 'saveToHistory',
        data: {
          site: site?.name || 'Unknown',
          siteIcon: site?.icon || '[WEB]',
          original: this.currentAnalysis.original,
          optimized: optimizedText,
          stats: this.currentAnalysis.stats,
          appliedRules: this.currentAnalysis.appliedRules.map(r => ({ id: r.id, name: r.name })),
          applied: true
        }
      });
    } catch (e) {
      // Extension was reloaded - prompt user to refresh
      if (e.message?.includes('Extension context invalidated')) {
        this.showToast('Extension updated - please refresh the page');
      } else {
        console.log('Could not save to history:', e);
      }
    }
    
    this.hideModal();
    this.showToast('Prompt optimized! ');
    this.currentInput.focus();
  }

  showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.pf-toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'pf-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
      toast.classList.add('pf-toast-visible');
    });
    
    setTimeout(() => {
      toast.classList.remove('pf-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + O
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        
        const input = this.currentInput || this.siteDetector.findInput();
        if (input) {
          this.showOptimizationModal(input);
        }
      }
    });
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'applyOptimized') {
        const input = this.currentInput || this.siteDetector.findInput();
        if (input) {
          this.setInputText(input, message.text);
          this.showToast('Applied from popup! ');
        }
        sendResponse({ success: true });
      }
      
      if (message.action === 'getInputText') {
        const input = this.currentInput || this.siteDetector.findInput();
        const text = input ? this.getInputText(input) : '';
        sendResponse({ text });
      }
      
      if (message.action === 'optimizeText') {
        // From context menu
        const input = this.currentInput || this.siteDetector.findInput();
        if (input) {
          this.setInputText(input, message.text);
          this.showOptimizationModal(input);
        }
      }
      
      return true;
    });
  }

  observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          setTimeout(() => {
            const inputs = this.siteDetector.findAllInputs();
            inputs.forEach(input => this.attachToInput?.(input));
          }, 100);
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PrompthaKCer().init());
} else {
  new PrompthaKCer().init();
}
