package ng.scamshield.app.core

import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.IsoFields

/** Port of src/core/community.ts. Must produce identical keys so Android and web reports match. */
fun isoWeek(date: LocalDate = LocalDate.now(ZoneOffset.UTC)): String {
    val week = date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = date.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, week)
}

fun normalizeForFingerprint(redactedText: String): String = redactedText
    .lowercase()
    .replace(Regex("""\[[a-z_]+_\d+]"""), " ")
    .replace(Regex("""[₦$€£]?\s?\d[\d,.]*"""), " ")
    .replace(Regex("""[^\p{L}\s]"""), " ")
    .replace(Regex("""\s+"""), " ")
    .trim()
    .take(400)

fun fingerprint(redactedText: String): String =
    MessageDigest.getInstance("SHA-256")
        .digest(normalizeForFingerprint(redactedText).toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
