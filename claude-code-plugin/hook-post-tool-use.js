#!/usr/bin/env node
/**
 * PrompthaKCer - PostToolUse Hook for Claude Code
 *
 * Tracks optimization statistics and provides insights after tool execution.
 * Logs tool usage patterns for analytics.
 *
 * Hook protocol:
 *   stdin: JSON { tool_name, tool_input, tool_output }
 *   stdout: (informational output, shown to user if non-empty)
 */

const { StatsTracker } = require('./rules-engine');

async function main() {
  let input = '';

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch {
    return;
  }

  const stats = new StatsTracker();
  const summary = stats.getSummary();

  // Show periodic stats summary (every 10 scans)
  if (summary.totalScans > 0 && summary.totalScans % 10 === 0) {
    const msg = [
      '',
      'PrompthaKCer Stats Update:',
      `  Scans: ${summary.totalScans} | DLP blocks: ${summary.dlpBlocks}`,
      `  Optimizations: ${summary.totalOptimizations} | Tokens saved: ${summary.totalTokensSaved}`,
      ''
    ].join('\n');

    // Write to stderr for informational output (won't interfere with hook protocol)
    process.stderr.write(msg);
  }
}

main().catch(() => {});
