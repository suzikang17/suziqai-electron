# Resume

**State (2026-10-10):** `main` = `a2ee808`, 163 tests green. Jev (TypeSafe) picks elements for web video import and for iOS. iOS projects work end to end in the app: Web/iOS switch → simulator view → chat → steps resolved by Jev → Save writes XCUITest `.swift`. Verified on pet-homepage: 12/12 steps, and the export passes on two app versions.

**Next:**
1. Polish iOS mode: hide web-only UI (device picker, Pick, back/forward), add an explicit simulator picker, and hoist repeated element expressions into `let`s in `generateXCUITest`.
2. Faster iOS taps: actions take 1.4–3s because XCUITest waits for the UI to settle. Measure `tapAt` versus query taps.
3. TPS job-order tests are blocked until a separate test environment exists. Don't run against tps-web.

**Gotchas:**
- Launch for automation with `SUZIQAI_NO_RESTORE=1 env -u ANTHROPIC_API_KEY npm run dev`. The `ANTHROPIC_API_KEY` in `~/.zshrc` has no credit, and the last project is TPS production.
- The iOS runner must be built first (`npm run ios-runner:build`). The Jev key goes in gitignored `.env.local` as `TYPESAFE_API_KEY`.
- `npm run dev` can race Vite and show an error page; reload the window.
- Old builds of an app may sit on other simulators. suziQai picks the most recent install, and the chosen simulator is saved in `.suziqai/config.json`.
