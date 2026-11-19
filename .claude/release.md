# Making a release

What `/patch`, `/minor` and `/major` do, once they have said how the version goes up. The README's "Releasing" says how a release is published; this is everything up to that.

1. **Start from GitHub's.** On `main`, up to date with GitHub (`git pull --ff-only`). Work in progress is left uncommitted: it goes out in the release's own commit, with its release notes. Say what is uncommitted, and leave out anything that was only ever temporary, as `/commit` would.
2. **The new version.** From `package.json`'s, bumped as asked: `npm version <version> --no-git-tag-version`, which changes `package-lock.json` too.
3. **Draft the release notes**, `docs/release-notes/<version>.md`: what has changed since the last release (`git log v<previous>..HEAD`, and the diff where a subject doesn't say enough; every commit if there is no tag yet), and what is uncommitted. No title, then `## New`, `## Improved` and `## Fixed`, each left out if it has nothing, bullets in the README's voice - what someone using the panel would notice, not how it was done. A bullet a change, a line each. If they have already been written, they are a draft like any other: check them against all of that and still stop and ask at step 6.
4. **Bring the README up to date** with anything new or changed in this release, in its own voice.
5. **Check it**: `npm run verify`, and `npm run test:ae` with After Effects open (ask if it isn't). Stop and say what fails rather than release around it.
6. **Stop and ask for the release notes and README to be checked.** Show the release notes in full, what changed in the README (`git diff README.md`), and any spelling, grammar or punctuation fixes proposed (UK spelling, single dashes, names of settings as the panel shows them). Commit nothing until told they are right.
7. **Carry their wording through**: the same words for the same things in the panel's labels, help tips and messages, and the comments. Then `npm run verify` again.
8. **Commit it and push it**, as `/commit` does: a short, witty subject ending `; <version>`, the detail in the body. Pushing the commit publishes nothing; the tag does.
9. **Stop and ask before publishing**: whether to tag and push, as pushing `v<version>` is what builds and publishes the release. Only once told to: `git tag v<version>` and `git push origin v<version>`.
