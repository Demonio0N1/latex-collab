import Foundation

struct ProjectFile: Codable, Identifiable, Hashable {
    let path: String
    let kind: String
    var id: String { path }
    var isTex: Bool { kind == "tex" }
}

struct ProjectSummary: Codable, Hashable {
    let id: String
    let name: String
    let createdAt: Double
}

struct JoinResponse: Codable {
    let project: ProjectSummary
    let files: [ProjectFile]
    let wsUrl: String
    let token: String
}

struct CreateResponse: Codable {
    let project: ProjectSummary
}

struct NetworkInfo: Codable {
    let addresses: [String]
    let port: Int
    let funnelUrl: String?
}

/// A live editing session the app is currently in.
struct Session: Hashable {
    let baseUrl: String     // e.g. http://192.168.1.20:5959 or https://x.ts.net
    let wsUrl: String       // ws(s)://host
    let token: String
    let project: ProjectSummary
    let password: String
    var files: [ProjectFile]

    static func == (a: Session, b: Session) -> Bool {
        a.baseUrl == b.baseUrl && a.project.id == b.project.id
    }
    func hash(into h: inout Hasher) { h.combine(baseUrl); h.combine(project.id) }
}

struct Peer: Codable, Identifiable, Hashable {
    let name: String
    let color: String
    var id: String { name }
}

/// A project the user opened before (stored locally to reopen quickly).
struct RecentProject: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let baseUrl: String
    let password: String
    var key: String { "\(id)@\(baseUrl)" }
}
