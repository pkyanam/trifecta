package com.belweave.trifecta.features.connection

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.clickable
import androidx.lifecycle.viewmodel.compose.viewModel
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.designsystem.T3Card
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Pill
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3SectionHeader
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.T3WordmarkLabel

@Composable
fun ConnectionSetupScreen(
    viewModel: ConnectionSetupViewModel = viewModel()
) {
    val state by viewModel.state.collectAsState()
    val ctx = LocalContext.current
    val canConnect = viewModel.canConnect
    val app = ctx.applicationContext as? TrifectaApp
    val pending by (app?.pendingPairingLink ?: kotlinx.coroutines.flow.MutableStateFlow(null))
        .collectAsState()
    LaunchedEffect(pending) {
        if (!pending.isNullOrBlank()) {
            viewModel.applyPastedText(pending!!)
            app?.consumePendingPairingLink()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(T3Color.surfaceGrouped)
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            HeaderBar()

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = T3Spacing.lg)
                    .padding(bottom = T3Spacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(T3Spacing.xl)
            ) {
                HeroBlock()
                FormCard(
                    state = state,
                    canConnect = canConnect,
                    onUrlChange = viewModel::updateServerUrl,
                    onTokenChange = viewModel::updateToken,
                    onPaste = { viewModel.applyPastedText(readClipboard(ctx)) },
                    onConnect = viewModel::connect
                )
                HelpCard()
            }
        }
    }
}

@Composable
private fun HeaderBar() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.lg)
            .padding(top = T3Spacing.md, bottom = T3Spacing.lg)
    ) {
        T3WordmarkLabel()
        Spacer(Modifier.weight(1f))
        T3Pill(
            text = "Pair",
            leadingIcon = Icons.Outlined.Link,
            tint = T3Color.warning,
            emphasized = true
        )
    }
}

@Composable
private fun HeroBlock() {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        Text(
            "Pair this device with a Trifecta server.",
            style = T3Typography.title,
            color = T3Color.textPrimary
        )
        Text(
            "Open the desktop app → Settings → Connections → Network access. Copy the pairing URL (HTTPS via tunnel like Cloudflare) or enter the server URL and token separately.",
            style = T3Typography.callout,
            color = T3Color.textSecondary
        )
    }
}

@Composable
private fun FormCard(
    state: ConnectionSetupViewModel.State,
    canConnect: Boolean,
    onUrlChange: (String) -> Unit,
    onTokenChange: (String) -> Unit,
    onPaste: () -> Unit,
    onConnect: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader("Server")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.md)) {
                FieldGroup(label = "Server URL") {
                    InputField(
                        value = state.serverUrl,
                        placeholder = "https://trifecta-review.example.com",
                        onValueChange = onUrlChange,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Uri,
                            autoCorrect = false,
                            capitalization = KeyboardCapitalization.None
                        )
                    )
                }
                FieldGroup(
                    label = "Pairing token",
                    trailing = {
                        Text(
                            "Paste link",
                            style = T3Typography.footnote,
                            color = T3Color.primary,
                            modifier = Modifier.clickable(onClick = onPaste)
                        )
                    }
                ) {
                    InputField(
                        value = state.token,
                        placeholder = "PAIRCODE",
                        onValueChange = onTokenChange,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            autoCorrect = false,
                            capitalization = KeyboardCapitalization.None
                        )
                    )
                }
                state.errorMessage?.let { msg ->
                    Text(msg, style = T3Typography.footnote, color = T3Color.danger)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    ConnectButton(
                        title = "Connect",
                        loading = state.isWorking,
                        enabled = canConnect && !state.isWorking,
                        onClick = onConnect
                    )
                }
            }
        }
    }
}

@Composable
private fun FieldGroup(
    label: String,
    trailing: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.xs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(label, style = T3Typography.footnote, color = T3Color.textSecondary)
            Spacer(Modifier.weight(1f))
            trailing?.invoke()
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .clip(RoundedCornerShape(T3Radius.md))
                .background(T3Color.surfaceMuted)
                .border(BorderStroke(0.5.dp, T3Color.separator), RoundedCornerShape(T3Radius.md))
                .padding(horizontal = T3Spacing.md),
            contentAlignment = Alignment.CenterStart
        ) {
            content()
        }
    }
}

@Composable
private fun InputField(
    value: String,
    placeholder: String,
    onValueChange: (String) -> Unit,
    keyboardOptions: KeyboardOptions
) {
    Box(modifier = Modifier.fillMaxWidth()) {
        if (value.isEmpty()) {
            Text(
                placeholder,
                style = T3Typography.body,
                color = T3Color.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardOptions = keyboardOptions,
            textStyle = T3Typography.body.copy(color = T3Color.textPrimary),
            cursorBrush = androidx.compose.ui.graphics.SolidColor(T3Color.primary),
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun ConnectButton(
    title: String,
    loading: Boolean,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val bg = if (enabled) T3Color.primary else T3Color.surfaceMuted
    val fg = if (enabled) T3Color.onPrimary else T3Color.textTertiary
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.xs),
        modifier = Modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = fg,
                strokeWidth = 2.dp,
                modifier = Modifier.height(16.dp).width(16.dp)
            )
        } else {
            Icon(
                Icons.Outlined.Link,
                contentDescription = null,
                tint = fg,
                modifier = Modifier.height(16.dp).width(16.dp)
            )
        }
        Text(title, style = T3Typography.bodyEmphasis, color = fg)
    }
}

@Composable
private fun HelpCard() {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader("Tips")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                TipRow("Public HTTPS URLs (e.g. Cloudflare Tunnel) work: the app uses WSS for the live socket.")
                TipRow("Use Tailscale or LAN when you are not using a tunnel — the device still needs a route to the server.")
                TipRow("Pairing tokens are one-time. After exchange, the device keeps a session.")
            }
        }
    }
}

@Composable
private fun TipRow(text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .padding(top = 6.dp)
                .clip(CircleShape)
                .background(T3Color.primary)
                .height(4.dp)
                .width(4.dp)
        )
        Text(text, style = T3Typography.footnote, color = T3Color.textSecondary)
    }
}

private fun readClipboard(ctx: Context): String {
    val clipboard = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
        ?: return ""
    val item = clipboard.primaryClip?.getItemAt(0) ?: return ""
    return item.coerceToText(ctx).toString()
}
