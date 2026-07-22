# Contributing to Frame

Thanks for your interest in improving Frame! This is a small, framework-free
TypeScript codebase and contributions are welcome.

## Ground rules

1. **The lossless invariant is sacred.** Your photo's pixels must survive
   bit-for-bit. `tests/browser/lossless.test.ts` enforces this against real
   Chromium for every fill mode — it **must stay green**. If you touch anything
   in `src/core/layout.ts`, `src/render/frame.ts`, `src/render/fills.ts`, or
   `src/render/sequence.ts`, run the browser tests and keep them passing.
2. **Discuss big changes first** by opening an issue, so we agree on direction
   before you invest time.
3. **Match the house style.** No UI framework — imperative DOM + canvas,
   `$()` = typed `getElementById`. New formats/fills/motions/transitions are
   added by extending the config arrays in `src/core/config.ts`, not by
   hand-wiring DOM.

## Getting set up

```bash
npm install
npm run dev            # web app at http://localhost:5173
npm run dev:desktop    # the same app inside Electron
```

## Before you open a PR

```bash
npm run typecheck      # web + electron
npm test               # unit + real-Chromium pixel tests
```

Both must pass. If the browser tests can't find Chromium, run
`npx playwright install chromium`.

## Project layout

See the **Architecture** section of the [README](README.md) and the detailed
notes in [`CLAUDE.md`](CLAUDE.md), which explains the state model, the single
frame renderer, the two export engines, and the desktop split.

## Commit & PR

- Keep commits focused and write a clear message explaining the *why*.
- Reference any related issue.
- Include a screenshot or short clip for user-facing UI changes.

## Reporting bugs

Open an issue with:
- what you did, what you expected, what happened;
- your browser / OS (and whether you used the web or desktop app);
- a sample photo or the exact format/settings if it's a rendering issue.

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
