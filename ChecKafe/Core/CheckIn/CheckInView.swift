import SwiftUI

struct VenueDetailSheet: View {
    let venue: Venue
    @EnvironmentObject var checkInViewModel: CheckInViewModel
    @Environment(\.dismiss) var dismiss

    var isCheckedInHere: Bool {
        checkInViewModel.activeCheckIn?.venueId == venue.placeId
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(Color("AppPrimary").opacity(0.1))
                        .frame(height: 120)
                    Image(systemName: venue.typeIcon)
                        .font(.system(size: 52))
                        .foregroundColor(Color("AppPrimary"))
                }
                .padding(.horizontal)

                VStack(spacing: 8) {
                    Text(venue.name)
                        .font(.title2.bold())
                    Text(venue.typeDisplayName)
                        .font(.subheadline)
                        .foregroundColor(Color("AppPrimary"))
                    Text(venue.address)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }

                if let remaining = checkInViewModel.timeRemainingText, isCheckedInHere {
                    HStack {
                        Image(systemName: "clock.fill")
                        Text("Kalan sure: \(remaining)")
                    }
                    .font(.subheadline)
                    .foregroundColor(.orange)
                }

                Spacer()

                VStack(spacing: 12) {
                    if isCheckedInHere {
                        Button {
                            Task {
                                await checkInViewModel.checkOut()
                                dismiss()
                            }
                        } label: {
                            Label("Check-Out Yap", systemImage: "rectangle.portrait.and.arrow.right")
                                .frame(maxWidth: .infinity)
                                .frame(height: 52)
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                    } else {
                        Button {
                            Task {
                                await checkInViewModel.checkIn(to: venue)
                                dismiss()
                            }
                        } label: {
                            if checkInViewModel.isLoading {
                                ProgressView().tint(.white)
                            } else {
                                Label("Check-In Yap", systemImage: "mappin.and.ellipse")
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 52)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color("AppPrimary"))
                        .disabled(checkInViewModel.isLoading)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
            .padding(.top)
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
    }
}

struct ActiveCheckInBanner: View {
    let checkIn: CheckIn
    let onCheckOut: () -> Void

    var body: some View {
        HStack {
            Image(systemName: "mappin.circle.fill")
                .foregroundColor(Color("AppPrimary"))
            VStack(alignment: .leading, spacing: 2) {
                Text("Su an buradasin")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(checkIn.venueName)
                    .font(.subheadline.bold())
            }
            Spacer()
            Button("Cikis", action: onCheckOut)
                .font(.caption.bold())
                .foregroundColor(.red)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}
