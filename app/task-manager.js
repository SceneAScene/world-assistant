export const SCENEWORLD_TASK_CANCELLED = 'SCENEWORLD_TASK_CANCELLED';

function cancelledError(reason = '世界动态任务已取消') {
    const error = new Error(String(reason || '世界动态任务已取消'));
    error.name = 'SceneWorldTaskCancelledError';
    error.code = SCENEWORLD_TASK_CANCELLED;
    return error;
}

export class TaskManager {
    #tasks = new Map();

    isRunning(key) {
        return this.#tasks.has(key);
    }

    async run(key, task) {
        if (!key || typeof task !== 'function') throw new TypeError('TaskManager.run requires key and task');
        const existing = this.#tasks.get(key);
        if (existing) return existing.promise;

        const controller = new AbortController();
        const context = Object.freeze({
            signal: controller.signal,
            assertActive() {
                if (controller.signal.aborted) throw cancelledError(controller.signal.reason);
            },
        });
        const record = { controller, promise: null };
        const promise = Promise.resolve().then(() => task(context)).finally(() => {
            if (this.#tasks.get(key) === record) this.#tasks.delete(key);
        });
        record.promise = promise;
        this.#tasks.set(key, record);
        return promise;
    }

    clear(reason = '世界动态任务已取消') {
        for (const record of this.#tasks.values()) {
            try { record.controller.abort(reason); } catch {}
        }
        this.#tasks.clear();
    }

    get size() {
        return this.#tasks.size;
    }
}
