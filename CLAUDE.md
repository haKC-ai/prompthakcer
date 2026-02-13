# PrompthaKCer - Claude Code Plugin

Automatic prompt optimization and DLP (Data Loss Prevention) for Claude Code sessions.

This plugin brings the PrompthaKCer Chrome extension's capabilities directly into Claude Code via hooks.

## What It Does

### Automatic DLP Scanning (PreToolUse Hook)
Every time Claude Code uses Write, Edit, Bash, or NotebookEdit tools, the plugin automatically scans for:
- **Credit card numbers** - Luhn-pattern card numbers
- **Email addresses** - Personal contact info
- **Social Security Numbers** - SSN patterns (XXX-XX-XXXX)
- **API keys** - OpenAI (sk-), GitHub (ghp_), Slack (xoxb-) tokens
- **IP addresses** - IPv4 addresses

If sensitive data is detected, the tool call is **blocked** with a detailed report.

### Prompt Optimizer CLI
Optimize prompts from the command line to save tokens:

```bash
# Basic optimization (medium compression)
node claude-code-plugin/optimize.js "Hey there! Could you please help me write a function?"

# Heavy compression
node claude-code-plugin/optimize.js --level heavy "I was wondering if you could possibly help me"

# DLP scan only
node claude-code-plugin/optimize.js --dlp-only "My card is 4532 1234 5678 9012"

# View stats
node claude-code-plugin/optimize.js --stats

# List all rules
node claude-code-plugin/optimize.js --rules

# JSON output (for piping)
node claude-code-plugin/optimize.js --json "your prompt here"

# Pipe mode
echo "your prompt" | node claude-code-plugin/optimize.js
```

### Stats Tracking (PostToolUse Hook)
Tracks DLP scans, blocks, and optimization statistics across your session. View with:
```bash
node claude-code-plugin/optimize.js --stats
```

## Compression Levels

| Level | Categories | Savings |
|-------|-----------|---------|
| **none** | formatting only | Minimal |
| **light** | + fluff, security | 15-25% |
| **medium** | + redundancy | 25-40% |
| **heavy** | + verbosity, qualifiers, structure | 40-60% |
| **maximum** | + deep compression | 50-70% |

## Hook Configuration

Hooks are configured in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|Bash|NotebookEdit",
        "command": "node claude-code-plugin/hook-pre-tool-use.js"
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "command": "node claude-code-plugin/hook-post-tool-use.js"
      }
    ]
  }
}
```

## Running Tests

```bash
node claude-code-plugin/test.js
```

## Rules

The plugin uses all 51+ rules from `rules.json`, organized into categories:
- **Security (DLP)** - Redact sensitive data
- **Fluff & Politeness** - Remove pleasantries, greetings, thanks
- **Redundancy** - Eliminate repetitive phrases
- **Verbosity** - Condense wordy expressions
- **Qualifiers** - Remove hedging language
- **Structure** - Optimize prompt structure (CRAFR framework)
- **Compression** - Aggressive token reduction
- **Formatting** - Clean whitespace and punctuation

## Architecture

```
claude-code-plugin/
  rules-engine.js      Core engine (DLP + optimization + stats)
  hook-pre-tool-use.js PreToolUse hook (automatic DLP scanning)
  hook-post-tool-use.js PostToolUse hook (stats tracking)
  optimize.js          Standalone CLI optimizer
  test.js              Test suite
  stats.json           Persistent statistics (auto-generated)
  package.json         Package metadata
```

All processing is local. No data is sent externally.
