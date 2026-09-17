import SwiftUI

@main
struct LaTeXCollabApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
                .onOpenURL { url in state.handleDeepLink(url.absoluteString) }
        }
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var session: Session?
    @Published var showNew = false
    @Published var showJoin = false
    @Published var showShare = false
    @Published var joinPrefill: (baseUrl: String, id: String, password: String)?
    @Published var errorText: String?
    @Published var recents: [RecentProject] = Store.recents()

    let userName = Store.userName

    func open(_ s: Session) {
        session = s
        showNew = false
        showJoin = false
        joinPrefill = nil
        Store.upsertRecent(.init(id: s.project.id, name: s.project.name, baseUrl: s.baseUrl, password: s.password))
        recents = Store.recents()
    }

    func leave() { session = nil }

    func removeRecent(_ key: String) {
        Store.removeRecent(key)
        recents = Store.recents()
    }

    func openRecent(_ r: RecentProject) async {
        do {
            let resp = try await Api(baseUrl: r.baseUrl).join(projectId: r.id, password: r.password)
            open(sessionFrom(resp, baseUrl: r.baseUrl, password: r.password))
        } catch {
            errorText = "No se pudo abrir \"\(r.name)\": \(error.localizedDescription)"
        }
    }

    func handleDeepLink(_ raw: String) {
        guard let parsed = InviteLink.parse(raw) else { return }
        Task {
            do {
                let resp = try await Api(baseUrl: parsed.baseUrl).join(projectId: parsed.projectId, password: parsed.password)
                open(sessionFrom(resp, baseUrl: parsed.baseUrl, password: parsed.password))
            } catch {
                joinPrefill = (baseUrl: parsed.baseUrl, id: parsed.projectId, password: parsed.password)
                showJoin = true
            }
        }
    }
}

func sessionFrom(_ resp: JoinResponse, baseUrl: String, password: String) -> Session {
    Session(baseUrl: baseUrl, wsUrl: resp.wsUrl, token: resp.token,
            project: resp.project, password: password, files: resp.files)
}
