#!/usr/bin/env node
/**
 * PrompthaKCer - PreToolUse Hook for Claude Code
 *
 * Automatically scans tool inputs for sensitive data (DLP) before
 * Claude Code executes Write, Edit, Bash, or other tools.
 *
 * Detects: credit cards, emails, SSNs, API keys, IP addresses
 *
 * Hook protocol:
 *   stdin:  JSON { tool_name, tool_input }
 *   stdout: JSON { decision: "approve"|"block", reason: "..." }
 */

const { RulesEngine, StatsTracker } = require('./rules-engine');

async function main() {
  let input = '';

  // Read JSON from stdin
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    // If we can't parse input, approve by default
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  const { tool_name, tool_input } = hookData;

  // Only scan tools that write/send content
  const scanTargets = ['Write', 'Edit', 'Bash', 'NotebookEdit'];
  if (!scanTargets.includes(tool_name)) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  // Extract text content to scan based on tool type
  let textToScan = '';
  switch (tool_name) {
    case 'Write':
      textToScan = tool_input?.content || '';
      break;
    case 'Edit':
      textToScan = tool_input?.new_string || '';
      break;
    case 'Bash':
      textToScan = tool_input?.command || '';
      break;
    case 'NotebookEdit':
      textToScan = tool_input?.new_source || '';
      break;
    default:
      textToScan = JSON.stringify(tool_input || {});
  }

  if (!textToScan || textToScan.length === 0) {
    console.log(JSON.stringify({ decision: 'approve' }));
    return;
  }

  // Initialize rules engine with security rules
  const engine = new RulesEngine('medium');
  engine.init();

  // Run DLP scan
  const findings = engine.scanDLP(textToScan);

  // Track stats
  const stats = new StatsTracker();
  stats.recordScan(findings);

  if (findings.length > 0) {
    // Build detailed reason message
    const details = findings.map(f =>
      `  [${f.ruleName}] ${f.matchCount} match(es) - ${f.explanation}`
    ).join('\n');

    const reason = [
      'PrompthaKCer DLP: Sensitive data detected in tool input!',
      '',
      ...findings.map(f =>
        `  [${f.ruleName}] ${f.matchCount} match(es) found - ${f.explanation}`
      ),
      '',
      `Total: ${findings.reduce((s, f) => s + f.matchCount, 0)} sensitive item(s) detected.`,
      'Review the content and redact sensitive data before proceeding.'
    ].join('\n');

    console.log(JSON.stringify({
      decision: 'block',
      reason
    }));
  } else {
    console.log(JSON.stringify({ decision: 'approve' }));
  }
}

main().catch(err => {
  // On error, approve to avoid blocking workflow
  console.log(JSON.stringify({ decision: 'approve' }));
});
