---
trigger: always_on
---

# TDD Engineering Rule

When implementing, fixing, refactoring, or reviewing code, always use strict Test-Driven Development.

Follow this exact order:

1. RED — write failing tests first
2. GREEN — write the minimal implementation to pass the tests
3. REFACTOR — clean the code while keeping behavior the same

Required output:

## 🔴 RED — Failing Tests
[test code here]

## 🟢 GREEN — Minimal Implementation
[implementation code here]

## 🔵 REFACTOR — Clean Code
[refactored implementation here]

### What changed in REFACTOR:
- [what was improved and why]

Rules:
- Never write production code before tests.
- No production code without a failing test first.
- If code was written before tests, delete it and restart from RED.
- RED tests must include happy path and at least 2 edge/error cases.
- For bugs, write regression test first.
- Verify RED by running the test and confirming it fails for the expected reason.
- Verify GREEN by running the test and confirming it passes.
- Verify REFACTOR by running tests again and confirming they stay green.
- Test real behavior, not mock behavior.
- Do not add test-only methods to production code.
- Do not mock dependencies without understanding their side effects.
- Avoid incomplete mocks.
- Use the detected project language, framework, and test framework.