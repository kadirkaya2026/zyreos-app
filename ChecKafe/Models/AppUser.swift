import Foundation
import FirebaseFirestore

struct AppUser: Identifiable, Codable {
    @DocumentID var id: String?
    var uid: String
    var name: String
    var age: Int
    var gender: String
    var bio: String
    var photoURLs: [String]
    var interests: [String]
    var fcmToken: String?
    var createdAt: Timestamp

    var firstPhotoURL: URL? {
        guard let urlString = photoURLs.first else { return nil }
        return URL(string: urlString)
    }
}
