const Cache = require('./cache').default;

jest.useFakeTimers();

describe('cache', () => {
  let cache;

  beforeEach(() => {
    cache = new Cache();
  });

  it('should store and get a value', () => {
    cache.set('TEST_KEY', { id: 'TEST_ID' });
    let value = cache.get('TEST_KEY');
    expect(value.id).toEqual('TEST_ID');

    jest.runAllTimers();

    value = cache.get('TEST_KEY');
    expect(value.id).toEqual('TEST_ID');
  });

  it('should return undefined for missing key', () => {
    const value = cache.get('MISSING_KEY');
    expect(value).toBeUndefined();
  });

  it('should expire a key after the TTL', async () => {
    cache.set('TEST_KEY_2', { id: 'TEST_ID' }, 1);
    let value = cache.get('TEST_KEY_2');
    expect(value.id).toEqual('TEST_ID');

    jest.advanceTimersByTime(1000);

    value = cache.get('TEST_KEY_2');
    expect(value).toBeUndefined();
  });

  it('should clear all entries', async () => {
    cache.set('TEST_KEY_2', { id: 'TEST_ID' }, 1);
    let value = cache.get('TEST_KEY_2');
    expect(value.id).toEqual('TEST_ID');

    expect(clearTimeout).toHaveBeenCalledTimes(0);
    cache.clear();
    expect(clearTimeout).toHaveBeenCalledTimes(1);

    value = cache.get('TEST_KEY_2');
    expect(value).toBeUndefined();
  });
});
