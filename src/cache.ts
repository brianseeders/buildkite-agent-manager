export default class Cache {
  store = new Map();

  set = (key: any, value: any, ttlSeconds: number = null) => {
    const oldValue = this.store.get(key);
    if (oldValue?.timer) {
      clearTimeout(oldValue.timer);
    }

    const timer = ttlSeconds
      ? setTimeout(() => {
          this.store.delete(key);
        }, ttlSeconds * 1000)
      : null;

    this.store.set(key, {
      value: value,
      timer: timer,
    });
  };

  get = (key: any) => {
    const val = this.store.get(key);
    if (val?.value) {
      return val.value;
    }

    return undefined;
  };

  clear = () => {
    for (const [, { timer }] of this.store.entries()) {
      if (timer) {
        clearTimeout(timer);
      }
    }

    this.store.clear();
  };
}

export const global = new Cache();
