package ng.scamshield.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import ng.scamshield.app.R

/**
 * Vxrcel Ember (light) / Nebula (dark) tokens, the same roles as the web
 * stylesheet (src/ui/styles.css). Components read roles, never raw colours.
 * One signal hue (coral / gold) marks the primary action and focus; verdicts
 * use the status tones.
 */
@Immutable
data class Tokens(
    val background: Color,
    val foreground: Color,
    val sheet: Color,
    val card: Color,
    val cardNested: Color,
    val ink2: Color,
    val ink3: Color,
    val signal: Color,
    val signalInk: Color,
    val signalSoft: Color,
    val inverse: Color,
    val inverseForeground: Color,
    val primary: Color,
    val primaryForeground: Color,
    val muted: Color,
    val border: Color,
    val input: Color,
    val ring: Color,
    val critical: Color,
    val warn: Color,
    val ok: Color,
    val dark: Boolean,
)

val Ember = Tokens(
    background = Color(0xFFF3F3F1), foreground = Color(0xFF111111), sheet = Color(0xFFFFFFFF),
    card = Color(0xFFF6F6F4), cardNested = Color(0xFFFFFFFF), ink2 = Color(0xFF6B6B6B), ink3 = Color(0xFFA3A3A3),
    signal = Color(0xFFE8603C), signalInk = Color(0xFFB4461F), signalSoft = Color(0xFFFBE3DA),
    inverse = Color(0xFF111111), inverseForeground = Color(0xFFFFFFFF),
    primary = Color(0xFFC84E2A), primaryForeground = Color(0xFFFFFFFF),
    muted = Color(0xFFEFEFEC), border = Color(0xFFE6E6E1), input = Color(0xFFE2E2DD), ring = Color(0xFFC84E2A),
    critical = Color(0xFFD93B2B), warn = Color(0xFFB76A00), ok = Color(0xFF2F8F5B), dark = false,
)

val Nebula = Tokens(
    background = Color(0xFF050A0B), foreground = Color(0xFFEAF2F1), sheet = Color(0x7A081213),
    card = Color(0x80142C2C), cardNested = Color(0x0BEAF2F1), ink2 = Color(0xFF9FB3B1), ink3 = Color(0xFF5F7573),
    signal = Color(0xFFE6C27A), signalInk = Color(0xFFE6C27A), signalSoft = Color(0x24E6C27A),
    inverse = Color(0xFFEAF2F1), inverseForeground = Color(0xFF0B1616),
    primary = Color(0xFFE6C27A), primaryForeground = Color(0xFF1A1408),
    muted = Color(0x0DEAF2F1), border = Color(0x1AA0DCD7), input = Color(0x26A0DCD7), ring = Color(0xFF5EE1D9),
    critical = Color(0xFFF0604D), warn = Color(0xFFF2B35B), ok = Color(0xFF5FD3A6), dark = true,
)

@OptIn(ExperimentalTextApi::class)
private fun variable(res: Int, weight: Int) =
    Font(res, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

val Sans = FontFamily(variable(R.font.geist, 400), variable(R.font.geist, 500), variable(R.font.geist, 600))
val Mono = FontFamily(variable(R.font.geist_mono, 400), variable(R.font.geist_mono, 500))
val Display = FontFamily(variable(R.font.instrument_sans, 500), variable(R.font.instrument_sans, 600))

object Type {
    val body = TextStyle(fontFamily = Sans, fontSize = 14.sp, lineHeight = 21.sp)
    val readout = TextStyle(fontFamily = Mono, fontSize = 11.sp, letterSpacing = 0.66.sp)
    val chip = TextStyle(fontFamily = Mono, fontSize = 10.5.sp, letterSpacing = 0.6.sp)
    val wordmark = TextStyle(fontFamily = Display, fontWeight = FontWeight(600), fontSize = 20.sp, letterSpacing = (-0.4).sp)
    val verdict = TextStyle(fontFamily = Display, fontWeight = FontWeight(600), fontSize = 26.sp, lineHeight = 28.sp, letterSpacing = (-0.65).sp)
    val kpi = TextStyle(fontFamily = Display, fontWeight = FontWeight(500), fontSize = 40.sp, lineHeight = 40.sp, letterSpacing = (-1.2).sp)
    val title = TextStyle(fontFamily = Display, fontWeight = FontWeight(600), fontSize = 18.sp, lineHeight = 22.sp, letterSpacing = (-0.18).sp)
}

val LocalTokens = staticCompositionLocalOf { Ember }

@Composable
fun ScamShieldTheme(content: @Composable () -> Unit) {
    val t = if (isSystemInDarkTheme()) Nebula else Ember
    CompositionLocalProvider(LocalTokens provides t, content = content)
}
