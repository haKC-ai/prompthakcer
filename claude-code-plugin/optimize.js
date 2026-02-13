#!/usr/bin/env node
/**
 * PrompthaKCer - Standalone Prompt Optimizer CLI for Claude Code
 *
 * Usage:
 *   node optimize.js "your prompt text here"
 *   echo "your prompt" | node optimize.js
 *   node optimize.js --level heavy "your prompt"
 *   node optimize.js --dlp-only "text to scan for sensitive data"
 *   node optimize.js --stats
 *   node optimize.js --rules
 *
 * Compression levels: none, light, medium (default), heavy, maximum
 */

const { RulesEngine, StatsTracker, COMPRESSION_PRESETS } = require('./rules-engine');

function printUsage() {
  console.log(`
PrompthaKCer - Prompt Optimizer for Claude Code
================================================

Usage:
  node optimize.js [options] "prompt text"
  echo "prompt text" | node optimize.js [options]

Options:
  --level <level>   Compression level: none, light, medium (default), heavy, maximum
  --dlp-only        Only scan for sensitive data (DLP mode)
  --stats           Show optimization statistics
  --stats-reset     Reset all statistics
  --rules           List all available rules
  --json            Output results as JSON
  --help            Show this help

Examples:
  node optimize.js "Hey there! Could you please help me write a function?"
  node optimize.js --level heavy "I was wondering if you could possibly help me"
  node optimize.js --dlp-only "My card is 4532 1234 5678 9012"
  node optimize.js --stats
`);
}

function printRules(engine) {
  const cats = engine.getRulesByCategory();
  console.log('\nPrompthaKCer Rules');
  console.log('==================\n');

  for (const [category, rules] of Object.entries(cats)) {
    console.log(`[${category.toUpperCase()}]`);
    for (const rule of rules) {
      const status = rule.enabled ? '+' : '-';
      console.log(`  ${status} ${rule.name} (${rule.id})`);
    }
    console.log('');
  }

  console.log('Compression Presets:');
  for (const [key, preset] of Object.entries(COMPRESSION_PRESETS)) {
    if (preset.enabledCategories) {
      console.log(`  [${key}] ${preset.name}: ${preset.enabledCategories.join(', ')}`);
    }
  }
}

function printStats(stats) {
  const summary = stats.getSummary();
  console.log('\nPrompthaKCer Statistics');
  console.log('======================\n');
  console.log(`Total DLP Scans:      ${summary.totalScans}`);
  console.log(`DLP Blocks:           ${summary.dlpBlocks}`);
  console.log(`Total Optimizations:  ${summary.totalOptimizations}`);
  console.log(`Total Tokens Saved:   ${summary.totalTokensSaved}`);
  console.log(`Total Chars Saved:    ${summary.totalCharsSaved}`);

  if (summary.topFindings.length > 0) {
    console.log('\nTop DLP Findings:');
    for (const [id, count] of summary.topFindings) {
      console.log(`  ${id}: ${count} occurrences`);
    }
  }

  if (summary.recentHistory.length > 0) {
    console.log('\nRecent Optimizations:');
    for (const entry of summary.recentHistory.reverse()) {
      console.log(`  ${entry.timestamp} - ${entry.tokensSaved} tokens saved (${entry.percentSaved}%) [${entry.rulesApplied} rules]`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let level = 'medium';
  let dlpOnly = false;
  let showStats = false;
  let resetStats = false;
  let showRules = false;
  let jsonOutput = false;
  let textArgs = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--level':
        level = args[++i] || 'medium';
        break;
      case '--dlp-only':
        dlpOnly = true;
        break;
      case '--stats':
        showStats = true;
        break;
      case '--stats-reset':
        resetStats = true;
        break;
      case '--rules':
        showRules = true;
        break;
      case '--json':
        jsonOutput = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        return;
      default:
        if (!args[i].startsWith('--')) {
          textArgs.push(args[i]);
        }
    }
  }

  // Handle --stats
  if (showStats) {
    const stats = new StatsTracker();
    if (jsonOutput) {
      console.log(JSON.stringify(stats.getSummary(), null, 2));
    } else {
      printStats(stats);
    }
    return;
  }

  // Handle --stats-reset
  if (resetStats) {
    const stats = new StatsTracker();
    stats.reset();
    console.log('Statistics reset.');
    return;
  }

  // Initialize engine
  const engine = new RulesEngine(level);
  engine.init();

  // Handle --rules
  if (showRules) {
    if (jsonOutput) {
      console.log(JSON.stringify(engine.getRulesByCategory(), null, 2));
    } else {
      printRules(engine);
    }
    return;
  }

  // Get input text from args or stdin
  let text = textArgs.join(' ');

  if (!text && !process.stdin.isTTY) {
    // Read from stdin (pipe mode)
    let stdinData = '';
    for await (const chunk of process.stdin) {
      stdinData += chunk;
    }
    text = stdinData.trim();
  }

  if (!text) {
    printUsage();
    return;
  }

  // DLP-only mode
  if (dlpOnly) {
    const findings = engine.scanDLP(text);
    const stats = new StatsTracker();
    stats.recordScan(findings);

    if (jsonOutput) {
      console.log(JSON.stringify({ findings, count: findings.length }, null, 2));
    } else if (findings.length === 0) {
      console.log('\n[CLEAN] No sensitive data detected.');
    } else {
      console.log('\n[ALERT] Sensitive data detected!\n');
      for (const f of findings) {
        console.log(`  [${f.ruleName}]`);
        console.log(`    ${f.description}`);
        console.log(`    Matches: ${f.matchCount}`);
        console.log(`    Why: ${f.explanation}`);
        console.log('');
      }
      console.log(`Total: ${findings.reduce((s, f) => s + f.matchCount, 0)} sensitive item(s)`);
    }
    return;
  }

  // Full optimization
  const result = engine.optimize(text);
  const stats = new StatsTracker();

  // Also run DLP scan
  const dlpFindings = engine.scanDLP(text);
  stats.recordScan(dlpFindings);

  if (result.hasChanges) {
    stats.recordOptimization(result);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      ...result,
      dlpFindings
    }, null, 2));
  } else {
    console.log('\nPrompthaKCer Optimization Results');
    console.log('=================================\n');

    if (dlpFindings.length > 0) {
      console.log('[DLP WARNING] Sensitive data detected:');
      for (const f of dlpFindings) {
        console.log(`  - ${f.ruleName}: ${f.matchCount} match(es)`);
      }
      console.log('');
    }

    console.log(`Original (${result.stats.originalTokens} tokens, ${result.stats.originalLength} chars):`);
    console.log(`  "${result.original}"\n`);

    console.log(`Optimized (${result.stats.optimizedTokens} tokens, ${result.stats.optimizedLength} chars):`);
    console.log(`  "${result.optimized}"\n`);

    console.log('Stats:');
    console.log(`  Tokens saved:  ${result.stats.tokensSaved} (${result.stats.percentSaved}%)`);
    console.log(`  Chars saved:   ${result.stats.charsSaved}`);
    console.log(`  Rules applied: ${result.appliedRules.length}`);

    if (result.appliedRules.length > 0) {
      console.log('\nApplied Rules:');
      for (const rule of result.appliedRules) {
        console.log(`  [${rule.category}] ${rule.name}`);
      }
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
