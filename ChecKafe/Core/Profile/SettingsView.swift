import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var showEditProfile = false
    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            List {
                if let user = authViewModel.currentUser {
                    Section {
                        HStack(spacing: 14) {
                            AsyncImage(url: user.firstPhotoURL) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                Color(.secondarySystemBackground)
                            }
                            .frame(width: 60, height: 60)
                            .clipShape(Circle())

                            VStack(alignment: .leading, spacing: 4) {
                                Text(user.name).font(.headline)
                                Text(user.bio.isEmpty ? "Biyografi eklenmemis" : user.bio)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                        }
                        .padding(.vertical, 6)
                    }

                    Section("Profil") {
                        Button {
                            showEditProfile = true
                        } label: {
                            Label("Profili Duzenle", systemImage: "pencil")
                        }
                        NavigationLink(destination: ProfileDetailView(user: user, isOwnProfile: true)) {
                            Label("Profili Goruntule", systemImage: "person.circle")
                        }
                    }
                }

                Section("Hesap") {
                    Button {
                        authViewModel.signOut()
                    } label: {
                        Label("Cikis Yap", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundColor(.red)
                    }

                    Button {
                        showDeleteConfirm = true
                    } label: {
                        Label("Hesabi Sil", systemImage: "trash")
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Ayarlar")
            .sheet(isPresented: $showEditProfile) {
                EditProfileView()
            }
            .confirmationDialog("Hesabini silmek istediginize emin misiniz?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Hesabi Sil", role: .destructive) {
                    Task { await authViewModel.deleteAccount() }
                }
                Button("Iptal", role: .cancel) {}
            }
        }
    }
}
