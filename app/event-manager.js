export class EventManager {
    #cleanups = new Set();

    addCleanup(cleanup) {
        if (typeof cleanup !== 'function') return () => {};
        this.#cleanups.add(cleanup);
        return () => {
            if (!this.#cleanups.delete(cleanup)) return;
            try { cleanup(); } catch (error) { console.warn('[SceneWorld] cleanup failed', error); }
        };
    }

    listen(target, type, handler, options) {
        if (!target?.addEventListener || typeof handler !== 'function') return () => {};
        target.addEventListener(type, handler, options);
        return this.addCleanup(() => target.removeEventListener(type, handler, options));
    }

    onEmitter(source, eventName, handler) {
        if (!source || !eventName || typeof handler !== 'function') return () => {};
        if (typeof source.on === 'function') {
            source.on(eventName, handler);
            return this.addCleanup(() => {
                if (typeof source.off === 'function') source.off(eventName, handler);
                else if (typeof source.removeListener === 'function') source.removeListener(eventName, handler);
            });
        }
        return () => {};
    }

    clear() {
        for (const cleanup of [...this.#cleanups]) {
            this.#cleanups.delete(cleanup);
            try { cleanup(); } catch (error) { console.warn('[SceneWorld] cleanup failed', error); }
        }
    }

    get size() {
        return this.#cleanups.size;
    }
}
