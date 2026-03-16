import Foundation
import Combine
import FirebaseFirestore
import FirebaseAuth
import UIKit

@MainActor
class ProfileViewModel: ObservableObject {
    @Published var name = ""
    @Published var age = 18
    @Published var gender = "Erkek"
    @Published var bio = ""
    @Published var selectedInterests: Set<String> = []
    @Published var selectedImages: [UIImage] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var isComplete = false

    let genderOptions = ["Erkek", "Kadin", "Diger"]
    let interestOptions = [
        "Muzik", "Spor", "Sanat", "Teknoloji", "Yemek", "Seyahat",
        "Film", "Kitap", "Fotograf", "Dans", "Yoga", "Oyun",
        "Doga", "Kahve", "Kedi", "Kopek"
    ]

    var currentStep = 0
    let totalSteps = 4

    func saveProfile() async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Ad alani bos birakilamaz"
            return
        }
        guard !selectedImages.isEmpty else {
            errorMessage = "En az bir fotograf eklemelisin"
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let photoURLs = try await FirebaseStorageService.shared.uploadPhotos(selectedImages, userId: uid)

            let user = AppUser(
                id: uid,
                uid: uid,
                name: name,
                age: age,
                gender: gender,
                bio: bio,
                photoURLs: photoURLs,
                interests: Array(selectedInterests),
                fcmToken: nil,
                createdAt: Timestamp(date: Date())
            )
            try await FirestoreService.shared.createUser(user)
            isComplete = true
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
