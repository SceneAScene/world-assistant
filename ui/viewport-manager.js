export function createViewportManager(host) {
    let started = false;
    let frame = 0;

    function applyNow() {
        if (!host?.isConnected) return;
        const viewport = window.visualViewport;
        const height = Math.max(320, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight || 720));
        const width = Math.max(280, Math.round(viewport?.width || window.innerWidth || document.documentElement.clientWidth || 360));
        const offsetTop = Math.max(0, Math.round(viewport?.offsetTop || 0));
        const offsetLeft = Math.max(0, Math.round(viewport?.offsetLeft || 0));
        host.style.setProperty('--sw-vv-height', `${height}px`);
        host.style.setProperty('--sw-vv-width', `${width}px`);
        host.style.setProperty('--sw-vv-top', `${offsetTop}px`);
        host.style.setProperty('--sw-vv-left', `${offsetLeft}px`);
    }

    function schedule() {
        if (frame) return;
        const callback = () => {
            frame = 0;
            applyNow();
        };
        if (typeof requestAnimationFrame === 'function') frame = requestAnimationFrame(callback);
        else frame = setTimeout(callback, 16);
    }

    function start() {
        if (started) return;
        started = true;
        applyNow();
        window.addEventListener('resize', schedule, { passive: true });
        window.addEventListener('orientationchange', schedule, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', schedule, { passive: true });
            window.visualViewport.addEventListener('scroll', schedule, { passive: true });
        }
    }

    function stop() {
        if (!started) return;
        started = false;
        window.removeEventListener('resize', schedule);
        window.removeEventListener('orientationchange', schedule);
        if (window.visualViewport) {
            window.visualViewport.removeEventListener('resize', schedule);
            window.visualViewport.removeEventListener('scroll', schedule);
        }
        if (frame) {
            if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
            else clearTimeout(frame);
            frame = 0;
        }
    }

    return Object.freeze({ start, stop, sync: applyNow });
}
