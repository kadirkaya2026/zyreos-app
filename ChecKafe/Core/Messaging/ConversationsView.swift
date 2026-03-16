import SwiftUI

struct ConversationsView: View {
    @EnvironmentObject var conversationViewModel: ConversationViewModel

    var body: some View {
        NavigationStack {
            Group {
                if conversationViewModel.conversations.isEmpty && conversationViewModel.pendingRequests.isEmpty {
                    ContentUnavailableView("Henuz konusma yok", systemImage: "message", description: Text("Check-in yaptigin mekandaki kullanicilara mesaj istegi gonderebilirsin"))
                } else {
                    List {
                        if !conversationViewModel.pendingRequests.isEmpty {
                            Section("Gelen Istekler (\(conversationViewModel.pendingRequests.count))") {
                                ForEach(conversationViewModel.pendingRequests) { conv in
                                    PendingRequestRow(conversation: conv)
                                }
                            }
                        }

                        if !conversationViewModel.conversations.isEmpty {
                            Section("Konusmalar") {
                                ForEach(conversationViewModel.conversations) { conv in
                                    NavigationLink(destination: ChatView(conversation: conv)) {
                                        ConversationRow(conversation: conv)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Mesajlar")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

struct PendingRequestRow: View {
    let conversation: Conversation
    @EnvironmentObject var conversationViewModel: ConversationViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "person.fill")
                    .frame(width: 40, height: 40)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
                VStack(alignment: .leading) {
                    Text("Mesaj istegi")
                        .font(.subheadline.bold())
                    Text(conversation.venueName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            HStack(spacing: 10) {
                Button {
                    Task { await conversationViewModel.rejectRequest(conversation: conversation) }
                } label: {
                    Label("Reddet", systemImage: "xmark")
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                }
                .buttonStyle(.bordered)
                .tint(.red)

                Button {
                    Task { await conversationViewModel.acceptRequest(conversation: conversation) }
                } label: {
                    Label("Kabul Et", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color("AppPrimary"))
            }
        }
        .padding(.vertical, 4)
    }
}

struct ConversationRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.circle.fill")
                .font(.largeTitle)
                .foregroundColor(Color("AppPrimary"))

            VStack(alignment: .leading, spacing: 4) {
                Text(conversation.venueName)
                    .font(.subheadline.bold())
                if let last = conversation.lastMessage {
                    Text(last)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
