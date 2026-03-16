import Foundation
import FirebaseAuth
import Combine

@MainActor
class AuthViewModel: ObservableObject {
    @Published var currentUser: AppUser?
    @Published var isLoggedIn = false
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var needsProfileSetup = false

    private let authService = FirebaseAuthService.shared
    private let firestoreService = FirestoreService.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        listenAuthState()
    }

    private func listenAuthState() {
        authService.authStatePublisher()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] uid in
                guard let self else { return }
                if let uid {
                    Task {
                        await self.loadCurrentUser(uid: uid)
                    }
                } else {
                    self.currentUser = nil
                    self.isLoggedIn = false
                }
            }
            .store(in: &cancellables)
    }

    private func loadCurrentUser(uid: String) async {
        do {
            let user = try await firestoreService.getUser(uid: uid)
            self.currentUser = user
            self.isLoggedIn = true
            self.needsProfileSetup = false
        } catch {
            self.isLoggedIn = true
            self.needsProfileSetup = true
        }
    }

    func signUp(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            _ = try await authService.signUp(email: email, password: password)
            needsProfileSetup = true
            isLoggedIn = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        do {
            try await authService.signIn(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func signOut() {
        try? authService.signOut()
        currentUser = nil
        isLoggedIn = false
    }

    func deleteAccount() async {
        isLoading = true
        do {
            if let uid = authService.currentUID {
                try await firestoreService.deleteUser(uid: uid)
            }
            try await authService.deleteAccount()
            currentUser = nil
            isLoggedIn = false
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func refreshCurrentUser() async {
        guard let uid = authService.currentUID else { return }
        await loadCurrentUser(uid: uid)
    }
}
