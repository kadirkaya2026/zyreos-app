import Foundation
import FirebaseAuth
import Combine

class FirebaseAuthService {
    static let shared = FirebaseAuthService()
    private init() {}

    var currentUID: String? {
        Auth.auth().currentUser?.uid
    }

    func signUp(email: String, password: String) async throws -> String {
        let result = try await Auth.auth().createUser(withEmail: email, password: password)
        return result.user.uid
    }

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    func deleteAccount() async throws {
        try await Auth.auth().currentUser?.delete()
    }

    func authStatePublisher() -> AnyPublisher<String?, Never> {
        let subject = PassthroughSubject<String?, Never>()
        Auth.auth().addStateDidChangeListener { _, user in
            subject.send(user?.uid)
        }
        return subject.eraseToAnyPublisher()
    }
}
