import XCTest

struct RunnerError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// The commands suziQai sends. Each one runs on the main queue against the app under test.
/// To add a capability, add a case here and a method on the Node driver.
final class Commands {
    private var app: XCUIApplication?

    func handle(_ command: String, _ body: [String: Any]) throws -> Any {
        switch command {
        case "health":
            return ["status": "ready"]

        case "launch":
            guard let bundleId = body["bundleId"] as? String else { throw RunnerError("launch needs bundleId") }
            let app = XCUIApplication(bundleIdentifier: bundleId)
            app.launchArguments = body["args"] as? [String] ?? []
            app.launch()
            guard app.wait(for: .runningForeground, timeout: 15) else { throw RunnerError("\(bundleId) did not reach foreground") }
            self.app = app
            return ["state": "runningForeground"]

        case "tree":
            return serialize(try currentApp().snapshot())

        case "tap":
            let element = try find(body["query"] as? [String: Any] ?? [:])
            element.tap()
            return ["tapped": true]

        case "type":
            guard let text = body["text"] as? String else { throw RunnerError("type needs text") }
            if let query = body["query"] as? [String: Any] {
                let element = try find(query)
                if body["replace"] as? Bool == true {
                    // fill semantics: replace the value. Tap the trailing edge so the cursor lands after it.
                    element.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
                    if let current = element.value as? String, !current.isEmpty, current != element.placeholderValue {
                        element.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
                    }
                } else {
                    element.tap()
                }
                if !text.isEmpty { element.typeText(text) }
            } else {
                try currentApp().typeText(text)
            }
            return ["typed": text.count]

        case "tapAt":
            // Coordinate tap from a frame we already have: skips the element query's existence wait
            guard let x = body["x"] as? Double, let y = body["y"] as? Double else { throw RunnerError("tapAt needs x and y") }
            try currentApp().coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y)).tap()
            return ["tapped": true]

        case "swipe":
            let target: XCUIElement = try (body["query"] as? [String: Any]).map(find) ?? currentApp()
            switch body["direction"] as? String {
            case "up": target.swipeUp()
            case "down": target.swipeDown()
            case "left": target.swipeLeft()
            case "right": target.swipeRight()
            default: throw RunnerError("swipe needs direction up|down|left|right")
            }
            return ["swiped": true]

        case "screenshot":
            return ["png": XCUIScreen.main.screenshot().pngRepresentation.base64EncodedString()]

        case "alert":
            // System alerts (permissions etc.) belong to SpringBoard, not the app under test
            let alert = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
            guard alert.exists else { return ["present": false] }
            let buttons = alert.buttons.allElementsBoundByIndex.map(\.label)
            if let label = body["tap"] as? String {
                guard buttons.contains(label) else { throw RunnerError("alert has no button \(label); has \(buttons)") }
                alert.buttons[label].tap()
                return ["present": true, "tapped": label]
            }
            return ["present": true, "title": alert.label, "buttons": buttons]

        default:
            throw RunnerError("unknown command: \(command)")
        }
    }

    private func currentApp() throws -> XCUIApplication {
        guard let app else { throw RunnerError("no app launched; send launch first") }
        return app
    }

    /// Finds one element by type, identifier and/or label, plus an index when several match.
    private func find(_ query: [String: Any]) throws -> XCUIElement {
        let app = try currentApp()
        let type = (query["type"] as? String).flatMap { ElementTypes.byName[$0] } ?? .any
        var predicates: [NSPredicate] = []
        if let id = query["id"] as? String { predicates.append(NSPredicate(format: "identifier == %@", id)) }
        if let label = query["label"] as? String { predicates.append(NSPredicate(format: "label == %@", label)) }
        if let contains = query["labelContains"] as? String { predicates.append(NSPredicate(format: "label CONTAINS %@", contains)) }
        if let placeholder = query["placeholder"] as? String { predicates.append(NSPredicate(format: "placeholderValue == %@", placeholder)) }

        let matches = app.descendants(matching: type)
            .matching(NSCompoundPredicate(andPredicateWithSubpredicates: predicates))
        let element = matches.element(boundBy: query["index"] as? Int ?? 0)
        guard element.waitForExistence(timeout: 5) else { throw RunnerError("no element matches \(query)") }
        return element
    }

    private func serialize(_ snapshot: XCUIElementSnapshot) -> [String: Any] {
        let f = snapshot.frame
        var node: [String: Any] = [
            "type": ElementTypes.name(for: snapshot.elementType),
            "id": snapshot.identifier,
            "label": snapshot.label,
            "enabled": snapshot.isEnabled,
            "selected": snapshot.isSelected,
            "frame": [f.origin.x, f.origin.y, f.size.width, f.size.height],
        ]
        if let value = snapshot.value { node["value"] = "\(value)" }
        if let placeholder = snapshot.placeholderValue { node["placeholder"] = placeholder }
        let children = snapshot.children.map(serialize)
        if !children.isEmpty { node["children"] = children }
        return node
    }
}

enum ElementTypes {
    static let byName: [String: XCUIElement.ElementType] = [
        "application": .application, "window": .window, "other": .other, "button": .button,
        "staticText": .staticText, "textField": .textField, "secureTextField": .secureTextField,
        "textView": .textView, "searchField": .searchField, "switch": .switch, "toggle": .toggle,
        "cell": .cell, "link": .link, "image": .image, "segmentedControl": .segmentedControl,
        "slider": .slider, "stepper": .stepper, "picker": .picker, "pickerWheel": .pickerWheel,
        "datePicker": .datePicker, "menuItem": .menuItem, "tabBar": .tabBar, "navigationBar": .navigationBar,
        "scrollView": .scrollView, "table": .table, "collectionView": .collectionView, "alert": .alert,
        "sheet": .sheet, "keyboard": .keyboard, "key": .key, "toolbar": .toolbar, "group": .group,
    ]
    private static let byType = Dictionary(uniqueKeysWithValues: byName.map { ($1.rawValue, $0) })

    static func name(for type: XCUIElement.ElementType) -> String {
        byType[type.rawValue] ?? "type\(type.rawValue)"
    }
}
