import Foundation
import FirebaseStorage
import UIKit

class FirebaseStorageService {
    static let shared = FirebaseStorageService()
    private let storage = Storage.storage()
    private init() {}

    func uploadProfilePhoto(_ image: UIImage, userId: String, index: Int) async throws -> String {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw NSError(domain: "StorageError", code: 0, userInfo: [NSLocalizedDescriptionKey: "Gorsel donusturulemedi"])
        }

        let ref = storage.reference().child("profile_photos/\(userId)/photo_\(index).jpg")
        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"

        _ = try await ref.putDataAsync(data, metadata: metadata)
        let url = try await ref.downloadURL()
        return url.absoluteString
    }

    func deleteProfilePhoto(userId: String, index: Int) async throws {
        let ref = storage.reference().child("profile_photos/\(userId)/photo_\(index).jpg")
        try await ref.delete()
    }

    func uploadPhotos(_ images: [UIImage], userId: String) async throws -> [String] {
        var urls: [String] = []
        for (index, image) in images.enumerated() {
            let url = try await uploadProfilePhoto(image, userId: userId, index: index)
            urls.append(url)
        }
        return urls
    }
}
