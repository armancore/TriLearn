import * as queryString from 'query-string';

describe('patched URI decoder through Expo Router query-string dependency', () => {
  it('preserves Unicode, repeated parameters and plus-encoded spaces', () => {
    expect(queryString.parse('name=%E0%A4%A8%E0%A5%87%E0%A4%AA%E0%A4%BE%E0%A4%B2&tag=one&tag=two&search=hello+world')).toEqual({
      name: 'नेपाल', tag: ['one', 'two'], search: 'hello world',
    })
    expect(queryString.stringify({ search: 'hello world', page: 2 }, { sort: false })).toBe('search=hello%20world&page=2')
  })

  it('handles a long malformed UTF-8 sequence without recursive decoding', () => {
    const malformed = '%E0%A4'.repeat(10000)
    expect(queryString.parse(`value=${malformed}`).value).toBe(malformed)
  })
})
