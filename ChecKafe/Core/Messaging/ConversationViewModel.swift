import Foundation
import Combine
import FirebaseAuth
import FirebaseFirestore

@MainActor
class ConversationViewModel: ObservableObject {
    @Published var conversations: [Conversation] = []
    @Published var pendingRequests: [Conversation] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var listener: ListenerRegistration?

    func startListening() {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        listener = firestoreService.listenConversations(userId: uid) { [weak self] conversations in
            guard let self else { return }
            self.conversations = conversations.filter { $0.status == .accepted }
            self.pendingRequests = conversations.filter {
                $0.status == .pending && $0.receiverId == uid
            }
        }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
    }

    func sendRequest(to targetUser: AppUser, from checkIn: CheckIn) async -> Bool {
        guard let uid = Auth.auth().currentUser?.uid,
              let targetId = targetUser.id else { return false }

        let existing = try? await firestoreService.getConversationBetween(userId1: uid, userId2: targetId)
        if existing != nil { return false }

        isLoading = true
        let conversation = Conversation(
            participantIds: [uid, targetId],
            requesterId: uid,
            receiverId: targetId,
            status: .pending,
            venueId: checkIn.venueId,
            venueName: checkIn.venueName,
            createdAt: Timestamp(date: Date())
        )
        do {
            _ = try await firestoreService.createConversation(conversation)
            isLoading = false
            return true
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
            return false
        }
    }

    func acceptRequest(conversation: Conversation) async {
        guard let id = conversation.id else { return }
        do {
            try await firestoreService.updateConversationStatus(id: id, status: .accepted)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rejectRequest(conversation: Conversation) async {
        guard let id = conversation.id else { return }
        do {
            try await firestoreService.updateConversationStatus(id: id, status: .rejected)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    var pendingCount: Int { pendingRequests.count }
}
