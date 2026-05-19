package com.belweave.trifecta.features.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.core.networking.ConnectionState
import com.belweave.trifecta.core.preferences.SavedServerProfile
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.AppAppearance
import com.belweave.trifecta.designsystem.ComposerSize
import com.belweave.trifecta.designsystem.T3Card
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Divider
import com.belweave.trifecta.designsystem.T3Pill
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3SectionHeader
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3ToolbarChip
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.T3WordmarkLabel
import com.belweave.trifecta.designsystem.TranscriptDensity
import kotlinx.coroutines.delay

@Composable
fun SettingsScreen(
    isDark: Boolean,
    onDismiss: () -> Unit,
    onOpenSsh: () -> Unit,
    viewModel: SettingsViewModel = viewModel()
) {
    val sessionState by viewModel.sessionState.collectAsState()
    val connectionState by viewModel.connectionState.collectAsState()
    val savedProfiles by viewModel.savedProfiles.collectAsState()
    val activeProfileID by viewModel.activeProfileID.collectAsState()
    val serverConfig by viewModel.serverConfig.collectAsState()
    val serverConfigError by viewModel.serverConfigError.collectAsState()
    val appearance by viewModel.appearance.collectAsState()
    val accent by viewModel.accent.collectAsState()
    val transcriptDensity by viewModel.transcriptDensity.collectAsState()
    val composerSize by viewModel.composerSize.collectAsState()
    val isRefreshingConfig by viewModel.isRefreshingConfig.collectAsState()
    val switchingProfileID by viewModel.switchingProfileID.collectAsState()

    val accentColor = accent.colorFor(isDark)
    val context = LocalContext.current

    var showSignOut by remember { mutableStateOf(false) }
    var pendingDeleteProfile by remember { mutableStateOf<SavedServerProfile?>(null) }
    var renamingProfile by remember { mutableStateOf<SavedServerProfile?>(null) }
    var renameDraft by remember { mutableStateOf("") }
    var copiedToast by remember { mutableStateOf(false) }

    LaunchedEffect(copiedToast) {
        if (copiedToast) {
            delay(1_800)
            copiedToast = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(T3Color.surfaceGrouped)
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            HeaderBar(
                connectionState = connectionState,
                onClose = onDismiss
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = T3Spacing.lg)
                    .padding(bottom = T3Spacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(T3Spacing.xl)
            ) {
                ConnectionSection(
                    sessionState = sessionState,
                    connectionState = connectionState,
                    savedProfiles = savedProfiles,
                    activeProfileID = activeProfileID,
                    switchingProfileID = switchingProfileID,
                    accent = accentColor,
                    onSwitch = viewModel::switchToProfile,
                    onRename = { profile ->
                        renameDraft = profile.name
                        renamingProfile = profile
                    },
                    onDelete = { pendingDeleteProfile = it }
                )

                AppearanceSection(
                    appearance = appearance,
                    accent = accent,
                    isDark = isDark,
                    onAppearance = viewModel::setAppearance,
                    onAccent = viewModel::setAccent
                )

                ChatSection(
                    transcriptDensity = transcriptDensity,
                    composerSize = composerSize,
                    onDensity = viewModel::setTranscriptDensity,
                    onComposer = viewModel::setComposerSize
                )

                SshSection(onOpenSsh = onOpenSsh)

                ServerSection(
                    sessionState = sessionState,
                    serverConfigError = serverConfigError,
                    isRefreshingConfig = isRefreshingConfig,
                    accent = accentColor,
                    onCopy = { url ->
                        copyToClipboard(context, url)
                        copiedToast = true
                    },
                    onRefresh = viewModel::refreshServerConfig
                )

                if (serverConfig != null && serverConfig!!.providers.isNotEmpty()) {
                    ProvidersSection(providers = serverConfig!!.providers)
                }

                AboutSection()

                SignOutSection(onSignOut = { showSignOut = true })
            }
        }

        if (copiedToast) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = T3Spacing.sm)
                    .clip(RoundedCornerShape(percent = 50))
                    .background(T3Color.surfaceElevated)
                    .border(0.5.dp, T3Color.separator, RoundedCornerShape(percent = 50))
                    .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm)
            ) {
                Text(
                    text = "URL copied",
                    style = T3Typography.caption.copy(fontWeight = FontWeight.SemiBold),
                    color = T3Color.textPrimary
                )
            }
        }
    }

    if (showSignOut) {
        AlertDialog(
            onDismissRequest = { showSignOut = false },
            title = { Text("Sign out of this server?") },
            text = {
                Text(
                    "Your bearer token will be removed from this device. " +
                        "Pair again from the desktop app to reconnect."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showSignOut = false
                    viewModel.signOut()
                    onDismiss()
                }) { Text("Sign out", color = T3Color.danger) }
            },
            dismissButton = {
                TextButton(onClick = { showSignOut = false }) { Text("Cancel") }
            }
        )
    }

    pendingDeleteProfile?.let { profile ->
        AlertDialog(
            onDismissRequest = { pendingDeleteProfile = null },
            title = { Text("Delete saved server?") },
            text = { Text("Remove \"${profile.name}\" from this device?") },
            confirmButton = {
                TextButton(onClick = {
                    val target = profile
                    pendingDeleteProfile = null
                    viewModel.removeProfile(target.id)
                }) { Text("Delete", color = T3Color.danger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteProfile = null }) { Text("Cancel") }
            }
        )
    }

    renamingProfile?.let { profile ->
        AlertDialog(
            onDismissRequest = { renamingProfile = null },
            title = { Text("Rename Server") },
            text = {
                OutlinedTextField(
                    value = renameDraft,
                    onValueChange = { renameDraft = it },
                    singleLine = true,
                    label = { Text("Server name") }
                )
            },
            confirmButton = {
                val canSave = renameDraft.trim().isNotEmpty()
                TextButton(enabled = canSave, onClick = {
                    val newName = renameDraft.trim()
                    val target = profile
                    renamingProfile = null
                    viewModel.renameProfile(target.id, newName)
                }) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { renamingProfile = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun SshSection(onOpenSsh: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "SSH")
        T3Card(padding = T3Spacing.md) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 44.dp)
                    .clip(RoundedCornerShape(T3Radius.md))
                    .background(T3Color.surfaceMuted)
                    .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
                    .clickable(onClick = onOpenSsh)
                    .padding(horizontal = T3Spacing.md),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
            ) {
                Icon(
                    Icons.Outlined.Terminal,
                    contentDescription = null,
                    tint = T3Color.textSecondary,
                    modifier = Modifier.size(16.dp)
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text("Open SSH client", style = T3Typography.body, color = T3Color.textPrimary)
                    Text(
                        "Host management, key verification, and live terminal",
                        style = T3Typography.footnote,
                        color = T3Color.textTertiary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun HeaderBar(
    connectionState: ConnectionState,
    onClose: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.lg)
            .padding(top = T3Spacing.md, bottom = T3Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        T3WordmarkLabel()
        Spacer(Modifier.weight(1f))
        ConnectionPill(state = connectionState)
        T3ToolbarChip(onClick = onClose) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Close",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(14.dp)
            )
        }
    }
}

@Composable
private fun ConnectionPill(state: ConnectionState) {
    val (text, tint) = when (state) {
        is ConnectionState.Connected -> "Live" to T3Color.success
        is ConnectionState.Connecting -> "Connecting" to T3Color.warning
        is ConnectionState.Offline -> "Offline" to T3Color.textTertiary
        is ConnectionState.Error -> "Issue" to T3Color.danger
    }
    T3Pill(text = text, tint = tint, emphasized = true)
}

@Composable
private fun ConnectionSection(
    sessionState: AppEnvironment.SessionState,
    connectionState: ConnectionState,
    savedProfiles: List<SavedServerProfile>,
    activeProfileID: String?,
    switchingProfileID: String?,
    accent: Color,
    onSwitch: (String) -> Unit,
    onRename: (SavedServerProfile) -> Unit,
    onDelete: (SavedServerProfile) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Connection")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.md)) {
                Row {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = connectionHeadline(connectionState),
                            style = T3Typography.title,
                            color = T3Color.textPrimary
                        )
                        if (sessionState is AppEnvironment.SessionState.Configured) {
                            Text(
                                text = sessionState.serverURL.host ?: sessionState.serverURL.toString(),
                                style = T3Typography.callout,
                                color = T3Color.textSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        } else {
                            Text(
                                text = "Not paired with a server",
                                style = T3Typography.callout,
                                color = T3Color.textSecondary
                            )
                        }
                    }
                    Spacer(Modifier.width(T3Spacing.md))
                    ConnectionPill(state = connectionState)
                }
                connectionState.detail?.let { msg ->
                    Text(
                        text = msg,
                        style = T3Typography.footnote,
                        color = T3Color.danger
                    )
                }

                if (savedProfiles.isNotEmpty()) {
                    T3Divider()
                    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                        Text(
                            text = "Saved servers",
                            style = T3Typography.callout,
                            color = T3Color.textSecondary
                        )
                        savedProfiles.sortedByDescending { it.lastUsedAt }.forEach { profile ->
                            ProfileRow(
                                profile = profile,
                                isActive = activeProfileID == profile.id,
                                isSwitching = switchingProfileID == profile.id,
                                anySwitching = switchingProfileID != null,
                                accent = accent,
                                onSwitch = { onSwitch(profile.id) },
                                onRename = { onRename(profile) },
                                onDelete = { onDelete(profile) }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileRow(
    profile: SavedServerProfile,
    isActive: Boolean,
    isSwitching: Boolean,
    anySwitching: Boolean,
    accent: Color,
    onSwitch: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = profile.name,
                style = T3Typography.body,
                color = T3Color.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = profile.serverURL.host ?: profile.serverURL.toString(),
                style = T3Typography.footnote,
                color = T3Color.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (isActive) {
            T3Pill(text = "Active", tint = T3Color.success, emphasized = true)
        } else {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(T3Radius.sm))
                    .background(T3Color.surfaceMuted)
                    .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.sm))
                    .clickable(enabled = !anySwitching, onClick = onSwitch)
                    .defaultMinSize(minWidth = 64.dp, minHeight = 28.dp)
                    .padding(horizontal = T3Spacing.sm),
                contentAlignment = Alignment.Center
            ) {
                if (isSwitching) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(14.dp),
                        color = accent
                    )
                } else {
                    Text(
                        text = "Switch",
                        style = T3Typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                        color = T3Color.textPrimary
                    )
                }
            }
        }
        Box {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(T3Color.surfaceMuted)
                    .clickable { menuOpen = true },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.MoreHoriz,
                    contentDescription = "Options",
                    tint = T3Color.textSecondary,
                    modifier = Modifier.size(14.dp)
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text("Rename") },
                    onClick = {
                        menuOpen = false
                        onRename()
                    }
                )
                DropdownMenuItem(
                    text = { Text("Delete", color = T3Color.danger) },
                    onClick = {
                        menuOpen = false
                        onDelete()
                    }
                )
            }
        }
    }
}

@Composable
private fun AppearanceSection(
    appearance: AppAppearance,
    accent: AppAccent,
    isDark: Boolean,
    onAppearance: (AppAppearance) -> Unit,
    onAccent: (AppAccent) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Look & feel")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.lg)) {
                Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                    Text(
                        text = "Appearance",
                        style = T3Typography.callout,
                        color = T3Color.textSecondary
                    )
                    SegmentedThree(
                        items = listOf(
                            AppAppearance.SYSTEM to "System",
                            AppAppearance.LIGHT to "Light",
                            AppAppearance.DARK to "Dark"
                        ),
                        selected = appearance,
                        onSelect = onAppearance
                    )
                }
                T3Divider()
                Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                    Text(
                        text = "Accent",
                        style = T3Typography.callout,
                        color = T3Color.textSecondary
                    )
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(T3Spacing.md),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        AppAccent.values().forEach { option ->
                            val selected = option == accent
                            Box(
                                modifier = Modifier
                                    .size(32.dp)
                                    .clip(CircleShape)
                                    .background(option.colorFor(isDark))
                                    .border(
                                        width = if (selected) 2.dp else 0.dp,
                                        color = if (selected) T3Color.textPrimary else Color.Transparent,
                                        shape = CircleShape
                                    )
                                    .clickable { onAccent(option) },
                                contentAlignment = Alignment.Center
                            ) {
                                if (selected) {
                                    Icon(
                                        Icons.Filled.Check,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(14.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun <T> SegmentedThree(
    items: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceMuted)
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        items.forEach { (value, label) ->
            val isSelected = value == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(32.dp)
                    .clip(RoundedCornerShape(T3Radius.sm))
                    .background(if (isSelected) T3Color.surface else Color.Transparent)
                    .clickable { onSelect(value) },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = label,
                    style = T3Typography.callout.copy(fontSize = 13.sp),
                    color = if (isSelected) T3Color.textPrimary else T3Color.textSecondary
                )
            }
        }
    }
}

@Composable
private fun ChatSection(
    transcriptDensity: TranscriptDensity,
    composerSize: ComposerSize,
    onDensity: (TranscriptDensity) -> Unit,
    onComposer: (ComposerSize) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Chat experience")
        T3Card(padding = T3Spacing.md) {
            Column {
                MenuRow(
                    title = "Transcript density",
                    value = transcriptDensity.label,
                    options = TranscriptDensity.values().map { it.label to it },
                    onSelect = onDensity
                )
                T3Divider()
                MenuRow(
                    title = "Composer height",
                    value = composerSize.label,
                    options = ComposerSize.values().map { it.label to it },
                    onSelect = onComposer
                )
            }
        }
    }
}

@Composable
private fun <T> MenuRow(
    title: String,
    value: String,
    options: List<Pair<String, T>>,
    onSelect: (T) -> Unit
) {
    var open by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .padding(horizontal = T3Spacing.xs)
    ) {
        Text(
            text = title,
            style = T3Typography.body,
            color = T3Color.textPrimary,
            modifier = Modifier.weight(1f)
        )
        Box {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(T3Spacing.xs),
                modifier = Modifier
                    .clip(RoundedCornerShape(percent = 50))
                    .background(T3Color.surfaceMuted)
                    .border(0.5.dp, T3Color.separator, RoundedCornerShape(percent = 50))
                    .clickable { open = true }
                    .padding(horizontal = T3Spacing.md, vertical = 6.dp)
            ) {
                Text(
                    text = value,
                    style = T3Typography.callout,
                    color = T3Color.textPrimary
                )
                Icon(
                    Icons.Filled.KeyboardArrowDown,
                    contentDescription = null,
                    tint = T3Color.textTertiary,
                    modifier = Modifier.size(12.dp)
                )
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (label, value) ->
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            open = false
                            onSelect(value)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun ServerSection(
    sessionState: AppEnvironment.SessionState,
    serverConfigError: String?,
    isRefreshingConfig: Boolean,
    accent: Color,
    onCopy: (String) -> Unit,
    onRefresh: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Server")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.lg)) {
                if (sessionState is AppEnvironment.SessionState.Configured) {
                    val urlText = sessionState.serverURL.toString()
                    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                        Text(
                            text = "Endpoint",
                            style = T3Typography.callout,
                            color = T3Color.textSecondary
                        )
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(T3Radius.sm))
                                .background(T3Color.surfaceMuted)
                                .padding(T3Spacing.sm)
                        ) {
                            Text(
                                text = urlText,
                                style = T3Typography.code,
                                color = T3Color.textPrimary,
                                maxLines = 3,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        ServerActionButton(
                            label = "Copy",
                            background = T3Color.surfaceMuted,
                            foreground = T3Color.textPrimary,
                            modifier = Modifier.weight(1f),
                            onClick = { onCopy(urlText) }
                        )
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .heightIn(min = 40.dp)
                                .clip(RoundedCornerShape(T3Radius.md))
                                .background(if (isRefreshingConfig) T3Color.surfaceMuted else accent)
                                .clickable(enabled = !isRefreshingConfig, onClick = onRefresh)
                                .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm),
                            contentAlignment = Alignment.Center
                        ) {
                            if (isRefreshingConfig) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.size(16.dp),
                                    color = accent
                                )
                            } else {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(T3Spacing.xs)
                                ) {
                                    Icon(
                                        Icons.Filled.Refresh,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Text(
                                        text = "Refresh",
                                        style = T3Typography.bodyEmphasis,
                                        color = Color.White
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Text(
                        text = "Not connected",
                        style = T3Typography.body,
                        color = T3Color.textSecondary
                    )
                }
                serverConfigError?.let { err ->
                    T3Divider()
                    Text(
                        text = err,
                        style = T3Typography.footnote,
                        color = T3Color.danger
                    )
                }
            }
        }
    }
}

@Composable
private fun ServerActionButton(
    label: String,
    background: Color,
    foreground: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Box(
        modifier = modifier
            .heightIn(min = 40.dp)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(background)
            .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
            .clickable(onClick = onClick)
            .padding(horizontal = T3Spacing.md, vertical = T3Spacing.sm),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = T3Typography.bodyEmphasis,
            color = foreground
        )
    }
}

@Composable
private fun ProvidersSection(providers: List<ServerProvider>) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Model providers")
        T3Card(padding = T3Spacing.md) {
            Column {
                val shown = providers.take(8)
                shown.forEachIndexed { index, p ->
                    ProviderRow(p)
                    if (index < shown.size - 1) T3Divider()
                }
            }
        }
        Text(
            text = "Configured on your desktop server.",
            style = T3Typography.footnote,
            color = T3Color.textTertiary,
            modifier = Modifier.padding(horizontal = T3Spacing.xs)
        )
    }
}

@Composable
private fun ProviderRow(p: ServerProvider) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.md),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = T3Spacing.sm)
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = p.label,
                style = T3Typography.body,
                color = T3Color.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = p.brandDisplayName,
                style = T3Typography.footnote,
                color = T3Color.textTertiary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        val label: String
        val tint: Color
        when {
            p.isUsable -> { label = "Ready"; tint = T3Color.success }
            !p.installed -> { label = "Missing"; tint = T3Color.textTertiary }
            !p.enabled -> { label = "Off"; tint = T3Color.textTertiary }
            else -> { label = p.auth.status; tint = T3Color.warning }
        }
        T3Pill(text = label, tint = tint, emphasized = true)
    }
}

@Composable
private fun AboutSection() {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "About")
        T3Card(padding = T3Spacing.md) {
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                ) {
                    Text(
                        text = "Version",
                        style = T3Typography.body,
                        color = T3Color.textPrimary,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "1.0",
                        style = T3Typography.callout,
                        color = T3Color.textSecondary
                    )
                }
            }
        }
    }
}

@Composable
private fun SignOutSection(onSignOut: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Account")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.md)) {
                Text(
                    text = "Signing out clears the saved server URL and token from this Android device.",
                    style = T3Typography.footnote,
                    color = T3Color.textSecondary
                )
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(T3Radius.md))
                        .background(T3Color.danger)
                        .clickable(onClick = onSignOut)
                        .padding(vertical = T3Spacing.sm),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Sign out",
                        style = T3Typography.bodyEmphasis,
                        color = Color.White
                    )
                }
            }
        }
    }
}

private fun connectionHeadline(state: ConnectionState): String = when (state) {
    is ConnectionState.Connected -> "Live"
    is ConnectionState.Connecting -> "Connecting…"
    is ConnectionState.Offline -> "Offline"
    is ConnectionState.Error -> "Needs attention"
}

private fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
    clipboard?.setPrimaryClip(ClipData.newPlainText("Trifecta server", text))
}
