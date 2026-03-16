import SwiftUI
import FirebaseAuth

struct ChatView: View {
    @StateObject private var viewModel: ChatViewModel
    @State private var scrollProxy: ScrollViewProxy?

    init(conversation: Conversation) {
        _viewModel = StateObject(wrappedValue: ChatViewModel(conversation: conversation))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(viewModel.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onAppear { scrollProxy = proxy }
                .onChange(of: viewModel.messages.count) { _, _ in
                    if let last = viewModel.messages.last?.id {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }

            Divider()

            HStack(spacing: 12) {
                TextField("Mesaj yaz...", text: $viewModel.messageText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)

                Button {
                    Task { await viewModel.sendMessage() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(viewModel.messageText.trimmingCharacters(in: .whitespaces).isEmpty ? .secondary : Color("AppPrimary"))
                }
                .disabled(viewModel.messageText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
        .navigationTitle(viewModel.otherUser?.name ?? "Mesajlar")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { viewModel.start() }
        .onDisappear { viewModel.stop() }
    }
}

struct MessageBubble: View {
    let message: Message
    private var isMe: Bool {
        message.senderId == Auth.auth().currentUser?.uid
    }

    var body: some View {
        HStack {
            if isMe { Spacer(minLength: 60) }
            Text(message.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isMe ? Color("AppPrimary") : Color(.secondarySystemBackground))
                .foregroundColor(isMe ? .white : .primary)
                .cornerRadius(18)
            if !isMe { Spacer(minLength: 60) }
        }
    }
}
