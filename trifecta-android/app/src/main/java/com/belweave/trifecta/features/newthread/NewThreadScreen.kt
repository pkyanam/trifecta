package com.belweave.trifecta.features.newthread

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil3.compose.AsyncImage
import com.belweave.trifecta.core.models.ModelSelection
import com.belweave.trifecta.core.models.ProjectID
import com.belweave.trifecta.core.models.ProviderInteractionMode
import com.belweave.trifecta.core.models.ServerProvider
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.T3Card
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Divider
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3SectionHeader
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3ToolbarChip
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.T3WordmarkLabel
import com.belweave.trifecta.features.thread.LocalAttachment
import com.belweave.trifecta.features.thread.ModelPickerSheet
import com.belweave.trifecta.features.thread.loadImageAttachment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun NewThreadScreen(
    accent: AppAccent,
    isDark: Boolean,
    onDismiss: () -> Unit,
    onCreated: (ThreadID) -> Unit,
    viewModel: NewThreadViewModel = viewModel()
) {
    val accentColor = accent.colorFor(isDark)
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val projects by viewModel.projects.collectAsState()
    val usableProviders by viewModel.usableProviders.collectAsState()
    val serverConfig by viewModel.serverConfig.collectAsState()
    val serverConfigError by viewModel.serverConfigError.collectAsState()
    val selectedProject by viewModel.selectedProject.collectAsState()
    val selectedProvider by viewModel.selectedProvider.collectAsState()
    val selectedModel by viewModel.selectedModel.collectAsState()
    val interactionMode by viewModel.interactionMode.collectAsState()
    val attachments by viewModel.attachments.collectAsState()
    val prompt by viewModel.prompt.collectAsState()
    val isCreating by viewModel.isCreating.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val canCreate by viewModel.canCreate.collectAsState()

    var showModelPicker by remember { mutableStateOf(false) }
    var showProjectMenu by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.start() }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(NewThreadViewModel.MAX_ATTACHMENTS)
    ) { uris: List<Uri> ->
        if (uris.isEmpty()) return@rememberLauncherForActivityResult
        scope.launch {
            val loaded = withContext(Dispatchers.IO) {
                uris.mapNotNull { loadImageAttachment(context.contentResolver, it) }
            }
            viewModel.addAttachments(loaded)
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
                isCreating = isCreating,
                canCreate = canCreate,
                accent = accentColor,
                onClose = onDismiss,
                onCreate = {
                    scope.launch {
                        val created = viewModel.createThread()
                        if (created != null) onCreated(created)
                    }
                }
            )

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = T3Spacing.lg)
                    .padding(bottom = T3Spacing.xxxl),
                verticalArrangement = Arrangement.spacedBy(T3Spacing.xl)
            ) {
                ProjectSection(
                    projects = projects,
                    selectedProject = selectedProject,
                    showMenu = showProjectMenu,
                    onShowMenu = { showProjectMenu = true },
                    onDismissMenu = { showProjectMenu = false },
                    onSelect = {
                        viewModel.selectProject(it)
                        showProjectMenu = false
                    }
                )

                MessageSection(
                    prompt = prompt,
                    onPromptChange = viewModel::setPrompt,
                    attachments = attachments,
                    onPickPhotos = {
                        photoPicker.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                        )
                    },
                    onRemoveAttachment = viewModel::removeAttachment,
                    accent = accentColor
                )

                ModelSection(
                    serverConfigLoaded = serverConfig != null,
                    serverConfigError = serverConfigError,
                    usableProviders = usableProviders,
                    selectedProvider = selectedProvider,
                    selectedModel = selectedModel,
                    onTap = { showModelPicker = true }
                )

                ChatModeSection(
                    interactionMode = interactionMode,
                    showInteractionToggle = selectedProvider?.showInteractionModeToggle != false,
                    accent = accentColor,
                    onSelect = viewModel::setInteractionMode
                )

                errorMessage?.let { msg ->
                    Text(
                        text = msg,
                        style = T3Typography.footnote,
                        color = T3Color.danger,
                        modifier = Modifier.padding(horizontal = T3Spacing.xs)
                    )
                }
            }
        }
    }

    if (showModelPicker) {
        ModelPickerSheet(
            providers = serverConfig?.providers.orEmpty(),
            currentSelection = selectedProvider?.let { ModelSelection(it.instanceId, selectedModel) },
            accent = accentColor,
            onDismiss = { showModelPicker = false },
            onSelect = { provider, slug ->
                viewModel.selectProvider(provider.instanceId, slug)
                showModelPicker = false
            }
        )
    }
}

@Composable
private fun HeaderBar(
    isCreating: Boolean,
    canCreate: Boolean,
    accent: Color,
    onClose: () -> Unit,
    onCreate: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = T3Spacing.lg)
            .padding(top = T3Spacing.md, bottom = T3Spacing.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)
    ) {
        T3ToolbarChip(onClick = onClose) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Close",
                tint = T3Color.textPrimary,
                modifier = Modifier.size(14.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            T3WordmarkLabel()
            Spacer(Modifier.height(2.dp))
            Text(
                text = "Spin up a new conversation",
                style = T3Typography.footnote,
                color = T3Color.textTertiary
            )
        }
        val bg = if (canCreate) accent else T3Color.surfaceMuted
        val fg = if (canCreate) Color.White else T3Color.textTertiary
        Box(
            modifier = Modifier
                .defaultMinSize(minWidth = 64.dp, minHeight = 36.dp)
                .clip(RoundedCornerShape(percent = 50))
                .background(bg)
                .clickable(enabled = canCreate && !isCreating, onClick = onCreate)
                .padding(horizontal = T3Spacing.md, vertical = 6.dp),
            contentAlignment = Alignment.Center
        ) {
            if (isCreating) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(18.dp)
                )
            } else {
                Text(
                    text = "Create",
                    style = T3Typography.callout.copy(fontSize = 14.sp),
                    color = fg
                )
            }
        }
    }
}

@Composable
private fun ProjectSection(
    projects: List<com.belweave.trifecta.core.models.ProjectShell>,
    selectedProject: com.belweave.trifecta.core.models.ProjectShell?,
    showMenu: Boolean,
    onShowMenu: () -> Unit,
    onDismissMenu: () -> Unit,
    onSelect: (ProjectID) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Project")
        T3Card(padding = T3Spacing.md) {
            if (projects.isEmpty()) {
                Text(
                    text = "No projects are available from the desktop server.",
                    style = T3Typography.callout,
                    color = T3Color.textSecondary,
                    modifier = Modifier.padding(vertical = T3Spacing.sm)
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = T3Spacing.xs)
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = selectedProject?.title ?: "Select project",
                            style = T3Typography.body,
                            color = T3Color.textPrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        if (selectedProject != null && selectedProject.workspaceRoot.isNotEmpty()) {
                            Text(
                                text = selectedProject.workspaceRoot,
                                style = T3Typography.footnote,
                                color = T3Color.textTertiary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    Box {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(CircleShape)
                                .background(T3Color.surfaceMuted)
                                .clickable { onShowMenu() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Filled.KeyboardArrowDown,
                                contentDescription = "Choose project",
                                tint = T3Color.textTertiary,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                        DropdownMenu(expanded = showMenu, onDismissRequest = onDismissMenu) {
                            projects.forEach { project ->
                                DropdownMenuItem(
                                    text = {
                                        Text(
                                            text = project.title,
                                            color = T3Color.textPrimary
                                        )
                                    },
                                    onClick = { onSelect(project.id) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MessageSection(
    prompt: String,
    onPromptChange: (String) -> Unit,
    attachments: List<LocalAttachment>,
    onPickPhotos: () -> Unit,
    onRemoveAttachment: (String) -> Unit,
    accent: Color
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Message")
        T3Card(padding = T3Spacing.md) {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                if (attachments.isNotEmpty()) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                        items(attachments, key = { it.id }) { att ->
                            AttachmentPreview(att) { onRemoveAttachment(att.id) }
                        }
                    }
                }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 120.dp, max = 220.dp)
                        .clip(RoundedCornerShape(T3Radius.md))
                        .background(T3Color.surface)
                        .border(0.5.dp, T3Color.separator, RoundedCornerShape(T3Radius.md))
                        .padding(T3Spacing.sm)
                ) {
                    if (prompt.isEmpty()) {
                        Text(
                            text = "Ask Trifecta…",
                            style = T3Typography.body,
                            color = T3Color.textTertiary
                        )
                    }
                    BasicTextField(
                        value = prompt,
                        onValueChange = onPromptChange,
                        textStyle = TextStyle(fontSize = 15.sp, color = T3Color.textPrimary, lineHeight = 22.sp),
                        cursorBrush = SolidColor(accent),
                        modifier = Modifier.fillMaxSize()
                    )
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    val attachDisabled = attachments.size >= NewThreadViewModel.MAX_ATTACHMENTS
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .clip(RoundedCornerShape(T3Radius.sm))
                            .clickable(enabled = !attachDisabled, onClick = onPickPhotos)
                            .padding(vertical = 4.dp, horizontal = 4.dp)
                    ) {
                        Icon(
                            Icons.Filled.AttachFile,
                            contentDescription = null,
                            tint = if (attachDisabled) T3Color.textTertiary else T3Color.textSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text = "Photos",
                            style = T3Typography.footnote,
                            color = if (attachDisabled) T3Color.textTertiary else T3Color.textSecondary
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    val overLimit = prompt.length > NewThreadViewModel.MAX_CHARS
                    Text(
                        text = "${prompt.length} / ${NewThreadViewModel.MAX_CHARS}",
                        style = T3Typography.caption,
                        color = if (overLimit) T3Color.danger else T3Color.textTertiary
                    )
                }
            }
        }
    }
}

@Composable
private fun AttachmentPreview(att: LocalAttachment, onRemove: () -> Unit) {
    Box(
        modifier = Modifier
            .size(width = 120.dp, height = 88.dp)
            .clip(RoundedCornerShape(T3Radius.md))
            .background(T3Color.surfaceMuted)
    ) {
        AsyncImage(
            model = att.previewBytes,
            contentDescription = att.upload.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(4.dp)
                .size(20.dp)
                .clip(CircleShape)
                .background(Color.Black.copy(alpha = 0.6f))
                .clickable(onClick = onRemove),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                Icons.Filled.Close,
                contentDescription = "Remove",
                tint = Color.White,
                modifier = Modifier.size(12.dp)
            )
        }
    }
}

@Composable
private fun ModelSection(
    serverConfigLoaded: Boolean,
    serverConfigError: String?,
    usableProviders: List<ServerProvider>,
    selectedProvider: ServerProvider?,
    selectedModel: String,
    onTap: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Model")
        T3Card(padding = T3Spacing.md) {
            if (usableProviders.isEmpty()) {
                val msg = serverConfigError
                    ?: if (!serverConfigLoaded) "Loading providers…"
                    else "No installed, authenticated providers are available."
                Text(
                    text = msg,
                    style = T3Typography.callout,
                    color = T3Color.textSecondary,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = T3Spacing.sm)
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp)
                        .clip(RoundedCornerShape(T3Radius.md))
                        .clickable(onClick = onTap)
                        .padding(horizontal = T3Spacing.xs)
                ) {
                    Text(
                        text = "Model",
                        style = T3Typography.body,
                        color = T3Color.textPrimary
                    )
                    Spacer(Modifier.weight(1f))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(T3Spacing.xs),
                        modifier = Modifier
                            .clip(RoundedCornerShape(percent = 50))
                            .background(T3Color.surfaceMuted)
                            .border(0.5.dp, T3Color.separator, RoundedCornerShape(percent = 50))
                            .padding(horizontal = T3Spacing.md, vertical = 6.dp)
                    ) {
                        Text(
                            text = modelSummary(selectedProvider, selectedModel),
                            style = T3Typography.callout,
                            color = T3Color.textPrimary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Icon(
                            Icons.Filled.KeyboardArrowDown,
                            contentDescription = null,
                            tint = T3Color.textTertiary,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
            }
        }
    }
}

private fun modelSummary(provider: ServerProvider?, slug: String): String {
    if (provider == null || slug.isEmpty()) return "Choose model"
    val name = provider.modelLabel(slug)
    val brand = provider.brandDisplayName
    val upstream = provider.upstreamVendorLabel(slug)
    return if (upstream != null) "$name · $brand · $upstream"
    else "$name · $brand · ${provider.label}"
}

@Composable
private fun ChatModeSection(
    interactionMode: ProviderInteractionMode,
    showInteractionToggle: Boolean,
    accent: Color,
    onSelect: (ProviderInteractionMode) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
        T3SectionHeader(title = "Mode")
        T3Card {
            Column(verticalArrangement = Arrangement.spacedBy(T3Spacing.sm)) {
                Text(
                    text = "Chat mode",
                    style = T3Typography.callout,
                    color = T3Color.textSecondary
                )
                SegmentedTwoOptions(
                    leftLabel = "Build",
                    rightLabel = "Plan",
                    selectedLeft = interactionMode == ProviderInteractionMode.DEFAULT,
                    enabled = showInteractionToggle,
                    accent = accent,
                    onSelectLeft = { onSelect(ProviderInteractionMode.DEFAULT) },
                    onSelectRight = { onSelect(ProviderInteractionMode.PLAN) }
                )
                Spacer(Modifier.height(T3Spacing.xs))
                T3Divider()
                Spacer(Modifier.height(T3Spacing.xs))
                Text(
                    text = "Access · Full access",
                    style = T3Typography.footnote,
                    color = T3Color.textTertiary
                )
            }
        }
    }
}

@Composable
private fun SegmentedTwoOptions(
    leftLabel: String,
    rightLabel: String,
    selectedLeft: Boolean,
    enabled: Boolean,
    accent: Color,
    onSelectLeft: () -> Unit,
    onSelectRight: () -> Unit
) {
    val shape = RoundedCornerShape(T3Radius.md)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(T3Color.surfaceMuted)
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        SegmentChip(
            label = leftLabel,
            selected = selectedLeft,
            enabled = enabled,
            accent = accent,
            modifier = Modifier.weight(1f),
            onClick = onSelectLeft
        )
        SegmentChip(
            label = rightLabel,
            selected = !selectedLeft,
            enabled = enabled,
            accent = accent,
            modifier = Modifier.weight(1f),
            onClick = onSelectRight
        )
    }
}

@Composable
private fun SegmentChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    accent: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = if (selected) T3Color.surface else Color.Transparent
    val fg = when {
        !enabled -> T3Color.textTertiary
        selected -> T3Color.textPrimary
        else -> T3Color.textSecondary
    }
    Box(
        modifier = modifier
            .height(32.dp)
            .clip(RoundedCornerShape(T3Radius.sm))
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = T3Typography.callout.copy(fontSize = 13.sp),
            color = fg
        )
    }
}
