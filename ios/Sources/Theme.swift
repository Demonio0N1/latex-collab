import SwiftUI

/// Dark palette mirroring the desktop app.
enum Theme {
    static let bgApp = Color(hex: 0x0B0C0F)
    static let bgPanel = Color(hex: 0x16171C)
    static let bgElevated = Color(hex: 0x1C1E25)
    static let border = Color.white.opacity(0.09)
    static let textPrimary = Color(hex: 0xEDEEF0)
    static let textSecondary = Color(hex: 0x9B9DA6)
    static let textMuted = Color(hex: 0x6A6C76)
    static let accent = Color(hex: 0x5B8CFF)
    static let accentHi = Color(hex: 0x7AA2FF)
    static let success = Color(hex: 0x3ECF8E)
}

extension Color {
    init(hex: UInt32) {
        self = Color(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0
        )
    }
}

/// The brand logomark (overlapping documents + a summation stroke), in SwiftUI.
struct BrandMark: View {
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.16)
                .fill(Color(hex: 0x2A2D36))
                .frame(width: size * 0.5, height: size * 0.62)
                .offset(x: -size * 0.08, y: -size * 0.04)
            RoundedRectangle(cornerRadius: size * 0.16)
                .fill(Theme.accent)
                .frame(width: size * 0.5, height: size * 0.62)
                .offset(x: size * 0.08, y: size * 0.04)
            Text("Σ")
                .font(.system(size: size * 0.34, weight: .bold))
                .foregroundColor(.white)
                .offset(x: size * 0.08, y: size * 0.04)
        }
        .frame(width: size, height: size)
    }
}

struct Avatar: View {
    let name: String
    let color: String
    var size: CGFloat = 30
    var body: some View {
        Text(name.initials)
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundColor(.white)
            .frame(width: size, height: size)
            .background(Circle().fill(Color(hslString: color)))
    }
}

/// A filled accent button used for primary actions.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(LinearGradient(colors: [Theme.accentHi, Theme.accent], startPoint: .top, endPoint: .bottom))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}
