package com.belweave.trifecta.core.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class PairingFlowTest {
    @Test
    fun parsesDirectBackendPairingUrl() {
        val parsed = PairingFlow.parsePairingURL("http://192.168.1.44:3773/pair#token=PAIRCODE")

        assertNotNull(parsed)
        assertEquals("http://192.168.1.44:3773", parsed!!.first.toString())
        assertEquals("PAIRCODE", parsed.second)
    }

    @Test
    fun parsesHostedPairingUrlWithBackendHost() {
        val parsed = PairingFlow.parsePairingURL(
            "https://app.trifecta.belweave.ai/pair?host=http%3A%2F%2F192.168.1.44%3A3773#token=PAIRCODE"
        )

        assertNotNull(parsed)
        assertEquals("http://192.168.1.44:3773", parsed!!.first.toString())
        assertEquals("PAIRCODE", parsed.second)
    }
}
