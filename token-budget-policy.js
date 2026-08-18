const PATCH_KEY = Symbol.for('world_dynamic.token_budget_policy.v1');
const WORLD_TASK_MARKER = '<world_dynamic_task_system>';
const MODULE_ID = 'world_dynamic';

function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function containsWorldTaskMarker(value, depth = 0) {
    if (depth > 6 || value == null) return false;
    if (typeof value === 'string') return value.includes(WORLD_TASK_MARKER);
    if (Array.isArray(value)) {
        return value.some(item => containsWorldTaskMarker(item, depth + 1));
    }
    if (typeof value !== 'object') return false;
    return Object.values(value).some(item => containsWorldTaskMarker(item, depth + 1));
}

function worldDynamicSettings(context) {
    return context?.extensionSettings?.[MODULE_ID] || null;
}

function hasExplicitTokenCap(context) {
    const settings = worldDynamicSettings(context);
    if (!settings) return false;
    if (positiveNumber(settings.maxOutputTokens)) return true;

    const moduleLimits = settings.generationModuleLimits;
    if (!moduleLimits || typeof moduleLimits !== 'object') return false;
    return Object.values(moduleLimits).some(limit => positiveNumber(limit?.maxTokens));
}

function currentContext() {
    try {
        return globalThis.SillyTavern?.getContext?.() || null;
    } catch {
        return null;
    }
}

function installFetchPolicy() {
    const originalFetch = globalThis.fetch;
    if (typeof originalFetch !== 'function' || originalFetch[PATCH_KEY]) return false;

    const wrappedFetch = async function worldDynamicTokenAwareFetch(input, init) {
        const rawBody = init?.body;
        if (typeof rawBody !== 'string') {
            return originalFetch.call(this, input, init);
        }

        let payload;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return originalFetch.call(this, input, init);
        }

        if (!containsWorldTaskMarker(payload?.messages)) {
            return originalFetch.call(this, input, init);
        }

        // Positive user caps are intentional and must remain authoritative.
        // Only the 0/automatic mode is uncapped by the plugin itself.
        if (hasExplicitTokenCap(currentContext())) {
            return originalFetch.call(this, input, init);
        }

        let changed = false;
        for (const key of ['max_tokens', 'max_completion_tokens']) {
            if (Object.prototype.hasOwnProperty.call(payload, key)) {
                delete payload[key];
                changed = true;
            }
        }

        if (!changed) return originalFetch.call(this, input, init);
        return originalFetch.call(this, input, {
            ...init,
            body: JSON.stringify(payload),
        });
    };

    Object.defineProperty(wrappedFetch, PATCH_KEY, {
        value: true,
        configurable: false,
        enumerable: false,
    });
    Object.defineProperty(wrappedFetch, '__worldDynamicOriginalFetch', {
        value: originalFetch,
        configurable: false,
        enumerable: false,
    });
    globalThis.fetch = wrappedFetch;
    return true;
}

function installGenerateRawPolicy() {
    const tavern = globalThis.SillyTavern;
    const originalGetContext = tavern?.getContext;
    if (typeof originalGetContext !== 'function' || originalGetContext[PATCH_KEY]) return false;

    const wrapperCache = new WeakMap();

    const wrappedGetContext = function worldDynamicTokenAwareGetContext(...args) {
        const context = originalGetContext.apply(this, args);
        const raw = context?.generateRaw;
        if (!context || typeof raw !== 'function' || raw[PATCH_KEY]) return context;

        let wrappedRaw = wrapperCache.get(raw);
        if (!wrappedRaw) {
            wrappedRaw = function worldDynamicTokenAwareGenerateRaw(options = {}) {
                if (
                    options
                    && containsWorldTaskMarker(options.prompt)
                    && !hasExplicitTokenCap(context)
                ) {
                    // SillyTavern's generateRaw defaults responseLength to null.
                    // Omitting the field therefore inherits the active Tavern/model
                    // response policy instead of imposing the plugin's old 2.4k/3.4k/4.6k estimate.
                    const nextOptions = { ...options };
                    delete nextOptions.responseLength;
                    return raw.call(context, nextOptions);
                }
                return raw.call(context, options);
            };
            Object.defineProperty(wrappedRaw, PATCH_KEY, {
                value: true,
                configurable: false,
                enumerable: false,
            });
            wrapperCache.set(raw, wrappedRaw);
        }

        try {
            context.generateRaw = wrappedRaw;
            return context;
        } catch {
            return new Proxy(context, {
                get(target, property, receiver) {
                    if (property === 'generateRaw') return wrappedRaw;
                    return Reflect.get(target, property, receiver);
                },
            });
        }
    };

    Object.defineProperty(wrappedGetContext, PATCH_KEY, {
        value: true,
        configurable: false,
        enumerable: false,
    });
    Object.defineProperty(wrappedGetContext, '__worldDynamicOriginalGetContext', {
        value: originalGetContext,
        configurable: false,
        enumerable: false,
    });
    tavern.getContext = wrappedGetContext;
    return true;
}

installFetchPolicy();

if (!installGenerateRawPolicy()) {
    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (installGenerateRawPolicy() || attempts >= 40) clearInterval(timer);
    }, 250);
}
