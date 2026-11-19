# Marker Manager

An After Effects ScriptUI panel (ExtendScript) for working with markers in bulk, with CSV and Reaper import. Open source, MIT. The README says what it does and how it's built; read it first.

## Rules

- ExtendScript is ES3. Everything in `src/` must parse as ES3 (`npm run verify` checks): no `let`/`const`, arrow functions, `Array.prototype.forEach`/`map`/`indexOf`, `String.prototype.trim`, `JSON` or trailing commas. Use `MM.util` and `MM.serial` instead.
- Keep the built script ASCII: write anything else as `\u....` escapes (the build refuses otherwise).
- Logic goes in `src/core/` (no After Effects, unit-tested under Node in `tests/`); only reading and writing After Effects goes in `src/ae/`. A new core file goes in `scripts/files.mjs`, in order.
- Every action that changes the project is one undo step (`undoable` in `src/ae/markers.jsx`), and works out all its changes before making any, so an error leaves things as they were.
- Don't name or describe other marker tools (commercial scripts or plugins) in the source, docs or commits.
- User-facing text (labels, help tips, messages, the README) is plain, short and in everyday words, with UK spelling and single dashes, never double.
- Before a commit: `npm run verify`, and `npm run test:ae` too when `src/ae/` or what it uses changed (it needs After Effects open, and adds and deletes a comp in its project, so only with one that's fine to change).
- A release needs `docs/release-notes/<version>.md` (no title; `## New`, `## Improved`, `## Fixed`, each left out if empty; a line a change, in the README's voice).
- Commit messages are short, to the point and witty if possible, with the detail in the body; one that changes the version has it in its subject (`Markers on the move; 0.2.0`). No `Co-Authored-By` line or any other attribution to Claude.
- `/commit` commits and pushes. `/patch`, `/minor` and `/major` make a release (`.claude/release.md`), stopping before it's published. `/install` builds it and copies it into After Effects.
