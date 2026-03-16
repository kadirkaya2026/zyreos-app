import Foundation
import FirebaseFirestore

struct Conversation: Identifiable, Codable {
    @DocumentID var id: String?
    var participantIds: [String]
    var requesterId: String
    var receiverId: String
    var status: ConversationStatus
    var venueId: String
    var venueName: String
    var createdAt: Timestamp
    var lastMessage: String?
    var lastMessageAt: Timestamp?
}

enum ConversationStatus: String, Codable {
    case pending
    case accepted
    case rejected
}
