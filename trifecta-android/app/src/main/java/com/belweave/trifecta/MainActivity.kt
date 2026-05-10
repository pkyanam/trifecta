package com.belweave.trifecta

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.belweave.trifecta.core.env.AppEnvironment
import com.belweave.trifecta.core.models.ThreadID
import com.belweave.trifecta.designsystem.AppAccent
import com.belweave.trifecta.designsystem.AppAppearance
import com.belweave.trifecta.designsystem.ComposerSize
import com.belweave.trifecta.designsystem.T3Theme
import com.belweave.trifecta.designsystem.TranscriptDensity
import com.belweave.trifecta.features.connection.ConnectionSetupScreen
import com.belweave.trifecta.features.newthread.NewThreadScreen
import com.belweave.trifecta.features.settings.SettingsScreen
import com.belweave.trifecta.features.thread.ThreadScreen
import com.belweave.trifecta.features.threads.ThreadsListScreen

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        capturePairingDeepLink(intent)
        setContent {
            val app = applicationContext as TrifectaApp
            val appearance by app.prefs.appearance.collectAsState(initial = AppAppearance.SYSTEM)
            val accent by app.prefs.accent.collectAsState(initial = AppAccent.BLUE)
            val transcriptDensity by app.prefs.transcriptDensity.collectAsState(initial = TranscriptDensity.COMFORTABLE)
            val composerSize by app.prefs.composerSize.collectAsState(initial = ComposerSize.COMFORTABLE)

            T3Theme(appearance = appearance, accent = accent) {
                val isDark = when (appearance) {
                    AppAppearance.SYSTEM -> isSystemInDarkTheme()
                    AppAppearance.LIGHT -> false
                    AppAppearance.DARK -> true
                }
                Box(modifier = Modifier.fillMaxSize()) {
                    AppNav(
                        env = app.env,
                        accent = accent,
                        isDark = isDark,
                        transcriptDensity = transcriptDensity,
                        composerSize = composerSize
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        capturePairingDeepLink(intent)
    }

    private fun capturePairingDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        val raw = data.toString()
        if (raw.isNotBlank()) {
            (applicationContext as? TrifectaApp)?.postPendingPairingLink(raw)
        }
    }
}

private object Routes {
    const val Connect = "connect"
    const val Threads = "threads"
    const val NewThread = "new-thread"
    const val Settings = "settings"
    const val Thread = "thread/{threadId}"
    fun thread(id: String) = "thread/$id"
}

@Composable
private fun AppNav(
    env: AppEnvironment,
    accent: AppAccent,
    isDark: Boolean,
    transcriptDensity: TranscriptDensity,
    composerSize: ComposerSize
) {
    val nav: NavHostController = rememberNavController()
    val sessionState by env.sessionState.collectAsState()

    val start = when (sessionState) {
        is AppEnvironment.SessionState.Configured -> Routes.Threads
        else -> Routes.Connect
    }

    LaunchedEffect(sessionState) {
        when (sessionState) {
            is AppEnvironment.SessionState.Configured -> {
                if (nav.currentDestination?.route == Routes.Connect) {
                    nav.navigate(Routes.Threads) {
                        popUpTo(Routes.Connect) { inclusive = true }
                    }
                }
            }
            is AppEnvironment.SessionState.Unconfigured -> {
                if (nav.currentDestination?.route != Routes.Connect) {
                    nav.navigate(Routes.Connect) {
                        popUpTo(0)
                    }
                }
            }
        }
    }

    NavHost(navController = nav, startDestination = start) {
        composable(Routes.Connect) {
            ConnectionSetupScreen()
        }
        composable(Routes.Threads) {
            ThreadsListScreen(
                onOpenThread = { thread ->
                    nav.navigate(Routes.thread(thread.id.rawValue))
                },
                onNewThread = { nav.navigate(Routes.NewThread) },
                onOpenSettings = { nav.navigate(Routes.Settings) },
                onOpenArchived = { nav.navigate(Routes.Settings) }
            )
        }
        composable(Routes.Settings) {
            SettingsScreen(
                isDark = isDark,
                onDismiss = { nav.popBackStack() }
            )
        }
        composable(Routes.NewThread) {
            NewThreadScreen(
                accent = accent,
                isDark = isDark,
                onDismiss = { nav.popBackStack() },
                onCreated = { id ->
                    nav.popBackStack()
                    nav.navigate(Routes.thread(id.rawValue))
                }
            )
        }
        composable(Routes.Thread) { backStackEntry ->
            val rawId = backStackEntry.arguments?.getString("threadId").orEmpty()
            ThreadScreen(
                threadId = ThreadID(rawId),
                onBack = { nav.popBackStack() },
                accent = accent,
                isDark = isDark,
                transcriptDensity = transcriptDensity,
                composerSize = composerSize
            )
        }
    }
}
