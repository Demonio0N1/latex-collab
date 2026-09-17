import SwiftUI

struct EditorView: View {
    @EnvironmentObject var state: AppState
    let session: Session

    @State private var activeFile: String = ""
    @State private var showShare = false
    @State private var showFiles = false

    private var texFiles: [ProjectFile] {
        let tex = session.files.filter { $0.kind != "other" }
        return tex.isEmpty ? session.files : tex
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Theme.border)
            if activeFile.isEmpty {
                Spacer(); Text("Este proyecto no tiene archivos.").foregroundColor(Theme.textMuted); Spacer()
            } else {
                FileEditor(session: session, filePath: activeFile, userName: state.userName)
                    .id(activeFile)
            }
        }
        .background(Theme.bgApp)
        .onAppear {
            if activeFile.isEmpty {
                activeFile = session.files.first(where: { $0.isTex })?.path ?? session.files.first?.path ?? ""
            }
        }
        .sheet(isPresented: $showShare) { ShareView(session: session) }
        .sheet(isPresented: $showFiles) { filesSheet }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Button { state.leave() } label: {
                Image(systemName: "chevron.left").foregroundColor(Theme.textSecondary)
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(session.project.name).font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.textPrimary)
                Text(activeFile).font(.system(size: 11, design: .monospaced)).foregroundColor(Theme.textMuted)
            }
            Spacer()
            Button { showFiles = true } label: {
                Image(systemName: "doc.on.doc").foregroundColor(Theme.textSecondary)
            }
            Button { showShare = true } label: {
                Text("Compartir").font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white).padding(.horizontal, 12).padding(.vertical, 7)
                    .background(LinearGradient(colors: [Theme.accentHi, Theme.accent], startPoint: .top, endPoint: .bottom))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
    }

    private var filesSheet: some View {
        NavigationStack {
            List(texFiles) { file in
                Button {
                    activeFile = file.path
                    showFiles = false
                } label: {
                    HStack {
                        Image(systemName: file.isTex ? "doc.text" : "doc")
                        Text(file.path)
                        Spacer()
                        if file.path == activeFile { Image(systemName: "checkmark").foregroundColor(Theme.accent) }
                    }
                }
            }
            .navigationTitle("Archivos")
        }
    }
}

/// Owns the collaborative session for one file. Recreated (via .id) when the
/// active file changes so the WebSocket/Yjs room follows the file.
struct FileEditor: View {
    @StateObject private var collab: CollabSession

    init(session: Session, filePath: String, userName: String) {
        _collab = StateObject(wrappedValue: CollabSession(session: session, filePath: filePath, userName: userName))
    }

    var body: some View {
        VStack(spacing: 0) {
            if !collab.peers.isEmpty {
                HStack(spacing: -7) {
                    ForEach(collab.peers) { p in
                        Avatar(name: p.name, color: p.color, size: 24)
                            .overlay(Circle().stroke(Theme.bgApp, lineWidth: 2))
                    }
                    Text("\(collab.peers.count) colaborando").font(.caption).foregroundColor(Theme.textMuted).padding(.leading, 12)
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 6)
            }
            TextEditor(text: Binding(get: { collab.text }, set: { collab.localEdit($0) }))
                .font(.system(size: 15, design: .monospaced))
                .foregroundColor(Theme.textPrimary)
                .scrollContentBackground(.hidden)
                .background(Theme.bgPanel)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
        .onAppear { collab.start() }
        .onDisappear { collab.stop() }
    }
}
