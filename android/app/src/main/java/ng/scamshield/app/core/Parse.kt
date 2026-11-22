package ng.scamshield.app.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.math.roundToInt

class ParseException(message: String) : Exception(message)

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

private fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

/**
 * Parse and sanitise model output (port of src/core/parse.ts). Small
 * on-device models can wrap JSON in fences or drift from the schema, so every
 * field is checked and clamped rather than trusted.
 */
fun parseCheckResult(raw: String): CheckResult {
    val cleaned = raw.trim().removePrefix("```json").removePrefix("```").removeSuffix("```")
    val start = cleaned.indexOf('{')
    val end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) throw ParseException("The model did not return a result. Please try again.")
    val o = try {
        json.parseToJsonElement(cleaned.substring(start, end + 1)).jsonObject
    } catch (e: Exception) {
        throw ParseException("The model did not return a result. Please try again.")
    }

    val riskPrim = o["risk"] as? JsonPrimitive
    var risk = riskPrim?.intOrNull ?: riskPrim?.contentOrNull?.toDoubleOrNull()?.roundToInt() ?: 50
    risk = risk.coerceIn(0, 100)

    var verdict = Verdict.entries.firstOrNull { it.name == o.str("verdict") }
        ?: when {
            risk >= 70 -> Verdict.scam
            risk >= 35 -> Verdict.suspicious
            else -> Verdict.safe
        }
    if (verdict == Verdict.safe && risk >= 60) verdict = Verdict.suspicious
    if (verdict == Verdict.scam && risk < 40) risk = 70

    val scamType = o.str("scamType")?.takeIf { it in SCAM_TYPES } ?: if (verdict == Verdict.safe) "none" else "other"

    val redFlags = (o["redFlags"] as? JsonArray).orEmpty()
        .mapNotNull { it as? JsonObject }
        .map { RedFlag(it.str("quote").orEmpty().trim().take(200), it.str("why").orEmpty().trim().take(300)) }
        .filter { it.why.isNotEmpty() }
        .take(4)

    val advice = (o["advice"] as? JsonArray).orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim() }
        .filter { it.isNotEmpty() }
        .take(3)

    return CheckResult(
        verdict = verdict,
        risk = risk,
        scamType = scamType,
        summary = o.str("summary")?.trim()?.ifEmpty { null } ?: "No summary returned.",
        redFlags = redFlags,
        advice = advice,
    )
}
