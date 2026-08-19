import { getSceneWorldSettings } from './sillytavern.js';

function clean(value, max = 12000) {
    return String(value ?? '').replace(/\r/g, '').trim().slice(0, max);
}

function normalizePurpose(purpose) {
    return String(purpose ?? '').trim().toLowerCase() === 'observation' ? 'observation' : 'simulation';
}

function purposeEnabled(settings, purpose) {
    return purpose === 'observation'
        ? settings.observationUseBaiBaiBook === true
        : settings.simulationUseBaiBaiBook === true;
}

export function getBaiBaiBookStatus(purpose = 'simulation') {
    const settings = getSceneWorldSettings();
    const mode = normalizePurpose(purpose);
    const api = globalThis.STBaiBaiBook;
    return {
        purpose: mode,
        enabled: purposeEnabled(settings, mode),
        available: !!api,
        apiVersion: api?.apiVersion ?? null,
        pluginVersion: api?.pluginVersion ?? null,
        maxChars: settings.baibaiHistoryMaxChars,
    };
}

export function buildBaiBaiBookHistoryContext({ purpose = 'simulation' } = {}) {
    const settings = getSceneWorldSettings();
    const mode = normalizePurpose(purpose);
    const enabled = purposeEnabled(settings, mode);
    if (!enabled) {
        return { text: '', stats: { purpose: mode, enabled: false, available: !!globalThis.STBaiBaiBook, used: false, reason: 'disabled' } };
    }

    const api = globalThis.STBaiBaiBook;
    if (!api || typeof api.getInjectedHistory !== 'function') {
        return { text: '', stats: { purpose: mode, enabled: true, available: false, used: false, reason: 'api-unavailable' } };
    }

    try {
        const result = api.getInjectedHistory();
        const raw = clean(result?.relativeText ?? result?.text, 200000);
        const limit = Math.max(2000, Math.min(Number(settings.baibaiHistoryMaxChars) || 8000, 20000));
        let text = raw;
        let truncated = false;
        if (raw.length > limit) {
            text = `（较早部分已按 SceneWorld 预算省略）\n${raw.slice(-limit)}`;
            truncated = true;
        }
        const coverage = result?.coverage && typeof result.coverage === 'object' ? result.coverage : null;
        return {
            text,
            stats: {
                purpose: mode,
                enabled: true,
                available: true,
                used: !!text,
                chars: text.length,
                truncated,
                complete: coverage?.complete !== false,
                missingAiFloors: Array.isArray(coverage?.missingAiFloors) ? coverage.missingAiFloors.slice(0, 50) : [],
                apiVersion: api.apiVersion ?? null,
                pluginVersion: api.pluginVersion ?? null,
            },
        };
    } catch (error) {
        console.warn(`[SceneWorld] 记忆插件长期历史读取失败（${mode === 'observation' ? '见闻' : '世界推演'}），已跳过`, error);
        return {
            text: '',
            stats: {
                purpose: mode,
                enabled: true,
                available: true,
                used: false,
                reason: 'read-failed',
                error: String(error?.message || error),
            },
        };
    }
}
