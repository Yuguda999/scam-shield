package ng.scamshield.app

import com.google.firebase.Firebase
import com.google.firebase.ai.GenerativeModel
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.ai
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.auth.auth
import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.firestore
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import ng.scamshield.app.core.CheckOutcome
import ng.scamshield.app.core.DEFAULT_PATTERNS
import ng.scamshield.app.core.DeviceStatus
import ng.scamshield.app.core.RedactionResult
import ng.scamshield.app.core.SCAM_TYPES
import ng.scamshield.app.core.Source
import ng.scamshield.app.core.Verdict
import ng.scamshield.app.core.checkPrompt
import ng.scamshield.app.core.explainPrompt
import ng.scamshield.app.core.fingerprint
import ng.scamshield.app.core.isoWeek
import ng.scamshield.app.core.parseCheckResult
import ng.scamshield.app.core.redact
import ng.scamshield.app.core.route

/**
 * Firebase AI Logic hybrid inference with privacy-aware routing.
 *
 * Every call states where it may run:
 *  - ONLY_ON_DEVICE  for the raw message (check, name finding) - it can never leak to the cloud.
 *  - ONLY_IN_CLOUD   for the redacted copy when the phone has no Gemini Nano or the text is too long.
 *  - PREFER_ON_DEVICE / PREFER_IN_CLOUD for explanations, which only contain the redacted finding.
 */
@OptIn(PublicPreviewAPI::class) // hybrid on-device inference is a public preview in firebase-ai 18.x
class FirebaseEngine : Engine {
    private data class Settings(val cloudModel: String, val maxDeviceChars: Int, val patterns: List<String>)

    private val ai by lazy { Firebase.ai(backend = GenerativeBackend.googleAI()) }
    private val models = mutableMapOf<String, GenerativeModel>()
    private val settingsLock = Mutex()
    private var settings: Settings? = null

    private val checkSchema = Schema.obj(
        mapOf(
            "verdict" to Schema.enumeration(listOf("scam", "suspicious", "safe")),
            "risk" to Schema.integer(),
            "scamType" to Schema.enumeration(SCAM_TYPES),
            "summary" to Schema.string(),
            "redFlags" to Schema.array(Schema.obj(mapOf("quote" to Schema.string(), "why" to Schema.string()))),
            "advice" to Schema.array(Schema.string()),
        ),
    )
    private val namesSchema = Schema.obj(mapOf("names" to Schema.array(Schema.string())))

    /** Remote Config pushes scam patterns, the on-device length limit and the cloud model without a release. */
    private suspend fun settings(): Settings = settingsLock.withLock {
        settings ?: run {
            val rc = Firebase.remoteConfig
            rc.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 3600 })
            rc.setDefaultsAsync(
                mapOf(
                    "cloud_model" to "gemini-3.5-flash-lite",
                    "android_max_device_chars" to 3000L, // on-device limit is 4,000 tokens for the whole request
                    "scam_patterns" to Json.encodeToString(JsonArray.serializer(), JsonArray(DEFAULT_PATTERNS.map(::JsonPrimitive))),
                ),
            ).await()
            // Don't block the first check on the network: use defaults / last activated values now,
            // fetch in the background and activate for the next launch.
            rc.fetch().addOnSuccessListener { rc.activate() }
            val patterns = runCatching {
                Json.parseToJsonElement(rc.getString("scam_patterns")).let { it as JsonArray }.map { (it as JsonPrimitive).content }
            }.getOrNull()?.takeIf { it.isNotEmpty() } ?: DEFAULT_PATTERNS
            Settings(
                cloudModel = rc.getString("cloud_model").ifEmpty { "gemini-3.5-flash-lite" },
                maxDeviceChars = rc.getLong("android_max_device_chars").toInt().takeIf { it > 0 } ?: 3000,
                patterns = patterns,
            ).also { settings = it }
        }
    }

    private suspend fun model(mode: InferenceMode, schema: Schema?): GenerativeModel {
        val s = settings()
        val key = "$mode:${schema?.hashCode()}"
        return models.getOrPut(key) {
            ai.generativeModel(
                modelName = s.cloudModel,
                generationConfig = generationConfig {
                    temperature = if (schema != null) 0.2f else 0.4f
                    if (schema != null) {
                        responseMimeType = "application/json"
                        responseSchema = schema
                    }
                },
                onDeviceConfig = OnDeviceConfig(mode = mode),
            )
        }
    }

    /** The on-device extension of the ONLY_ON_DEVICE check model reports Gemini Nano's status on this phone. */
    private suspend fun onDevice() = model(InferenceMode.ONLY_ON_DEVICE, checkSchema).onDeviceExtension

    override suspend fun deviceStatus(): DeviceStatus = try {
        when (onDevice()?.checkStatus()) {
            OnDeviceModelStatus.AVAILABLE -> DeviceStatus.AVAILABLE
            OnDeviceModelStatus.DOWNLOADABLE -> DeviceStatus.DOWNLOADABLE
            OnDeviceModelStatus.DOWNLOADING -> DeviceStatus.DOWNLOADING
            else -> DeviceStatus.UNAVAILABLE
        }
    } catch (e: Exception) {
        DeviceStatus.UNAVAILABLE
    }

    override suspend fun downloadModel(onProgress: (Float) -> Unit) {
        var total = 0L
        (onDevice() ?: error("On-device AI is not supported on this phone")).download().collect { st ->
            when (st) {
                is DownloadStatus.DownloadStarted -> { total = st.bytesToDownload; onProgress(0f) }
                is DownloadStatus.DownloadInProgress -> if (total > 0) onProgress((st.totalBytesDownloaded.toFloat() / total).coerceIn(0f, 1f))
                is DownloadStatus.DownloadCompleted -> onProgress(1f)
                is DownloadStatus.DownloadFailed -> throw st.exception
                else -> Unit
            }
        }
    }

    /** Regex rules always; person names from Gemini Nano when it is on the phone (ONLY_ON_DEVICE). */
    private suspend fun redactOnDevice(text: String, device: DeviceStatus): RedactionResult {
        var names = emptyList<String>()
        if (device == DeviceStatus.AVAILABLE) {
            names = runCatching {
                val res = model(InferenceMode.ONLY_ON_DEVICE, namesSchema).generateContent(
                    "List every personal name of a real person in the MESSAGE. Not companies, banks or brands. " +
                        "Respond with JSON {\"names\":[string]}.\nMESSAGE:\n\"\"\"\n${text.take(2500)}\n\"\"\"",
                )
                val o = Json.parseToJsonElement(res.text.orEmpty().trim().removePrefix("```json").removeSuffix("```")).jsonObject
                (o["names"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content }
            }.getOrDefault(emptyList())
        }
        return redact(text, names)
    }

    override suspend fun plan(text: String, deepCheck: Boolean): Plan {
        val s = settings()
        val device = deviceStatus()
        val decision = route(text.length, device, s.maxDeviceChars, deepCheck)
        return Plan(decision, device, if (decision.redact) redactOnDevice(text, device) else null)
    }

    override suspend fun run(text: String, plan: Plan): CheckOutcome {
        val s = settings()
        val started = System.currentTimeMillis()
        val onDevice = plan.decision.onDevice
        val sent = if (onDevice) text else plan.redaction!!.text
        val res = model(if (onDevice) InferenceMode.ONLY_ON_DEVICE else InferenceMode.ONLY_IN_CLOUD, checkSchema)
            .generateContent(checkPrompt(sent, s.patterns, redacted = !onDevice))
        return CheckOutcome(
            result = parseCheckResult(res.text.orEmpty()),
            source = if (res.inferenceSource == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD,
            redacted = !onDevice,
            sentText = sent,
            ms = System.currentTimeMillis() - started,
            route = plan.decision.reason,
        )
    }

    /**
     * English prefers Gemini Nano; Hausa, Yorùbá, Igbo and Pidgin prefer the cloud
     * (on-device is only validated for English). The prompt holds the redacted finding only.
     */
    override fun explain(outcome: CheckOutcome, language: String): Flow<Pair<String, Source>> = flow {
        val prompt = redact(explainPrompt(outcome.result, language)).text
        val mode = if (language == "en") InferenceMode.PREFER_ON_DEVICE else InferenceMode.PREFER_IN_CLOUD
        var text = ""
        try {
            model(mode, null).generateContentStream(prompt).collect { chunk ->
                text += chunk.text.orEmpty()
                emit(text to if (chunk.inferenceSource == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD)
            }
        } catch (e: Exception) {
            if (text.isNotEmpty()) return@flow // keep the partial answer
            val res = model(mode, null).generateContent(prompt) // streams can fail mid-flight; retry once
            emit(res.text.orEmpty() to if (res.inferenceSource == InferenceSource.ON_DEVICE) Source.ON_DEVICE else Source.IN_CLOUD)
        }
    }

    // ---- community reports: anonymous auth + Firestore, redacted text only ----

    private suspend fun uid(): String {
        val auth = Firebase.auth
        return auth.currentUser?.uid ?: auth.signInAnonymously().await().user!!.uid
    }

    override suspend fun communityText(outcome: CheckOutcome, original: String): String =
        if (outcome.redacted) outcome.sentText else redactOnDevice(original, deviceStatus()).text

    override suspend fun seenThisWeek(redactedText: String): Int {
        uid()
        val q = Firebase.firestore.collection("reports")
            .whereEqualTo("fingerprint", fingerprint(redactedText))
            .whereEqualTo("week", isoWeek())
        // Mobile networks drop DNS lookups now and then; Firestore's gRPC channel
        // recovers on its own, so retry a few times before giving up.
        var last: Exception? = null
        repeat(3) { attempt ->
            try {
                return q.count().get(AggregateSource.SERVER).await().count.toInt()
            } catch (e: Exception) {
                last = e
                kotlinx.coroutines.delay(2000L shl attempt)
            }
        }
        throw last!!
    }

    override suspend fun report(outcome: CheckOutcome, redactedText: String) {
        val r = outcome.result
        Firebase.firestore.collection("reports").add(
            mapOf(
                "uid" to uid(),
                "createdAt" to FieldValue.serverTimestamp(),
                "week" to isoWeek(),
                "fingerprint" to fingerprint(redactedText),
                "scamType" to r.scamType,
                "verdict" to if (r.verdict == Verdict.safe) "suspicious" else r.verdict.name,
                "risk" to r.risk,
                "text" to redactedText.take(2000),
                "flags" to r.redFlags.map { redact(it.why).text.take(300) }.take(4),
                "source" to if (outcome.source == Source.ON_DEVICE) "on_device" else "in_cloud",
            ),
        ).await()
    }
}
