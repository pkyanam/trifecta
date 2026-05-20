package com.belweave.trifecta.features.connection

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.belweave.trifecta.TrifectaApp
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

@Composable
fun QrScannerScreen(
    onScanned: () -> Unit,
    onCancel: () -> Unit
) {
    val ctx = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }

    val camPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) onCancel()
    }

    LaunchedEffect(Unit) {
        val hasPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (!hasPermission) {
            camPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { parentCtx ->
                val previewView = PreviewView(parentCtx).apply {
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                }
                val cameraProviderFuture = ProcessCameraProvider.getInstance(parentCtx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val options = BarcodeScannerOptions.Builder()
                        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                        .build()
                    val barcodeScanner = BarcodeScanning.getClient(options)
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(executor) { imageProxy ->
                        val mediaImage = imageProxy.image
                        if (mediaImage != null) {
                            val inputImage = InputImage.fromMediaImage(
                                mediaImage, imageProxy.imageInfo.rotationDegrees
                            )
                            barcodeScanner.process(inputImage)
                                .addOnSuccessListener { barcodes ->
                                    for (barcode in barcodes) {
                                        val raw = barcode.rawValue
                                        if (!raw.isNullOrBlank()) {
                                            val app = ctx.applicationContext as? TrifectaApp
                                            app?.postPendingPairingLink(raw)
                                            onScanned()
                                            return@addOnSuccessListener
                                        }
                                    }
                                }
                                .addOnCompleteListener { imageProxy.close() }
                        } else {
                            imageProxy.close()
                        }
                    }
                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            analysis
                        )
                    } catch (_: Exception) { }
                }, ContextCompat.getMainExecutor(parentCtx))
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        IconButton(
            onClick = onCancel,
            modifier = Modifier.padding(16)
        ) {
            Icon(
                Icons.Filled.ArrowBack,
                contentDescription = "Back",
                tint = Color.White
            )
        }
    }
}
