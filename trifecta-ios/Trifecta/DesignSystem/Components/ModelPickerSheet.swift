import SwiftUI

// MARK: - Favorites (local, mirrors desktop settings shape loosely)

private enum ModelPickerFavoriteStore {
    private static let defaultsKey = "modelPickerFavoriteIds"

    static func load() -> Set<String> {
        guard let data = UserDefaults.standard.data(forKey: defaultsKey),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return Set(decoded)
    }

    static func save(_ ids: Set<String>) {
        let sorted = ids.sorted()
        if let data = try? JSONEncoder().encode(sorted) {
            UserDefaults.standard.set(data, forKey: defaultsKey)
        }
    }
}

/// Desktop-style model picker: favorites rail, per-instance icons, search, starred rows, jump hints.
struct ModelPickerSheet: View {
    private enum RailSelection: Hashable {
        case favorites
        case provider(ProviderInstanceID)
    }

    let providers: [ServerProvider]
    let currentSelection: ModelSelection?
    let accentColor: Color
    let onSelect: (ServerProvider, String) -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @FocusState private var searchFocused: Bool

    @State private var searchQuery = ""
    @State private var railSelection: RailSelection = .favorites
    @State private var favoriteIds: Set<String> = ModelPickerFavoriteStore.load()

    private var usableProviders: [ServerProvider] {
        providers
            .filter(\.isUsable)
            .sorted {
                let brandCmp = $0.brandDisplayName.localizedCaseInsensitiveCompare($1.brandDisplayName)
                if brandCmp != .orderedSame { return brandCmp == .orderedAscending }
                return $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
            }
    }

    private var instanceOrder: [ProviderInstanceID] {
        usableProviders.map(\.instanceId)
    }

    private var catalogEntries: [ModelCatalogEntry] {
        var rows: [ModelCatalogEntry] = []
        for p in usableProviders {
            for m in p.models where m.eligible != false {
                rows.append(ModelCatalogEntry(id: "\(p.instanceId.rawValue)|\(m.slug)", provider: p, model: m))
            }
        }
        return rows
    }

    private var isSearching: Bool {
        !ModelPickerSearch.normalizedTokens(searchQuery).isEmpty
    }

    private var filteredEntries: [ModelCatalogEntry] {
        let base: [ModelCatalogEntry]
        if isSearching {
            base = catalogEntries
        } else {
            switch railSelection {
            case .favorites:
                base = catalogEntries.filter { favoriteIds.contains($0.id) }
            case .provider(let id):
                base = catalogEntries.filter { $0.provider.instanceId == id }
            }
        }

        guard !base.isEmpty else { return [] }

        if isSearching {
            let ranked = base.compactMap { entry -> (ModelCatalogEntry, Int, String)? in
                guard let r = ModelPickerSearch.rank(
                    entry: entry,
                    query: searchQuery,
                    isFavorite: favoriteIds.contains(entry.id)
                ) else {
                    return nil
                }
                return (entry, r.score, r.tieBreaker)
            }
            return ranked
                .sorted {
                    if $0.1 != $1.1 { return $0.1 < $1.1 }
                    return $0.2.localizedStandardCompare($1.2) == .orderedAscending
                }
                .map(\.0)
        }

        let orderIndex = Dictionary(uniqueKeysWithValues: instanceOrder.enumerated().map { ($0.element, $0.offset) })

        return base.sorted { a, b in
            let fa = favoriteIds.contains(a.id)
            let fb = favoriteIds.contains(b.id)
            if railSelection != .favorites, fa != fb {
                return fa && !fb
            }
            let ia = orderIndex[a.provider.instanceId] ?? Int.max
            let ib = orderIndex[b.provider.instanceId] ?? Int.max
            if ia != ib { return ia < ib }
            let nameCmp = a.model.label.localizedCaseInsensitiveCompare(b.model.label)
            if nameCmp != .orderedSame { return nameCmp == .orderedAscending }
            return a.provider.label.localizedCaseInsensitiveCompare(b.provider.label) == .orderedAscending
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader
                .contentShape(Rectangle())
                .onTapGesture { blurSearch() }

            HStack(spacing: 0) {
                if !isSearching {
                    pickerRail
                    Divider()
                        .overlay(T3Color.separator.opacity(0.55))
                }

                mainColumn
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background {
            T3Color.surfaceGrouped
                .ignoresSafeArea(edges: .all)
        }
        .presentationBackground(T3Color.surfaceGrouped)
        .presentationDragIndicator(.visible)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    blurSearch()
                }
                .fontWeight(.semibold)
            }
        }
        .onAppear {
            favoriteIds = ModelPickerFavoriteStore.load()
            if favoriteIds.isEmpty {
                let fallback = currentSelection.flatMap { cur in
                    usableProviders.first { $0.instanceId == cur.instanceId }?.instanceId
                } ?? usableProviders.first?.instanceId
                if let fallback {
                    railSelection = .provider(fallback)
                }
            } else {
                railSelection = .favorites
            }
        }
    }

    private var sheetHeader: some View {
        HStack {
            Spacer(minLength: 0)
            Button("Done") { dismiss() }
                .fontWeight(.medium)
                .buttonStyle(.plain)
        }
        .padding(.horizontal, T3Spacing.md)
        .padding(.vertical, T3Spacing.sm)
    }

    /// Main list + search — keeps keyboard dismissal gestures off the sidebar rail.
    private var mainColumn: some View {
        VStack(spacing: 0) {
            searchBar
                .padding(.horizontal, T3Spacing.md)
                .padding(.vertical, T3Spacing.sm)

            if filteredEntries.isEmpty {
                emptyState
                    .contentShape(Rectangle())
                    .onTapGesture { blurSearch() }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(filteredEntries.enumerated()), id: \.element.id) { index, entry in
                            modelRow(entry: entry, visibleIndex: index)
                            if entry.id != filteredEntries.last?.id {
                                Divider()
                                    .overlay(T3Color.separator.opacity(0.35))
                                    .padding(.leading, 52)
                            }
                        }
                    }
                    .padding(.horizontal, T3Spacing.sm)
                    .padding(.bottom, T3Spacing.md)
                }
                .scrollDismissesKeyboard(.interactively)
                .simultaneousGesture(TapGesture().onEnded { _ in blurSearch() })
                .t3ScrollEdgeSoftFade()
            }
        }
    }

    private func blurSearch() {
        searchFocused = false
    }

    // MARK: Rail

    private var pickerRail: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 10) {
                railIconButton(
                    systemImage: "star.fill",
                    label: "Favorites",
                    isSelected: railSelection == .favorites,
                    dimWhenUnselected: true
                ) {
                    railSelection = .favorites
                }

                Rectangle()
                    .fill(T3Color.separator.opacity(0.45))
                    .frame(height: 1)
                    .padding(.horizontal, 6)

                ForEach(usableProviders) { provider in
                    let selected = railSelection == .provider(provider.instanceId)
                    railProviderButton(provider: provider, isSelected: selected) {
                        railSelection = .provider(provider.instanceId)
                    }
                }

                comingSoonCopilotRail
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 10)
            .frame(width: railWidth)
        }
        .frame(width: railWidth)
        .background(railBackground)
    }

    private var railWidth: CGFloat { 54 }

    private var railBackground: some View {
        ZStack {
            T3Color.surfaceMuted.opacity(0.55)
            Rectangle().fill(.ultraThinMaterial)
        }
    }

    private func railIconButton(
        systemImage: String,
        label: String,
        isSelected: Bool,
        dimWhenUnselected: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: {
            blurSearch()
            action()
        }) {
            ZStack(alignment: .trailing) {
                Image(systemName: systemImage)
                    .font(.system(size: 19, weight: .medium))
                    .foregroundStyle(
                        isSelected
                            ? Color.yellow.opacity(0.95)
                            : (dimWhenUnselected ? T3Color.textTertiary.opacity(0.42) : T3Color.textPrimary)
                    )
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 6)
                    .background {
                        if isSelected {
                            railSelectionBackground
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .overlay(alignment: .trailing) {
                        if isSelected {
                            Capsule()
                                .fill(accentColor)
                                .frame(width: 3, height: 22)
                                .padding(.trailing, -2)
                        }
                    }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func railProviderButton(provider: ServerProvider, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: {
            blurSearch()
            action()
        }) {
            ZStack(alignment: .trailing) {
                ProviderIcon(driver: provider.driver, size: 22)
                    .opacity(isSelected ? 1 : 0.48)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .padding(.horizontal, 6)
                    .background {
                        if isSelected {
                            railSelectionBackground
                        }
                    }
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .overlay(alignment: .trailing) {
                        if isSelected {
                            Capsule()
                                .fill(accentColor)
                                .frame(width: 3, height: 22)
                                .padding(.trailing, -2)
                        }
                    }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(provider.label)
    }

    @ViewBuilder
    private var railSelectionBackground: some View {
        if #available(iOS 26.0, *) {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.clear)
                .glassEffect(.regular.tint(Color.white.opacity(0.06)), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        } else {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(T3Color.surfaceElevated.opacity(0.95))
        }
    }

    private var comingSoonCopilotRail: some View {
        VStack(spacing: 4) {
            ProviderIcon(driver: "githubCopilot", size: 20)
                .opacity(0.42)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .padding(.horizontal, 6)
                .background(T3Color.surfaceGrouped.opacity(0.001))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(T3Color.separator.opacity(0.25), lineWidth: 0.5)
                )
            Image(systemName: "clock.fill")
                .font(.system(size: 9))
                .foregroundStyle(T3Color.textTertiary.opacity(0.55))
        }
        .accessibilityLabel("GitHub Copilot, coming soon")
        .allowsHitTesting(false)
    }

    // MARK: Search

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(T3Color.textTertiary.opacity(0.65))

            TextField("Search models...", text: $searchQuery)
                .focused($searchFocused)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .font(.body)

            if !searchQuery.isEmpty {
                Button {
                    searchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(T3Color.textTertiary.opacity(0.65))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .t3AdaptiveRoundedRectGlass(
            cornerRadius: 12,
            interactive: false,
            tint: accentColor.opacity(0.14),
            fallbackFill: T3Color.surfaceElevated.opacity(0.88),
            fallbackStroke: accentColor.opacity(0.22)
        )
    }

    // MARK: Rows

    private func modelRow(entry: ModelCatalogEntry, visibleIndex: Int) -> some View {
        let selected = isSelected(entry)
        let favorite = favoriteIds.contains(entry.id)
        let jumpText = jumpHint(for: visibleIndex)

        return HStack(alignment: .top, spacing: 10) {
            Button {
                toggleFavorite(entry)
            } label: {
                Image(systemName: favorite ? "star.fill" : "star")
                    .font(.system(size: 17))
                    .foregroundStyle(favorite ? Color.yellow : T3Color.textTertiary.opacity(0.42))
                    .padding(.top, 3)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(favorite ? "Remove from favorites" : "Add to favorites")

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(entry.model.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(T3Color.textPrimary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Spacer(minLength: 8)

                    if let jumpText {
                        jumpBadge(text: jumpText)
                    }
                }

                HStack(spacing: 6) {
                    ProviderIcon(driver: entry.provider.driver, size: 11)
                    Text(rowSubtitle(entry))
                        .font(.system(size: 12))
                        .foregroundStyle(T3Color.textTertiary.opacity(0.92))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onTapGesture {
                select(entry)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 11)
        .background {
            Group {
                if selected {
                    if #available(iOS 26.0, *) {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.clear)
                            .glassEffect(
                                .regular.tint(accentColor.opacity(0.08)),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                            )
                    } else {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(accentColor.opacity(0.10))
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private func jumpHint(for index: Int) -> String? {
        guard index < 9 else { return nil }
        if horizontalSizeClass == .regular {
            return "⌘\(index + 1)"
        }
        return "\(index + 1)"
    }

    private func jumpBadge(text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .medium, design: .rounded))
            .foregroundStyle(T3Color.textSecondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(T3Color.surfaceMuted.opacity(0.95), in: Capsule())
            .overlay(Capsule().stroke(T3Color.separator.opacity(0.55), lineWidth: 0.5))
            .accessibilityHidden(true)
    }

    private func rowSubtitle(_ entry: ModelCatalogEntry) -> String {
        if let sp = entry.model.subProvider?.trimmingCharacters(in: .whitespacesAndNewlines), !sp.isEmpty {
            return "\(entry.provider.label) · \(sp)"
        }
        return entry.provider.label
    }

    private func isSelected(_ entry: ModelCatalogEntry) -> Bool {
        guard let current = currentSelection else { return false }
        return current.instanceId == entry.provider.instanceId
            && current.model == entry.model.slug
    }

    private func toggleFavorite(_ entry: ModelCatalogEntry) {
        blurSearch()
        if favoriteIds.contains(entry.id) {
            favoriteIds.remove(entry.id)
        } else {
            favoriteIds.insert(entry.id)
        }
        ModelPickerFavoriteStore.save(favoriteIds)
    }

    private func select(_ entry: ModelCatalogEntry) {
        blurSearch()
        onSelect(entry.provider, entry.model.slug)
        dismiss()
    }

    private var emptyState: some View {
        VStack(spacing: T3Spacing.md) {
            Image(systemName: isSearching ? "magnifyingglass" : "sparkles")
                .font(.largeTitle)
                .foregroundStyle(T3Color.textTertiary)
            Text(emptyStateMessage)
                .font(T3Typography.callout)
                .foregroundStyle(T3Color.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 48)
    }

    private var emptyStateMessage: String {
        if isSearching { return "No models found" }
        if case .favorites = railSelection, favoriteIds.isEmpty {
            return "No favorites yet — tap the star on a model"
        }
        return "No models available"
    }
}
