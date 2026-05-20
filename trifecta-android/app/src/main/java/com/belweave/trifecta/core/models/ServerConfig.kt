package com.belweave.trifecta.core.models

import kotlinx.serialization.json.JsonObject

// MARK: - Server runtime config (from /api/v1/runtime-config)

data class ServerProviderAuth(
    val status: String,
    val label: String?,
    val email: String?
) {
    companion object {
        fun fromJson(obj: JsonObject?): ServerProviderAuth =
            ServerProviderAuth(
                status = obj?.str("status") ?: "unauthenticated",
                label = obj?.str("label"),
                email = obj?.str("email")
            )
    }
}

data class ServerProviderModel(
    val slug: String,
    val name: String,
    val shortName: String?,
    val subProvider: String?,
    val isCustom: Boolean,
    val tier: String?,
    val catalog: String?,
    val bundle: String?,
    val eligible: Boolean?
) {
    val id: String get() = slug
    val label: String get() = shortName ?: name

    fun opencodeRoutingBucket(): OpenCodeRoutingBucket {
        OpenCodeRoutingBucket.fromMetadata(tier, catalog, bundle, subProvider)?.let { return it }
        OpenCodeRoutingBucket.fromSlugPrefix(slug)?.let { return it }
        return OpenCodeRoutingBucket.STANDARD
    }

    companion object {
        fun fromJson(obj: JsonObject): ServerProviderModel? {
            val slug = obj.str("slug") ?: return null
            val name = obj.str("name") ?: slug
            val subProviderRaw = obj.str("subProvider")?.trim()
            val tier = firstString(obj, "tier", "subscription", "routing", "channel", "offer")
            val eligible = firstBool(obj, "eligible", "available", "enabled")
            return ServerProviderModel(
                slug = slug,
                name = name,
                shortName = obj.str("shortName"),
                subProvider = subProviderRaw?.takeIf { it.isNotEmpty() },
                isCustom = obj.bool("isCustom") ?: false,
                tier = tier,
                catalog = obj.str("catalog"),
                bundle = obj.str("bundle"),
                eligible = eligible
            )
        }

        private fun firstString(obj: JsonObject, vararg keys: String): String? {
            for (k in keys) {
                obj.str(k)?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
            }
            return null
        }

        private fun firstBool(obj: JsonObject, vararg keys: String): Boolean? {
            for (k in keys) {
                obj.bool(k)?.let { return it }
            }
            return null
        }
    }
}

data class ServerProviderSlashCommand(
    val name: String,
    val description: String?,
    val inputHint: String?
) {
    companion object {
        fun fromJson(obj: JsonObject): ServerProviderSlashCommand? {
            val name = obj.str("name") ?: return null
            return ServerProviderSlashCommand(
                name = name,
                description = obj.str("description"),
                inputHint = obj.obj("input")?.str("hint")
            )
        }
    }
}

data class ServerProviderSkill(
    val name: String,
    val description: String?,
    val shortDescription: String?
) {
    companion object {
        fun fromJson(obj: JsonObject): ServerProviderSkill? {
            val name = obj.str("name") ?: return null
            return ServerProviderSkill(
                name = name,
                description = obj.str("description"),
                shortDescription = obj.str("shortDescription")
            )
        }
    }
}

data class ServerProvider(
    val instanceId: ProviderInstanceID,
    val driver: String,
    val displayName: String?,
    val enabled: Boolean,
    val installed: Boolean,
    val status: String,
    val auth: ServerProviderAuth,
    val models: List<ServerProviderModel>,
    val showInteractionModeToggle: Boolean?,
    val slashCommands: List<ServerProviderSlashCommand>,
    val skills: List<ServerProviderSkill>
) {
    val id: ProviderInstanceID get() = instanceId

    val isUsable: Boolean
        get() = enabled && installed && auth.status != "unauthenticated"

    val label: String
        get() = displayName?.trim()?.takeIf { it.isNotEmpty() } ?: driver.providerDisplayName()

    val brandDisplayName: String
        get() = when (driver) {
            "claudeAgent" -> "Anthropic"
            "cursor" -> "Cursor"
            "opencode" -> "OpenCode"
            "openaiChat", "openAIChat", "openai" -> "OpenAI"
            "gemini", "googleGemini", "antigravity" -> "Google"
            else -> driver.providerDisplayName()
        }

    val defaultModel: String
        get() = models.firstOrNull { !it.isCustom && it.eligible != false }?.slug
            ?: models.firstOrNull { it.eligible != false }?.slug
            ?: models.firstOrNull()?.slug
            ?: defaultModelSlugFor(driver)

    fun modelLabel(slug: String): String =
        models.firstOrNull { it.slug == slug }?.label ?: slug

    fun upstreamVendorLabel(modelSlug: String): String? {
        if (driver != "opencode") return null
        val routed = opencodeUpstreamSlug(modelSlug)
        val slash = routed.indexOf('/')
        if (slash < 0) return null
        return opencodeVendorTitle(routed.substring(0, slash).lowercase())
    }

    companion object {
        fun fromJson(obj: JsonObject): ServerProvider? {
            val instance = obj.str("instanceId") ?: return null
            val driver = obj.str("driver") ?: return null
            val models = obj.arr("models")?.mapNotNull {
                ServerProviderModel.fromJson(it.asObjectOrNull() ?: return@mapNotNull null)
            } ?: emptyList()
            return ServerProvider(
                instanceId = ProviderInstanceID(instance),
                driver = driver,
                displayName = obj.str("displayName"),
                enabled = obj.bool("enabled") ?: false,
                installed = obj.bool("installed") ?: false,
                status = obj.str("status") ?: "",
                auth = ServerProviderAuth.fromJson(obj.obj("auth")),
                models = models,
                showInteractionModeToggle = obj.bool("showInteractionModeToggle"),
                slashCommands = obj.arr("slashCommands")?.mapNotNull {
                    ServerProviderSlashCommand.fromJson(it.asObjectOrNull() ?: return@mapNotNull null)
                } ?: emptyList(),
                skills = obj.arr("skills")?.mapNotNull {
                    ServerProviderSkill.fromJson(it.asObjectOrNull() ?: return@mapNotNull null)
                } ?: emptyList()
            )
        }

        private fun defaultModelSlugFor(driver: String): String = when (driver) {
            "claudeAgent" -> "claude-sonnet-4-6"
            "cursor" -> "auto"
            "opencode" -> "openai/gpt-5"
            "antigravity" -> "auto"
            else -> "gpt-5.4"
        }

        fun opencodeUpstreamSlug(slug: String): String {
            val slash = slug.indexOf('/')
            if (slash < 0) return slug
            val prefix = slug.substring(0, slash).lowercase()
            return when (prefix) {
                "zen", "go" -> slug.substring(slash + 1).ifEmpty { slug }
                else -> slug
            }
        }

        fun opencodeVendorTitle(raw: String): String = when (raw) {
            "openai" -> "OpenAI"
            "anthropic" -> "Anthropic"
            "google", "gemini" -> "Google"
            "groq" -> "Groq"
            "x-ai", "xai" -> "xAI"
            "mistralai", "mistral" -> "Mistral"
            "deepseek" -> "DeepSeek"
            "meta-llama", "meta" -> "Meta"
            "cohere" -> "Cohere"
            else -> raw.split('-').joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        }
    }
}

private val camelCaseRegex = Regex("([a-z])([A-Z])")
private val sepRegex = Regex("[-_]+")
private fun String.providerDisplayName(): String =
    this.replace(camelCaseRegex, "$1 $2")
        .replace(sepRegex, " ")
        .split(' ')
        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }

data class ServerRuntimeConfig(
    val providers: List<ServerProvider>,
    val sshEnabled: Boolean = true,
    val serverPlatformOs: String? = null
) {
    fun provider(instanceId: ProviderInstanceID): ServerProvider? =
        providers.firstOrNull { it.instanceId == instanceId }

    fun modelDisplayLabel(selection: ModelSelection): String {
        val provider = provider(selection.instanceId)
        return provider?.modelLabel(selection.model) ?: selection.model
    }

    companion object {
        fun fromJson(obj: JsonObject): ServerRuntimeConfig {
            val providers = obj.arr("providers")
                ?.mapNotNull { ServerProvider.fromJson(it.asObjectOrNull() ?: return@mapNotNull null) }
                ?: emptyList()
            val environment = obj.obj("environment")
            val sshEnabled = environment?.obj("capabilities")?.bool("ssh") ?: true
            val serverPlatformOs = environment?.obj("platform")?.str("os")
            return ServerRuntimeConfig(
                providers = providers,
                sshEnabled = sshEnabled,
                serverPlatformOs = serverPlatformOs
            )
        }
    }
}

// MARK: - OpenCode routing bucket + catalog grouping

enum class OpenCodeRoutingBucket(val raw: String, val sectionSuffix: String) {
    ZEN("zen", "Zen"),
    GO("go", "Go"),
    STANDARD("standard", "Standard routing"),
    OTHER("other", "Other");

    companion object {
        val allInOrder: List<OpenCodeRoutingBucket> = listOf(ZEN, GO, STANDARD, OTHER)

        fun fromMetadata(
            tier: String?,
            catalog: String?,
            bundle: String?,
            subProvider: String?
        ): OpenCodeRoutingBucket? {
            val bits = listOfNotNull(tier, catalog, bundle, subProvider).map { it.lowercase() }
            for (raw in bits) if (raw.contains("zen")) return ZEN
            for (raw in bits) {
                if (raw.contains("google")) continue
                if (raw == "go" || raw.startsWith("go/") || raw.endsWith("/go")
                    || raw.contains(" opencode go") || raw == "opencode-go"
                ) return GO
            }
            return null
        }

        fun fromSlugPrefix(slug: String): OpenCodeRoutingBucket? {
            val slash = slug.indexOf('/')
            if (slash < 0) return null
            return when (slug.substring(0, slash).lowercase()) {
                "zen" -> ZEN
                "go" -> GO
                else -> null
            }
        }
    }
}

data class ModelCatalogEntry(
    val id: String,
    val provider: ServerProvider,
    val model: ServerProviderModel
) {
    val opencodeBucket: OpenCodeRoutingBucket?
        get() = if (provider.driver == "opencode") model.opencodeRoutingBucket() else null
}

data class ModelCatalogSection(
    val sectionId: String,
    val provider: ServerProvider,
    val entries: List<ModelCatalogEntry>,
    val headerSuffix: String?
) {
    val id: String get() = sectionId

    val headerTitle: String
        get() {
            val base = "${provider.brandDisplayName} · ${provider.label}"
            return if (headerSuffix != null) "$base · $headerSuffix" else base
        }

    companion object {
        fun grouped(providers: List<ServerProvider>): List<ModelCatalogSection> {
            val usable = providers.filter { it.isUsable }
                .sortedWith(
                    Comparator { a, b ->
                        val brandCmp = String.CASE_INSENSITIVE_ORDER.compare(a.brandDisplayName, b.brandDisplayName)
                        if (brandCmp != 0) brandCmp
                        else String.CASE_INSENSITIVE_ORDER.compare(a.label, b.label)
                    }
                )

            val sections = mutableListOf<ModelCatalogSection>()
            for (p in usable) {
                val rawEntries = p.models
                    .filter { it.eligible != false }
                    .map {
                        ModelCatalogEntry(
                            id = "${p.instanceId.rawValue}|${it.slug}",
                            provider = p,
                            model = it
                        )
                    }
                if (rawEntries.isEmpty()) continue

                if (p.driver != "opencode") {
                    val sorted = rawEntries.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.model.label })
                    sections.add(
                        ModelCatalogSection(
                            sectionId = p.instanceId.rawValue,
                            provider = p,
                            entries = sorted,
                            headerSuffix = null
                        )
                    )
                    continue
                }

                val subProviderKeys = rawEntries
                    .mapNotNull { it.model.subProvider?.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()

                if (subProviderKeys.isNotEmpty()) {
                    val groups = rawEntries.groupBy {
                        it.model.subProvider?.trim().orEmpty().ifEmpty { "__none__" }
                    }
                    val orderedKeys = groups.keys.sortedWith(Comparator { a, b ->
                        when {
                            a == "__none__" -> 1
                            b == "__none__" -> -1
                            else -> String.CASE_INSENSITIVE_ORDER.compare(a, b)
                        }
                    })
                    val nonEmptyKeys = orderedKeys.filter { it != "__none__" }
                    val showSuffix = nonEmptyKeys.size > 1
                        || (orderedKeys.contains("__none__") && nonEmptyKeys.isNotEmpty())
                    for (key in orderedKeys) {
                        val items = groups[key]?.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.model.label }) ?: continue
                        val label = if (key == "__none__") "Other" else key
                        sections.add(
                            ModelCatalogSection(
                                sectionId = "${p.instanceId.rawValue}|$key",
                                provider = p,
                                entries = items,
                                headerSuffix = if (showSuffix) label else null
                            )
                        )
                    }
                } else {
                    val buckets = rawEntries.groupBy { it.model.opencodeRoutingBucket() }
                    val orderedBuckets = OpenCodeRoutingBucket.allInOrder.filter { buckets[it] != null }
                    val showSuffix = !(orderedBuckets.size == 1 && orderedBuckets.firstOrNull() == OpenCodeRoutingBucket.STANDARD)
                    for (bucket in orderedBuckets) {
                        val items = buckets[bucket]?.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.model.label }) ?: continue
                        sections.add(
                            ModelCatalogSection(
                                sectionId = "${p.instanceId.rawValue}|${bucket.raw}",
                                provider = p,
                                entries = items,
                                headerSuffix = if (showSuffix) bucket.sectionSuffix else null
                            )
                        )
                    }
                }
            }
            return sections
        }
    }
}

// MARK: - Pairing environment descriptor

data class EnvironmentDescriptor(
    val policy: String,
    val bootstrapMethods: List<String>,
    val sessionMethods: List<String>,
    val sessionCookieName: String?
) {
    companion object {
        fun decodeLenient(text: String): EnvironmentDescriptor? {
            val obj = runCatching {
                T3Json.parseToJsonElement(text).asObjectOrNull()
            }.getOrNull() ?: return null
            return EnvironmentDescriptor(
                policy = obj.str("policy") ?: "remote-reachable",
                bootstrapMethods = obj.arr("bootstrapMethods")?.mapNotNull { it.stringOrNull() } ?: emptyList(),
                sessionMethods = obj.arr("sessionMethods")?.mapNotNull { it.stringOrNull() } ?: emptyList(),
                sessionCookieName = obj.str("sessionCookieName")
            )
        }
    }
}
