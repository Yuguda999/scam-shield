package ng.scamshield.app.core

/**
 * Same prompts as the web app (src/core/prompts.ts). Instructions are inline
 * because on-device models do not take system instructions. Remote Config can
 * override the scam patterns.
 */
val DEFAULT_PATTERNS = listOf(
    "Credit \"alerts\" sent by SMS/WhatsApp from a normal phone number, or a screenshot of a transfer, used to get goods released before money lands.",
    "Messages saying your account, BVN, NIN or SIM will be blocked unless you \"update\" via a link or call.",
    "Anyone asking for an OTP, PIN, card number or password. Banks never ask for these.",
    "Job offers that need an \"application\", \"training\" or \"registration\" fee, or interviews only on WhatsApp/Telegram.",
    "Investments promising fixed high returns (e.g. 20-50% monthly), \"double your money\", referral bonuses, crypto trading platforms that freeze withdrawals.",
    "Loan apps that demand an upfront \"processing\" fee or threaten to message your contacts.",
    "Prizes, giveaways, grants or \"foundation\" money you never applied for that need a fee to claim.",
    "People claiming to be EFCC, police, bank staff, a relative with a new number, or a boss, asking for urgent money.",
    "Delivery or customs messages asking for a small fee to release a package.",
    "Links with misspelled bank names or odd domains (e.g. gtb-secure-update.com, zenith-verify.top).",
)

fun checkPrompt(message: String, patterns: List<String> = DEFAULT_PATTERNS, redacted: Boolean = false): String = buildList {
    add("You are Scam Shield, a fraud checker for people in Nigeria. Decide if the MESSAGE below is a scam.")
    add("Known scam patterns:")
    patterns.forEach { add("- $it") }
    add("Rules:")
    add("- verdict: \"scam\" if it clearly matches a scam pattern, \"suspicious\" if some warning signs, \"safe\" if normal.")
    add("- risk: 0-100.")
    add("- scamType: one of ${SCAM_TYPES.joinToString(", ")}. Use \"none\" when safe.")
    add("- summary: one plain sentence a non-technical person understands.")
    add("- redFlags: up to 4. quote = short exact words copied from the message; why = one short sentence.")
    add("- advice: 2-3 short, practical steps (e.g. \"Check your bank app, not the SMS\").")
    add("- Do not invent details that are not in the message.")
    if (redacted) add("- Personal details were replaced with placeholders like [PHONE_1] or [ACCOUNT_NUMBER_1]. Treat them as real values; asking for them is still a red flag.")
    add("Respond with JSON only, matching: {\"verdict\":string,\"risk\":integer,\"scamType\":string,\"summary\":string,\"redFlags\":[{\"quote\":string,\"why\":string}],\"advice\":[string]}")
    add("MESSAGE:")
    add("\"\"\"")
    add(message)
    add("\"\"\"")
}.joinToString("\n")

val LANGUAGES = linkedMapOf(
    "ha" to "Hausa",
    "yo" to "Yorùbá",
    "ig" to "Igbo",
    "pcm" to "Nigerian Pidgin",
    "en" to "simple English",
)

fun explainPrompt(r: CheckResult, language: String): String = listOf(
    "Explain this scam warning to an ordinary person in ${LANGUAGES[language]}.",
    "Use short sentences and everyday words. Keep it under 120 words. No markdown.",
    "",
    "Finding: ${r.summary}",
    "Warning signs: ${r.redFlags.joinToString("; ") { "\"${it.quote}\" (${it.why})" }}",
    "What to do: ${r.advice.joinToString("; ")}",
).joinToString("\n")
