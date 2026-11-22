package ng.scamshield.app.core

/** Mirrors FirebaseAIOnDevice.checkStatus() plus "no API" for completeness. */
enum class DeviceStatus { AVAILABLE, DOWNLOADABLE, DOWNLOADING, UNAVAILABLE }

data class RouteDecision(val onDevice: Boolean, val redact: Boolean, val reason: RouteReason)

/**
 * Privacy-aware routing (port of src/core/router.ts). Raw text may only ever
 * reach the on-device model; anything bound for the cloud is redacted first.
 * Android's on-device limit is 4,000 tokens for the whole request.
 */
fun route(textLength: Int, device: DeviceStatus, maxDeviceChars: Int, deepCheck: Boolean = false): RouteDecision = when {
    deepCheck -> RouteDecision(onDevice = false, redact = true, reason = RouteReason.USER_REQUESTED_DEEP_CHECK)
    device != DeviceStatus.AVAILABLE -> RouteDecision(false, true, RouteReason.NO_ON_DEVICE_MODEL)
    textLength > maxDeviceChars -> RouteDecision(false, true, RouteReason.TOO_LONG_FOR_DEVICE)
    else -> RouteDecision(true, false, RouteReason.ON_DEVICE_AVAILABLE)
}
