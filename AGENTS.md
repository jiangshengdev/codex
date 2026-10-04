# Documentation language

- This section applies only to files in this repository. It does not apply to online issues, including their titles, descriptions, and comments.
- Exception: `codex-gui-docs/**` is the Chinese documentation site. Its documentation text, titles, navigation labels, and locale configuration may remain in Chinese. This exception does not extend to domain documentation, ADRs, or other modules.
- Write project documentation in English, including headings, explanatory prose, and explanatory comments in examples.
- When creating or updating documentation, update its corresponding Chinese translation if one already exists. If no corresponding Chinese translation exists, do not create one or translate the document.
- Chinese text is allowed when its original wording matters to what the document quotes, matches, or verifies. Examples include user trigger phrases, required literal outputs, quoted UI labels or error messages, Chinese input samples, and actual names or paths. Preserve those literals; explain them in English.
- Avoid Chinese text when preserving its original wording serves no purpose. Do not use the literal-text exception to write ordinary explanations or whole sections in Chinese.
- A regular-expression match for Chinese characters is a review candidate, not proof of a violation. Check the surrounding context to distinguish meaningful source text from explanatory prose; do not mechanically translate every match.

# Codex GUI

- Before editing files under `codex-gui/**`, read `codex-gui/AGENTS.md` and apply its frontend-specific rules.

# Rust/codex-rs

- Before working in `codex-rs/**`, read `codex-rs/AGENTS.md` and apply its Rust-specific rules.

## Agent skills

### Issue tracker

Use CNB Issues for this repository. Read `docs/agents/issue-tracker.md`
before starting task work or tracker operations, including when CNB is
unavailable.

### Triage labels

Use the five default triage state labels defined in
`docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout covering both the GUI and Rust backend.
See `docs/agents/domain.md`.
