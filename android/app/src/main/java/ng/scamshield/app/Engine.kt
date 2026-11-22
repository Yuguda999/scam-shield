package ng.scamshield.app

import kotlinx.coroutines.flow.Flow
import ng.scamshield.app.core.CheckOutcome
import ng.scamshield.app.core.DeviceStatus
import ng.scamshield.app.core.RedactionResult
import ng.scamshield.app.core.RouteDecision
import ng.scamshield.app.core.Source

data class Plan(val decision: RouteDecision, val device: DeviceStatus, val redaction: RedactionResult?)

/** Everything the screen needs; implemented with Firebase in FirebaseEngine. */
interface Engine {
    suspend fun deviceStatus(): DeviceStatus
    suspend fun downloadModel(onProgress: (Float) -> Unit)
    suspend fun plan(text: String, deepCheck: Boolean = false): Plan
    suspend fun run(text: String, plan: Plan): CheckOutcome
    fun explain(outcome: CheckOutcome, language: String): Flow<Pair<String, Source>>
    suspend fun communityText(outcome: CheckOutcome, original: String): String
    suspend fun seenThisWeek(redactedText: String): Int
    suspend fun report(outcome: CheckOutcome, redactedText: String)
}
