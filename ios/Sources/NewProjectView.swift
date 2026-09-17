import SwiftUI

struct NewProjectView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) var dismiss

    @State private var server = Store.recents().first?.baseUrl ?? ""
    @State private var name = ""
    @State private var password = String(UUID().uuidString.prefix(8)).lowercased()
    @State private var templates: [String] = []
    @State private var template: String? = nil
    @State private var busy = false
    @State private var error: String?

    private let labels = ["article": "Artículo", "report": "Reporte", "beamer": "Presentación", "cv": "CV"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Servidor") {
                    TextField("https://tu-servidor.ts.net", text: $server)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Text("La dirección de tu servidor LaTeX Collab (Funnel o IP de red).")
                        .font(.caption).foregroundColor(.secondary)
                }
                Section("Proyecto") {
                    TextField("Nombre (ej. tesis-cap3)", text: $name).autocorrectionDisabled()
                    TextField("Contraseña para compartir", text: $password).autocorrectionDisabled()
                }
                Section("Plantilla") {
                    Picker("Plantilla", selection: $template) {
                        Text("En blanco").tag(String?.none)
                        ForEach(templates, id: \.self) { t in
                            Text(labels[t] ?? t).tag(String?.some(t))
                        }
                    }
                }
                if let error { Text(error).foregroundColor(.red).font(.footnote) }
                Section {
                    Button { Task { await create() } } label: {
                        Text(busy ? "Creando…" : "Crear proyecto").frame(maxWidth: .infinity)
                    }
                    .disabled(busy || name.isEmpty || server.isEmpty)
                }
            }
            .navigationTitle("Nuevo proyecto")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() } } }
            .task { await loadTemplates() }
        }
    }

    private func normalizedServer() -> String {
        var s = server.trimmingCharacters(in: .whitespaces)
        if !s.hasPrefix("http://") && !s.hasPrefix("https://") {
            s = (s.range(of: #":\d+$"#, options: .regularExpression) != nil ? "http://" : "https://") + s
        }
        return s
    }

    private func loadTemplates() async {
        guard !server.isEmpty else { return }
        templates = (try? await Api(baseUrl: normalizedServer()).templates()) ?? []
    }

    private func create() async {
        busy = true; error = nil
        let base = normalizedServer()
        do {
            let api = Api(baseUrl: base)
            let project = try await api.createProject(name: name, password: password, template: template)
            let resp = try await api.join(projectId: project.id, password: password)
            state.open(sessionFrom(resp, baseUrl: base, password: password))
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
