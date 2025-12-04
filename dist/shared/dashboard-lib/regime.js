const IGNORED_TAGS = new Set(['MIXED_ACTIVITY', 'VOLATILITY_CRUSH']);
function humanizeTag(tag) {
    return tag
        .split('_')
        .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
        .join(' ');
}
export function summarizeBehaviorRegime(hotzones = []) {
    if (!hotzones || hotzones.length === 0) {
        return { label: 'Mixed activity', tags: [] };
    }
    const scores = new Map();
    hotzones.forEach((zone) => {
        const weight = Number(zone?.density ?? 1);
        (zone?.semanticTags ?? []).forEach((tag) => {
            if (!tag || IGNORED_TAGS.has(tag.toUpperCase()))
                return;
            const upper = tag.toUpperCase();
            scores.set(upper, (scores.get(upper) ?? 0) + weight);
        });
    });
    const ranking = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([tag]) => tag);
    if (ranking.length === 0) {
        return { label: 'Mixed activity', tags: [] };
    }
    return {
        label: ranking.map(humanizeTag).join(' + '),
        tags: ranking,
    };
}
