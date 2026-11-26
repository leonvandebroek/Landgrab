import Testing
@testable import GameClient

@Suite struct PositionThrottleTests {
    /// Feeds fix times through the throttle and returns the ones it let through.
    private func sent(_ times: [Double], interval: Double) -> [Double] {
        var throttle = PositionThrottle(interval: interval)
        return times.filter { throttle.shouldSend(at: $0) }
    }

    @Test func firstFixAlwaysGoesOut() {
        #expect(sent([100], interval: 5) == [100])
    }

    @Test func fixesInsideTheIntervalAreDropped() {
        #expect(sent([0, 1, 2, 3, 4, 5, 6, 10], interval: 5) == [0, 5, 10])
    }

    @Test func oneHertzFixesWithJitterAllPassAOneSecondInterval() {
        let times = [0.0, 0.97, 1.99, 2.95, 4.0]
        #expect(sent(times, interval: 1) == times)
    }

    @Test func shorterIntervalAppliesToTheNextFix() {
        var throttle = PositionThrottle(interval: 10)
        let first = throttle.shouldSend(at: 0)
        let tooSoon = throttle.shouldSend(at: 1)
        throttle.setInterval(1)
        let afterChange = throttle.shouldSend(at: 1.5)
        #expect(first && !tooSoon && afterChange)
    }

    @Test func resetSendsTheNextFixImmediately() {
        var throttle = PositionThrottle(interval: 10)
        _ = throttle.shouldSend(at: 0)
        throttle.reset()
        let next = throttle.shouldSend(at: 0.1)
        #expect(next)
    }

    @Test func rateModeIntervalIsInSeconds() {
        #expect(RateModeChangedEvent(mode: .engaged, intervalMs: 1000, nearestDistanceMeters: 80).interval == 1)
    }
}
