import SwiftUI
import PhotosUI

struct EditProfileView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var bio = ""
    @State private var age = 18
    @State private var selectedInterests: Set<String> = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    let interestOptions = [
        "Muzik", "Spor", "Sanat", "Teknoloji", "Yemek", "Seyahat",
        "Film", "Kitap", "Fotograf", "Dans", "Yoga", "Oyun",
        "Doga", "Kahve", "Kedi", "Kopek"
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Temel Bilgiler") {
                    TextField("Ad", text: $name)
                    Stepper("\(age) yas", value: $age, in: 18...99)
                }

                Section("Hakkinda") {
                    TextEditor(text: $bio)
                        .frame(minHeight: 100)
                }

                Section("Ilgi Alanlari") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 90))], spacing: 8) {
                        ForEach(interestOptions, id: \.self) { interest in
                            let sel = selectedInterests.contains(interest)
                            Text(interest)
                                .font(.subheadline)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 7)
                                .background(sel ? Color("AppPrimary") : Color(.secondarySystemBackground))
                                .foregroundColor(sel ? .white : .primary)
                                .cornerRadius(16)
                                .onTapGesture {
                                    if sel { selectedInterests.remove(interest) }
                                    else { selectedInterests.insert(interest) }
                                }
                        }
                    }
                    .padding(.vertical, 4)
                }

                if let error = errorMessage {
                    Section {
                        Text(error).foregroundColor(.red).font(.caption)
                    }
                }
            }
            .navigationTitle("Profili Duzenle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Iptal") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kaydet") {
                        Task { await saveChanges() }
                    }
                    .disabled(isLoading)
                }
            }
            .onAppear {
                if let user = authViewModel.currentUser {
                    name = user.name
                    bio = user.bio
                    age = user.age
                    selectedInterests = Set(user.interests)
                }
            }
        }
    }

    private func saveChanges() async {
        guard let uid = authViewModel.currentUser?.uid else { return }
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Ad bos birakilamaz"
            return
        }
        isLoading = true
        do {
            try await FirestoreService.shared.updateUser(uid: uid, data: [
                "name": name,
                "bio": bio,
                "age": age,
                "interests": Array(selectedInterests)
            ])
            await authViewModel.refreshCurrentUser()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
