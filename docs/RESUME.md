# Resume

**State (2026-10-11):** `main` pushed at the CI fixes; 277 tests green. Steps → **Goal mode** → **Feature mode** all work end to end. Goal runs keep one warm Claude process (Sonnet 5.5, `/clear` between rounds); deps updated (agent-sdk 0.3, Electron 44, Playwright 1.64, TS pinned 6.0.3). New: swipe action (runner + both exporters), iOS side-by-side layout, "Set up CI" button (writes `.github/workflows/suziqai-tests.yml`), `SUZIQAI_TIMING=1` timing logs. Proven: pet-homepage CareTeam 8/8 in Xcode (pushed on its branch `fix/care-team-row-refresh`, no PR yet); TPS prod read-only feature run 4/8 verified (nothing committed to tps-web, by design).

**Next:**
1. Open the pet-homepage PR for `fix/care-team-row-refresh` (its CI workflow only runs on PRs/main/nightly; may overlap the existing `ios-tests.yml`).
2. Speed: steps are ~56% of a goal run, mostly XCUITest idle waits (fill ~3.1s, tap ~1.5s); the next lever is parallel simulators per scenario.
3. TPS stuck scenarios: Clear All popover, New JO dialog state, "More for this job order" missing on prod. iOS `{{env}}` secrets aren't supported in XCUITest export yet.

**Gotchas:**
- Launch for automation: `SUZIQAI_AUTO_APPROVE=1 SUZIQAI_NO_RESTORE=1 env -u ANTHROPIC_API_KEY npm run dev` (zshrc key has no credit).
- TypeScript 7 drops the JS compiler API spec-importer uses: stay on ~6.0. After Playwright upgrades run `npx playwright install chromium`.
- Shut down the suziQai iOS runner before `xcodebuild test` on the same simulator, or it hangs. Never launch pet-homepage without `--uitest` (real CloudKit store).
- TPS: production, read-only always; never-click list in memory `project_tps_no_safe_env`; creds only in `.env.local`. Rotate the TypeSafe key and TPS test password (both went through chat).
