package com.belweave.trifecta.features.ssh

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.models.SshAuthMethod
import com.belweave.trifecta.core.models.SshHostKeyPrompt
import com.belweave.trifecta.core.models.SshHostProfile
import com.belweave.trifecta.core.models.SshSessionSnapshot
import com.belweave.trifecta.core.models.SshSessionStatus
import com.belweave.trifecta.core.models.SshTerminalEvent
import com.belweave.trifecta.core.networking.ConnectionState
import com.belweave.trifecta.core.networking.ShellProfileSetupResult
import com.belweave.trifecta.core.networking.StreamSubscription
import com.belweave.trifecta.core.networking.sshAddHost
import com.belweave.trifecta.core.networking.sshCloseSession
import com.belweave.trifecta.core.networking.sshConfirmHostKey
import com.belweave.trifecta.core.networking.sshListHosts
import com.belweave.trifecta.core.networking.sshOpenSession
import com.belweave.trifecta.core.networking.sshRemoveHost
import com.belweave.trifecta.core.networking.sshSendInput
import com.belweave.trifecta.core.networking.sshSetupShellProfile
import com.belweave.trifecta.core.networking.subscribeSshTerminal
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Divider
import com.belweave.trifecta.designsystem.T3Pill
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3ToolbarChip
import com.belweave.trifecta.designsystem.T3Typography
import kotlinx.coroutines.launch

@Composable
fun SshScreen(
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as TrifectaApp
    val connectionState by app.env.connectionState.collectAsState()
    val serverConfig by app.env.serverConfig.collectAsState()
    val sshEnabled = serverConfig?.sshEnabled ?: true

    var terminalText by remember { mutableStateOf("") }
    var hosts by remember { mutableStateOf<List<SshHostProfile>>(emptyList()) }
    var selectedHostId by remember { mutableStateOf<String?>(null) }
    var session by remember { mutableStateOf<SshSessionSnapshot?>(null) }
    var hostKeyPrompt by remember { mutableStateOf<SshHostKeyPrompt?>(null) }
    var subscription by remember { mutableStateOf<StreamSubscription?>(null) }
    var isBusy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var shellProfileResult by remember { mutableStateOf<ShellProfileSetupResult?>(null) }
    var showShellProfileResult by remember { mutableStateOf(false) }
    var showKeychainBanner by remember { mutableStateOf(false) }
    var input by remember { mutableStateOf("") }
    var isSecureInputMode by remember { mutableStateOf(false) }
    var hostMenuOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val terminalScroll = rememberScrollState()
    val keyScroll = rememberScrollState()

    val selectedHost = hosts.firstOrNull { it.id == selectedHostId } ?: hosts.firstOrNull()
    val hasLiveSession = when (session?.status) {
        SshSessionStatus.PENDING_HOST_KEY,
        SshSessionStatus.AUTHENTICATING,
        SshSessionStatus.RUNNING -> true
        else -> false
    }
    val canSendInput = when (session?.status) {
        SshSessionStatus.AUTHENTICATING,
        SshSessionStatus.RUNNING -> true
        else -> false
    }

    fun appendTerminal(chunk: String) {
        val shouldClear = chunk.contains("\u001B[2J") ||
            chunk.contains("\u001B[3J") ||
            chunk.contains("\u001Bc")
        if (shouldClear) {
            terminalText = ""
        }
        val sanitized = sanitizeTerminalChunk(chunk).let {
            if (shouldClear) it.trimStart('\n') else it
        }
        if (sanitized.isEmpty()) return
        val merged = terminalText + sanitized
        terminalText = if (merged.length > 80_000) merged.takeLast(60_000) else merged
    }

    suspend fun refreshHosts() {
        val client = app.env.client() ?: return
        isBusy = true
        try {
            val fetched = client.sshListHosts()
            hosts = fetched
            if (selectedHostId == null || fetched.none { it.id == selectedHostId }) {
                selectedHostId = fetched.firstOrNull()?.id
            }
        } catch (t: Throwable) {
            errorMessage = t.message ?: "Failed to load SSH hosts"
        } finally {
            isBusy = false
        }
    }

    suspend fun closeSession(closeRemote: Boolean) {
        val currentSubscription = subscription
        val currentSessionId = session?.sessionId
        subscription = null
        session = null
        hostKeyPrompt = null
        currentSubscription?.cancel()
        if (closeRemote && currentSessionId != null) {
            runCatching { app.env.client()?.sshCloseSession(currentSessionId) }
        }
    }

    suspend fun connectSelectedHost() {
        val client = app.env.client() ?: return
        val host = selectedHost ?: return
        isBusy = true
        if (session != null || subscription != null) {
            closeSession(closeRemote = true)
        }
        hostKeyPrompt = null
        isSecureInputMode = false
        terminalText = ""
        appendTerminal("[ssh] opening ${host.username}@${host.hostname}:${host.port}\n")
        try {
            val openResult = client.sshOpenSession(host.id, cols = 120, rows = 32)
            session = openResult.snapshot
            subscription = client.subscribeSshTerminal(openResult.snapshot.sessionId) { event ->
                scope.launch {
                    when (event) {
                        is SshTerminalEvent.Status -> {
                            session = event.snapshot
                            if (event.snapshot.status == SshSessionStatus.CLOSED || event.snapshot.status == SshSessionStatus.ERROR) {
                                subscription = null
                                hostKeyPrompt = null
                                showKeychainBanner = false
                            }
                        }
                        is SshTerminalEvent.Output -> {
                            appendTerminal(event.data)
                            if (isSensitivePrompt(event.data)) {
                                isSecureInputMode = true
                            } else if (event.data.contains("\n")) {
                                isSecureInputMode = false
                            }
                            if (event.data.contains("keychain", ignoreCase = true) &&
                                event.data.contains("unlock", ignoreCase = true)) {
                                showKeychainBanner = true
                            }
                        }
                        is SshTerminalEvent.HostKeyPromptEvent -> {
                            hostKeyPrompt = event.prompt
                            appendTerminal("[ssh] host key approval required\n")
                        }
                        is SshTerminalEvent.Error -> {
                            appendTerminal("[ssh error] ${event.message}\n")
                            errorMessage = event.message
                            isSecureInputMode = false
                        }
                        is SshTerminalEvent.Exited -> {
                            appendTerminal("[ssh exited ${event.exitCode?.toString() ?: "without status"}]\n")
                            session = null
                            subscription = null
                            showKeychainBanner = false
                            isSecureInputMode = false
                        }
                    }
                }
            }
        } catch (t: Throwable) {
            errorMessage = t.message ?: "Failed to connect SSH session"
        } finally {
            isBusy = false
        }
    }

    suspend fun sendInput(data: String) {
        val client = app.env.client() ?: return
        val sessionId = session?.sessionId ?: return
        if (session?.status != SshSessionStatus.RUNNING && session?.status != SshSessionStatus.AUTHENTICATING) {
            return
        }
        runCatching {
            client.sshSendInput(sessionId, data)
            if (showKeychainBanner && data.contains('\n')) showKeychainBanner = false
            if (isSecureInputMode && data.contains('\n')) isSecureInputMode = false
        }.onFailure { t ->
            errorMessage = t.message ?: "Failed to send SSH input"
        }
    }

    LaunchedEffect(serverConfig) {
        if (serverConfig != null && sshEnabled) refreshHosts()
    }
    LaunchedEffect(terminalText) {
        terminalScroll.scrollTo(terminalScroll.maxValue)
    }

    DisposableEffect(Unit) {
        onDispose {
            scope.launch { closeSession(closeRemote = true) }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(T3Color.surfaceGrouped)
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
        ) {
            T3ToolbarChip(onClick = onBack) {
                Icon(Icons.Outlined.ArrowBack, contentDescription = "Back", tint = T3Color.textPrimary)
            }
            Text("SSH", style = T3Typography.headline, color = T3Color.textPrimary)
            Spacer(modifier = Modifier.weight(1f))
            T3ToolbarChip(onClick = { showAddDialog = true }) {
                Icon(Icons.Outlined.Add, contentDescription = "Add host", tint = T3Color.textPrimary)
            }
            T3ToolbarChip(onClick = { scope.launch { refreshHosts() } }) {
                Icon(Icons.Outlined.Refresh, contentDescription = "Refresh", tint = T3Color.textPrimary)
            }
            T3ToolbarChip(onClick = { scope.launch { if (!hasLiveSession) selectedHost?.let { app.env.client()?.sshRemoveHost(it.id); refreshHosts() } } }) {
                Icon(Icons.Outlined.Delete, contentDescription = "Delete host", tint = if (hasLiveSession) T3Color.textTertiary else T3Color.textPrimary)
            }
        }
        T3Divider()

        if (connectionState !is ConnectionState.Connected) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    "Desktop server offline. Pair or reconnect before opening SSH.",
                    style = T3Typography.callout,
                    color = T3Color.textSecondary,
                    modifier = Modifier.padding(T3Spacing.lg)
                )
            }
            return@Column
        }

        if (!sshEnabled) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(T3Spacing.sm),
                    modifier = Modifier.padding(T3Spacing.lg)
                ) {
                    Icon(
                        Icons.Outlined.Terminal,
                        contentDescription = null,
                        tint = T3Color.textTertiary,
                        modifier = Modifier.size(36.dp)
                    )
                    Text(
                        "Requires Trifecta Desktop",
                        style = T3Typography.headline,
                        color = T3Color.textPrimary
                    )
                    Text(
                        "SSH is only available when connected to Trifecta Desktop on your Mac. This server does not support SSH sessions.",
                        style = T3Typography.callout,
                        color = T3Color.textSecondary
                    )
                }
            }
            return@Column
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(T3Color.surfaceElevated)
                .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.md)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(T3Radius.md))
                        .background(T3Color.surfaceMuted)
                        .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
                        .clickable(enabled = hosts.isNotEmpty() && !hasLiveSession) { hostMenuOpen = true }
                        .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
                ) {
                    Column {
                        Text(
                            selectedHost?.label ?: "No host",
                            style = T3Typography.bodyEmphasis,
                            color = T3Color.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            selectedHost?.let { "${it.username}@${it.hostname}:${it.port}" } ?: "Add an SSH host",
                            style = T3Typography.footnote.copy(fontFamily = FontFamily.Monospace),
                            color = T3Color.textSecondary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    DropdownMenu(expanded = hostMenuOpen, onDismissRequest = { hostMenuOpen = false }) {
                        hosts.forEach { host ->
                            DropdownMenuItem(
                                text = { Text(host.label) },
                                onClick = {
                                    selectedHostId = host.id
                                    hostMenuOpen = false
                                }
                            )
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(T3Radius.md))
                        .background(if (hasLiveSession) T3Color.surfaceMuted else T3Color.primary)
                        .clickable(enabled = selectedHost != null && !hasLiveSession && !isBusy) {
                            scope.launch { connectSelectedHost() }
                        }
                        .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
                ) {
                    Text(
                        if (hasLiveSession) "Connected" else "Connect",
                        style = T3Typography.bodyEmphasis,
                        color = if (hasLiveSession) T3Color.textTertiary else Color.White
                    )
                }
            }
        }

        if (showKeychainBanner && hasLiveSession) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
                    .clip(RoundedCornerShape(T3Radius.md))
                    .background(Color(0x1A00BCD4))
                    .border(0.5.dp, Color(0x6600BCD4), RoundedCornerShape(T3Radius.md))
                    .padding(T3Spacing.md)
            ) {
                Text("macOS Keychain Unlock", style = T3Typography.bodyEmphasis, color = T3Color.textPrimary)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Type your Mac login password to unlock the keychain. Claude Code credentials stay in the macOS Keychain and may be locked for SSH sessions.",
                    style = T3Typography.footnote,
                    color = T3Color.textSecondary
                )
            }
        }

        hostKeyPrompt?.let { prompt ->
            HostKeyPromptCard(
                prompt = prompt,
                onDecision = { approve, rememberHost ->
                    scope.launch {
                        val client = app.env.client() ?: return@launch
                        try {
                            session = client.sshConfirmHostKey(
                                sessionId = prompt.sessionId,
                                fingerprintSha256 = prompt.fingerprintSha256,
                                approve = approve,
                                remember = rememberHost
                            )
                            hostKeyPrompt = null
                            if (!approve) {
                                appendTerminal("[ssh] host key rejected")
                            }
                        } catch (t: Throwable) {
                            errorMessage = t.message ?: "Failed to submit host key decision"
                            hostKeyPrompt = null
                        }
                    }
                }
            )
        }

        if (hasLiveSession) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(top = T3Spacing.md)
                    .background(Color(0xFF101420))
                    .padding(T3Spacing.md)
            ) {
                if (terminalText.isEmpty()) {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Outlined.Terminal, contentDescription = null, tint = T3Color.textTertiary)
                        Spacer(Modifier.height(T3Spacing.sm))
                        Text("Connecting to SSH host...", style = T3Typography.callout, color = T3Color.textSecondary)
                    }
                } else {
                    Text(
                        terminalText,
                        style = T3Typography.footnote.copy(fontFamily = FontFamily.Monospace),
                        color = Color(0xFFE8EDF6),
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(terminalScroll)
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = input,
                        onValueChange = { input = it },
                        modifier = Modifier.weight(1f),
                        label = { Text("Terminal input") },
                        singleLine = true,
                        textStyle = T3Typography.body.copy(color = T3Color.textPrimary),
                        visualTransformation = if (isSecureInputMode) PasswordVisualTransformation() else VisualTransformation.None,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Send
                        ),
                        keyboardActions = KeyboardActions(
                            onSend = {
                                if (input.isNotBlank() && canSendInput) {
                                    val data = if (input.endsWith('\n')) input else "$input\n"
                                    input = ""
                                    scope.launch { sendInput(data) }
                                }
                            }
                        )
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(T3Radius.md))
                            .background(if (input.isNotBlank() && canSendInput) T3Color.primary else T3Color.surfaceMuted)
                            .clickable(enabled = input.isNotBlank() && canSendInput) {
                                val data = if (input.endsWith('\n')) input else "$input\n"
                                input = ""
                                scope.launch { sendInput(data) }
                            }
                            .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
                    ) {
                        Text("Send", style = T3Typography.bodyEmphasis, color = Color.White)
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
                    .horizontalScroll(keyScroll),
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
            ) {
                listOf("Esc" to "\u001B", "Tab" to "\t", "Ctrl+C" to "\u0003", "Ctrl+D" to "\u0004", "↑" to "\u001B[A", "↓" to "\u001B[B").forEach { (label, seq) ->
                    T3Pill(
                        text = label,
                        tint = T3Color.textSecondary,
                        emphasized = true,
                        modifier = Modifier.clickable(enabled = canSendInput) {
                            scope.launch { sendInput(seq) }
                        }
                    )
                }
                T3Pill(
                    text = "Setup Keychain Unlock",
                    tint = T3Color.warning,
                    emphasized = true,
                    modifier = Modifier.clickable(enabled = false) {}
                )
            }
        } else {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(top = T3Spacing.md)
                    .background(Color(0xFF101420)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.Terminal, contentDescription = null, tint = T3Color.textTertiary)
                    Spacer(Modifier.height(T3Spacing.sm))
                    Text("Select a host and tap Connect", style = T3Typography.callout, color = T3Color.textSecondary)
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
                    .horizontalScroll(keyScroll),
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
            ) {
                T3Pill(
                    text = "Setup Keychain Unlock",
                    tint = T3Color.warning,
                    emphasized = true,
                    modifier = Modifier.clickable {
                        scope.launch {
                            try {
                                shellProfileResult = app.env.client()?.sshSetupShellProfile()
                                showShellProfileResult = true
                            } catch (t: Throwable) {
                                errorMessage = t.message ?: "Failed to update shell profile"
                            }
                        }
                    }
                )
            }
        }
    }

    if (showAddDialog) {
        AddHostDialog(
            onDismiss = { showAddDialog = false },
            onSave = { label, hostname, port, username, authMethod ->
                scope.launch {
                    val client = app.env.client() ?: return@launch
                    try {
                        val host = client.sshAddHost(
                            label = label,
                            hostname = hostname,
                            port = port,
                            username = username,
                            authMethod = authMethod
                        )
                        hosts = hosts + host
                        selectedHostId = host.id
                        showAddDialog = false
                    } catch (t: Throwable) {
                        errorMessage = t.message ?: "Failed to save SSH host"
                    }
                }
            }
        )
    }

    if (showShellProfileResult) {
        AlertDialog(
            onDismissRequest = { showShellProfileResult = false },
            title = { Text("Shell Profile Setup") },
            text = {
                Text(
                    if (shellProfileResult?.alreadyPresent == true) {
                        "Keychain unlock snippet already present in ${shellProfileResult?.shellProfile}."
                    } else {
                        "Added keychain unlock snippet to ${shellProfileResult?.shellProfile}. SSH sessions will now unlock your keychain automatically."
                    }
                )
            },
            confirmButton = {
                TextButton(onClick = { showShellProfileResult = false }) {
                    Text("OK")
                }
            }
        )
    }

    errorMessage?.let { message ->
        AlertDialog(
            onDismissRequest = { errorMessage = null },
            title = { Text("SSH Error") },
            text = { Text(message) },
            confirmButton = {
                TextButton(onClick = { errorMessage = null }) {
                    Text("OK")
                }
            }
        )
    }
}

@Composable
private fun HostKeyPromptCard(
    prompt: SshHostKeyPrompt,
    onDecision: (approve: Boolean, rememberHost: Boolean) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(Color(0x1AFFC107))
            .border(0.5.dp, Color(0x66FFC107), RoundedCornerShape(T3Radius.md))
            .padding(T3Spacing.md),
        verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        Text("Trust SSH host key?", style = T3Typography.bodyEmphasis, color = T3Color.textPrimary)
        Text("${prompt.hostname}:${prompt.port}", style = T3Typography.footnote.copy(fontFamily = FontFamily.Monospace), color = T3Color.textSecondary)
        Text(prompt.keyType, style = T3Typography.footnote, color = T3Color.textSecondary)
        Text(prompt.fingerprintSha256, style = T3Typography.footnote.copy(fontFamily = FontFamily.Monospace), color = T3Color.textSecondary)
        Row(horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
            HostKeyButton(text = "Reject", background = T3Color.danger, onClick = { onDecision(false, false) })
            HostKeyButton(text = "Trust Once", background = T3Color.surfaceMuted, textColor = T3Color.textPrimary, onClick = { onDecision(true, false) })
            HostKeyButton(text = "Remember", background = T3Color.primary, onClick = { onDecision(true, true) })
        }
    }
}

@Composable
private fun HostKeyButton(
    text: String,
    background: Color,
    textColor: Color = Color.White,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(T3Radius.sm))
            .background(background)
            .clickable(onClick = onClick)
            .padding(horizontal = T3Spacing.sm, vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(text, style = T3Typography.footnote, color = textColor)
    }
}

@Composable
private fun AddHostDialog(
    onDismiss: () -> Unit,
    onSave: (label: String, hostname: String, port: Int, username: String, authMethod: SshAuthMethod) -> Unit
) {
    var label by remember { mutableStateOf("My Mac") }
    var hostname by remember { mutableStateOf("127.0.0.1") }
    var port by remember { mutableStateOf("22") }
    var username by remember { mutableStateOf("") }
    var authMethod by remember { mutableStateOf(SshAuthMethod.AGENT_FORWARD) }
    var authMenuOpen by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add SSH Host") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                OutlinedTextField(value = label, onValueChange = { label = it }, singleLine = true, label = { Text("Label") })
                OutlinedTextField(value = hostname, onValueChange = { hostname = it }, singleLine = true, label = { Text("Hostname") })
                OutlinedTextField(
                    value = port,
                    onValueChange = { port = it.filter { ch -> ch.isDigit() } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    label = { Text("Port") }
                )
                OutlinedTextField(value = username, onValueChange = { username = it }, singleLine = true, label = { Text("Username") })
                Box {
                    OutlinedTextField(
                        value = authMethod.label,
                        onValueChange = {},
                        enabled = false,
                        readOnly = true,
                        label = { Text("Authentication") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clickable { authMenuOpen = true }
                    )
                    DropdownMenu(expanded = authMenuOpen, onDismissRequest = { authMenuOpen = false }) {
                        SshAuthMethod.values().forEach { method ->
                            DropdownMenuItem(
                                text = { Text(method.label) },
                                onClick = {
                                    authMethod = method
                                    authMenuOpen = false
                                }
                            )
                        }
                    }
                }
                Text(authMethod.testingNote, style = T3Typography.footnote, color = T3Color.textSecondary)
            }
        },
        confirmButton = {
            val parsedPort = port.toIntOrNull()
            val canSave = label.isNotBlank() && hostname.isNotBlank() && username.isNotBlank() && parsedPort != null && parsedPort in 1..65535
            TextButton(
                enabled = canSave,
                onClick = {
                    onSave(label.trim(), hostname.trim(), parsedPort ?: 22, username.trim(), authMethod)
                }
            ) { Text("Save Host") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}

private fun sanitizeTerminalChunk(chunk: String): String {
    return chunk
        .replace("\r\n", "\n")
        // Bare CR means "return to line start", not newline.
        .replace("\r", "")
        .replace(Regex("\\u001B\\[[0-9;?]*[ -/]*[@-~]"), "")
        .replace(Regex("\\u001B\\][^\\u0007]*(\\u0007|\\u001B\\\\)"), "")
        .filter { it == '\n' || it == '\t' || it.code >= 0x20 }
}

private fun isSensitivePrompt(text: String): Boolean {
    val lower = text.lowercase()
    return lower.contains("enter passphrase for key") ||
        lower.contains("password to unlock") ||
        lower.contains("password:")
}
