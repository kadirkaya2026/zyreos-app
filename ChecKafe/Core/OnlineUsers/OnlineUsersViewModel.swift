import Foundation
import Combine
import FirebaseAuth
import FirebaseFirestore

@MainActor
class OnlineUsersViewModel: ObservableObject {
    @Published var onlineUsers: [AppUser] = []
    @Published var isLoading = false

    private let firestoreService = FirestoreService.shared
    private var listener: ListenerRegistration?

    func startListening(venueId: String) {
        isLoading = true
        listener = firestoreService.listenActiveCheckInsAtVenue(venueId: venueId) { [weak self] checkIns in
            guard let self else { return }
            let currentUID = Auth.auth().currentUser?.uid
            let otherUserIds = checkIns
                .filter { !$0.isExpired && $0.userId != currentUID }
                .map(\.userId)

            Task {
                await self.loadUsers(userIds: otherUserIds)
                self.isLoading = false
            }
        }
    }

    func stopListening() {
        listener?.remove()
        listener = nil
        onlineUsers = []
    }

    private func loadUsers(userIds: [String]) async {
        var users: [AppUser] = []
        for uid in userIds {
            if let user = try? await firestoreService.getUser(uid: uid) {
                users.append(user)
            }
        }
        onlineUsers = users
    }
}
