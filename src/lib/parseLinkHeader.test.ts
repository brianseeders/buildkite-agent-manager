import parseLinkHeader from './parseLinkHeader';

describe('parseLinkHeader', () => {
  test('', () => {
    const result = parseLinkHeader(
      '<https://api.buildkite.com/v2/organizations/elastic/agents?page=2&per_page=1>; rel="next", <https://api.buildkite.com/v2/organizations/elastic/agents?page=5&per_page=1>; rel="last"'
    );

    expect(result).toMatchInlineSnapshot(`
      Object {
        "last": "https://api.buildkite.com/v2/organizations/elastic/agents?page=5&per_page=1",
        "next": "https://api.buildkite.com/v2/organizations/elastic/agents?page=2&per_page=1",
      }
    `);
  });
});
