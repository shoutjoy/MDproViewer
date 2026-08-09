(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MDRenderCoordinator = api;
})(typeof window !== 'undefined' ? window : null, function () {
    function create(host) {
        const runtime = host || globalThis;
        const tasks = new Map();
        const stats = {
            scheduled: 0,
            executed: 0,
            cancelled: 0,
            staleSkipped: 0,
            idleExecuted: 0
        };

        function cancel(name) {
            const task = tasks.get(name);
            if (!task) return false;
            if (task.timerId !== null) runtime.clearTimeout(task.timerId);
            if (task.idleId !== null && typeof runtime.cancelIdleCallback === 'function') {
                runtime.cancelIdleCallback(task.idleId);
            }
            tasks.delete(name);
            stats.cancelled += 1;
            return true;
        }

        function run(name, task) {
            if (tasks.get(name) !== task) return;
            tasks.delete(name);
            if (typeof task.isCurrent === 'function' && !task.isCurrent(task.revision)) {
                stats.staleSkipped += 1;
                return;
            }
            stats.executed += 1;
            task.callback(task.revision);
        }

        function schedule(name, callback, options) {
            const opts = options || {};
            cancel(name);
            const task = {
                callback: callback,
                revision: opts.revision,
                isCurrent: opts.isCurrent,
                timerId: null,
                idleId: null
            };
            tasks.set(name, task);
            stats.scheduled += 1;
            task.timerId = runtime.setTimeout(function () {
                task.timerId = null;
                if (opts.idle && typeof runtime.requestIdleCallback === 'function') {
                    task.idleId = runtime.requestIdleCallback(function () {
                        task.idleId = null;
                        stats.idleExecuted += 1;
                        run(name, task);
                    }, { timeout: Math.max(250, Number(opts.idleTimeoutMs) || 1000) });
                    return;
                }
                run(name, task);
            }, Math.max(0, Number(opts.delayMs) || 0));
            return task;
        }

        function cancelAll() {
            Array.from(tasks.keys()).forEach(cancel);
        }

        function getStats() {
            return Object.assign({}, stats, {
                pending: tasks.size,
                pendingNames: Array.from(tasks.keys())
            });
        }

        function resetStats() {
            Object.keys(stats).forEach(function (key) { stats[key] = 0; });
        }

        return {
            schedule: schedule,
            cancel: cancel,
            cancelAll: cancelAll,
            getStats: getStats,
            resetStats: resetStats
        };
    }

    return { create: create };
});

