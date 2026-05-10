package com.belweave.trifecta.designsystem

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object T3Typography {
    val largeTitle: TextStyle = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Bold)
    val title: TextStyle = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    val headline: TextStyle = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold)

    val body: TextStyle = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Normal)
    val bodyEmphasis: TextStyle = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
    val callout: TextStyle = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Normal)
    val footnote: TextStyle = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Normal)
    val caption: TextStyle = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium)

    val code: TextStyle = TextStyle(fontSize = 13.sp, fontFamily = FontFamily.Monospace)
    val codeBlock: TextStyle = TextStyle(fontSize = 14.sp, fontFamily = FontFamily.Monospace)
}
