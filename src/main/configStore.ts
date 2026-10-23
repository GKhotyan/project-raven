import { existsSync, renameSync, unlinkSync } from 'fs';

interface ConfigLike {
  store: object;
}

interface ConfigLogger {
  warn: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
}

export interface OpenEncryptedConfigOptions<S extends ConfigLike> {
  /** Absolute path of the config file `open` reads. */
  filePath: string;
  /** Key the config is written with from now on. */
  key: string;
  /** Keys older builds used. A config readable with one is re-encrypted with `key`. */
  legacyKeys: string[];
  /** Opens the config with the given key. Must throw if the file cannot be decrypted. */
  open: (encryptionKey: string) => S;
  log: ConfigLogger;
}

/**
 * Opens an encrypted config without ever deleting it. A config written with a
 * legacy key is migrated; one no known key can read is moved aside so the
 * user's settings can still be recovered by hand.
 */
export function openEncryptedConfig<S extends ConfigLike>(opts: OpenEncryptedConfigOptions<S>): S {
  const { filePath, key, legacyKeys, open, log } = opts;
  try {
    return open(key);
  } catch {
    // Not written with the current key; try the legacy ones below.
  }

  if (!existsSync(filePath)) return open(key);

  for (const legacyKey of legacyKeys) {
    let data: object;
    try {
      data = open(legacyKey).store;
    } catch {
      continue;
    }
    // Keep the old file until the migrated one is written.
    const backupPath = `${filePath}.migrating`;
    renameSync(filePath, backupPath);
    const migrated = open(key);
    migrated.store = data;
    unlinkSync(backupPath);
    log.info('Config re-encrypted with the current key');
    return migrated;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const asidePath = filePath.replace(/\.json$/, `.unreadable-${stamp}.json`);
  renameSync(filePath, asidePath);
  log.warn('Config could not be decrypted; moved aside to', asidePath);
  return open(key);
}
