import SwiftUI
import PhotosUI

struct ProfileSetupView: View {
    @EnvironmentObject var authViewModel: AuthViewModel
    @StateObject private var viewModel = ProfileViewModel()
    @State private var step = 0

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemBackground).ignoresSafeArea()

                VStack(spacing: 0) {
                    ProgressView(value: Double(step + 1), total: Double(viewModel.totalSteps))
                        .tint(Color("AppPrimary"))
                        .padding(.horizontal)
                        .padding(.top)

                    TabView(selection: $step) {
                        StepBasicInfo(viewModel: viewModel).tag(0)
                        StepBio(viewModel: viewModel).tag(1)
                        StepInterests(viewModel: viewModel).tag(2)
                        StepPhotos(viewModel: viewModel).tag(3)
                    }
                    .tabViewStyle(.page(indexDisplayMode: .never))
                    .animation(.easeInOut, value: step)

                    HStack {
                        if step > 0 {
                            Button("Geri") { step -= 1 }
                                .buttonStyle(SecondaryButtonStyle())
                        }
                        Spacer()
                        if step < viewModel.totalSteps - 1 {
                            Button("Devam") {
                                step += 1
                            }
                            .buttonStyle(PrimaryButtonStyle())
                        } else {
                            Button {
                                Task {
                                    await viewModel.saveProfile()
                                    if viewModel.isComplete {
                                        await authViewModel.refreshCurrentUser()
                                    }
                                }
                            } label: {
                                if viewModel.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Text("Tamamla")
                                }
                            }
                            .buttonStyle(PrimaryButtonStyle())
                            .disabled(viewModel.isLoading)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 32)

                    if let error = viewModel.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.bottom, 8)
                    }
                }
            }
            .navigationTitle("Profil Olustur")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

struct StepBasicInfo: View {
    @ObservedObject var viewModel: ProfileViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionHeader(title: "Temel Bilgiler", subtitle: "Seni taniyelim")

                VStack(alignment: .leading, spacing: 8) {
                    Text("Adiniz").font(.caption).foregroundColor(.secondary)
                    TextField("Adinizi girin", text: $viewModel.name)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Yasiniz").font(.caption).foregroundColor(.secondary)
                    Stepper("\(viewModel.age) yas", value: $viewModel.age, in: 18...99)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Cinsiyet").font(.caption).foregroundColor(.secondary)
                    Picker("Cinsiyet", selection: $viewModel.gender) {
                        ForEach(viewModel.genderOptions, id: \.self) { g in
                            Text(g).tag(g)
                        }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .padding(24)
        }
    }
}

struct StepBio: View {
    @ObservedObject var viewModel: ProfileViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionHeader(title: "Hakkinda", subtitle: "Kendini birkaç cümleyle anlat")

                TextEditor(text: $viewModel.bio)
                    .frame(minHeight: 140)
                    .padding(8)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.3)))

                Text("\(viewModel.bio.count)/200")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .onChange(of: viewModel.bio) { _, new in
                        if new.count > 200 { viewModel.bio = String(new.prefix(200)) }
                    }
            }
            .padding(24)
        }
    }
}

struct StepInterests: View {
    @ObservedObject var viewModel: ProfileViewModel
    let columns = [GridItem(.adaptive(minimum: 100))]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionHeader(title: "Ilgi Alanlari", subtitle: "En az 3 etiket sec")

                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(viewModel.interestOptions, id: \.self) { interest in
                        let selected = viewModel.selectedInterests.contains(interest)
                        Text(interest)
                            .font(.subheadline)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(selected ? Color("AppPrimary") : Color(.secondarySystemBackground))
                            .foregroundColor(selected ? .white : .primary)
                            .cornerRadius(20)
                            .onTapGesture {
                                if selected {
                                    viewModel.selectedInterests.remove(interest)
                                } else {
                                    viewModel.selectedInterests.insert(interest)
                                }
                            }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct StepPhotos: View {
    @ObservedObject var viewModel: ProfileViewModel
    @State private var selectedItems: [PhotosPickerItem] = []
    let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                SectionHeader(title: "Fotograflar", subtitle: "1-6 fotograf ekle")

                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(viewModel.selectedImages.indices, id: \.self) { index in
                        ZStack(alignment: .topTrailing) {
                            Image(uiImage: viewModel.selectedImages[index])
                                .resizable()
                                .scaledToFill()
                                .frame(height: 110)
                                .cornerRadius(12)
                                .clipped()

                            Button {
                                viewModel.selectedImages.remove(at: index)
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.white)
                                    .background(Color.black.opacity(0.5).clipShape(Circle()))
                            }
                            .padding(4)
                        }
                    }

                    if viewModel.selectedImages.count < 6 {
                        PhotosPicker(selection: $selectedItems, maxSelectionCount: 6 - viewModel.selectedImages.count, matching: .images) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 12)
                                    .fill(Color(.secondarySystemBackground))
                                    .frame(height: 110)
                                Image(systemName: "plus")
                                    .font(.title2)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .onChange(of: selectedItems) { _, items in
                            Task {
                                for item in items {
                                    if let data = try? await item.loadTransferable(type: Data.self),
                                       let image = UIImage(data: data) {
                                        viewModel.selectedImages.append(image)
                                    }
                                }
                                selectedItems = []
                            }
                        }
                    }
                }
            }
            .padding(24)
        }
    }
}

struct SectionHeader: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.title2.bold())
            Text(subtitle).font(.subheadline).foregroundColor(.secondary)
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(.white)
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .background(Color("AppPrimary").opacity(configuration.isPressed ? 0.8 : 1))
            .cornerRadius(14)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundColor(Color("AppPrimary"))
            .padding(.horizontal, 28)
            .padding(.vertical, 14)
            .background(Color("AppPrimary").opacity(0.1))
            .cornerRadius(14)
    }
}
