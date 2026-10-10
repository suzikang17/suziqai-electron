import SwiftUI

/// Placeholder host: XCUITest bundles must target an app, but the runner drives
/// the app under test by bundle id, so this one is never used.
@main
struct RunnerHostApp: App {
    var body: some Scene {
        WindowGroup { Text("suziQai runner host") }
    }
}
