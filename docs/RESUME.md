# Resume

**State (2026-10-10, evening):** `main` pushed; 220+ tests green. Three layers now work end to end: steps → **Goal mode** (one sentence → observe/plan/act loop, Jev resolves elements, kept steps verified by a fresh replay) → **Feature mode** (Claude reads the project code → reviewed scenario plan → each scenario run as a goal → coverage report). Proven: TPS prod read-only (goal 6/6 verified; feature run in progress at wrap time — see devlog) and pet-homepage iOS (goal 6/6; feature run 4/7 verified before the `disabled`-assertion and self-contained-scenario fixes landed). Hooks export + run like CI; in-app assertions auto-retry like Playwright `expect`; Watch mode shows targets; read-only mode blocks writes and is built into exported specs. ADR: `docs/decisions/0001`.

**Next:**
1. Re-run the pet-homepage "care team" feature after the merges (expect the 3 stuck scenarios to pass); export and run the XCUITests; commit the suite to `pet-homepage` branch `test/suziqai-journeys`.
2. CI + reports: GitHub Actions workflow per repo (nightly + on push) running the exported suites with the Playwright HTML report / `xcodebuild` results as private artifacts; then a "Set up CI" action in suziQai that writes it.
3. Speed: goal rounds are Claude calls (~10–20s each). Try `SUZIQAI_GOAL_MODEL=claude-sonnet-5-5`, bigger batches per round, parallel simulators.

**Gotchas:**
- Launch for automation: `SUZIQAI_AUTO_APPROVE=1 SUZIQAI_NO_RESTORE=1 env -u ANTHROPIC_API_KEY npm run dev` (the `ANTHROPIC_API_KEY` in `~/.zshrc` has no credit; last project may be TPS prod). `SUZIQAI_DEVTOOLS=1` for DevTools.
- Commit before forking worktree agents (they branch from HEAD, not the working tree) and tell them to symlink `node_modules`.
- TPS: production only, read-only mode always; creds in `.env.local` (`TPS_TEST_*`); never-click list in memory `project_tps_no_safe_env`. Rotate the TypeSafe key and the TPS test password (both passed through chat).
- Build the iOS runner first (`npm run ios-runner:build`); Jev key in `.env.local` as `TYPESAFE_API_KEY`.
