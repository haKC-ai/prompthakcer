/**
 * PrompthaKCer Rules Engine v2.0
 * Advanced configurable rule-based prompt optimization system
 * Rules are fetched from GitHub for easy updates without republishing
 */

// Remote rules URL - update this repo to push rule changes to all users
const REMOTE_RULES_URL = 'https://raw.githubusercontent.com/haKC-ai/prompthakcer/main/rules.json';
const RULES_CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

const COMPRESSION_PRESETS = {
  none: {
    name: 'None',
    description: 'Formatting only - no content changes',
    icon: '[1]',
    enabledCategories: ['formatting']
  },
  light: {
    name: 'Light',
    description: 'Light touch - removes obvious fluff',
    icon: '[2]',
    enabledCategories: ['formatting', 'fluff', 'security']
  },
  medium: {
    name: 'Medium',
    description: 'Recommended - removes fluff and redundancy',
    icon: '[3]',
    enabledCategories: ['formatting', 'fluff', 'redundancy', 'security']
  },
  heavy: {
    name: 'Heavy',
    description: 'Aggressive - strips most non-essential content',
    icon: '[4]',
    enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'security']
  },
  maximum: {
    name: 'Maximum',
    description: 'Extreme - deep compression (may alter meaning)',
    icon: '[5]',
    enabledCategories: ['formatting', 'fluff', 'redundancy', 'verbosity', 'qualifiers', 'structure', 'compression', 'security']
  },
  custom: {
    name: 'Custom',
    description: 'Your own rule configuration',
    icon: '[C]',
    enabledCategories: null
  }
};

const RULE_CATEGORIES = {
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

const DEFAULT_RULES = [
  // SECURITY (DLP)
  { id: 'redact-credit-cards', name: 'Redact Credit Cards', description: 'Redacts potential credit card numbers',
    explanation: 'Prevents sending payment information to AI models.',
    example: { before: 'My card is 4532 1234 5678 9012', after: 'My card is [REDACTED CREDIT CARD]' },
    enabled: true, category: 'security', priority: 1,
    patterns: [
      { find: /\b(?:\d[ -]*?){13,16}\b/g, replace: '[REDACTED CREDIT CARD]' }
    ]
  },
  { id: 'redact-email', name: 'Redact Email Addresses', description: 'Redacts email addresses',
    explanation: 'Prevents sharing personal contact information.',
    example: { before: 'Contact me at user@example.com', after: 'Contact me at [REDACTED EMAIL]' },
    enabled: true, category: 'security', priority: 1,
    patterns: [
      { find: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replace: '[REDACTED EMAIL]' }
    ]
  },
  { id: 'redact-ipv4', name: 'Redact IP Addresses', description: 'Redacts IPv4 addresses',
    explanation: 'Prevents exposing internal network infrastructure.',
    example: { before: 'Server is at 192.168.1.1', after: 'Server is at [REDACTED IP]' },
    enabled: true, category: 'security', priority: 1,
    patterns: [
      { find: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replace: '[REDACTED IP]' }
    ]
  },
  { id: 'redact-ssn', name: 'Redact SSN', description: 'Redacts Social Security Numbers',
    explanation: 'Protects sensitive personal identification numbers.',
    example: { before: 'SSN: 123-45-6789', after: 'SSN: [REDACTED SSN]' },
    enabled: true, category: 'security', priority: 1,
    patterns: [
      { find: /\b\d{3}-\d{2}-\d{4}\b/g, replace: '[REDACTED SSN]' }
    ]
  },
  { id: 'redact-api-keys', name: 'Redact API Keys', description: 'Redacts potential API keys',
    explanation: 'Prevents accidental leakage of secrets and tokens.',
    example: { before: 'Key: sk-12345abcdef', after: 'Key: [REDACTED API KEY]' },
    enabled: true, category: 'security', priority: 1,
    patterns: [
      { find: /\b(sk-[a-zA-Z0-9]{20,})\b/g, replace: '[REDACTED API KEY]' },
      { find: /\b(ghp_[a-zA-Z0-9]{36})\b/g, replace: '[REDACTED API KEY]' },
      { find: /\b(xoxb-[a-zA-Z0-9-]{10,})\b/g, replace: '[REDACTED API KEY]' }
    ]
  },

  // FLUFF - Greetings and Farewells
  { id: 'remove-greetings', name: 'Remove Greetings', description: 'Removes "Hey there", "Hope you\'re well" etc.',
    explanation: 'Greetings waste tokens - AI doesn\'t need social pleasantries.',
    example: { before: 'Hey there! Hope you\'re having a great day!', after: '' },
    enabled: true, category: 'fluff', priority: 5,
    patterns: [
      { find: /^(hey|hi|hello|greetings)( there)?[!.,]?\s*/gi, replace: '' },
      { find: /\bhope you'?r?e? (having|doing|feeling)[\w\s]*[!.]\s*/gi, replace: '' },
      { find: /\bhope (this finds you well|all is well|you'?r?e? well)[!.,]?\s*/gi, replace: '' },
      { find: /\bhave a (great|wonderful|nice|good|lovely) day[!.,]?\s*/gi, replace: '' },
      { find: /\bthanks (again|so much|a lot|in advance)[!.,]?\s*/gi, replace: '' },
      { find: /\bthank you (so much|very much|again|in advance)[!.,]?\s*/gi, replace: '' },
      { find: /\bsorry (for|about) the (long|lengthy) (message|email|text)[!.,]?\s*/gi, replace: '' },
      { find: /\bno pressure( though)?[!.,]?\s*/gi, replace: '' },
      { find: /\bonly if you want to[!.,]?\s*/gi, replace: '' },
      { find: /\blet me know what you think[!.,]?\s*/gi, replace: '' },
      { find: /\bwhen you get a chance[!.,]?\s*/gi, replace: '' }
    ] },

  { id: 'remove-please', name: 'Remove Pleasantries', description: 'Removes "please" from requests',
    explanation: 'AI models respond equally well without "please" - saves tokens.',
    example: { before: 'Please write a poem', after: 'Write a poem' },
    enabled: true, category: 'fluff', priority: 10,
    patterns: [{ find: /\bplease\s+/gi, replace: '' }, { find: /,?\s*please[!.,]?$/gi, replace: '' }] },

  { id: 'remove-polite-requests', name: 'Remove Polite Phrases', description: 'Removes "could you", "would you" etc.',
    explanation: 'Direct commands work better than polite questions.',
    example: { before: 'Could you help me with...', after: 'Help me with...' },
    enabled: true, category: 'fluff', priority: 11,
    patterns: [
      { find: /\bcould you (please\s+)?/gi, replace: '' },
      { find: /\bwould you (please\s+)?(mind\s+)?/gi, replace: '' },
      { find: /\bcan you (please\s+)?/gi, replace: '' },
      { find: /\bwill you (please\s+)?/gi, replace: '' },
      { find: /\bmight you (be able to\s+)?/gi, replace: '' },
      { find: /\bif you (could|would|might)\s+/gi, replace: '' }
    ] },

  { id: 'remove-appreciation', name: 'Remove Appreciation Prefixes', description: 'Removes "I would appreciate..."',
    explanation: 'Appreciation adds tokens without affecting output quality.',
    example: { before: 'I would appreciate if you could explain...', after: 'Explain...' },
    enabled: true, category: 'fluff', priority: 12,
    patterns: [
      { find: /\bI would (really\s+)?appreciate (it\s+)?if you could\s+/gi, replace: '' },
      { find: /\bI('d| would) like (it\s+)?if you could\s+/gi, replace: '' },
      { find: /\bI was (kind of\s+)?(maybe\s+)?wondering if (you could|perhaps you might)\s+/gi, replace: '' },
      { find: /\bI was wondering if\s+/gi, replace: '' },
      { find: /\bif you don't mind,?\s*/gi, replace: '' },
      { find: /\bif possible,?\s*/gi, replace: '' },
      { find: /\bif it's not too much trouble[,.]?\s*/gi, replace: '' },
      { find: /\bwhen you (get|have) (a\s+)?(chance|time),?\s*/gi, replace: '' },
      { find: /\band you have the time,?\s*/gi, replace: '' }
    ] },

  { id: 'remove-apologies', name: 'Remove Apologies', description: 'Removes unnecessary apologies',
    explanation: 'Apologizing to AI wastes tokens.',
    example: { before: 'Sorry to bother you, but...', after: '' },
    enabled: true, category: 'fluff', priority: 13,
    patterns: [
      { find: /\bI don't want to be a bother( or anything)?[,.]?\s*(but\s+)?/gi, replace: '' },
      { find: /\bsorry to (bother|trouble|bug) you[,.]?\s*(but\s+)?/gi, replace: '' },
      { find: /\bsorry (if this is|for being)[^.,!]*[.,!]?\s*/gi, replace: '' },
      { find: /\bI (hope|don't want to) (this isn't|be)[^.,!]*[.,!]?\s*/gi, replace: '' }
    ] },

  { id: 'remove-fillers', name: 'Remove Filler Words', description: 'Removes "just", "basically", "actually"',
    explanation: 'Filler words add no meaning and dilute clarity.',
    example: { before: 'I just really need you to basically help', after: 'I need you to help' },
    enabled: true, category: 'fluff', priority: 15,
    patterns: [
      { find: /\bjust\s+/gi, replace: '' },
      { find: /\bbasically,?\s*/gi, replace: '' },
      { find: /\bactually,?\s*/gi, replace: '' },
      { find: /\breally\s+/gi, replace: '' },
      { find: /\bliterally\s+/gi, replace: '' },
      { find: /\bsimply\s+/gi, replace: '' },
      { find: /\bhonestly,?\s*/gi, replace: '' },
      { find: /\bkind of\s+/gi, replace: '' },
      { find: /\bsort of\s+/gi, replace: '' },
      { find: /\ba little (bit\s+)?/gi, replace: '' },
      { find: /\babsolutely\s+/gi, replace: '' },
      { find: /\banyway,?\s*/gi, replace: '' },
      { find: /\bso,\s+/gi, replace: '' }
    ] },

  { id: 'remove-softeners', name: 'Remove Softening Language', description: 'Removes "would be cool if", "it might be nice"',
    explanation: 'Softening language weakens requests.',
    example: { before: 'It would be cool if you could...', after: '' },
    enabled: true, category: 'fluff', priority: 16,
    patterns: [
      { find: /\bit would be (really\s+)?(cool|nice|great|awesome) if you could\s+/gi, replace: '' },
      { find: /\bit might be (nice|good|helpful) (if|to)\s+/gi, replace: '' },
      { find: /\bI was thinking that (maybe,?\s*)?/gi, replace: '' },
      { find: /\bmaybe,?\s*just\s*maybe,?\s*/gi, replace: '' }
    ] },

  // REDUNDANCY  
  { id: 'remove-self-reference', name: 'Remove Self-References', description: 'Removes "I want you to", "I need you to"',
    explanation: 'The AI knows you are asking. These phrases are redundant.',
    example: { before: 'I want you to write a story', after: 'Write a story' },
    enabled: true, category: 'redundancy', priority: 20,
    patterns: [
      { find: /\bI (want|need|would like|'d like) you to\s+/gi, replace: '' },
      { find: /\bI (want|need|am looking for)\s+/gi, replace: '' },
      { find: /\bI('m| am) (trying|looking|hoping) to\s+/gi, replace: '' },
      { find: /\bwhat I need is\s+/gi, replace: '' }
    ] },

  { id: 'remove-ai-awareness', name: 'Remove AI Awareness', description: 'Removes "As an AI", "You are an AI"',
    explanation: 'The AI knows what it is - stating this wastes tokens.',
    example: { before: 'As an AI, you can...', after: 'You can...' },
    enabled: true, category: 'redundancy', priority: 21,
    patterns: [
      { find: /\bAs an AI( language model)?,?\s*/gi, replace: '' },
      { find: /\bYou are an AI,?\s*(so\s+)?/gi, replace: '' },
      { find: /\bI know you('re| are) an AI,?\s*(but\s+)?/gi, replace: '' }
    ] },

  { id: 'condense-phrases', name: 'Condense Wordy Phrases', description: 'Shortens verbose phrases',
    explanation: 'Many common phrases can be shortened without losing meaning.',
    example: { before: 'in order to achieve', after: 'to achieve' },
    enabled: true, category: 'redundancy', priority: 25,
    patterns: [
      { find: /\bin order to\s+/gi, replace: 'to ' },
      { find: /\bfor the purpose of\s+/gi, replace: 'to ' },
      { find: /\bdue to the fact that\s+/gi, replace: 'because ' },
      { find: /\bthe fact that\s+/gi, replace: 'that ' },
      { find: /\bat this point in time\s*/gi, replace: 'now ' },
      { find: /\bin the event that\s+/gi, replace: 'if ' },
      { find: /\bwith regards? to\s+/gi, replace: 'regarding ' },
      { find: /\bin the context of\s+/gi, replace: 'for ' },
      { find: /\ba large number of\s+/gi, replace: 'many ' },
      { find: /\bthe vast majority of\s+/gi, replace: 'most ' }
    ] },

  { id: 'remove-opinion-markers', name: 'Remove Opinion Markers', description: 'Removes "I think", "I believe"',
    explanation: 'Everything you write is your input - marking it as opinion is redundant.',
    example: { before: 'I think you should...', after: 'You should...' },
    enabled: true, category: 'redundancy', priority: 26,
    patterns: [
      { find: /\bI (think|believe|feel|suppose|guess) (that\s+)?/gi, replace: '' },
      { find: /\bin my opinion,?\s*/gi, replace: '' },
      { find: /\bpersonally,?\s*(I\s+)?/gi, replace: '' }
    ] },

  // VERBOSITY
  { id: 'condense-ability', name: 'Condense Ability Phrases', description: 'Replaces "has the ability to" with "can"',
    explanation: 'Verbose ability phrases can be simplified.',
    example: { before: 'has the ability to perform', after: 'can perform' },
    enabled: true, category: 'verbosity', priority: 30,
    patterns: [
      { find: /\bhas the ability to\s+/gi, replace: 'can ' },
      { find: /\bhave the ability to\s+/gi, replace: 'can ' },
      { find: /\bis able to\s+/gi, replace: 'can ' },
      { find: /\bare able to\s+/gi, replace: 'can ' },
      { find: /\bis capable of\s+/gi, replace: 'can ' }
    ] },

  { id: 'condense-instructions', name: 'Condense Instructions', description: 'Shortens instruction patterns',
    explanation: 'Instructions can be shortened while keeping clarity.',
    example: { before: 'make sure that you', after: 'ensure' },
    enabled: true, category: 'verbosity', priority: 31,
    patterns: [
      { find: /\bmake sure (that\s+)?(you\s+)?/gi, replace: 'ensure ' },
      { find: /\bprovide me with\s+/gi, replace: 'give ' },
      { find: /\btell me about\s+/gi, replace: 'explain ' },
      { find: /\blet me know\s+/gi, replace: 'tell me ' },
      { find: /\bgo ahead and\s+/gi, replace: '' },
      { find: /\bfeel free to\s+/gi, replace: '' },
      { find: /\bdon't hesitate to\s+/gi, replace: '' },
      { find: /\bany help you (might|may) (be able to\s+)?provide[!.,]?\s*/gi, replace: '' },
      { find: /\bhelp me out with something\??\s*/gi, replace: 'help with: ' },
      { find: /\bpotentially\s+/gi, replace: '' },
      { find: /\bpotentially help me out\s*/gi, replace: 'help ' },
      { find: /\bwriting some code for me\??\s*/gi, replace: 'write code: ' },
      { find: /\bconsider\s+/gi, replace: '' },
      { find: /\bpossibly consider\s+/gi, replace: '' }
    ] },

  { id: 'remove-modifiers', name: 'Remove Weak Modifiers', description: 'Removes "very", "extremely"',
    explanation: 'Weak modifiers often dilute meaning.',
    example: { before: 'very important', after: 'important' },
    enabled: true, category: 'verbosity', priority: 32,
    patterns: [
      { find: /\bvery\s+/gi, replace: '' },
      { find: /\bextremely\s+/gi, replace: '' },
      { find: /\bhighly\s+/gi, replace: '' },
      { find: /\bincredibly\s+/gi, replace: '' }
    ] },

  // QUALIFIERS
  { id: 'remove-hedging', name: 'Remove Hedging', description: 'Removes "perhaps", "maybe", "possibly"',
    explanation: 'Hedging makes prompts less clear. Be direct.',
    example: { before: 'Maybe you could perhaps help', after: 'Help' },
    enabled: true, category: 'qualifiers', priority: 40,
    patterns: [
      { find: /\bperhaps\s+/gi, replace: '' },
      { find: /\bmaybe\s+/gi, replace: '' },
      { find: /\bpossibly\s+/gi, replace: '' },
      { find: /\bprobably\s+/gi, replace: '' },
      { find: /\bI guess\s+/gi, replace: '' },
      { find: /\bI suppose\s+/gi, replace: '' }
    ] },

  { id: 'remove-appearance', name: 'Remove Appearance Phrases', description: 'Removes "it seems like"',
    explanation: 'These phrases express uncertainty. State things directly.',
    example: { before: 'It seems like you could...', after: 'You could...' },
    enabled: true, category: 'qualifiers', priority: 41,
    patterns: [
      { find: /\bit (seems|appears|looks) (like|as if|that)\s+/gi, replace: '' },
      { find: /\bseemingly\s+/gi, replace: '' },
      { find: /\bapparently\s+/gi, replace: '' }
    ] },

  // STRUCTURE
  { id: 'optimize-format-requests', name: 'Optimize Format Requests', description: 'Shortens format specifications',
    explanation: 'Format requests can be shortened to direct commands.',
    example: { before: 'provide a detailed explanation of', after: 'explain in detail:' },
    enabled: true, category: 'structure', priority: 50,
    patterns: [
      { find: /\bprovide (me with\s+)?a detailed explanation of\s+/gi, replace: 'explain in detail: ' },
      { find: /\bgive (me\s+)?a summary of\s+/gi, replace: 'summarize: ' },
      { find: /\bwrite a comprehensive guide (on|about)\s+/gi, replace: 'guide: ' },
      { find: /\b(create|make|generate) a list of\s+/gi, replace: 'list: ' }
    ] },

  // FORMATTING
  { id: 'cleanup-whitespace', name: 'Clean Whitespace', description: 'Normalizes spaces',
    explanation: 'Clean formatting helps AI parse your prompt correctly.',
    example: { before: 'Hello    world', after: 'Hello world' },
    enabled: true, category: 'formatting', priority: 90,
    patterns: [
      { find: /\s{2,}/g, replace: ' ' },
      { find: /^\s+/g, replace: '' },
      { find: /\s+$/g, replace: '' }
    ] },

  { id: 'fix-punctuation', name: 'Fix Punctuation', description: 'Fixes punctuation issues',
    explanation: 'Clean punctuation improves clarity.',
    example: { before: 'Hello..  World', after: 'Hello. World' },
    enabled: true, category: 'formatting', priority: 91,
    patterns: [
      { find: /\s+([.,!?;:])/g, replace: '$1' },
      { find: /([.,!?;:])\s*([.,!?;:])+/g, replace: '$1' },
      { find: /([.,!?;:])([A-Za-z])/g, replace: '$1 $2' }
    ] },

  { id: 'capitalize-first', name: 'Capitalize First Letter', description: 'Ensures proper capitalization',
    explanation: 'Proper capitalization is standard formatting.',
    example: { before: 'write a poem', after: 'Write a poem' },
    enabled: true, category: 'formatting', priority: 95,
    transform: (text) => text.charAt(0).toUpperCase() + text.slice(1) },

  // DEEP COMPRESSION (disabled by default)
  { id: 'compress-articles', name: 'Remove Articles', description: 'Removes "a", "an", "the"',
    explanation: 'Articles can be removed in prompts without losing meaning. Use carefully.',
    example: { before: 'Write a poem about the moon', after: 'Write poem about moon' },
    enabled: false, category: 'compression', priority: 100,
    patterns: [{ find: /\b(a|an|the)\s+/gi, replace: '' }] },

  { id: 'compress-pronouns', name: 'Simplify Pronouns', description: 'Removes unnecessary pronouns',
    explanation: 'Some pronouns can be omitted when context is clear.',
    example: { before: 'I need you to help me', after: 'Help' },
    enabled: false, category: 'compression', priority: 101,
    patterns: [
      { find: /\byou (should|must|need to)\s+/gi, replace: '' }
    ] }
];

class RulesEngine {
  constructor() {
    this.rules = [];
    this.customRules = [];
    this.remoteRules = [];
    this.compressionLevel = 'medium';
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await this.loadRules();
    this.initialized = true;
  }

  // Fetch rules from GitHub repo (cached for 1 hour)
  async fetchRemoteRules() {
    try {
      // Check cache first
      const cached = await chrome.storage.local.get(['remoteRulesCache', 'remoteRulesCacheTime']);
      const now = Date.now();

      if (cached.remoteRulesCache && cached.remoteRulesCacheTime &&
          (now - cached.remoteRulesCacheTime) < RULES_CACHE_DURATION) {
        console.log('Using cached remote rules');
        return cached.remoteRulesCache;
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
        remoteRulesCacheTime: now
      });

      console.log(`Fetched ${remoteData.rules?.length || 0} remote rules`);
      return remoteData;
    } catch (e) {
      console.log('Could not fetch remote rules, using defaults:', e.message);
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

    // Handle transform functions (stored as strings)
    if (rule.transformCode) {
      try {
        // Create function from code string - allows simple transforms
        parsed.transform = new Function('text', rule.transformCode);
      } catch (e) {
        console.log(`Invalid transform for rule ${rule.id}:`, e.message);
      }
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

      // Use remote rules if available, otherwise fall back to bundled defaults
      let baseRules;
      if (remoteData && remoteData.rules && remoteData.rules.length > 0) {
        baseRules = remoteData.rules.map(r => this.parseRemoteRule(r));
        this.remoteRules = baseRules;
        console.log(`Loaded ${baseRules.length} rules from remote`);
      } else {
        baseRules = DEFAULT_RULES;
        console.log('Using bundled default rules');
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
      this.rules = [...DEFAULT_RULES];
    }
  }

  // Force refresh rules from remote (ignore cache)
  async refreshRemoteRules() {
    try {
      await chrome.storage.local.remove(['remoteRulesCache', 'remoteRulesCacheTime']);
      await this.loadRules();
      return true;
    } catch (e) {
      console.log('Could not refresh rules:', e);
      return false;
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
    this.rules = DEFAULT_RULES.map(r => ({ ...r }));
    this.applyCompressionPreset('medium');
    try {
      await chrome.storage.sync.remove(['customRules', 'ruleSettings', 'compressionLevel']);
    } catch (e) {
      console.log('Could not reset rules (extension may have been reloaded):', e.message);
    }
  }

  async exportConfig() {
    return { version: '1.0', compressionLevel: this.compressionLevel, customRules: this.customRules.map(r => ({ ...r, patterns: undefined })),
      ruleSettings: this.rules.reduce((acc, r) => { if (!r.isCustom) acc[r.id] = { enabled: r.enabled }; return acc; }, {}) };
  }

  async importConfig(config) {
    if (config.version !== '1.0') throw new Error('Incompatible version');
    this.compressionLevel = config.compressionLevel || 'balanced';
    this.customRules = (config.customRules || []).map(r => {
      if (r.patternString) r.patterns = [{ find: new RegExp(r.patternString, r.patternFlags || 'gi'), replace: r.replaceString || '' }];
      return r;
    });
    this.rules = DEFAULT_RULES.map(r => ({ ...r, ...(config.ruleSettings?.[r.id] || {}) }));
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
  window.DEFAULT_RULES = DEFAULT_RULES;
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RulesEngine, COMPRESSION_PRESETS, RULE_CATEGORIES, DEFAULT_RULES };
}
