import Foundation
import FirebaseFirestore

struct Message: Identifiable, Codable {
    @DocumentID var id: String?
    var conversationId: String
    var senderId: String
    var text: String
    var sentAt: Timestamp
}
