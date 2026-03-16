import Foundation
import CoreLocation
import Combine

@MainActor
class VenueViewModel: ObservableObject {
    @Published var venues: [Venue] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let locationService = LocationService.shared
    private var cancellables = Set<AnyCancellable>()

    init() {
        locationService.$currentLocation
            .compactMap { $0 }
            .removeDuplicates { a, b in
                a.distance(from: b) < 50
            }
            .sink { [weak self] location in
                Task {
                    await self?.loadVenues(location: location)
                }
            }
            .store(in: &cancellables)
    }

    func loadVenues(location: CLLocation? = nil) async {
        let loc = location ?? locationService.currentLocation
        guard let loc else {
            errorMessage = "Konum alinamadi"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            venues = try await VenueService.shared.fetchNearbyVenues(location: loc)
        } catch {
            errorMessage = "Mekanlar yuklenemedi: \(error.localizedDescription)"
        }
        isLoading = false
    }
}
