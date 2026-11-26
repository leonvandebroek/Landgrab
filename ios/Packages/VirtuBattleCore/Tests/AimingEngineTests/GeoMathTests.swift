import Testing
@testable import AimingEngine

// A spot near Eindhoven, roughly where field tests would happen.
private let origin = GeoPoint(latitude: 51.4416, longitude: 5.4697)

@Suite struct GeoMathTests {
    @Test func distanceOfOneDegreeLatitudeIsAbout111km() {
        let north = GeoPoint(latitude: origin.latitude + 1, longitude: origin.longitude)
        #expect(abs(GeoMath.distance(from: origin, to: north) - 111_195) < 50)
    }

    @Test func distanceToSelfIsZero() {
        #expect(GeoMath.distance(from: origin, to: origin) == 0)
    }

    @Test(arguments: [0.0, 45, 90, 135, 180, 225, 270, 359])
    func destinationRoundTripsBearingAndDistance(bearing: Double) {
        let target = GeoMath.destination(from: origin, bearing: bearing, distance: 50)
        #expect(abs(GeoMath.distance(from: origin, to: target) - 50) < 0.01)
        #expect(abs(GeoMath.signedAngle(from: bearing, to: GeoMath.bearing(from: origin, to: target))) < 0.01)
    }

    @Test(arguments: [
        (10.0, 20.0, 10.0),
        (350.0, 10.0, 20.0),
        (10.0, 350.0, -20.0),
        (0.0, 180.0, 180.0),
        (90.0, -90.0, 180.0),
    ])
    func signedAngleTakesTheShortWay(from: Double, to: Double, expected: Double) {
        #expect(abs(GeoMath.signedAngle(from: from, to: to) - expected) < 1e-9)
    }

    @Test func normalizeDegreesWrapsIntoRange() {
        #expect(GeoMath.normalizeDegrees(-90) == 270)
        #expect(GeoMath.normalizeDegrees(720) == 0)
    }
}

@Suite struct AimConeTests {
    let cone = AimCone()

    @Test func coneWidensUpClose() {
        #expect(cone.halfAngle(atDistance: 5) == 35)
        #expect(cone.halfAngle(atDistance: 100) == 12)
        #expect(abs(cone.halfAngle(atDistance: 35) - 23.5) < 1e-9)
    }

    @Test func aimingStraightAtTargetHits() {
        let target = GeoMath.destination(from: origin, bearing: 80, distance: 40)
        let result = cone.evaluate(shooter: origin, headingDegrees: 80, target: target)
        #expect(result.isHit)
        #expect(abs(result.distance - 40) < 0.01)
    }

    @Test func aimingThirtyDegreesOffAtRangeMisses() {
        let target = GeoMath.destination(from: origin, bearing: 80, distance: 60)
        let result = cone.evaluate(shooter: origin, headingDegrees: 110, target: target)
        #expect(!result.isHit)
        #expect(result.offsetDegrees < 0)
    }

    @Test func thirtyDegreesOffUpCloseStillHits() {
        let target = GeoMath.destination(from: origin, bearing: 80, distance: 8)
        #expect(cone.evaluate(shooter: origin, headingDegrees: 110, target: target).isHit)
    }

    @Test func beyondMaxRangeAlwaysMisses() {
        let target = GeoMath.destination(from: origin, bearing: 0, distance: 200)
        #expect(!cone.evaluate(shooter: origin, headingDegrees: 0, target: target).isHit)
    }

    @Test func aimingAcrossNorthWorks() {
        let target = GeoMath.destination(from: origin, bearing: 355, distance: 30)
        #expect(cone.evaluate(shooter: origin, headingDegrees: 5, target: target).isHit)
    }
}
