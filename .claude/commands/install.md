---
description: Build the panel and install it in After Effects
argument-hint: [the After Effects to install in, e.g. "Adobe After Effects 2026"]
---
Build the panel and install it in After Effects, to try it there.

1. **Which After Effects.** The one given (`$ARGUMENTS`), which is then written to `.claude/ae-version` (ignored by git) for next time. With none, use the one kept there and say so; with none kept either, the newest installed (`scripts/install.mjs` picks it).
2. **Install it**: `npm run install:ae -- "<that After Effects>"`. The ScriptUI Panels folder belongs to the system, so it may need a password: if it does, say so and give the command to run.
3. **Say what to do next**: restart After Effects (a panel already open there keeps running the old code until then) and open **Window > Marker Manager.jsx**. Say too what is in it that isn't committed, if anything.
