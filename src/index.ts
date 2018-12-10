// Invokes callback fn after a delay
const delay = (callback: () => void, delayTime: number) => {
    return setTimeout(callback, delayTime);
};

// Invokes callback fn in a new stack to avoid stackoverflow
const callOnNewStack = (callback: () => void, delayTime: number = 0) => {
    return setTimeout(callback, delayTime);
};

// NOTE: time it takes at most to write to localStorage
const writeDelay = 100;

/**
 * Locker to acquire a lock across threads, tabs and windows
 * using localStorage (based on Lamport's First Fast Lock)
 * Addition of time in Y so that Y can be cleared in case
 * it wasn't cleared on window.unload
 */

export default class Locker {
    private uniqueId: string;
    private xKey: string;
    private yKey: string;

    private lamportLockTimeoutId?: number;
    private lamportDelayTimeoutId?: number;
    private watchdogIntervalId?: number;

    // private stopped: boolean;

    constructor(lock: string) {
        this.xKey = `${lock}-x`;
        this.yKey = `${lock}-y`;

        this.uniqueId = this.getUUID();

        // release lock on window unload (may not be 100% reliable)
        window.onunload = this.release;
    }

    // Acquire the lock: returns a promise that resolves when done.
    public acquire = (maxLockTime: number = 5000, refreshTime: number = 1000) => {
        return new Promise((resolve) => {
            const callback = () => {
                this.watchdogIntervalId = setInterval(this.refreshY, refreshTime);
                resolve();
            };

            this.lamportLockTimeoutId = delay(() => {
                this.lamportFastLock(callback, maxLockTime);
            }, this.getRandomTime());
        });
    }

    // Clear lock if acquired and all attempts if trying to acquire
    public release = () => {
        clearTimeout(this.lamportLockTimeoutId);
        clearTimeout(this.lamportDelayTimeoutId);
        clearTimeout(this.watchdogIntervalId);

        this.clearY();

        // FIXME: add internal variable this.stopped
    }

    private setX = (val: string) => localStorage.setItem(this.xKey, val);

    private getX = () => localStorage.getItem(this.xKey);

    private clearY = () => localStorage.removeItem(this.yKey);

    // NOTE: Adds timestamp along with uniqueId
    private setY = (val: string) => localStorage.setItem(this.yKey, `${val},${Date.now()}`);

    // NOTE: get value as well as timestamp
    private getY = () => {
        const item = localStorage.getItem(this.yKey);
        const [val, time] = item ? item.split(",") : [undefined, undefined];
        return { val, time };
    }

    // NOTE: Y is locked if it is set and time has not expired
    private isYLocked = (maxLockTime: number) => {
        const { val, time = 0 } = this.getY();
        return val && Date.now() - (+time) < maxLockTime;
    }

    // NOTE: refresh timestamp for Y so that it is not expired
    private refreshY = () => {
        this.setY(this.uniqueId);
    }

    private getUUID = (randomness: number = 1000000000) => {
        const now = Date.now();
        const rand = Math.round(Math.random() * randomness);
        return `${now}:${rand}`;
    }

    private getRandomTime = (randomness: number = 2000) => Math.round(Math.random() * randomness);

    private lamportFastLock = (callback: () => void, maxLockTime: number) => {
        this.setX(this.uniqueId);

        if (this.isYLocked(maxLockTime)) {
            this.lamportLockTimeoutId = callOnNewStack(() => {
                this.lamportFastLock(callback, maxLockTime);
            });
            return;
        }

        this.setY(this.uniqueId);

        if (this.getX() !== this.uniqueId) {
            this.lamportDelayTimeoutId = delay(() => {
                if (this.getY().val !== this.uniqueId) {
                    this.lamportFastLock(callback, maxLockTime);
                } else {
                    callback();
                }
            }, writeDelay);
            return;
        }

        callback();
    }
}
