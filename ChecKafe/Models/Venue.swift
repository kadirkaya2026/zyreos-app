import Foundation
import CoreLocation

struct Venue: Identifiable, Codable, Hashable {
    var id: String { placeId }
    var placeId: String
    var name: String
    var type: String
    var latitude: Double
    var longitude: Double
    var address: String
    var distance: Double?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var typeDisplayName: String {
        switch type {
        case "cafe": return "Kafe"
        case "restaurant": return "Restoran"
        case "bar": return "Bar"
        case "night_club": return "Kulup"
        default: return "Mekan"
        }
    }

    var typeIcon: String {
        switch type {
        case "cafe": return "cup.and.saucer.fill"
        case "restaurant": return "fork.knife"
        case "bar": return "wineglass.fill"
        case "night_club": return "music.note.house.fill"
        default: return "mappin.circle.fill"
        }
    }
}
