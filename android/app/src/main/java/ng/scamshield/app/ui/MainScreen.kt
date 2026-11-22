package ng.scamshield.app.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalClipboardManager // LocalClipboard needs a suspend scope; fine for a button tap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import ng.scamshield.app.Community
import ng.scamshield.app.MainViewModel
import ng.scamshield.app.Plan
import ng.scamshield.app.ReportState
import ng.scamshield.app.Screen
import ng.scamshield.app.UiState
import ng.scamshield.app.core.CheckOutcome
import ng.scamshield.app.core.DeviceStatus
import ng.scamshield.app.core.LANGUAGES
import ng.scamshield.app.core.SCAM_LABELS
import ng.scamshield.app.core.Source
import ng.scamshield.app.core.Verdict

private val SAMPLES = listOf(
    "BVN update" to "Dear Customer, your GTBank account has been restricted due to BVN update. Click https://gtb-secure-update.com/verify to reactivate within 24hrs or call 08031234567.",
    "Credit alert" to "CREDIT ALERT! Acct: 012****789 Amt: NGN250,000.00 Desc: TRF FROM CHIOMA OKAFOR. Avail Bal: NGN251,340.22. Pls release the goods, I have paid.",
    "Job offer" to "Hi, this is Tunde from HR at Dangote Group. You have been shortlisted for a remote data entry role (₦350,000/month). Pay ₦15,000 training fee to 0123456789 to start Monday.",
    "Family" to "Hi mum, I am at the shop. Can you send ₦3,000 for the bread and milk? I will pay you back when I get home tonight.",
)

@Composable
fun MainScreen(vm: MainViewModel, state: UiState) {
    val t = LocalTokens.current
    val atmosphere = if (t.dark) {
        Brush.radialGradient(listOf(Color(0xFF1E423C), Color(0xFF050A0B)), radius = 1600f, center = androidx.compose.ui.geometry.Offset(900f, -200f))
    } else SolidColor(t.background)
    Box(Modifier.fillMaxSize().background(t.background).background(atmosphere)) {
        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 12.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Header(state, onDownload = vm::downloadModel)
            Composer(state, vm)
            AnimatedContent(
                targetState = state.screen,
                transitionSpec = { (fadeIn(tween(320)) + slideInVertically(tween(320)) { it / 24 }) togetherWith fadeOut(tween(120)) },
                contentKey = { it::class },
                label = "out",
            ) { screen ->
                when (screen) {
                    Screen.Empty -> StateCard("Paste anything that feels off", "A bank alert, a job offer, a “BVN update” link. Scam Shield reads it on your phone first.", t.signal)
                    is Screen.Loading -> StateCard(screen.label, "This takes a few seconds", t.signal)
                    is Screen.Error -> StateCard("That didn’t work", screen.message, t.critical)
                    is Screen.Consent -> ConsentCard(screen.plan, screen.text, vm)
                    is Screen.Result -> ResultCard(screen.outcome, state, vm)
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = Arrangement.Center) {
                Readout("Raw messages stay on your phone. Cloud gets a redacted copy.", align = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun Header(state: UiState, onDownload: () -> Unit) {
    val t = LocalTokens.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(t.inverse), contentAlignment = Alignment.Center) {
            ShieldIcon(t.inverseForeground, 18.dp)
        }
        Box(Modifier.size(0.dp)) // keeps the signal dot anchored to the mark below
        Column(Modifier.padding(start = 10.dp)) {
            Text("Scam Shield", style = Type.wordmark, color = t.foreground)
            Readout("Check before you pay", Modifier.padding(top = 2.dp))
        }
        Grow()
        val p = state.downloadProgress
        when {
            p != null -> StatusChip("Downloading ${(p * 100).toInt()}%", Tone.RUNNING)
            state.device == DeviceStatus.AVAILABLE -> StatusChip("On-device ready", Tone.OK)
            state.device == DeviceStatus.DOWNLOADING -> StatusChip("On-device loading", Tone.RUNNING)
            state.device == DeviceStatus.DOWNLOADABLE -> StatusChip("Get on-device AI", Tone.RUNNING, onClick = onDownload)
            state.device == null -> StatusChip("Checking", Tone.IDLE)
            else -> StatusChip("Cloud · redacted", Tone.IDLE)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Composer(state: UiState, vm: MainViewModel) {
    val t = LocalTokens.current
    val clipboard = LocalClipboardManager.current
    Bento(Modifier, content = {
        BasicTextField(
            value = state.input,
            onValueChange = vm::setInput,
            textStyle = Type.body.copy(color = t.foreground),
            cursorBrush = SolidColor(t.ring),
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 116.dp)
                .clip(TileShape)
                .background(if (t.dark) t.cardNested else t.sheet)
                .border(1.dp, t.input, TileShape)
                .padding(horizontal = 14.dp, vertical = 12.dp)
                .semantics { contentDescription = "Message to check" },
            decorationBox = { inner ->
                if (state.input.isEmpty()) Body("Paste an SMS, WhatsApp message, email or link", t.ink3)
                inner()
            },
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillButton(
                "Check message", { vm.check() }, Modifier.weight(1f), enabled = !state.busy,
                leading = { ShieldIcon(t.primaryForeground, 16.dp) },
            )
            PillButton("Paste", {
                clipboard.getText()?.text?.takeIf { it.isNotBlank() }?.let { vm.check(it) }
            }, kind = ButtonKind.SURFACE, enabled = !state.busy)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Readout("Try", Modifier.padding(end = 2.dp))
            SAMPLES.forEach { (label, text) -> SampleChip(label) { vm.check(text) } }
        }
    })
}

@Composable
private fun StateCard(title: String, body: String, dot: Color) {
    val t = LocalTokens.current
    Bento {
        Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Rings(dot)
            Text(title, style = Type.title.copy(fontWeight = FontWeight(500)), color = t.foreground, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 14.dp))
            Body(body, t.ink2, Type.body.copy(fontSize = 13.sp, lineHeight = 20.sp), Modifier.padding(top = 6.dp, start = 24.dp, end = 24.dp), TextAlign.Center)
        }
    }
}

@Composable
private fun ConsentCard(plan: Plan, text: String, vm: MainViewModel) {
    val t = LocalTokens.current
    var remember by remember { mutableStateOf(false) }
    val why = when (plan.device) {
        DeviceStatus.AVAILABLE -> "This message is too long for the on-device AI."
        DeviceStatus.DOWNLOADING, DeviceStatus.DOWNLOADABLE -> "The on-device AI is not downloaded yet."
        DeviceStatus.UNAVAILABLE -> "This phone has no on-device AI."
    }
    val r = plan.redaction!!
    Bento(outline = t.signal.copy(alpha = 0.35f)) {
        Column { Readout("Cloud check"); Text("Send a redacted copy?", style = Type.title, color = t.foreground) }
        Body("$why Personal details were removed on your phone. Only the text below will be sent.", t.ink2, Type.body.copy(fontSize = 13.5.sp))
        Tile { RedactedText(r.text) }
        Readout("${r.redactions.size} removed · ${r.redactions.groupBy { it.kind }.entries.joinToString { "${it.value.size} ${it.key.name.lowercase().replace('_', ' ')}" }.ifEmpty { "nothing personal found" }}")
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clickable { remember = !remember }) {
            Checkbox(remember, { remember = it }, colors = CheckboxDefaults.colors(checkedColor = t.primary, uncheckedColor = t.ink3))
            Body("Don’t ask again for redacted copies", t.ink2, Type.body.copy(fontSize = 13.sp))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PillButton("Send redacted copy", { vm.sendRedacted(plan, text, remember) }, Modifier.weight(1f))
            PillButton("Cancel", vm::cancel, kind = ButtonKind.SURFACE)
        }
    }
}

@Composable
private fun RedactedText(text: String) {
    val t = LocalTokens.current
    val annotated = buildAnnotatedString {
        Regex("""(\[[A-Z_]+_\d+])""").split(text).let { }
        var last = 0
        Regex("""\[[A-Z_]+_\d+]""").findAll(text).forEach { m ->
            append(text.substring(last, m.range.first))
            withStyle(SpanStyle(background = t.signalSoft, color = t.signalInk)) { append(m.value) }
            last = m.range.last + 1
        }
        append(text.substring(last))
    }
    Text(annotated, style = Type.body.copy(fontFamily = Mono, fontSize = 12.5.sp, lineHeight = 20.sp), color = t.foreground)
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ResultCard(o: CheckOutcome, state: UiState, vm: MainViewModel) {
    val t = LocalTokens.current
    val r = o.result
    val tone = when (r.verdict) { Verdict.scam -> t.critical; Verdict.suspicious -> t.warn; Verdict.safe -> t.ok }
    val chipTone = when (r.verdict) { Verdict.scam -> Tone.CRITICAL; Verdict.suspicious -> Tone.WARN; Verdict.safe -> Tone.OK }
    val title = when (r.verdict) { Verdict.scam -> "Likely scam"; Verdict.suspicious -> "Be careful"; Verdict.safe -> "Looks safe" }
    val fill by animateFloatAsState(r.risk / 100f, tween(700), label = "risk")

    Bento {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusChip(SCAM_LABELS[r.scamType] ?: r.scamType, chipTone)
                Text(title, style = Type.verdict, color = tone)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${r.risk}", style = Type.kpi, color = tone)
                Readout("Risk / 100", Modifier.padding(top = 4.dp))
            }
        }
        Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(t.muted)) {
            Box(Modifier.fillMaxWidth(fill).height(4.dp).clip(CircleShape).background(tone))
        }
        Body(r.summary, style = Type.body.copy(fontSize = 15.5.sp, lineHeight = 23.sp))

        if (r.redFlags.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Readout("Warning signs")
            r.redFlags.forEach { f ->
                Tile {
                    if (f.quote.isNotEmpty()) Text("“${f.quote}”", style = Type.body.copy(fontFamily = Mono, fontSize = 12.sp, lineHeight = 17.sp), color = tone)
                    Body(f.why, t.ink2, Type.body.copy(fontSize = 13.sp, lineHeight = 19.sp))
                }
            }
        }
        if (r.advice.isNotEmpty()) Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Readout("What to do")
            r.advice.forEachIndexed { i, a ->
                Row {
                    Text("%02d".format(i + 1), style = Type.readout, color = t.ink3, modifier = Modifier.width(26.dp).padding(top = 3.dp))
                    Body(a, style = Type.body.copy(fontSize = 13.5.sp, lineHeight = 20.sp))
                }
            }
        }

        CommunityTile(o, state, vm)

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Readout("Explain in")
            FlowRow(
                Modifier.clip(CircleShape).background(if (t.dark) t.background.copy(alpha = 0.4f) else t.sheet).border(1.dp, t.border, CircleShape).padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                LANGUAGES.forEach { (code, name) ->
                    val active = state.explanation?.language == code
                    Box(
                        Modifier.height(32.dp).clip(CircleShape)
                            .background(if (active) (if (t.dark) t.signalSoft else t.inverse) else Color.Transparent)
                            .clickable { vm.explain(o, code) }
                            .padding(horizontal = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(name.removePrefix("simple ").removePrefix("Nigerian "), style = Type.body.copy(fontSize = 12.5.sp, fontWeight = FontWeight(500)),
                            color = if (active) (if (t.dark) t.signal else t.inverseForeground) else t.ink2)
                    }
                }
            }
            state.explanation?.let { e ->
                when {
                    e.error != null -> Body(e.error, t.critical, Type.body.copy(fontSize = 13.5.sp))
                    e.text.isEmpty() -> Readout("Writing in ${LANGUAGES[e.language]}…")
                    else -> {
                        Tile { Body(e.text, style = Type.body.copy(lineHeight = 22.sp)) }
                        e.source?.let { SourceChip(it, true) }
                    }
                }
            }
        }

        if (o.source == Source.ON_DEVICE) PillButton("Second opinion from the cloud", { vm.check(deepCheck = true) }, Modifier.fillMaxWidth(), kind = ButtonKind.SURFACE)

        Box(Modifier.fillMaxWidth().height(1.dp).background(t.border))
        Row(verticalAlignment = Alignment.CenterVertically) {
            SourceChip(o.source, o.redacted)
            Grow()
            Readout("%.1f s".format(o.ms / 1000.0))
        }
        HowChecked(o)
    }
}

@Composable
private fun HowChecked(o: CheckOutcome) {
    val t = LocalTokens.current
    var open by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Readout(if (open) "How was this checked  ▴" else "How was this checked  ▾", Modifier.clickable { open = !open })
        if (open) Tile {
            Body(o.route.label, t.ink2, Type.body.copy(fontSize = 13.sp))
            if (o.redacted) RedactedText(o.sentText)
        }
    }
}

@Composable
private fun SourceChip(source: Source, redacted: Boolean) =
    if (source == Source.ON_DEVICE) StatusChip("On this phone", Tone.OK) else StatusChip(if (redacted) "Cloud · redacted" else "Cloud", Tone.IDLE)

@Composable
private fun CommunityTile(o: CheckOutcome, state: UiState, vm: MainViewModel) {
    val t = LocalTokens.current
    Tile {
        val n = (state.community as? Community.Count)?.n ?: 0
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(if (n > 0) t.warn.copy(alpha = 0.14f) else t.muted), contentAlignment = Alignment.Center) {
                Text("👥", fontSize = 15.sp)
            }
            val text = when (val c = state.community) {
                Community.Loading -> buildAnnotatedString { append("Checking community reports…") }
                Community.Unavailable -> buildAnnotatedString { append("Community reports are unavailable right now.") }
                is Community.Count -> buildAnnotatedString {
                    if (c.n > 0) {
                        withStyle(SpanStyle(fontFamily = Display, fontWeight = FontWeight(600), fontSize = 16.sp)) { append("${c.n}") }
                        append(if (c.n == 1) " person has reported this message this week." else " people have reported this message this week.")
                    } else append("No one has reported this exact message this week.")
                }
            }
            Text(text, style = Type.body.copy(fontSize = 13.5.sp, lineHeight = 19.sp), color = if (n > 0) t.foreground else t.ink2, modifier = Modifier.padding(start = 12.dp))
        }
        if (o.result.verdict != Verdict.safe) when (val rs = state.report) {
            ReportState.Idle -> PillButton("Report to warn others", vm::startReport, Modifier.fillMaxWidth(), kind = ButtonKind.SURFACE, small = true, enabled = state.community !is Community.Loading)
            is ReportState.Confirm -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Body("Share this copy to warn others? Personal details were removed on your phone.", t.ink2, Type.body.copy(fontSize = 13.sp))
                RedactedText(rs.redactedText)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PillButton("Share redacted copy", { vm.confirmReport(o, rs.redactedText) }, small = true)
                    PillButton("Cancel", vm::cancelReport, kind = ButtonKind.GHOST, small = true)
                }
            }
            ReportState.Sending -> Readout("Sharing…")
            ReportState.Done -> Body("Reported. Thank you for warning others.", t.ok, Type.body.copy(fontSize = 13.5.sp))
            is ReportState.Failed -> Body(rs.message, t.critical, Type.body.copy(fontSize = 13.5.sp))
        }
    }
}

@Suppress("unused")
private val italic = SpanStyle(fontStyle = FontStyle.Italic)
