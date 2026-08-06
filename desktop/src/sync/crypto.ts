import { pythonExe } from "../bootstrap/paths";
import { runAsync } from "../bootstrap/proc";

// The desktop app's TypeScript side has no Fernet implementation of its
// own — shelling out to the bundled Python (which already has
// `cryptography` installed as a backend dependency) reuses the exact same
// implementation the backend uses to encrypt/decrypt Google OAuth tokens,
// keeping the cloud refresh token protected the same way, with the same
// key (RuntimeConfig.encryptionKey) already generated on first run.

export async function fernetEncrypt(plaintext: string, key: string): Promise<string> {
  const result = await runAsync(pythonExe, [
    "-c",
    "import sys; from cryptography.fernet import Fernet; " +
      "print(Fernet(sys.argv[1].encode()).encrypt(sys.argv[2].encode()).decode())",
    key,
    plaintext,
  ]);
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`Failed to encrypt value: ${result.stderr}`);
  }
  return result.stdout.trim();
}

export async function fernetDecrypt(ciphertext: string, key: string): Promise<string> {
  const result = await runAsync(pythonExe, [
    "-c",
    "import sys; from cryptography.fernet import Fernet; " +
      "print(Fernet(sys.argv[1].encode()).decrypt(sys.argv[2].encode()).decode())",
    key,
    ciphertext,
  ]);
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`Failed to decrypt value: ${result.stderr}`);
  }
  return result.stdout.trim();
}
