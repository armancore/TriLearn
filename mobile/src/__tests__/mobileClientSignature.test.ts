import { describe, expect, it, jest } from '@jest/globals';

import * as mobileClientSignature from '@/src/services/mobileClientSignature';

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

describe('mobileClientSignature', () => {
  it('exports stable mobile client metadata from React Native platform state', () => {
    expect(mobileClientSignature.CLIENT_TYPE).toBe('mobile');
    expect(mobileClientSignature.APP_PLATFORM).toBe('ios');
  });

  it('does not expose a forgeable client-side HMAC signature helper or secret', () => {
    expect(mobileClientSignature).not.toHaveProperty('CLIENT_SIGNATURE_SECRET');
    expect(mobileClientSignature).not.toHaveProperty('createClientSignature');
    expect(mobileClientSignature).not.toHaveProperty('signMobileClientRequest');
  });
});
