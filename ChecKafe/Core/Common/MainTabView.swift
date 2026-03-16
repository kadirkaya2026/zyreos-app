import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject var checkInViewModel = CheckInViewModel()
    @StateObject var conversationViewModel = ConversationViewModel()

    var body: some View {
        TabView {
            VenueListView()
                .environmentObject(checkInViewModel)
                .tabItem {
                    Label("Mekanlar", systemImage: "mappin.and.ellipse")
                }

            OnlineUsersView()
                .environmentObject(checkInViewModel)
                .environmentObject(conversationViewModel)
                .tabItem {
                    Label("Online", systemImage: "person.2.fill")
                }

            ConversationsView()
                .environmentObject(conversationViewModel)
                .tabItem {
                    Label("Mesajlar", systemImage: "message.fill")
                }
                .badge(conversationViewModel.pendingCount > 0 ? conversationViewModel.pendingCount : 0)

            SettingsView()
                .tabItem {
                    Label("Profil", systemImage: "person.crop.circle")
                }
        }
        .tint(Color("AppPrimary"))
        .onAppear {
            conversationViewModel.startListening()
        }
        .onDisappear {
            conversationViewModel.stopListening()
        }
    }
}
