import kleur from 'kleur';
import { api, ApiError } from '../lib/api.js';
import { setState } from '../lib/config.js';

interface LoginOptions {
  clientId?: string;
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export async function loginCommand(opts: LoginOptions = {}): Promise<void> {
  const clientId = opts.clientId ?? 'researchcrafters-cli';
  process.stdout.write('Requesting device code...\n');

  let device;
  try {
    device = await api.deviceCode(clientId);
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(`Failed to request device code: ${err.message}`);
    }
    throw err;
  }

  process.stdout.write('\n');
  process.stdout.write(`  ${kleur.bold('Visit:')} ${kleur.cyan(device.verification_uri)}\n`);
  process.stdout.write(`  ${kleur.bold('Code:')}  ${kleur.yellow(device.user_code)}\n`);
  if (device.verification_uri_complete) {
    process.stdout.write(
      `  ${kleur.dim('Or open:')} ${kleur.cyan(device.verification_uri_complete)}\n`,
    );
  }
  process.stdout.write('\nWaiting for confirmation...\n');

  const intervalMs = opts.pollIntervalMs ?? Math.max(1000, device.interval * 1000);
  const maxAttempts = opts.maxAttempts ?? Math.ceil(device.expires_in / device.interval);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await new Promise((res) => setTimeout(res, intervalMs));
    try {
      const token = await api.pollDeviceToken(device.device_code);
      setState({
        token: token.access_token,
        ...(token.refresh_token !== undefined ? { refreshToken: token.refresh_token } : {}),
        tokenExpiresAt: Date.now() + token.expires_in * 1000,
      });
      process.stdout.write(kleur.green('Logged in successfully.\n'));
      return;
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'authorization_pending' || err.code === 'slow_down')) {
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw new Error('Login timed out. Run `researchcrafters login` again.');
}
