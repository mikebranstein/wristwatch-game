# Utility: GitHub Wiki Manager

An autonomous expert librarian utility that manages GitHub wiki repositories for research artifacts and organizational knowledge.

## Purpose

Self-organizing wiki repository for AIOS research artifacts. Utility learns structure from existing content, organizes new submissions automatically, prevents duplicates, and maintains master index.

## How Agents Use This Utility

Agents call this utility (don't just read it like contracts). It's an executable tool.

```bash
Agent calls: Call the wiki-manager utility with action and parameters
Utility executes: Performs git operations (clone, commit, push, reorganize)
Utility returns: Structured JSON result
Agent uses: The returned result to proceed
```

## Agent Interface (Actions)

Agents can call two actions:

### **search** - Find existing content

```json
{
  "action": "search",
  "repo": "owner/repo",
  "query": "[search term]"
}
```

**Returns:**
```json
{
  "status": "success|error",
  "total_found": 1,
  "results": [
    {
      "page": "[page name]",
      "match_score": 0.98,
      "snippet": "[excerpt]"
    }
  ]
}
```

### **write-content** - Store research findings

```json
{
  "action": "write-content",
  "repo": "owner/repo",
  "content_type": "[type]",
  "subject": "[subject]",
  "content": "[markdown content]",
  "status": "Complete | In Progress | Deferred",
  "confidence": "HIGH | MEDIUM | LOW",
  "github_issue": "#[issue]",
  "findings_summary": "[one-liner]"
}
```

**Returns:**
```json
{
  "status": "success",
  "committed": true,
  "reorganized": false,
  "note": "Content committed to wiki."
}
```

## Key Features

✅ **Expert librarian, not passive storage** — Utility owns organization and maintenance  
✅ **Autonomous optimization** — Evaluates and reorganizes wiki automatically to maintain quality  
✅ **Index as source of truth** — Master index always accurate and complete  
✅ **Agents specify semantics** — Agents define content_type and subject; utility handles structure  
✅ **Skill owns structure** — Utility decides WHERE and HOW based on patterns  
✅ **Post-reorganization rigor** — Always audits and updates index after changes  
✅ **Generic by design** — Works with any content types agents define

## Prerequisites

- GitHub CLI (`gh`) installed and authenticated
- Git installed
- PowerShell 5.1+
- Wiki enabled on target repo

## Workspace Safety (Mandatory)

- All clone/write/commit operations must run in an isolated temporary workspace.
- Never perform wiki file operations in invocation directory or repository root.
- Cross-platform temp roots:
  - Bash (Linux/macOS): `${TMPDIR:-/tmp}`
  - PowerShell (Windows): `$env:TEMP`
- Utility must clean up temp workspace on success and failure.

## Internal Workflow

When an agent calls write-content:

1. Utility discovers current wiki structure and organization patterns
2. Utility calculates organization "messiness" metric
3. If messiness exceeds threshold → **automatically reorganizes**:
   - Restructures wiki to improve coherence
   - Audits all pages accounted for
   - Analyzes for gaps and orphaned content
   - Updates Content-Index
4. Writes new content to optimized structure
5. Returns response indicating if reorganization occurred

## Master Index Format

Content-Index.md (auto-maintained in wiki root):

```markdown
# Content-Index

Master registry of all content.

| Subject | Type | Status | Wiki Page | Last Updated | GitHub Issue | Confidence | Summary |
|---------|------|--------|-----------|--------------|--------------|------------|---------|
| [subject] | [type] | ✅ Complete | [location] | 2026-07-08 | #1025 | HIGH | [one-liner] |
```

## Typical Research Workflow

```
Step 0: Pre-flight check
CALL wiki-manager: search("[subject]")
→ If found and complete: reuse existing

Step 1-3: Conduct research/analysis

Step 4: Write findings
CALL wiki-manager: write-content
{
  "content_type": "[type]",
  "subject": "[subject]",
  "content": "[findings]",
  "status": "Complete",
  "confidence": "HIGH"
}
→ Utility writes + auto-reorganizes + updates index

Step 5: Close issue
```

## Key Difference from Contracts

| Contracts | Utilities |
|-----------|-----------|
| Read-only reference documents | Executable tools |
| Agents read and apply internally | Agents call with parameters |
| Define decision criteria | Perform complex operations |
| Return nothing to agent | Return structured results |
