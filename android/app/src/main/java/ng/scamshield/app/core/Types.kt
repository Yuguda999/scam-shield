package ng.scamshield.app.core

enum class Verdict { scam, suspicious, safe }

val SCAM_TYPES = listOf(
    "fake_bank_alert",
    "account_or_bvn_update",
    "otp_or_pin_request",
    "fake_job_offer",
    "investment_or_ponzi",
    "loan_app",
    "prize_or_giveaway",
    "impersonation",
    "romance",
    "delivery_or_customs",
    "phishing_link",
    "other",
    "none",
)

val SCAM_LABELS = mapOf(
    "fake_bank_alert" to "Fake bank alert",
    "account_or_bvn_update" to "Account or BVN “update”",
    "otp_or_pin_request" to "OTP or PIN request",
    "fake_job_offer" to "Fake job offer",
    "investment_or_ponzi" to "Investment or Ponzi",
    "loan_app" to "Loan app",
    "prize_or_giveaway" to "Fake prize or giveaway",
    "impersonation" to "Impersonation",
    "romance" to "Romance scam",
    "delivery_or_customs" to "Delivery or customs fee",
    "phishing_link" to "Phishing link",
    "other" to "Other scam",
    "none" to "No scam pattern",
)

data class RedFlag(val quote: String, val why: String)

data class CheckResult(
    val verdict: Verdict,
    val risk: Int,
    val scamType: String,
    val summary: String,
    val redFlags: List<RedFlag>,
    val advice: List<String>,
)

enum class Source { ON_DEVICE, IN_CLOUD }

enum class RouteReason(val label: String) {
    ON_DEVICE_AVAILABLE("Checked privately on this phone. Nothing was sent anywhere."),
    NO_ON_DEVICE_MODEL("This phone has no on-device AI, so a redacted copy was checked in the cloud."),
    TOO_LONG_FOR_DEVICE("Too long for the on-device AI, so a redacted copy was checked in the cloud."),
    USER_REQUESTED_DEEP_CHECK("You asked for a second opinion. Only the redacted copy was sent."),
}

data class CheckOutcome(
    val result: CheckResult,
    val source: Source,
    val redacted: Boolean,
    val sentText: String,
    val ms: Long,
    val route: RouteReason,
)
