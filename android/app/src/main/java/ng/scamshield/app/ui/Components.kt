package ng.scamshield.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

val CardShape = RoundedCornerShape(28.dp)
val TileShape = RoundedCornerShape(20.dp)

@Composable
fun Bento(modifier: Modifier = Modifier, outline: Color? = null, content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    val border = outline ?: if (t.dark) t.border else Color.Transparent
    Column(
        modifier
            .fillMaxWidth()
            .clip(CardShape)
            .background(t.card)
            .border(BorderStroke(1.dp, border), CardShape)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
        content = content,
    )
}

@Composable
fun Tile(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val t = LocalTokens.current
    Column(
        modifier
            .fillMaxWidth()
            .clip(TileShape)
            .background(t.cardNested)
            .border(BorderStroke(1.dp, if (t.dark) Color.Transparent else t.border), TileShape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        content = content,
    )
}

@Composable
fun Readout(text: String, modifier: Modifier = Modifier, color: Color = LocalTokens.current.ink2, align: TextAlign? = null) =
    Text(text.uppercase(), modifier, style = Type.readout, color = color, textAlign = align)

enum class Tone { OK, WARN, CRITICAL, RUNNING, IDLE }

@Composable
fun StatusChip(text: String, tone: Tone, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val t = LocalTokens.current
    val (fg, bg) = when (tone) {
        Tone.OK -> t.ok to t.ok.copy(alpha = 0.12f)
        Tone.WARN -> t.warn to t.warn.copy(alpha = 0.12f)
        Tone.CRITICAL -> t.critical to t.critical.copy(alpha = 0.12f)
        Tone.RUNNING -> t.signalInk to t.signalSoft
        Tone.IDLE -> t.ink2 to Color.Transparent
    }
    Row(
        modifier
            .height(24.dp)
            .clip(CircleShape)
            .background(bg)
            .then(if (tone == Tone.IDLE) Modifier.border(1.dp, t.border, CircleShape) else Modifier)
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(fg))
        Text(text.uppercase(), style = Type.chip, color = fg, maxLines = 1)
    }
}

enum class ButtonKind { PRIMARY, SURFACE, GHOST }

@Composable
fun PillButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.PRIMARY,
    enabled: Boolean = true,
    small: Boolean = false,
    leading: (@Composable () -> Unit)? = null,
) {
    val t = LocalTokens.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val (bg, fg) = when (kind) {
        ButtonKind.PRIMARY -> t.primary to t.primaryForeground
        ButtonKind.SURFACE -> (if (t.dark) t.cardNested else t.sheet) to t.foreground
        ButtonKind.GHOST -> Color.Transparent to t.ink2
    }
    Row(
        modifier
            .scale(if (pressed) 0.98f else 1f)
            .height(if (small) 36.dp else 44.dp)
            .clip(CircleShape)
            .background(if (enabled) bg else bg.copy(alpha = bg.alpha * 0.5f))
            .then(if (kind == ButtonKind.SURFACE) Modifier.border(1.dp, t.border, CircleShape) else Modifier)
            .clickable(enabled = enabled, interactionSource = source, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = if (small) 14.dp else 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
    ) {
        leading?.invoke()
        Text(text, style = Type.body.copy(fontWeight = androidx.compose.ui.text.font.FontWeight(500), fontSize = if (small) Type.body.fontSize * 0.93f else Type.body.fontSize), color = if (enabled) fg else fg.copy(alpha = 0.6f), maxLines = 1)
    }
}

@Composable
fun SampleChip(text: String, onClick: () -> Unit) {
    val t = LocalTokens.current
    Box(
        Modifier
            .height(32.dp)
            .clip(CircleShape)
            .background(t.muted)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Type.body.copy(fontSize = Type.body.fontSize * 0.9f), color = t.foreground) }
}

/** Lucide-style shield-check on the 24 grid. */
@Composable
fun ShieldIcon(color: Color, size: Dp = 18.dp, tick: Color? = null) {
    Canvas(Modifier.size(size)) {
        val s = this.size.width / 24f
        val shield = Path().apply {
            moveTo(20 * s, 13 * s)
            cubicTo(20 * s, 18 * s, 16.5f * s, 20.5f * s, 12.34f * s, 21.95f * s)
            cubicTo(12.12f * s, 22.02f * s, 11.88f * s, 22.02f * s, 11.67f * s, 21.94f * s)
            cubicTo(7.5f * s, 20.5f * s, 4 * s, 18 * s, 4 * s, 13 * s)
            lineTo(4 * s, 6 * s)
            cubicTo(4 * s, 5.45f * s, 4.45f * s, 5 * s, 5 * s, 5 * s)
            cubicTo(7 * s, 5 * s, 9.5f * s, 3.8f * s, 11.24f * s, 2.28f * s)
            cubicTo(11.67f * s, 1.91f * s, 12.33f * s, 1.91f * s, 12.76f * s, 2.28f * s)
            cubicTo(14.51f * s, 3.79f * s, 17 * s, 5 * s, 19 * s, 5 * s)
            cubicTo(19.55f * s, 5 * s, 20 * s, 5.45f * s, 20 * s, 6 * s)
            close()
        }
        val stroke = Stroke(width = 2 * s, cap = StrokeCap.Round, join = StrokeJoin.Round)
        drawPath(shield, color, style = stroke)
        val check = Path().apply { moveTo(9 * s, 12 * s); lineTo(11 * s, 14 * s); lineTo(15 * s, 10 * s) }
        drawPath(check, tick ?: color, style = stroke)
    }
}

/** Two hairline rings around a signal dot: the empty / loading / error mark. */
@Composable
fun Rings(dot: Color, modifier: Modifier = Modifier) {
    val t = LocalTokens.current
    Canvas(modifier.size(88.dp)) {
        val c = Offset(size.width / 2, size.height / 2)
        val hair = Stroke(width = 1.dp.toPx())
        drawCircle(t.border, radius = size.width / 2 - 1, center = c, style = hair)
        drawCircle(t.border, radius = size.width / 2 - 14.dp.toPx(), center = c, style = hair)
        drawCircle(t.cardNested, radius = 15.dp.toPx(), center = c)
        drawCircle(t.border, radius = 15.dp.toPx(), center = c, style = hair)
        drawCircle(dot, radius = 4.dp.toPx(), center = c)
    }
}

@Composable
fun RowScope.Grow() = Spacer(Modifier.weight(1f))

@Composable
fun Gap(h: Dp) = Spacer(Modifier.height(h).width(h))

@Composable
fun Body(text: String, color: Color = LocalTokens.current.foreground, style: TextStyle = Type.body, modifier: Modifier = Modifier, align: TextAlign? = null) =
    Text(text, modifier, style = style, color = color, textAlign = align)
