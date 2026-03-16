import Foundation
import Combine
import FirebaseFirestore
import FirebaseAuth

@MainActor
class CheckInViewModel: ObservableObject {
    @Published var activeCheckIn: CheckIn?
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let firestoreService = FirestoreService.shared
    private var expiryTimer: Timer?

    init() {
        Task { await loadActiveCheckIn() }
    }

    func loadActiveCheckIn() async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        do {
            activeCheckIn = try await firestoreService.getActiveCheckIn(userId: uid)
            if let checkIn = activeCheckIn, checkIn.isExpired {
                await checkOut()
            } else {
                scheduleExpiryTimer()
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func checkIn(to venue: Venue) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }

        if activeCheckIn != nil {
            await checkOut()
        }

        isLoading = true
        errorMessage = nil

        let now = Date()
        let expiry = Calendar.current.date(byAdding: .hour, value: 3, to: now) ?? now

        let checkIn = CheckIn(
            userId: uid,
            venueId: venue.placeId,
            venueName: venue.name,
            latitude: venue.latitude,
            longitude: venue.longitude,
            isActive: true,
            checkedInAt: Timestamp(date: now),
            expiresAt: Timestamp(date: expiry)
        )

        do {
            let id = try await firestoreService.createCheckIn(checkIn)
            var savedCheckIn = checkIn
            savedCheckIn.id = id
            activeCheckIn = savedCheckIn
            scheduleExpiryTimer()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    func checkOut() async {
        guard let id = activeCheckIn?.id else { return }
        expiryTimer?.invalidate()
        expiryTimer = nil
        do {
            try await firestoreService.deactivateCheckIn(id: id)
            activeCheckIn = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func scheduleExpiryTimer() {
        expiryTimer?.invalidate()
        guard let expiry = activeCheckIn?.expiresAt.dateValue() else { return }
        let interval = expiry.timeIntervalSinceNow
        guard interval > 0 else {
            Task { await checkOut() }
            return
        }
        expiryTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            Task { await self?.checkOut() }
        }
    }

    var timeRemainingText: String? {
        guard let expiry = activeCheckIn?.expiresAt.dateValue() else { return nil }
        let remaining = expiry.timeIntervalSinceNow
        if remaining <= 0 { return nil }
        let hours = Int(remaining) / 3600
        let minutes = (Int(remaining) % 3600) / 60
        if hours > 0 {
            return "\(hours)s \(minutes)dk"
        }
        return "\(minutes)dk"
    }
}
