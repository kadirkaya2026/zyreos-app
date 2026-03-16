import SwiftUI

struct OnlineUsersView: View {
    @EnvironmentObject var checkInViewModel: CheckInViewModel
    @StateObject private var viewModel = OnlineUsersViewModel()
    @EnvironmentObject var conversationViewModel: ConversationViewModel
    @State private var selectedUser: AppUser?

    let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            Group {
                if let activeCheckIn = checkInViewModel.activeCheckIn {
                    if viewModel.isLoading {
                        ProgressView("Kullanicilar yukleniyor...")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.onlineUsers.isEmpty {
                        ContentUnavailableView(
                            "Burada kimse yok",
                            systemImage: "person.2.slash",
                            description: Text("\(activeCheckIn.venueName) konumunda su an baska kimse yok")
                        )
                    } else {
                        ScrollView {
                            Text("\(activeCheckIn.venueName) · \(viewModel.onlineUsers.count) kisi")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .padding(.horizontal)
                                .padding(.top, 8)

                            LazyVGrid(columns: columns, spacing: 14) {
                                ForEach(viewModel.onlineUsers) { user in
                                    UserCardView(user: user) {
                                        selectedUser = user
                                    }
                                }
                            }
                            .padding()
                        }
                    }
                } else {
                    ContentUnavailableView(
                        "Check-in yapman gerekiyor",
                        systemImage: "mappin.slash",
                        description: Text("Online kullanicilari gormek icin once bir mekana check-in yap")
                    )
                }
            }
            .navigationTitle("Online Kullanicilar")
            .navigationBarTitleDisplayMode(.large)
            .sheet(item: $selectedUser) { user in
                MessageRequestSheet(targetUser: user)
                    .environmentObject(checkInViewModel)
                    .environmentObject(conversationViewModel)
            }
            .onAppear {
                if let venueId = checkInViewModel.activeCheckIn?.venueId {
                    viewModel.startListening(venueId: venueId)
                }
            }
            .onDisappear {
                viewModel.stopListening()
            }
            .onChange(of: checkInViewModel.activeCheckIn?.venueId) { _, venueId in
                viewModel.stopListening()
                if let venueId {
                    viewModel.startListening(venueId: venueId)
                }
            }
        }
    }
}
