import SwiftUI

struct RootView: View {
    @EnvironmentObject var state: AppState

    var body: some View {
        ZStack {
            Theme.bgApp.ignoresSafeArea()
            if let session = state.session {
                EditorView(session: session)
                    .id(session.project.id)
            } else {
                WelcomeView()
            }
        }
        .sheet(isPresented: $state.showNew) { NewProjectView() }
        .sheet(isPresented: $state.showJoin) { JoinProjectView() }
        .alert("Error", isPresented: Binding(
            get: { state.errorText != nil },
            set: { if !$0 { state.errorText = nil } }
        )) {
            Button("OK", role: .cancel) { state.errorText = nil }
        } message: {
            Text(state.errorText ?? "")
        }
    }
}

struct WelcomeView: View {
    @EnvironmentObject var state: AppState

    private let features: [(String, String, String)] = [
        ("person.2.fill", "Edición en tiempo real", "Varias personas escriben el mismo .tex a la vez."),
        ("link", "Comparte con un link", "Genera un enlace y quien lo abra entra al instante."),
        ("doc.text", "Colabora desde el iPad", "Conéctate a tu servidor y edita en cualquier lugar."),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                BrandMark(size: 60)
                    .padding(20)
                    .background(Theme.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.border))

                Text("LaTeX Collab")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundColor(Theme.textPrimary)
                Text("Editor de LaTeX colaborativo, autoalojado.\nCrea un proyecto o únete a uno para empezar.")
                    .multilineTextAlignment(.center)
                    .font(.system(size: 15))
                    .foregroundColor(Theme.textSecondary)

                VStack(spacing: 12) {
                    Button { state.showNew = true } label: {
                        Label("Nuevo proyecto", systemImage: "plus")
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button { state.showJoin = true } label: {
                        Label("Unirse a un proyecto", systemImage: "arrow.right.to.line")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(Theme.textPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Theme.bgElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.border))
                    }
                }
                .frame(maxWidth: 420)

                if !state.recents.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("RECIENTES").font(.system(size: 11, weight: .semibold)).foregroundColor(Theme.textMuted)
                        ForEach(state.recents) { r in
                            Button { Task { await state.openRecent(r) } } label: {
                                HStack(spacing: 10) {
                                    Avatar(name: r.name, color: colorFor(r.name), size: 30)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(r.name).foregroundColor(Theme.textPrimary).font(.system(size: 14))
                                        Text(r.baseUrl.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                                            .foregroundColor(Theme.textMuted).font(.system(size: 11))
                                    }
                                    Spacer()
                                }
                                .padding(8)
                                .background(Theme.bgPanel)
                                .clipShape(RoundedRectangle(cornerRadius: 9))
                            }
                        }
                    }
                    .frame(maxWidth: 420)
                }

                ForEach(features, id: \.1) { f in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: f.0).foregroundColor(Theme.accent).frame(width: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(f.1).font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.textPrimary)
                            Text(f.2).font(.system(size: 12)).foregroundColor(Theme.textMuted)
                        }
                        Spacer()
                    }
                    .padding(16)
                    .background(Theme.bgPanel)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                    .frame(maxWidth: 460)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
        }
    }
}
