import SwiftUI

struct VenueListView: View {
    @StateObject private var viewModel = VenueViewModel()
    @EnvironmentObject var checkInViewModel: CheckInViewModel
    @State private var selectedVenue: Venue?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.venues.isEmpty {
                    ProgressView("Yakin mekanlar aranıyor...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error = viewModel.errorMessage {
                    ContentUnavailableView("Mekan bulunamadi", systemImage: "location.slash", description: Text(error))
                } else {
                    ScrollView {
                        if let active = checkInViewModel.activeCheckIn {
                            ActiveCheckInBanner(checkIn: active) {
                                Task { await checkInViewModel.checkOut() }
                            }
                            .padding(.horizontal)
                            .padding(.top)
                        }

                        LazyVStack(spacing: 12) {
                            ForEach(viewModel.venues) { venue in
                                VenueCard(venue: venue) {
                                    selectedVenue = venue
                                }
                            }
                        }
                        .padding()
                    }
                    .refreshable {
                        await viewModel.loadVenues()
                    }
                }
            }
            .navigationTitle("Yakinindakiler")
            .navigationBarTitleDisplayMode(.large)
            .sheet(item: $selectedVenue) { venue in
                VenueDetailSheet(venue: venue)
                    .environmentObject(checkInViewModel)
            }
        }
        .onAppear {
            LocationService.shared.requestPermission()
        }
    }
}
