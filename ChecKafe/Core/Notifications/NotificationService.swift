import Foundation
import FirebaseAuth
import FirebaseMessaging
import FirebaseFirestore

class NotificationService {
    static let shared = NotificationService()
    private init() {}

    func updateFCMToken(_ token: String) {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        Task {
            try? await FirestoreService.shared.updateUser(uid: uid, data: ["fcmToken": token])
        }
    }
}
