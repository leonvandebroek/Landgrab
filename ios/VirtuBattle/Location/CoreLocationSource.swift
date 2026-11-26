import CoreLocation

/// Live location from Core Location's async API, foreground only.
///
/// `CLLocationUpdate.liveUpdates(.fitness)` gives about one fix per second while moving, tuned for
/// people on foot. The server's rate mode decides how many of those fixes are sent (see PositionThrottle).
@MainActor
final class CoreLocationSource: LocationSource {
    private var session: CLServiceSession?

    func events() -> AsyncStream<LocationEvent> {
        let (stream, continuation) = AsyncStream.makeStream(of: LocationEvent.self, bufferingPolicy: .bufferingNewest(1))

        // Holding a service session makes iOS ask for When In Use permission and keeps updates flowing.
        session = CLServiceSession(authorization: .whenInUse)

        let task = Task {
            do {
                for try await update in CLLocationUpdate.liveUpdates(.fitness) {
                    if update.authorizationDenied || update.authorizationDeniedGlobally {
                        continuation.yield(.denied)
                        continue
                    }
                    guard let location = update.location, location.horizontalAccuracy >= 0 else { continue }
                    continuation.yield(.fix(LocationFix(
                        latitude: location.coordinate.latitude,
                        longitude: location.coordinate.longitude,
                        horizontalAccuracy: location.horizontalAccuracy,
                        timestamp: location.timestamp)))
                }
            } catch {
                // liveUpdates only throws when cancelled.
            }
            continuation.finish()
        }

        continuation.onTermination = { _ in
            task.cancel()
            Task { @MainActor [weak self] in
                self?.session?.invalidate()
                self?.session = nil
            }
        }
        return stream
    }
}
