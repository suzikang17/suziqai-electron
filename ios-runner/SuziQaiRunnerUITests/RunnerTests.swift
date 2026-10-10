import XCTest

/// Not a real test: it starts the command server and keeps the XCUITest session alive until
/// suziQai sends `shutdown` (or the session hits SUZIQAI_RUNNER_TIMEOUT seconds, default 1h).
/// Port comes from SUZIQAI_RUNNER_PORT (pass TEST_RUNNER_SUZIQAI_RUNNER_PORT to xcodebuild).
final class RunnerTests: XCTestCase {
    /// Failures XCTest records during the current command (e.g. a tap on an element that can't be
    /// scrolled into view). Recorded normally they'd fail — and end — the whole serving session.
    private var issues: [String] = []

    override func record(_ issue: XCTIssue) {
        issues.append(issue.compactDescription)
    }

    func testServe() throws {
        continueAfterFailure = true
        let env = ProcessInfo.processInfo.environment
        let port = UInt16(env["SUZIQAI_RUNNER_PORT"] ?? "") ?? 22087
        let timeout = TimeInterval(env["SUZIQAI_RUNNER_TIMEOUT"] ?? "") ?? 3600

        let commands = Commands()
        var running = true
        let server = try HTTPServer(port: port) { command, body in
            if command == "shutdown" {
                running = false
                return ["stopping": true]
            }
            self.issues.removeAll()
            let result = try commands.handle(command, body)
            if !self.issues.isEmpty { throw RunnerError(self.issues.joined(separator: "; ")) }
            return result
        }
        server.start()
        print("SUZIQAI_RUNNER_READY port=\(port)")

        let deadline = Date().addingTimeInterval(timeout)
        while running && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        server.stop()
    }
}
