#!/usr/bin/env node
/**
 * PrompthaKCer Claude Code Plugin - Test Suite
 * Validates rules engine, DLP scanning, and optimization
 */

const { RulesEngine, StatsTracker } = require('./rules-engine');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passed++;
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

console.log('\nPrompthaKCer Plugin Tests');
console.log('========================\n');

// ---- Rules Engine Init ----
console.log('Rules Engine:');

const engine = new RulesEngine('medium');
engine.init();

test('loads rules from rules.json', () => {
  assert(engine.rules.length > 0, `Expected rules, got ${engine.rules.length}`);
});

test('has security rules', () => {
  const secRules = engine.getSecurityRules();
  assert(secRules.length > 0, 'No security rules found');
});

test('has multiple categories', () => {
  const cats = engine.getRulesByCategory();
  assert(Object.keys(cats).length >= 3, 'Expected at least 3 categories');
});

// ---- DLP Scanning ----
console.log('\nDLP Scanning:');

test('detects credit card numbers', () => {
  const findings = engine.scanDLP('My card is 4532 1234 5678 9012');
  assert(findings.length > 0, 'Should detect credit card');
  assert(findings.some(f => f.ruleId === 'redact-credit-cards'), 'Should match credit card rule');
});

test('detects email addresses', () => {
  const findings = engine.scanDLP('Contact me at user@example.com');
  assert(findings.length > 0, 'Should detect email');
  assert(findings.some(f => f.ruleId === 'redact-email'), 'Should match email rule');
});

test('detects SSNs', () => {
  const findings = engine.scanDLP('SSN: 123-45-6789');
  assert(findings.length > 0, 'Should detect SSN');
  assert(findings.some(f => f.ruleId === 'redact-ssn'), 'Should match SSN rule');
});

test('detects API keys (sk-)', () => {
  const findings = engine.scanDLP('Key: sk-12345abcdefghijklmnopqrs');
  assert(findings.length > 0, 'Should detect API key');
  assert(findings.some(f => f.ruleId === 'redact-api-keys'), 'Should match API key rule');
});

test('detects GitHub tokens', () => {
  const findings = engine.scanDLP('Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
  assert(findings.length > 0, 'Should detect GitHub token');
});

test('detects IP addresses', () => {
  const findings = engine.scanDLP('Server at 192.168.1.100');
  assert(findings.length > 0, 'Should detect IP');
  assert(findings.some(f => f.ruleId === 'redact-ipv4'), 'Should match IP rule');
});

test('clean text passes DLP', () => {
  const findings = engine.scanDLP('Write a function that adds two numbers');
  assert(findings.length === 0, `Expected 0 findings, got ${findings.length}`);
});

// ---- Prompt Optimization ----
console.log('\nPrompt Optimization:');

test('removes greetings', () => {
  const result = engine.optimize('Hey there! Write a function');
  assert(result.optimized.indexOf('Hey there') === -1, 'Should remove greeting');
  assert(result.hasChanges, 'Should have changes');
});

test('removes please', () => {
  const result = engine.optimize('Please write a poem');
  assert(result.optimized.indexOf('Please') === -1 && result.optimized.indexOf('please') === -1,
    'Should remove please');
});

test('removes polite requests', () => {
  const result = engine.optimize('Could you help me with this');
  assert(!result.optimized.match(/\bcould you\b/i), 'Should remove "could you"');
});

test('reports tokens saved', () => {
  const result = engine.optimize('Hey there! I was wondering if you could please help me write a function that adds two numbers. Thanks so much!');
  assert(result.stats.tokensSaved > 0, 'Should save tokens');
  assert(result.stats.percentSaved > 0, 'Should have percent saved');
});

test('preserves content meaning', () => {
  const result = engine.optimize('Write a recursive fibonacci function in Python');
  // Short direct prompts should be mostly preserved
  assert(result.optimized.includes('fibonacci') || result.optimized.includes('Fibonacci'),
    'Should preserve key content');
});

test('tracks applied rules', () => {
  const result = engine.optimize('Hello! I would really appreciate it if you could please help me. Thanks!');
  assert(result.appliedRules.length > 0, 'Should track applied rules');
  assert(result.appliedRules[0].id, 'Rules should have IDs');
  assert(result.appliedRules[0].name, 'Rules should have names');
});

test('redacts sensitive data during optimization', () => {
  const result = engine.optimize('My email is test@example.com and my card is 4532 1234 5678 9012');
  assert(result.optimized.includes('[REDACTED'), 'Should redact sensitive data');
});

// ---- Compression Levels ----
console.log('\nCompression Levels:');

test('none level keeps most content', () => {
  const e = new RulesEngine('none');
  e.init();
  const result = e.optimize('Hey there! Please write a poem about nature.');
  // "none" only does formatting, so most content remains
  assert(result.optimized.includes('please') || result.optimized.includes('Please') || result.optimized.includes('Hey'),
    'None level should preserve most content');
});

test('heavy level removes more', () => {
  const e = new RulesEngine('heavy');
  e.init();
  const result = e.optimize('I was wondering if you could perhaps maybe please help me write a very simple function.');
  assert(result.stats.percentSaved > 10, 'Heavy should save significant tokens');
});

// ---- Stats Tracker ----
console.log('\nStats Tracker:');

const stats = new StatsTracker();
stats.reset();

test('starts with empty stats', () => {
  const summary = stats.getSummary();
  assert(summary.totalScans === 0, 'Should start at 0 scans');
  assert(summary.totalOptimizations === 0, 'Should start at 0 optimizations');
});

test('records DLP scans', () => {
  stats.recordScan([{ ruleId: 'test-rule', matchCount: 2 }]);
  const summary = stats.getSummary();
  assert(summary.totalScans === 1, 'Should record scan');
  assert(summary.dlpBlocks === 1, 'Should record block');
});

test('records optimizations', () => {
  stats.recordOptimization({
    stats: { tokensSaved: 15, charsSaved: 50, percentSaved: 25 },
    appliedRules: [{ id: 'test', name: 'Test' }]
  });
  const summary = stats.getSummary();
  assert(summary.totalOptimizations === 1, 'Should record optimization');
  assert(summary.totalTokensSaved === 15, 'Should track tokens');
});

test('resets stats', () => {
  stats.reset();
  const summary = stats.getSummary();
  assert(summary.totalScans === 0, 'Should reset to 0');
});

// ---- Summary ----
console.log('\n========================');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
console.log(failed === 0 ? '\nAll tests passed!' : '\nSome tests failed!');
process.exit(failed > 0 ? 1 : 0);
