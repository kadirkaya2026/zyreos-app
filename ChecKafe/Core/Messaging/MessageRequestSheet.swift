import SwiftUI

struct MessageRequestSheet: View {
    let targetUser: AppUser
    @EnvironmentObject var checkInViewModel: CheckInViewModel
    @EnvironmentObject var conversationViewModel: ConversationViewModel
    @Environment(\.dismiss) var dismiss
    @State private var requestSent = false
    @State private var alreadyExists = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                AsyncImage(url: targetUser.firstPhotoURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    ZStack {
                        Color(.secondarySystemBackground)
                        Image(systemName: "person.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.secondary)
                    }
                }
                .frame(width: 110, height: 110)
                .clipShape(Circle())
                .shadow(radius: 6)

                VStack(spacing: 6) {
                    Text("\(targetUser.name), \(targetUser.age)")
                        .font(.title2.bold())
                    Text(targetUser.gender)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }

                if requestSent {
                    Label("Istek gonderildi!", systemImage: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .font(.headline)
                } else if alreadyExists {
                    Text("Bu kullaniciyla zaten bir konusmaniz var")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    VStack(spacing: 12) {
                        Text("Mesaj istegi gondermek istiyor musun?")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)

                        if let checkIn = checkInViewModel.activeCheckIn {
                            Text("'\(checkIn.venueName)' mekaninda buldun")
                                .font(.caption)
                                .foregroundColor(Color("AppPrimary"))
                        }

                        Button {
                            Task {
                                guard let checkIn = checkInViewModel.activeCheckIn else { return }
                                let success = await conversationViewModel.sendRequest(to: targetUser, from: checkIn)
                                if success {
                                    requestSent = true
                                } else {
                                    alreadyExists = true
                                }
                            }
                        } label: {
                            if conversationViewModel.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Label("Mesaj Istegi Gonder", systemImage: "paperplane.fill")
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color("AppPrimary"))
                        .disabled(conversationViewModel.isLoading || checkInViewModel.activeCheckIn == nil)
                    }
                }

                Spacer()
            }
            .padding(24)
            .navigationTitle("Istek Gonder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
    }
}
