import SwiftUI

struct VenueCard: View {
    let venue: Venue
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color("AppPrimary").opacity(0.12))
                        .frame(width: 52, height: 52)
                    Image(systemName: venue.typeIcon)
                        .font(.title3)
                        .foregroundColor(Color("AppPrimary"))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(venue.name)
                        .font(.headline)
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(venue.address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                    Text(venue.typeDisplayName)
                        .font(.caption2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color("AppPrimary").opacity(0.1))
                        .foregroundColor(Color("AppPrimary"))
                        .cornerRadius(8)
                }

                Spacer()

                if let dist = venue.distance {
                    VStack(alignment: .trailing) {
                        Text(formatDistance(dist))
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.06), radius: 6, x: 0, y: 2)
        }
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters < 1000 {
            return "\(Int(meters))m"
        } else {
            return String(format: "%.1fkm", meters / 1000)
        }
    }
}
