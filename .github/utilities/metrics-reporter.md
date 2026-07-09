---
description: "Metrics reporter utility - like wiki-manager but for metrics. Agents call at completion, utility handles timing and wiki storage automatically."
---

# Metrics Reporter Utility

Wiki-based metrics reporter. Agents call this at completion with minimal parameters; utility handles all timing/tracking/storage internally.

---

## Quick Start

### For Agents (Copy-Paste)

**At agent completion:**
```bash
./utilities/metrics-reporter.md report \
  --agent-id "intake" \
  --issue-number "42" \
  --decision "PASS" \
  --confidence "0.98"
```

That's it. The utility handles:
- ✅ Recording execution time (automatic)
- ✅ Formatting metrics (automatic)
- ✅ Writing to GitHub wiki (automatic)
- ✅ Organizing by date/agent/metric (automatic)

Idea Scout example:
```bash
./utilities/metrics-reporter.md report \
  --agent-id "idea-scout" \
  --issue-number "128" \
  --decision "CREATE_PM_IDEA" \
  --confidence "0.87"
```

### For Orchestrators (Copy-Paste)

**At cycle end:**
```bash
./utilities/metrics-reporter.md report-cycle \
  --orchestrator "dev" \
  --cycle-number "42" \
  --duration-seconds "90" \
  --issues-processed "5" \
  --issues-completed "3" \
  --agents-spawned "6"
```

Utility handles all the rest.

Discovery orchestrator bounded-run example:
```bash
./utilities/metrics-reporter.md report-cycle \
  --orchestrator "discovery" \
  --cycle-number "18" \
  --duration-seconds "540" \
  --issues-processed "5" \
  --issues-completed "3" \
  --agents-spawned "1"
```

---

## How It Works

### Agent Flow

```
Agent startup:
└─ ./utilities/metrics-reporter.md start \
     --agent-id "intake" \
     --issue-number "42"
    └─ Utility records AGENT_START_TIME in memory

Agent finishes work...

Agent completion:
└─ ./utilities/metrics-reporter.md report \
     --agent-id "intake" \
     --issue-number "42" \
     --decision "PASS" \
     --confidence "0.98"
    └─ Utility:
       ├─ Calculates duration (now - START_TIME)
       ├─ Formats metric row
       ├─ Clones GitHub wiki repo
       ├─ Appends to Metrics-YYYY-MM-DD page
       ├─ Appends to <agent-id> page
       ├─ Commits & pushes to wiki
       └─ Returns success/failure
```

### Orchestrator Flow

```
Cycle end:
└─ ./utilities/metrics-reporter.md report-cycle \
     --orchestrator "dev" \
     --cycle-number "42" \
     --duration-seconds "90" \
     --issues-processed "5" \
     --issues-completed "3"
    └─ Utility:
       ├─ Formats cycle row
       ├─ Calculates success rate
       ├─ Clones GitHub wiki repo
       ├─ Appends to Cycles-Dev page
       ├─ Appends to Metrics-YYYY-MM-DD page
       ├─ Commits & pushes to wiki
       └─ Returns summary
```

---

## Integration Examples

### Intake Agent

```bash
#!/bin/bash
# intake.agent.md

AGENT_ID="intake"
ISSUE_NUMBER=$1

# Start tracking (records START_TIME)
./utilities/metrics-reporter.md start \
  --agent-id "$AGENT_ID" \
  --issue-number "$ISSUE_NUMBER"

# ... do intake work ...

# Make decision
DECISION="PASS"
CONFIDENCE="0.98"

# Report metrics (utility calculates duration automatically)
./utilities/metrics-reporter.md report \
  --agent-id "$AGENT_ID" \
  --issue-number "$ISSUE_NUMBER" \
  --decision "$DECISION" \
  --confidence "$CONFIDENCE"

# Then post your normal decision comment
gh issue comment "$ISSUE_NUMBER" --body "## Intake Decision: $DECISION"
```

### Design Agent

```bash
#!/bin/bash
# design.agent.md

AGENT_ID="design"
ISSUE_NUMBER=$1

./utilities/metrics-reporter.md start \
  --agent-id "$AGENT_ID" \
  --issue-number "$ISSUE_NUMBER"

# ... do design work ...

DECISION="PASS"
CONFIDENCE="0.95"

./utilities/metrics-reporter.md report \
  --agent-id "$AGENT_ID" \
  --issue-number "$ISSUE_NUMBER" \
  --decision "$DECISION" \
  --confidence "$CONFIDENCE"

gh issue comment "$ISSUE_NUMBER" --body "## Design Review: $DECISION"
```

### Dev Orchestrator Cycle

```bash
#!/bin/bash
# dev-orchestrator-v2.agent.md (cycle end)

ORCHESTRATOR="dev"
CYCLE_START_TIME=$(date +%s)

# ... do cycle work (spawn agents, etc.) ...

CYCLE_END_TIME=$(date +%s)
CYCLE_DURATION=$((CYCLE_END_TIME - CYCLE_START_TIME))

# Report cycle metrics
./utilities/metrics-reporter.md report-cycle \
  --orchestrator "$ORCHESTRATOR" \
  --cycle-number "$CYCLE_NUMBER" \
  --duration-seconds "$CYCLE_DURATION" \
  --issues-processed "5" \
  --issues-completed "3" \
  --agents-spawned "6"

echo "Cycle $CYCLE_NUMBER complete: ${CYCLE_DURATION}s, 3/5 issues complete"
```

---

## Metrics Pages Created (Wiki)

### Daily Summary
- **Page:** `Metrics-YYYY-MM-DD`
- **Contains:** All agent metrics + orchestrator cycles for that day
- **Format:** Markdown table with timestamp, agent, issue, decision, duration, confidence

### Agent Pages
- **Page:** `<agent-id>` (e.g., `intake`, `design`, `build`, `qa`, `policy`)
- **Contains:** Historical metrics for that agent only
- **Format:** Markdown table (time, issue, decision, confidence, duration)

### Orchestrator Pages
- **Page:** `Cycles-<Orchestrator>` (e.g., `Cycles-Dev`, `Cycles-Pm`, `Cycles-Po`, `Cycles-Discovery`)
- **Contains:** All cycle metrics for that orchestrator
- **Format:** Markdown table (cycle #, duration, processed, completed, success rate, agents spawned)

### Main Dashboard
- **Page:** `Metrics` (optional, created on first run)
- **Contains:** Links to all metric pages + summary stats
- **Format:** Markdown dashboard with overview

---

## Command Reference

### Agent Commands

#### `start`
Record agent start time (called at agent initialization).

```bash
./utilities/metrics-reporter.md start \
  --agent-id <agent-id> \
  --issue-number <number>
```

**Result:** Stores START_TIME in memory for later calculation.

#### `report`
Report agent completion metrics (called at agent finish).

```bash
./utilities/metrics-reporter.md report \
  --agent-id <agent-id> \
  --issue-number <number> \
  --decision <PASS|FAIL|BLOCKED|REVISE|CREATE_PM_IDEA|DEFER|DROP> \
  --confidence <0.0-1.0> \
  [--notes "optional notes"]
```

**What it does:**
- Calculates duration = now - START_TIME
- Formats metric row
- Appends to Metrics-YYYY-MM-DD page
- Appends to <agent-id> page
- Commits and pushes to wiki
- Returns: `✓ Agent metric reported: <agent-id> #<issue> (<decision>, Xs)`

### Orchestrator Commands

#### `report-cycle`
Report orchestrator cycle metrics (called at cycle end).

```bash
./utilities/metrics-reporter.md report-cycle \
  --orchestrator <pm|po|dev|discovery> \
  --cycle-number <number> \
  --duration-seconds <number> \
  --issues-processed <number> \
  --issues-completed <number> \
  --agents-spawned <number>
```

**What it does:**
- Calculates success rate = completed / processed * 100
- Formats cycle row
- Appends to Cycles-<Orchestrator> page
- Appends to Metrics-YYYY-MM-DD page
- Commits and pushes to wiki
- Returns: `✓ Cycle metric reported: <orch> cycle <num> (Xs, X% complete)`

### Query Commands

#### `query-agent`
Show recent metrics for an agent.

```bash
./utilities/metrics-reporter.md query-agent <agent-id>
```

Returns: Last 10 metrics for that agent from wiki page.

#### `query-slowest`
Show slowest agents (last N days).

```bash
./utilities/metrics-reporter.md query-slowest [days]
```

Returns: Top slowest agents with average duration.

#### `query-cycles`
Show recent cycle metrics for an orchestrator.

```bash
./utilities/metrics-reporter.md query-cycles <orch> [limit]
```

Returns: Last N cycles for that orchestrator.

---

## Environment Variables

Optional configuration:

```bash
# GitHub repo (for wiki access)
export GITHUB_REPOSITORY="owner/repo"

# Local wiki cache (default: /tmp/wiki-repo)
export WIKI_CACHE_DIR="/tmp/wiki-repo"

# Agent start time (set automatically by 'start' command)
export AGENT_START_TIME="<unix timestamp>"
```

---

## Wiki Page Examples

### `Metrics-2026-07-09` (Daily Summary)

```markdown
# Metrics for 2026-07-09

| Time | Issue | Agent | Decision | Confidence | Duration | Model Tier |
|------|-------|-------|----------|------------|----------|-----------|
| 14:32:15 | #42 | intake | PASS | 0.98 | 12.3s | FAST |
| 14:32:47 | #43 | intake | BLOCKED | 0.85 | 18.5s | FAST |
| 14:33:04 | #42 | design | PASS | 0.96 | 42.1s | EXPENSIVE |
| 14:35:12 | #42 | build | COMPLETE | 0.99 | 18.7s | EXPENSIVE |
| 14:36:04 | #42 | qa | PASS | 0.94 | 31.2s | STANDARD |

## Orchestrator Cycles

| Cycle | Orchestrator | Duration | Processed | Completed | Success | Agents | Timestamp |
|-------|--------------|----------|-----------|-----------|---------|--------|-----------|
| 42 | dev | 90s | 5 | 3 | 60% | 6 | 2026-07-09T14:36:30Z |
```

### `intake` (Agent Page)

```markdown
# Agent Metrics: intake

| Time | Issue | Decision | Confidence | Duration | Date |
|------|-------|----------|------------|----------|------|
| 14:32:15 | #42 | PASS | 0.98 | 12.3s | 2026-07-09 |
| 14:32:47 | #43 | BLOCKED | 0.85 | 18.5s | 2026-07-09 |
| 09:15:22 | #39 | PASS | 0.99 | 11.8s | 2026-07-08 |
| 09:16:04 | #40 | REVISE | 0.82 | 22.1s | 2026-07-08 |
| 09:18:33 | #41 | PASS | 0.97 | 14.2s | 2026-07-08 |

## Statistics (Last 7 Days)
- Total runs: 47
- Average duration: 14.5s
- Success rate: 94.6%
- Min/Max: 8.2s / 24.1s
```

### `Cycles-Dev` (Orchestrator Page)

```markdown
# Orchestrator Cycles: Dev

| Cycle | Duration | Processed | Completed | Success | Agents | Timestamp |
|-------|----------|-----------|-----------|---------|--------|-----------|
| 40 | 85s | 5 | 4 | 80% | 5 | 2026-07-09T14:34:00Z |
| 41 | 92s | 6 | 3 | 50% | 7 | 2026-07-09T14:35:15Z |
| 42 | 90s | 5 | 3 | 60% | 6 | 2026-07-09T14:36:30Z |

## Summary
- Average cycle duration: 89s
- Average success rate: 63%
- Slowest cycle: #41 (92s)
- Typical agents per cycle: 6
```

---

## What NOT to Do

❌ Don't manually time agents  
❌ Don't manage wiki repos yourself  
❌ Don't format metrics manually  
❌ Don't commit to wiki manually  

✅ Just call the utility and forget it handles everything

---

## Zero-Config Behavior

If you don't set environment variables, the utility:
- Uses `$GITHUB_REPOSITORY` (from CI/CD or GitHub CLI context)
- Caches wiki repo in `/tmp/wiki-repo` (auto-manages)
- Creates pages automatically on first metric
- Formats tables automatically
- Commits with standard messages

### First-Run Setup

```bash
# Just run this once to verify wiki access:
gh repo view --json nameWithOwner
```

If that works, metrics-reporter.md will work.

---

## Integration Checklist

- [ ] Make utility executable: `chmod +x metrics-reporter.md`
- [ ] Add `./utilities/metrics-reporter.md start` to agent startup
- [ ] Add `./utilities/metrics-reporter.md report --agent-id ... --issue ... --decision ... --confidence ...` to agent completion
- [ ] Add `./utilities/metrics-reporter.md report-cycle` to orchestrator cycle end
- [ ] Test with one agent (check wiki page appears)
- [ ] Verify metrics appear in daily page
- [ ] Query metrics: `./utilities/metrics-reporter.md query-agent intake`
- [ ] Done! System auto-organizes metrics into wiki pages
