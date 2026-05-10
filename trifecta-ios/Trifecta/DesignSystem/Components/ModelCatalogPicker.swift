import SwiftUI

/// Sectioned model menu: one section per configured provider instance, with OpenCode upstream labels on each row.
struct ModelCatalogMenuSections: View {
    let sections: [ModelCatalogSection]
    let accentColor: Color
    let isSelected: (ModelCatalogEntry) -> Bool
    let onSelect: (ModelCatalogEntry) -> Void

    var body: some View {
        ForEach(sections) { section in
            Section(section.headerTitle) {
                ForEach(section.entries) { entry in
                    Button {
                        onSelect(entry)
                    } label: {
                        rowLabel(entry)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func rowLabel(_ entry: ModelCatalogEntry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: T3Spacing.sm) {
            ProviderIcon(driver: entry.provider.driver, size: 12)
                .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] + 4 }
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.model.label)
                    .font(.body)
                if entry.provider.driver == "opencode" {
                    opencodeCaptions(entry)
                } else if let upstream = entry.provider.upstreamVendorLabel(forModelSlug: entry.model.slug) {
                    Text(upstream)
                        .font(.caption)
                        .foregroundStyle(T3Color.textTertiary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if isSelected(entry) {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(accentColor)
            }
        }
    }

    @ViewBuilder
    private func opencodeCaptions(_ entry: ModelCatalogEntry) -> some View {
        if let sp = entry.model.subProvider, !sp.isEmpty {
            Text(sp)
                .font(.caption.weight(.semibold))
                .foregroundStyle(T3Color.textSecondary)
                .lineLimit(2)
        }
        if let upstream = entry.provider.upstreamVendorLabel(forModelSlug: entry.model.slug) {
            Text(upstream)
                .font(.caption)
                .foregroundStyle(T3Color.textTertiary)
                .lineLimit(1)
        }
        Text(entry.model.slug)
            .font(.caption2)
            .foregroundStyle(T3Color.textTertiary.opacity(0.92))
            .lineLimit(2)
            .minimumScaleFactor(0.85)
    }
}
