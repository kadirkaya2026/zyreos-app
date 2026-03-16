import SwiftUI

struct LoginView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @State private var email = ""
    @State private var password = ""
    @State private var showRegister = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Color("AppPrimary"), Color("AppSecondary")],
                               startPoint: .topLeading,
                               endPoint: .bottomTrailing)
                    .ignoresSafeArea()

                VStack(spacing: 32) {
                    Spacer()

                    VStack(spacing: 8) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 60))
                            .foregroundColor(.white)
                        Text("ChecKafe")
                            .font(.system(size: 36, weight: .bold))
                            .foregroundColor(.white)
                        Text("Neredesin?")
                            .font(.subheadline)
                            .foregroundColor(.white.opacity(0.8))
                    }

                    Spacer()

                    VStack(spacing: 16) {
                        AuthTextField(placeholder: "E-posta", text: $email, keyboardType: .emailAddress)
                        AuthTextField(placeholder: "Sifre", text: $password, isSecure: true)

                        if let error = authViewModel.errorMessage {
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.red)
                                .multilineTextAlignment(.center)
                        }

                        Button {
                            Task { await authViewModel.signIn(email: email, password: password) }
                        } label: {
                            ZStack {
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color.white)
                                    .frame(height: 52)
                                if authViewModel.isLoading {
                                    ProgressView().tint(Color("AppPrimary"))
                                } else {
                                    Text("Giris Yap")
                                        .font(.headline)
                                        .foregroundColor(Color("AppPrimary"))
                                }
                            }
                        }
                        .disabled(authViewModel.isLoading)

                        Button {
                            showRegister = true
                        } label: {
                            Text("Hesabin yok mu? **Kaydol**")
                                .font(.subheadline)
                                .foregroundColor(.white)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                }
            }
            .navigationDestination(isPresented: $showRegister) {
                RegisterView()
            }
        }
    }
}
