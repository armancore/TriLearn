import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

export const CLIENT_TYPE = 'mobile';
export const APP_PLATFORM = Platform.OS;

const SIGNATURE_WINDOW_MS = 30000;
const HMAC_BLOCK_SIZE = 64;
const textEncoder = new TextEncoder();

const sha256 = async (bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return new Uint8Array(digest);
};

const hmacSha256Hex = async (secret: string, message: string): Promise<string> => {
  let key: Uint8Array<ArrayBuffer> = textEncoder.encode(secret);

  if (key.length > HMAC_BLOCK_SIZE) {
    key = await sha256(key);
  }

  const paddedKey = new Uint8Array(HMAC_BLOCK_SIZE);
  paddedKey.set(key);

  const innerKeyPad = paddedKey.map((byte) => byte ^ 0x36);
  const outerKeyPad = paddedKey.map((byte) => byte ^ 0x5c);
  const messageBytes = textEncoder.encode(message);
  const innerDigest = await sha256(new Uint8Array([...innerKeyPad, ...messageBytes]));
  const hmacDigest = await sha256(new Uint8Array([...outerKeyPad, ...innerDigest]));

  return [...hmacDigest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const buildMobileClientSignature = async (clientVersion: string): Promise<string | undefined> => {
  const secret = process.env.EXPO_PUBLIC_MOBILE_CLIENT_SECRET?.trim();

  if (!secret) {
    return undefined;
  }

  const timestampWindow = Math.floor(Date.now() / SIGNATURE_WINDOW_MS);
  const signaturePayload = `${CLIENT_TYPE}:${clientVersion}:${APP_PLATFORM}:${timestampWindow}`;

  return hmacSha256Hex(secret, signaturePayload);
};
