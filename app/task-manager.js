export class TaskManager {
    #tasks = new Map();

    isRunning(key) {
        return this.#tasks.has(key);
    }

    async run(key, task) {
        if (!key || typeof task !== 'function') throw new TypeError('TaskManager.run requires key and task');
        if (this.#tasks.has(key)) return this.#tasks.get(key);
        const promise = Promise.resolve().then(task).finally(() => {
            if (this.#tasks.get(key) === promise) this.#tasks.delete(key);
        });
        this.#tasks.set(key, promise);
        return promise;
    }

    clear() {
        this.#tasks.clear();
    }

    get size() {
        return this.#tasks.size;
    }
}
