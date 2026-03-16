import Foundation
import Combine
import FirebaseAuth
import FirebaseFirestore

@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var messageText = ""
    @Published var otherUser: AppUser?

    private let firestoreService = FirestoreService.shared
    private var listener: ListenerRegistration?
    let conversation: Conversation

    init(conversation: Conversation) {
        self.conversation = conversation
    }

    func start() {
        listener = firestoreService.listenMessages(conversationId: conversation.id ?? "") { [weak self] msgs in
            self?.messages = msgs
        }
        Task { await loadOtherUser() }
    }

    func stop() {
        listener?.remove()
        listener = nil
    }

    private func loadOtherUser() async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let otherId = conversation.participantIds.first { $0 != uid } ?? ""
        otherUser = try? await firestoreService.getUser(uid: otherId)
    }

    func sendMessage() async {
        guard let uid = Auth.auth().currentUser?.uid,
              let conversationId = conversation.id,
              !messageText.trimmingCharacters(in: .whitespaces).isEmpty else { return }

        let text = messageText
        messageText = ""

        let message = Message(
            conversationId: conversationId,
            senderId: uid,
            text: text,
            sentAt: Timestamp(date: Date())
        )
        try? await firestoreService.sendMessage(message)
    }
}
