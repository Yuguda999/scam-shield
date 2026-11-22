package ng.scamshield.app

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ng.scamshield.app.core.CheckOutcome
import ng.scamshield.app.core.DeviceStatus
import ng.scamshield.app.core.Source

sealed interface Screen {
    data object Empty : Screen
    data class Loading(val label: String) : Screen
    data class Consent(val plan: Plan, val text: String) : Screen
    data class Result(val outcome: CheckOutcome, val original: String) : Screen
    data class Error(val message: String) : Screen
}

sealed interface Community {
    data object Loading : Community
    data class Count(val n: Int) : Community
    data object Unavailable : Community
}

sealed interface ReportState {
    data object Idle : ReportState
    data class Confirm(val redactedText: String) : ReportState
    data object Sending : ReportState
    data object Done : ReportState
    data class Failed(val message: String) : ReportState
}

data class Explanation(val language: String, val text: String = "", val source: Source? = null, val error: String? = null)

data class UiState(
    val input: String = "",
    val device: DeviceStatus? = null,
    val downloadProgress: Float? = null,
    val screen: Screen = Screen.Empty,
    val explanation: Explanation? = null,
    val community: Community = Community.Loading,
    val report: ReportState = ReportState.Idle,
    val busy: Boolean = false,
)

class MainViewModel(app: Application) : AndroidViewModel(app) {
    private val engine: Engine = (app as ScamShieldApp).engine
    private val prefs = app.getSharedPreferences("scam-shield", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()
    private var explainJob: Job? = null
    private var communityRedacted: String? = null

    init { refreshDevice() }

    fun setInput(text: String) = _state.update { it.copy(input = text) }

    fun refreshDevice() = viewModelScope.launch {
        val d = runCatching { engine.deviceStatus() }.getOrDefault(DeviceStatus.UNAVAILABLE)
        _state.update { it.copy(device = d) }
    }

    fun downloadModel() = viewModelScope.launch {
        _state.update { it.copy(downloadProgress = 0f) }
        runCatching { engine.downloadModel { p -> _state.update { s -> s.copy(downloadProgress = p) } } }
        _state.update { it.copy(downloadProgress = null) }
        refreshDevice()
    }

    fun check(text: String = _state.value.input, deepCheck: Boolean = false) {
        val msg = text.trim()
        if (msg.isEmpty()) return
        _state.update {
            it.copy(input = msg, busy = true, explanation = null, report = ReportState.Idle, community = Community.Loading,
                screen = Screen.Loading(if (deepCheck) "Redacting on your phone" else "Reading the message"))
        }
        viewModelScope.launch {
            try {
                val p = engine.plan(msg, deepCheck)
                _state.update { it.copy(device = p.device) }
                if (!p.decision.onDevice && !deepCheck && !prefs.getBoolean("cloudConsent", false)) {
                    _state.update { it.copy(screen = Screen.Consent(p, msg), busy = false) }
                } else {
                    execute(msg, p)
                }
            } catch (e: Exception) {
                fail(e)
            }
        }
    }

    fun sendRedacted(plan: Plan, text: String, remember: Boolean) {
        if (remember) prefs.edit().putBoolean("cloudConsent", true).apply()
        viewModelScope.launch { execute(text, plan) }
    }

    fun cancel() = _state.update { it.copy(screen = Screen.Empty, busy = false) }

    private suspend fun execute(text: String, p: Plan) {
        _state.update {
            it.copy(busy = true, screen = Screen.Loading(if (p.decision.onDevice) "Checking privately on this phone" else "Checking the redacted copy in the cloud"))
        }
        try {
            val outcome = engine.run(text, p)
            _state.update { it.copy(screen = Screen.Result(outcome, text), busy = false) }
            loadCommunity(outcome, text)
        } catch (e: Exception) {
            fail(e)
        }
    }

    private fun loadCommunity(outcome: CheckOutcome, original: String) = viewModelScope.launch {
        try {
            val redacted = engine.communityText(outcome, original).also { communityRedacted = it }
            _state.update { it.copy(community = Community.Count(engine.seenThisWeek(redacted))) }
        } catch (e: Exception) {
            _state.update { it.copy(community = Community.Unavailable) }
        }
    }

    fun startReport() {
        val text = communityRedacted ?: return
        _state.update { it.copy(report = ReportState.Confirm(text)) }
    }

    fun cancelReport() = _state.update { it.copy(report = ReportState.Idle) }

    fun confirmReport(outcome: CheckOutcome, redacted: String) = viewModelScope.launch {
        _state.update { it.copy(report = ReportState.Sending) }
        try {
            engine.report(outcome, redacted)
            val n = engine.seenThisWeek(redacted)
            _state.update { it.copy(report = ReportState.Done, community = Community.Count(n)) }
        } catch (e: Exception) {
            _state.update { it.copy(report = ReportState.Failed(friendly(e))) }
        }
    }

    fun explain(outcome: CheckOutcome, language: String) {
        explainJob?.cancel()
        _state.update { it.copy(explanation = Explanation(language)) }
        explainJob = viewModelScope.launch {
            try {
                engine.explain(outcome, language).collect { (text, source) ->
                    _state.update { it.copy(explanation = Explanation(language, text, source)) }
                }
            } catch (e: Exception) {
                _state.update { it.copy(explanation = Explanation(language, error = friendly(e))) }
            }
        }
    }

    private fun fail(e: Exception) = _state.update { it.copy(screen = Screen.Error(friendly(e)), busy = false) }

    private fun friendly(e: Exception): String {
        val m = e.message.orEmpty()
        return when {
            Regex("app.?check|attestation|403|PERMISSION_DENIED|401", RegexOption.IGNORE_CASE).containsMatchIn(m) ->
                "The cloud check was blocked by App Check. This build’s debug token needs to be registered."
            Regex("Unable to resolve host|timeout|network|UnknownHost", RegexOption.IGNORE_CASE).containsMatchIn(m) ->
                "You seem to be offline, and this check needs the cloud. Try again when you’re connected."
            else -> m.ifEmpty { "Something went wrong. Please try again." }
        }
    }
}
