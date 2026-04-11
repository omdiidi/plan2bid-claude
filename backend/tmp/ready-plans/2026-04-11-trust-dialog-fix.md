# Plan: Definitively Fix the Trust Dialog on Worker Mac Mini

## Problem
Claude Code shows a "Do you trust this folder?" dialog when opening a new temp directory. This blocks automated estimation runs. We've tried pre-config and auto-Enter but haven't verified what actually works on the Mac Mini.

## Phase 1: Test (user runs on Mac Mini)

Give the worker Claude Code session this diagnostic prompt:

```
Run these tests and report results for each:

TEST 1 — Check current ~/.claude.json:
cat ~/.claude.json 2>/dev/null | python3 -m json.tool || echo "File missing or invalid"

TEST 2 — Write pre-trust for a test dir, both /tmp and /private/tmp paths:
python3 -c "
import json, os
p = os.path.expanduser('~/.claude.json')
c = json.load(open(p)) if os.path.exists(p) else {}
proj = c.setdefault('projects', {})
for d in ['/tmp/trust_test', '/private/tmp/trust_test', '/tmp', '/private/tmp']:
    proj[d] = {'hasTrustDialogAccepted': True}
json.dump(c, open(p, 'w'), indent=2)
print('Written. Projects:', list(proj.keys()))
"

TEST 3 — Create test dir and launch claude in a NEW Terminal:
mkdir -p /tmp/trust_test
echo "say hello" > /tmp/trust_test/_prompt.txt
osascript -e 'tell application "Terminal" to do script "cd /tmp/trust_test && claude --dangerously-skip-permissions \"say hello\""'

TEST 4 — Watch the new Terminal window for 10 seconds. Report:
a) Did the trust dialog appear? (yes/no)
b) If yes, what exactly did it say?
c) Did Claude process the "say hello" prompt?
d) Screenshot if possible

TEST 5 — If trust dialog appeared, try with --trust-project flag:
osascript -e 'tell application "Terminal" to do script "cd /tmp/trust_test && claude --dangerously-skip-permissions --trust-project \"say hello\""'

Report: did --trust-project skip the dialog?
```

## Phase 2: Implement Based on Results

### If pre-trust config WORKS (no dialog in Test 4):
- Keep current implementation as-is
- Remove the conditional auto-Enter entirely — it's not needed
- The _ensure_directory_trusted function handles everything

### If pre-trust config FAILS (dialog still appears):

**Option A — auto-Enter with correct timing:**
- The trust dialog blocks Claude Code completely
- Nothing else runs until it's dismissed
- Use auto-Enter but tune the delay based on Test 4 observations
- The Enter can ONLY hit the trust dialog since nothing else is on screen

**Option B — use `yes | claude` to pipe Enter via stdin:**
```bash
echo "" | claude --dangerously-skip-permissions "$(cat _prompt.txt)"
```
This pipes a single Enter to stdin immediately. If the trust dialog reads from stdin, this dismisses it. If not, it has no effect.

**Option C — use `--trust-project` flag (if it exists in v2.1.101):**
```bash
claude --dangerously-skip-permissions --trust-project "$(cat _prompt.txt)"
```

**Option D — use `expect` to detect the dialog text and respond:**
```bash
brew install expect  # one-time
expect -c '
spawn claude --dangerously-skip-permissions "$(cat _prompt.txt)"
expect {
    "trust" { send "\r" }
    timeout { }
}
interact
'
```
This only sends Enter when it sees "trust" in the output. Most reliable but requires expect.

### Decision Tree:
```
Test 4: trust dialog appears?
├── NO  → Keep current code, remove auto-Enter. Done.
├── YES → Test 5: --trust-project works?
│   ├── YES → Add --trust-project flag. Done.
│   └── NO  → Try Option B (stdin pipe)
│       ├── Works → Use it. Done.
│       └── Fails → Use Option D (expect). Done.
```

## Files Being Changed

```
worker repo:
  worker.py    ← MODIFIED (based on test results)
```

## Confidence: 9/10
Once we know which approach works (from the test), the implementation is trivial. The uncertainty is only in which approach to use.
