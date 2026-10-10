import Foundation
import Network

/// Minimal HTTP/1.1 server: one JSON request per connection, `POST /<command>`.
/// Requests are handed to `handler` on the main queue, where XCUITest APIs must run.
final class HTTPServer {
    typealias Handler = (_ command: String, _ body: [String: Any]) throws -> Any

    private let listener: NWListener
    private let handler: Handler
    private let queue = DispatchQueue(label: "suziqai.runner.http")

    init(port: UInt16, handler: @escaping Handler) throws {
        let params = NWParameters.tcp
        params.allowLocalEndpointReuse = true
        listener = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
        self.handler = handler
    }

    func start() {
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { return }
            connection.start(queue: self.queue)
            self.receive(on: connection, buffer: Data())
        }
        listener.start(queue: queue)
    }

    func stop() {
        listener.cancel()
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }

            if let request = Self.parse(buffer) {
                self.respond(to: request, on: connection)
            } else if isComplete || error != nil {
                connection.cancel()
            } else {
                self.receive(on: connection, buffer: buffer)
            }
        }
    }

    private func respond(to request: (path: String, body: Data), on connection: NWConnection) {
        let command = request.path.split(separator: "/").first.map(String.init) ?? ""
        let body = (try? JSONSerialization.jsonObject(with: request.body)) as? [String: Any] ?? [:]

        DispatchQueue.main.async {
            var status = "200 OK"
            var payload: Any
            do {
                payload = ["ok": true, "result": try self.handler(command, body)]
            } catch {
                status = "500 Internal Server Error"
                payload = ["ok": false, "error": "\(error)"]
            }
            let json = (try? JSONSerialization.data(withJSONObject: payload)) ?? Data("{}".utf8)
            var response = Data("HTTP/1.1 \(status)\r\nContent-Type: application/json\r\nContent-Length: \(json.count)\r\nConnection: close\r\n\r\n".utf8)
            response.append(json)
            connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
        }
    }

    /// Returns the path and body once the full request (headers + Content-Length bytes) has arrived.
    private static func parse(_ data: Data) -> (path: String, body: Data)? {
        guard let headerEnd = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        guard let header = String(data: data[..<headerEnd.lowerBound], encoding: .utf8) else { return nil }
        let lines = header.components(separatedBy: "\r\n")
        let parts = lines.first?.split(separator: " ") ?? []
        guard parts.count >= 2 else { return nil }

        let length = lines.dropFirst()
            .first { $0.lowercased().hasPrefix("content-length:") }
            .flatMap { Int($0.split(separator: ":")[1].trimmingCharacters(in: .whitespaces)) } ?? 0
        let body = data[headerEnd.upperBound...]
        guard body.count >= length else { return nil }
        return (String(parts[1]), Data(body.prefix(length)))
    }
}
