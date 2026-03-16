import SwiftUI

struct UserCardView: View {
    let user: AppUser
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                AsyncImage(url: user.firstPhotoURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    ZStack {
                        Color(.secondarySystemBackground)
                        Image(systemName: "person.fill")
                            .font(.largeTitle)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(height: 160)
                .clipped()

                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(user.name)
                            .font(.subheadline.bold())
                            .foregroundColor(.primary)
                            .lineLimit(1)
                        Spacer()
                        Text("\(user.age)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    HStack(spacing: 4) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 7, height: 7)
                        Text("Online")
                            .font(.caption2)
                            .foregroundColor(.green)
                    }
                }
                .padding(10)
            }
            .background(Color(.systemBackground))
            .cornerRadius(14)
            .shadow(color: .black.opacity(0.07), radius: 6, x: 0, y: 2)
        }
    }
}
