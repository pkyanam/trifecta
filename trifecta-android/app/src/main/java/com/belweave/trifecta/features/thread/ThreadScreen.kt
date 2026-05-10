package com.belweave.trifecta.features.thread

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.belweave.trifecta.TrifectaApp
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.designsystem.T3Color
import com.belweave.trifecta.designsystem.T3Radius
import com.belweave.trifecta.designsystem.T3Spacing
import com.belweave.trifecta.designsystem.T3Typography
import com.belweave.trifecta.designsystem.TranscriptDensity
import androidx.compose.ui.graphics.Color
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.ComposerSize

@Composable
fun ThreadScreen(
    threadId: ThreadID,
    onBack: () -> Unit,
    accent: AppAccent,
    isDark: Boolean,
    transcriptDensity: TranscriptDensity,
    composerSize: ComposerSize = ComposerSize.COMFORTABLE
) {
    val context = LocalContext.current
    val app = context.applicationContext as TrifectaApp
    val viewModel: ThreadViewModel = viewModel(
        factory = ThreadViewModel.factory(app, threadId)
    )

    val accentColor: Color = accent.colorFor(isDark)
    val messages by viewModel.messages.collectAsState()
    val activities by viewModel.activities.collectAsState()
    val session by viewModel.session.collectAsState()
    val detail by viewModel.detail.collectAsState()
    val threads by viewModel.threads.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val serverConfig by viewModel.serverConfig.collectAsState()
    val lastError by viewModel.lastError.collectAsState()

    LaunchedEffect(threadId) { viewModel.start() }
    DisposableEffect(viewModel) { onDispose { viewModel.stop() } }

    var showRename by remember { mutableStateOf(false) }

    val threadShell = remember(threads, threadId) {
        threads.firstOrNull { it.id == threadId }
    }
    val project = remember(projects, threadShell) {
        threadShell?.let { ts -> projects.firstOrNull { it.id == ts.projectId } }
    }

    val descriptor = run {
        val title = detail?.title ?: threadShell?.title ?: "Thread"
        val selection = detail?.modelSelection ?: threadShell?.modelSelection
        val model = selection?.let { sel ->
            serverConfig?.modelDisplayLabel(sel) ?: sel.model
        } ?: "—"
        val interaction = detail?.interactionMode ?: threadShell?.interactionMode
            ?: com.belweave.trifecta.core.models.ProviderInteractionMode.DEFAULT
        val runtime = detail?.runtimeMode ?: threadShell?.runtimeMode
            ?: com.belweave.trifecta.core.models.RuntimeMode.FULL_ACCESS
        ThreadDescriptor(title = title, model = model, interactionMode = interaction, runtimeMode = runtime)
    }

    val isArchived = (detail?.archivedAt ?: threadShell?.archivedAt) != null

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(T3Color.surfaceGrouped)
            .windowInsetsPadding(WindowInsets.systemBars)
    ) {
        ThreadHeader(
            thread = descriptor,
            project = project,
            session = session,
            isArchived = isArchived,
            accent = accentColor,
            onBack = onBack,
            onRename = { showRename = true },
            onArchive = { viewModel.archive(onBack) },
            onUnarchive = { viewModel.unarchive() },
            onDelete = { viewModel.delete(onBack) },
            onSetInteractionMode = { mode -> viewModel.setInteractionMode(mode) }
        )

        Box(modifier = Modifier.weight(1f)) {
            MessageTimeline(
                messages = messages,
                activities = activities,
                density = transcriptDensity,
                accent = accentColor
            )
        }

        lastError?.let { err ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = T3Spacing.lg, vertical = T3Spacing.sm)
                    .clip(RoundedCornerShape(T3Radius.md))
                    .background(T3Color.danger.copy(alpha = 0.08f))
                    .padding(T3Spacing.md)
            ) {
                Text(err, style = T3Typography.footnote, color = T3Color.danger)
            }
        }

        ComposerView(
            viewModel = viewModel,
            accent = accent,
            isDark = isDark,
            composerSize = composerSize
        )
    }

    if (showRename) {
        var draft by remember(detail?.title, threadShell?.title) {
            mutableStateOf(detail?.title ?: threadShell?.title ?: "")
        }
        AlertDialog(
            onDismissRequest = { showRename = false },
            title = { Text("Rename thread") },
            text = {
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showRename = false
                        viewModel.rename(draft.trim())
                    },
                    enabled = draft.trim().isNotEmpty()
                ) { Text("Save") }
            },
            dismissButton = {
                TextButton(onClick = { showRename = false }) { Text("Cancel") }
            }
        )
    }
}
