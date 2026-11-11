## What does this PR do?

<!-- One or two sentences. Link the issue it closes, e.g. "Closes #12". -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behaviour)
- [ ] Documentation only
- [ ] Build / CI / tooling

## Which surface does it touch?

- [ ] `src/template.html` (UI, skins, themes, CSS)
- [ ] `src/app.js` (application logic, export, tables, search)
- [ ] `src/mermaid-flow.js` (MD FLOW renderer)
- [ ] `src/text-flow.js` (plain text → diagram)
- [ ] `desktop/` (Electron shell, installer, NSIS)
- [ ] `ios/` (PWA build)
- [ ] Docs / CI only

## How was it tested?

<!-- Paste the commands you ran and their result. -->

- [ ] `python src/build.py` rebuilt `dist/MDReader.html` without errors
- [ ] `python desktop/scripts/verify-portable.py` — 17/17 passing
- [ ] Relevant CDP verification script in `desktop/scripts/` or `tools/` passed
- [ ] Manually opened a `.md` in the built app and confirmed the change
- [ ] Checked light / dark / sepia and both skins (card, paper)

Regression output:

```
(paste here)
```

## Checklist

- [ ] The change keeps the **zero network request** guarantee (no new `fetch`, no CDN link, no external font)
- [ ] No Chinese/English string was duplicated where an existing helper exists
- [ ] If a build artifact changed, `dist/` was regenerated (not hand-edited)
- [ ] If an icon or dependency changed, the full re-packaging chain was run
- [ ] README / CHANGELOG updated when behaviour is user-visible
- [ ] No `node_modules`, `release*/`, screenshots from local debugging, or personal paths committed

## Screenshots (for UI changes)

<!-- Before / after, ideally at 1440px width. -->
