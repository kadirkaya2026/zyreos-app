import Foundation
import FirebaseFirestore
import Combine

class FirestoreService {
    static let shared = FirestoreService()
    let db = Firestore.firestore()
    private init() {}

    func createUser(_ user: AppUser) async throws {
        try db.collection("users").document(user.uid).setData(from: user)
    }

    func getUser(uid: String) async throws -> AppUser {
        try await db.collection("users").document(uid).getDocument(as: AppUser.self)
    }

    func updateUser(uid: String, data: [String: Any]) async throws {
        try await db.collection("users").document(uid).updateData(data)
    }

    func deleteUser(uid: String) async throws {
        try await db.collection("users").document(uid).delete()
    }

    func createCheckIn(_ checkIn: CheckIn) async throws -> String {
        let ref = try db.collection("checkins").addDocument(from: checkIn)
        return ref.documentID
    }

    func deactivateCheckIn(id: String) async throws {
        try await db.collection("checkins").document(id).updateData(["isActive": false])
    }

    func getActiveCheckIn(userId: String) async throws -> CheckIn? {
        let snapshot = try await db.collection("checkins")
            .whereField("userId", isEqualTo: userId)
            .whereField("isActive", isEqualTo: true)
            .limit(to: 1)
            .getDocuments()
        return try snapshot.documents.first?.data(as: CheckIn.self)
    }

    func listenActiveCheckInsAtVenue(venueId: String, completion: @escaping ([CheckIn]) -> Void) -> ListenerRegistration {
        db.collection("checkins")
            .whereField("venueId", isEqualTo: venueId)
            .whereField("isActive", isEqualTo: true)
            .addSnapshotListener { snapshot, _ in
                let checkIns = snapshot?.documents.compactMap { try? $0.data(as: CheckIn.self) } ?? []
                completion(checkIns)
            }
    }

    func createConversation(_ conversation: Conversation) async throws -> String {
        let ref = try db.collection("conversations").addDocument(from: conversation)
        return ref.documentID
    }

    func updateConversationStatus(id: String, status: ConversationStatus) async throws {
        try await db.collection("conversations").document(id).updateData(["status": status.rawValue])
    }

    func listenConversations(userId: String, completion: @escaping ([Conversation]) -> Void) -> ListenerRegistration {
        db.collection("conversations")
            .whereField("participantIds", arrayContains: userId)
            .order(by: "createdAt", descending: true)
            .addSnapshotListener { snapshot, _ in
                let conversations = snapshot?.documents.compactMap { try? $0.data(as: Conversation.self) } ?? []
                completion(conversations)
            }
    }

    func sendMessage(_ message: Message) async throws {
        try db.collection("conversations")
            .document(message.conversationId)
            .collection("messages")
            .addDocument(from: message)

        try await db.collection("conversations").document(message.conversationId).updateData([
            "lastMessage": message.text,
            "lastMessageAt": message.sentAt
        ])
    }

    func listenMessages(conversationId: String, completion: @escaping ([Message]) -> Void) -> ListenerRegistration {
        db.collection("conversations")
            .document(conversationId)
            .collection("messages")
            .order(by: "sentAt")
            .addSnapshotListener { snapshot, _ in
                let messages = snapshot?.documents.compactMap { try? $0.data(as: Message.self) } ?? []
                completion(messages)
            }
    }

    func getConversationBetween(userId1: String, userId2: String) async throws -> Conversation? {
        let snapshot = try await db.collection("conversations")
            .whereField("participantIds", arrayContains: userId1)
            .getDocuments()
        return snapshot.documents
            .compactMap { try? $0.data(as: Conversation.self) }
            .first { $0.participantIds.contains(userId2) }
    }
}
