---
name: gui-launch
description: Ordinary Codex GUI launch URL printing. Use when the user says `GUI 启动`, `启动 GUI`, `/gui`, asks for normal GUI URLs, or wants the same output as the CLI `/gui` command. Do not use for debugging, responsive-mode checks, screenshots, browser automation, or visual verification.
---

# GUI Launch

## Core Rules

- This is the ordinary GUI launch flow; behavior must match CLI `/gui`.
- Only call the outer Codex `launch_gui` tool and print the returned URL list.
- Do not run `.codex/skills/debug-responsive-gui/scripts/debug-responsive-gui.mjs`.
- Do not start or control a browser, use Playwright, enter responsive mode, take screenshots, or verify the page.
- Do not start, stop, or manage the `codex-gui` Vite dev server.
- Do not choose among LAN, Local, or VPN; do not add priority, fallback, availability checks, or URL filtering.
- URL, label, order, and token values must come from the current `launch_gui` result. Do not hand-write, guess, splice, or reuse old URLs.

## Output Format

After calling `launch_gui`, print all returned entries in the CLI `/gui` text format:

```text
GUI URLs:
  <label>:<padding><url>
```

Rules:

- The first line is exactly `GUI URLs:`. Do not include a real bullet character in the text; the TUI assistant message renderer adds the outer bullet to the first line on its own.
- Print one URL entry per following line: two spaces, label, colon, padding, URL.
- Use the CLI `/gui` alignment semantics for padding: align URL start columns based on the longest returned label.
- If only `Local` is returned, print only `Local`.
- If `Local`, `LAN`, `VPN`, or any other label is returned, print every entry in the order returned by `launch_gui`.
- Do not add extra explanation, Markdown links, debug status, verification results, or alternative addresses to the final response.

Example:

```text
GUI URLs:
  Local: http://127.0.0.1:12345/?threadId=t#token=x
  LAN:   http://192.168.3.165:12345/?threadId=t#token=x
  VPN:   http://100.88.28.119:12345/?threadId=t#token=x
```

## Error Handling

If `launch_gui` fails, report the failure using CLI `/gui` semantics:

```text
Failed to launch GUI: <error>
```

Do not automatically switch to the debug skill, start Vite, or open a browser.
