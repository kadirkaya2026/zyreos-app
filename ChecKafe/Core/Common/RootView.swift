import SwiftUI

struct RootView: View {
    @EnvironmentObject var authViewModel: AuthViewModel

    var body: some View {
        Group {
            if authViewModel.isLoggedIn {
                if authViewModel.needsProfileSetup {
                    ProfileSetupView()
                } else {
                    MainTabView()
                }
            } else {
                LoginView()
            }
        }
    }
}
