import Foundation
import FirebaseFirestore
import CoreLocation

struct CheckIn: Identifiable, Codable {
    @DocumentID var id: String?
    var userId: String
    var venueId: String
    var venueName: String
    var latitude: Double
    var longitude: Double
    var isActive: Bool
    var checkedInAt: Timestamp
    var expiresAt: Timestamp

    var isExpired: Bool {
        expiresAt.dateValue() < Date()
    }
}
