import path from 'path';

/**
 * Shared runtime data root for local JSON stores. Tests set this to an isolated
 * temporary directory; production defaults to the repository working directory.
 */
export const DATA_DIR = path.resolve(process.env.SENTINEL_NOVA_DATA_DIR || path.join(process.cwd(), 'data'));
