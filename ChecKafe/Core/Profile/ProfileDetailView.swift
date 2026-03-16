import SwiftUI

struct ProfileDetailView: View {
    let user: AppUser
    var isOwnProfile: Bool = false
    @State private var photoIndex = 0

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                TabView(selection: $photoIndex) {
                    ForEach(user.photoURLs.indices, id: \.self) { i in
                        AsyncImage(url: URL(string: user.photoURLs[i])) { image in
                            image.resizable().scaledToFill()
                        } placeholder: {
                            Color(.secondarySystemBackground)
                        }
                        .tag(i)
                    }
                }
                .tabViewStyle(.page)
                .frame(height: 420)
                .clipped()

                VStack(alignment: .leading, spacing: 20) {
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(user.name), \(user.age)")
                                .font(.title.bold())
                            Text(user.gender)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                    }
                    .padding(.top, 20)

                    if !user.bio.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Hakkinda")
                                .font(.headline)
                            Text(user.bio)
                                .font(.body)
                                .foregroundColor(.secondary)
                        }
                    }

                    if !user.interests.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Ilgi Alanlari")
                                .font(.headline)
                            FlowLayout(items: user.interests) { interest in
                                Text(interest)
                                    .font(.subheadline)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color("AppPrimary").opacity(0.1))
                                    .foregroundColor(Color("AppPrimary"))
                                    .cornerRadius(16)
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .ignoresSafeArea(edges: .top)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct FlowLayout<Item: Hashable, Content: View>: View {
    let items: [Item]
    let content: (Item) -> Content

    init(items: [Item], @ViewBuilder content: @escaping (Item) -> Content) {
        self.items = items
        self.content = content
    }

    var body: some View {
        var width: CGFloat = 0
        var rows: [[Item]] = [[]]

        return GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                ForEach(items, id: \.self) { item in
                    content(item)
                        .alignmentGuide(.leading) { d in
                            if abs(width - d.width) > geo.size.width {
                                width = 0
                                rows.append([item])
                            }
                            let result = width
                            if item == items.last { width = 0 } else { width -= d.width + 8 }
                            return result
                        }
                        .alignmentGuide(.top) { _ in
                            let result = -CGFloat(rows.count - 1) * 36
                            return result
                        }
                }
            }
        }
        .frame(minHeight: CGFloat(max(1, items.count / 3)) * 36)
    }
}
