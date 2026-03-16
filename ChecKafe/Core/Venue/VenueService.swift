import Foundation
import CoreLocation

class VenueService {
    static let shared = VenueService()
    private init() {}

    private let apiKey = "YOUR_GOOGLE_PLACES_API_KEY"
    private let radius = 500

    func fetchNearbyVenues(location: CLLocation) async throws -> [Venue] {
        let lat = location.coordinate.latitude
        let lng = location.coordinate.longitude
        let types = "cafe|restaurant|bar|night_club"
        let urlString = "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=\(lat),\(lng)&radius=\(radius)&type=\(types)&key=\(apiKey)"

        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
        let (data, _) = try await URLSession.shared.data(from: url)
        let response = try JSONDecoder().decode(PlacesResponse.self, from: data)

        return response.results.map { place in
            let distance = location.distance(from: CLLocation(
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng
            ))
            let type = place.types.first { ["cafe", "restaurant", "bar", "night_club"].contains($0) } ?? "cafe"
            return Venue(
                placeId: place.place_id,
                name: place.name,
                type: type,
                latitude: place.geometry.location.lat,
                longitude: place.geometry.location.lng,
                address: place.vicinity ?? "",
                distance: distance
            )
        }.sorted { ($0.distance ?? 0) < ($1.distance ?? 0) }
    }
}

struct PlacesResponse: Codable {
    let results: [PlaceResult]
}

struct PlaceResult: Codable {
    let place_id: String
    let name: String
    let vicinity: String?
    let types: [String]
    let geometry: PlaceGeometry
}

struct PlaceGeometry: Codable {
    let location: PlaceLocation
}

struct PlaceLocation: Codable {
    let lat: Double
    let lng: Double
}
