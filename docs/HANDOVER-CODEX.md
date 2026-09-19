# Handover to Codex: put Ribbit Rush live

Copy everything below the line into a new Codex thread. The repo is complete (v1.0.0, 311 tests,
all gates green, see `docs/specs/M10-report.md`). Codex's only job is publishing.

---

Goal:
Publish the finished browser game Ribbit Rush from the local git repo at E:\Games\frogger (branch
`master`, tag-worthy v1.0.0) to a new public GitHub repository and GitHub Pages, so Robin has a URL
to share.

Done when:
- A public repo `robindally/ribbit-rush` exists on GitHub with the full local history pushed and
  `master` as the default branch.
- GitHub Pages is enabled for that repo with source "GitHub Actions", and the included workflow
  `.github/workflows/deploy-pages.yml` has completed green (it runs typecheck, unit tests, build,
  and deploys `dist/`).
- The live URL (expected `https://robindally.github.io/ribbit-rush/`) loads the title screen,
  Start begins a level, the frog hops, and the browser console shows no errors.
- `node scripts/review.mjs --url <live url> --secs 15` runs against the live URL from
  E:\Games\frogger and reports `"errors": []` and at least one hop scored (score > 0).
- The live URL is added as a one-line "Play it: <url>" under the title in README.md, committed on
  `master`, and pushed (which triggers one more deploy that also goes green).
- A short report is returned with: repo URL, live URL, workflow run URL, the review harness
  output, and one screenshot of the live title screen.

Open Brain checks:
None. This is Robin's personal project, not WAAC or client work. No Open Brain reads or writes.

Sources:
- The repo itself: README.md ("Deploy" section), `vite.config.ts` (`base: './'` already set for a
  project-pages subpath), `.github/workflows/deploy-pages.yml` (already written), and
  `docs/specs/M10-report.md` for the verified gate results.
- GitHub docs for "Publishing with a custom GitHub Actions workflow" only if the Pages enablement
  step needs it.
- Preflight (connector-readiness): `gh auth status` must show account `robindally`; `git` and
  `node` 24 must be on PATH. Do not assume any other tool or connector is available.

Boundaries:
- Do not change game code, sprites, audio, level data, tests, or dependencies. The only permitted
  source edit is the README "Play it" line. If a Pages-specific config fix is genuinely required
  (for example a base path issue), make the minimal change, explain it in the report, and do not
  touch anything else.
- Do not deploy to Netlify, Vercel, or any other host. Do not buy or configure a custom domain.
- Do not force-push, rebase, squash, or rewrite history. Do not delete files or branches.
- Do not commit `dist/`, `coverage/`, or `node_modules/` (they are gitignored; keep it so).
- Do not change the LICENSE holder name; Robin will set it.
- Do not add repository secrets, collaborators, or GitHub Apps.
- Do not create the repo under any other owner or with any other name without asking.

Permissions:
- Read and write the local repo at E:\Games\frogger (commit only the README line).
- Create exactly one public GitHub repository under `robindally` named `ribbit-rush`, add it as
  `origin`, and push `master`.
- Enable GitHub Pages on that repo (source: GitHub Actions), for example
  `gh api -X POST repos/robindally/ribbit-rush/pages -f build_type=workflow`.
- Trigger or watch the workflow (`gh run watch`, `gh run list`).
- Everything else is read-only.

Verification:
1. `gh repo view robindally/ribbit-rush --json url,visibility,defaultBranchRef` shows public and
   `master`.
2. `gh run list --workflow deploy-pages.yml` shows the latest run `completed` / `success`; if it
   fails, read the log with `gh run view <id> --log-failed` before doing anything else.
3. `curl -sI <live url>` returns 200, and `curl -s <live url> | grep -c "Ribbit Rush"` is at
   least 1.
4. Headless play: `cd E:\Games\frogger && node scripts/review.mjs --url <live url> --secs 15
   --shots docs/screens/review/live`. Paste the JSON output. Playwright and its Chromium are
   already installed in this repo.
5. Open the live URL in a real browser, press Enter, hop once, screenshot the title screen.

Stop if:
- `gh auth status` is not logged in, or the account is not `robindally`.
- A repo named `ribbit-rush` already exists under `robindally` (ask which name to use).
- The workflow fails for a reason that would need a change outside `.github/workflows/` or
  `vite.config.ts` (report the failing step and log excerpt, do not patch game code).
- The live page loads but shows a blank or black canvas, or assets return 404 (report with the
  network log; the likely cause is the base path, which is the one config edit allowed).
- Anything asks for a secret, token, payment, or a custom domain.

Receipts:
- Repo URL, live URL, and the successful workflow run URL.
- The `review.mjs` JSON output against the live URL.
- The live title screenshot path.
- The README diff (one line) and the commit hash that added it.
- A one-paragraph note of anything that deviated from this prompt.

First action:
```
cd E:\Games\frogger && gh auth status && git status --short && git log --oneline | head -3
```
Then, if clean and logged in as robindally:
```
gh repo create ribbit-rush --public --source=. --remote=origin --push --description "Ribbit Rush: a Frogger reimagining. Designed by Claude Fable, coded by Claude Sonnet."
```
