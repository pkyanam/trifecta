package com.belweave.trifecta.core.networking

sealed class T3Error(message: String) : Exception(message) {
    object NotConnected : T3Error("Not connected to T3 server")
    object InvalidServerURL : T3Error("Invalid server URL")
    data class PairingFailed(val reason: String) : T3Error("Pairing failed: $reason")
    data class RequestFailed(val reason: String) : T3Error("Request failed: $reason")
    data class DecodingFailed(val reason: String) : T3Error("Failed to decode response: $reason")
}
