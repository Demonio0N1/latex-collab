import Foundation

enum ApiError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(m) = self { return m }; return nil }
}

/// REST client for the LaTeX Collab server. `baseUrl` is like
/// "http://192.168.1.20:5959" or "https://mymac.tailnet.ts.net".
struct Api {
    let baseUrl: String

    private func url(_ path: String) -> URL { URL(string: baseUrl + path)! }

    private func send<T: Decodable>(_ req: URLRequest, _ type: T.Type) async throws -> T {
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw ApiError.message("No response") }
        if !(200...299).contains(http.statusCode) {
            if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let err = obj["error"] as? String {
                throw ApiError.message(err)
            }
            throw ApiError.message("Request failed (\(http.statusCode))")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func jsonRequest(_ path: String, method: String, body: [String: Any?]) -> URLRequest {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let clean = body.compactMapValues { $0 }
        req.httpBody = try? JSONSerialization.data(withJSONObject: clean)
        return req
    }

    func networkInfo() async throws -> NetworkInfo {
        try await send(URLRequest(url: url("/api/network-info")), NetworkInfo.self)
    }

    func templates() async throws -> [String] {
        struct R: Decodable { let templates: [String] }
        return try await send(URLRequest(url: url("/api/templates")), R.self).templates
    }

    func createProject(name: String, password: String, template: String?) async throws -> ProjectSummary {
        let req = jsonRequest("/api/projects", method: "POST",
                              body: ["name": name, "password": password, "template": template])
        return try await send(req, CreateResponse.self).project
    }

    func join(projectId: String, password: String) async throws -> JoinResponse {
        let req = jsonRequest("/api/projects/\(projectId)/join", method: "POST",
                              body: ["password": password])
        return try await send(req, JoinResponse.self)
    }

    func listFiles(projectId: String) async throws -> [ProjectFile] {
        struct R: Decodable { let files: [ProjectFile] }
        return try await send(URLRequest(url: url("/api/projects/\(projectId)/files")), R.self).files
    }
}

/// A clickable/pasteable share link, matching the desktop app's format.
enum InviteLink {
    /// Parse either the http(s) landing link (…/open?host=&id=&key=) or the
    /// raw latexcollab:// deep link into its parts.
    static func parse(_ raw: String) -> (baseUrl: String, projectId: String, password: String)? {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        func inferBase(_ host: String) -> String {
            // Our LAN links carry an explicit :port; a Tailscale Funnel host
            // never does — so "has a port" tells http from https.
            let hasPort = host.range(of: #":\d+$"#, options: .regularExpression) != nil
            return (hasPort ? "http://" : "https://") + host
        }
        if s.hasPrefix("latexcollab://") {
            guard let u = URLComponents(string: s.replacingOccurrences(of: "latexcollab://", with: "http://")) else { return nil }
            let projectId = u.path.replacingOccurrences(of: "/", with: "")
            let key = u.queryItems?.first(where: { $0.name == "key" })?.value ?? ""
            guard !projectId.isEmpty, !key.isEmpty, let host = u.host else { return nil }
            let hostPort = u.port.map { "\(host):\($0)" } ?? host
            return (inferBase(hostPort), projectId, key)
        }
        guard let u = URLComponents(string: s),
              let host = u.queryItems?.first(where: { $0.name == "host" })?.value,
              let id = u.queryItems?.first(where: { $0.name == "id" })?.value,
              let key = u.queryItems?.first(where: { $0.name == "key" })?.value
        else { return nil }
        return (inferBase(host), id, key)
    }

    static func build(baseUrl: String, projectId: String, password: String) -> String {
        let host = baseUrl.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
        var c = URLComponents()
        c.queryItems = [.init(name: "host", value: host), .init(name: "id", value: projectId), .init(name: "key", value: password)]
        let q = c.percentEncodedQuery ?? ""
        return "\(baseUrl)/open?\(q)"
    }
}
