import SwiftUI

struct RegisterView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var localError: String?

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color("AppPrimary"), Color("AppSecondary")],
                           startPoint: .topLeading,
                           endPoint: .bottomTrailing)
                .ignoresSafeArea()

            VStack(spacing: 32) {
                Spacer()

                VStack(spacing: 8) {
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 54))
                        .foregroundColor(.white)
                    Text("Hesap Olustur")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                }

                Spacer()

                VStack(spacing: 16) {
                    AuthTextField(placeholder: "E-posta", text: $email, keyboardType: .emailAddress)
                    AuthTextField(placeholder: "Sifre", text: $password, isSecure: true)
                    AuthTextField(placeholder: "Sifre Tekrar", text: $confirmPassword, isSecure: true)

                    if let error = localError ?? authViewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        guard password == confirmPassword else {
                            localError = "Sifreler eslesmiyor"
                            return
                        }
                        guard password.count >= 6 else {
                            localError = "Sifre en az 6 karakter olmali"
                            return
                        }
                        localError = nil
                        Task { await authViewModel.signUp(email: email, password: password) }
                    } label: {
                        ZStack {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(Color.white)
                                .frame(height: 52)
                            if authViewModel.isLoading {
                                ProgressView().tint(Color("AppPrimary"))
                            } else {
                                Text("Kaydol")
                                    .font(.headline)
                                    .foregroundColor(Color("AppPrimary"))
                            }
                        }
                    }
                    .disabled(authViewModel.isLoading)

                    Button {
                        dismiss()
                    } label: {
                        Text("Zaten hesabin var mi? **Giris Yap**")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .navigationBarHidden(true)
    }
}
