import XCTest

/// Not a real test: it starts the command server and keeps the XCUITest session alive until
/// suziQai sends `shutdown` (or the session hits SUZIQAI_RUNNER_TIMEOUT seconds, default 1h).
/// Port comes from SUZIQAI_RUNNER_PORT (pass TEST_RUNNER_SUZIQAI_RUNNER_PORT to xcodebuild).
final class RunnerTests: XCTestCase {
    func testServe() throws {
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
            return try commands.handle(command, body)
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
