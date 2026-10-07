import { LoorCoreResponse } from './loor-core.types';

/** Prefer Core JSON body for FE; fall back to full envelope. */
export function unwrapCoreData<T>(result: LoorCoreResponse<T>): T {
  return result.data;
}
