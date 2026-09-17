import SwiftUI

struct JoinProjectView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) var dismiss

    @State private var link = ""
    @State private var server = ""
    @State private var projectId = ""
    @State private var password = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Pega un link de invitación") {
                    TextField("https://…/open?…  o  latexcollab://…", text: $link)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onChange(of: link) { _, new in applyLink(new) }
                }
                Section("O a mano") {
                    TextField("Servidor (https://tu-servidor.ts.net)", text: $server)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("ID del proyecto", text: $projectId).autocorrectionDisabled()
                    TextField("Contraseña", text: $password).autocorrectionDisabled()
                }
                if let error { Text(error).foregroundColor(.red).font(.footnote) }
                Section {
                    Button { Task { await join() } } label: {
                        Text(busy ? "Uniendo…" : "Unirse").frame(maxWidth: .infinity)
                    }
                    .disabled(busy || projectId.isEmpty || password.isEmpty || server.isEmpty)
                }
            }
            .navigationTitle("Unirse")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
            .onAppear {
                if let p = state.joinPrefill {
                    server = p.baseUrl; projectId = p.id; password = p.password
                }
            }
        }
    }

    private func applyLink(_ raw: String) {
        if let p = InviteLink.parse(raw) {
            server = p.baseUrl; projectId = p.projectId; password = p.password
        }
    }

    private func normalizedServer() -> String {
        var s = server.trimmingCharacters(in: .whitespaces)
        if !s.hasPrefix("http://") && !s.hasPrefix("https://") {
            s = (s.range(of: #":\d+$"#, options: .regularExpression) != nil ? "http://" : "https://") + s
        }
        return s
    }

    private func join() async {
        busy = true; error = nil
        let base = normalizedServer()
        do {
            let resp = try await Api(baseUrl: base).join(projectId: projectId, password: password)
            state.open(sessionFrom(resp, baseUrl: base, password: password))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}

struct ShareView: View {
    @Environment(\.dismiss) var dismiss
    let session: Session
    @State private var addresses: [String] = []
    @State private var funnelUrl: String?
    @State private var copied = false

    private var effectiveBase: String {
        // Prefer a globally-reachable Funnel URL; otherwise the base we're on.
        funnelUrl ?? session.baseUrl
    }
    private var link: String {
        InviteLink.build(baseUrl: effectiveBase, projectId: session.project.id, password: session.password)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Link para compartir") {
                    Text(link).font(.system(size: 12, design: .monospaced)).textSelection(.enabled)
                    Button {
                        UIPasteboard.general.string = link
                        copied = true
                    } label: { Label(copied ? "Copiado" : "Copiar link", systemImage: "doc.on.doc") }
                }
                Section("O a mano") {
                    LabeledContent("ID", value: session.project.id)
                    LabeledContent("Contraseña", value: session.password)
                }
                if funnelUrl != nil {
                    Text("🌐 Link público (Tailscale Funnel): funciona para cualquiera, sin instalar nada.")
                        .font(.footnote).foregroundColor(.secondary)
                } else {
                    Text("Quien se una necesita alcanzar \(effectiveBase). En la misma red o por Tailscale.")
                        .font(.footnote).foregroundColor(.secondary)
                }
            }
            .navigationTitle("Compartir")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Listo") { dismiss() } } }
            .task {
                if let info = try? await Api(baseUrl: session.baseUrl).networkInfo() {
                    addresses = info.addresses
                    funnelUrl = info.funnelUrl
                }
            }
        }
    }
}
