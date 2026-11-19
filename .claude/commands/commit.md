---
description: Commit what has changed and push it - a short, witty subject, the detail in the body
argument-hint: [anything the message should mention]
---
Commit the work in progress. $ARGUMENTS

1. Look at all of it: `git status` and `git diff`, staged and not. Leave out anything that was only ever temporary (a scratch test, a probe, a file of notes) and say what was left out.
2. Run the checks CLAUDE.md asks for before a commit: `npm run verify`, and `npm run test:ae` when `src/ae/` or what it uses changed (After Effects has to be open; if it isn't, say so and ask). If anything fails, stop and say what, rather than commit around it.
3. Write the message:
   - **Subject**: short, to the point and witty if possible - a few words, no full stop. If the commit changes the version in `package.json`, the subject ends with `; <version>` (`Markers on the move; 0.2.0`).
   - **Body**: the detail - what changed and why, as bullets, enough for someone reading the log months from now to follow without the diff.
   - Never a `Co-Authored-By` line, or any other attribution to Claude.
4. Commit, then push it to GitHub (`git push`; if GitHub has moved on, stop and say so rather than merge). Show what went (`git log -1 --stat`).
