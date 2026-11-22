package ng.scamshield.app.core

/**
 * On-device redaction, a port of src/core/redact.ts. Runs before ANY text is
 * sent to the cloud: personal identifiers become typed placeholders, while
 * scam signals that are not personal (amounts, link domains) are kept.
 */
enum class RedactionKind { EMAIL, PHONE, CARD_NUMBER, BVN_OR_NIN, ACCOUNT_NUMBER, OTP, URL_DETAILS, NAME }

data class Redaction(val kind: RedactionKind, val placeholder: String)
data class RedactionResult(val text: String, val redactions: List<Redaction>)

private class Rule(
    val kind: RedactionKind,
    val re: Regex,
    val accept: (MatchResult) -> Boolean = { true },
    val replace: ((MatchResult, String) -> String)? = null,
)

private fun luhnOk(digits: String): Boolean {
    var sum = 0
    var double = false
    for (i in digits.indices.reversed()) {
        var d = digits[i] - '0'
        if (double) {
            d *= 2
            if (d > 9) d -= 9
        }
        sum += d
        double = !double
    }
    return sum % 10 == 0
}

private val RULES = listOf(
    Rule(RedactionKind.EMAIL, Regex("""[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}""")),
    Rule(
        RedactionKind.URL_DETAILS,
        Regex("""\b((?:https?://)?(?:[a-z0-9-]+\.)+[a-z]{2,})(/[^\s)]*)""", RegexOption.IGNORE_CASE),
        accept = { it.groupValues[2].length > 1 },
        replace = { m, p -> "${m.groupValues[1]}/$p" },
    ),
    Rule(
        RedactionKind.OTP,
        Regex("""\b(otp|code|pin|token|password)(\s*(?:is|:|-)?\s*)(\d{4,8})\b""", RegexOption.IGNORE_CASE),
        replace = { m, p -> "${m.groupValues[1]}${m.groupValues[2]}$p" },
    ),
    Rule(
        RedactionKind.CARD_NUMBER,
        Regex("""\b(?:\d[ -]?){12,18}\d\b"""),
        accept = { m -> m.value.filter(Char::isDigit).let { it.length in 13..19 && luhnOk(it) } },
    ),
    Rule(RedactionKind.PHONE, Regex("""(?:\+?234[\s-]?|\b0)[789][01]\d(?:[\s-]?\d){7}\b""")),
    Rule(RedactionKind.PHONE, Regex("""\+\d{1,3}[\s-]?\d(?:[\s-]?\d){6,12}\b""")),
    Rule(RedactionKind.BVN_OR_NIN, Regex("""\b\d{11}\b""")),
    Rule(RedactionKind.ACCOUNT_NUMBER, Regex("""\b\d{10}\b""")),
)

private val PLACEHOLDER = Regex("""\[[A-Z_]+_\d+]""")
private val NOT_NAMES = setOf(
    "customer", "customers", "sir", "madam", "ma", "user", "client", "friend", "dear", "all", "team", "valued",
    "esteemed", "winner", "beneficiary", "account", "holder", "the", "a", "an", "our", "your",
)
private const val CAP = "[A-Z][a-z'’-]+"
private val NAME_PATTERNS = listOf(
    Regex("""\b(?:Dear|Hello|Hi|Hey)\s+($CAP(?:\s+$CAP)?)"""),
    Regex("""\b(?:[Tt]his is|I am|I'm|[Mm]y name is|[Nn]ame is)\s+($CAP(?:\s+$CAP)?)"""),
    Regex("""\b(?:Mr|Mrs|Ms|Miss|Dr|Engr|Barr|Chief|Alhaji|Alhaja|Pastor|Prof)\.?\s+($CAP(?:\s+$CAP)?)"""),
    Regex("""\b(?:FROM|TO|BY)\s*:?\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){1,2})\b"""),
)

/** Rule-based name finder used when no on-device model can find names. */
fun heuristicNames(text: String): List<String> {
    val found = linkedSetOf<String>()
    for (re in NAME_PATTERNS) for (m in re.findAll(text)) {
        val words = m.groupValues[1].split(Regex("\\s+")).filter { it.lowercase() !in NOT_NAMES }
        if (words.isNotEmpty()) found += words.joinToString(" ")
    }
    return found.toList()
}

fun redact(input: String, names: List<String> = emptyList()): RedactionResult {
    var text = input
    val redactions = mutableListOf<Redaction>()
    val counters = mutableMapOf<RedactionKind, Int>()
    val seen = mutableMapOf<String, String>()

    fun placeholderFor(kind: RedactionKind, value: String): String {
        val key = "$kind:$value"
        seen[key]?.let { return it }
        val n = (counters[kind] ?: 0) + 1
        counters[kind] = n
        val placeholder = "[${kind.name}_$n]"
        seen[key] = placeholder
        redactions += Redaction(kind, placeholder)
        return placeholder
    }

    for (rule in RULES) {
        text = rule.re.replace(text) { m ->
            if (PLACEHOLDER.containsMatchIn(m.value) || !rule.accept(m)) return@replace m.value
            val digits = m.value.filter(Char::isDigit)
            val valueKey = when (rule.kind) {
                RedactionKind.OTP, RedactionKind.URL_DETAILS -> m.value
                RedactionKind.PHONE -> digits.takeLast(10) // +234 803…, 234803…, 0803… are one number
                else -> digits.ifEmpty { m.value }
            }
            val placeholder = placeholderFor(rule.kind, valueKey)
            rule.replace?.invoke(m, placeholder) ?: placeholder
        }
    }

    for (raw in names + heuristicNames(text)) {
        val name = raw.trim()
        if (name.length < 2) continue
        val re = Regex("\\b${Regex.escape(name)}\\b", RegexOption.IGNORE_CASE)
        if (!re.containsMatchIn(text)) continue
        val placeholder = placeholderFor(RedactionKind.NAME, name.lowercase())
        text = re.replace(text, Regex.escapeReplacement(placeholder))
    }
    return RedactionResult(text, redactions)
}
