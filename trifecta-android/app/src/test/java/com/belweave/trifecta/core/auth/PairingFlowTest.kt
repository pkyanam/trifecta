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

    @Test
    fun preservesHostedSandboxProxyPath() {
        val parsed = PairingFlow.parsePairingURL(
            "https://app.trifecta.belweave.com/pair?host=https%3A%2F%2Fsbx.belweave.com%2F3773-d2fbll6q3hoi8suj&label=app-store-review#token=PAIRCODE"
        )

        assertNotNull(parsed)
        assertEquals("https://sbx.belweave.com/3773-d2fbll6q3hoi8suj", parsed!!.first.toString())
        assertEquals("PAIRCODE", parsed.second)
    }

    @Test
    fun parsesDaytonaPairingUrlWithQueryToken() {
        val parsed = PairingFlow.parsePairingURL(
            "https://3773-d2fbll6q3hoi8suj.daytonaproxy01.net/pair?token=PAIRCODE"
        )

        assertNotNull(parsed)
        assertEquals("https://3773-d2fbll6q3hoi8suj.daytonaproxy01.net", parsed!!.first.toString())
        assertEquals("PAIRCODE", parsed.second)
    }
}
