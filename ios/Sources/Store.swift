import Foundation
import SwiftUI

/// Local persistence: this device's display name + recently opened projects.
enum Store {
    private static let d = UserDefaults.standard
    private static let nameKey = "latex-collab.userName"
    private static let recentsKey = "latex-collab.recents"

    static var userName: String {
        if let n = d.string(forKey: nameKey) { return n }
        let generated = "Usuario-" + String(UUID().uuidString.prefix(4))
        d.set(generated, forKey: nameKey)
        return generated
    }

    static func setUserName(_ n: String) { d.set(n, forKey: nameKey) }

    static func recents() -> [RecentProject] {
        guard let data = d.data(forKey: recentsKey),
              let list = try? JSONDecoder().decode([RecentProject].self, from: data) else { return [] }
        return list
    }

    static func upsertRecent(_ p: RecentProject) {
        var list = recents().filter { $0.key != p.key }
        list.insert(p, at: 0)
        if list.count > 30 { list = Array(list.prefix(30)) }
        if let data = try? JSONEncoder().encode(list) { d.set(data, forKey: recentsKey) }
    }

    static func removeRecent(_ key: String) {
        let list = recents().filter { $0.key != key }
        if let data = try? JSONEncoder().encode(list) { d.set(data, forKey: recentsKey) }
    }
}

extension Color {
    /// Parse "hsl(210, 70%, 55%)" (the server/desktop color format).
    init(hslString: String) {
        let nums = hslString
            .replacingOccurrences(of: "hsl(", with: "")
            .replacingOccurrences(of: ")", with: "")
            .replacingOccurrences(of: "%", with: "")
            .split(separator: ",")
            .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
        guard nums.count == 3 else { self = .accentColor; return }
        self = Color(hue: nums[0] / 360.0, saturation: nums[1] / 100.0, brightness: nums[2] / 100.0)
    }
}

extension String {
    /// Two-letter initials for an avatar chip.
    var initials: String {
        let parts = self.split(whereSeparator: { " -_".contains($0) })
        if parts.count >= 2 { return (parts[0].prefix(1) + parts[1].prefix(1)).uppercased() }
        return String(prefix(2)).uppercased()
    }
}
