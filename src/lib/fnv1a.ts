export const FNV_OFFSET_BASIS_32 = 0x811c9dc5
export const FNV_PRIME_32 = 0x01000193

export type ByteMapper = (code: number, index: number) => number

export function fnv1a32(input: string, byteMapper?: ByteMapper): number {
  let hash = FNV_OFFSET_BASIS_32
  for (let i = 0; i < input.length; i++) {
    const raw = input.charCodeAt(i)
    const byte = byteMapper ? byteMapper(raw, i) : raw
    hash ^= byte & 0xff
    hash = Math.imul(hash, FNV_PRIME_32)
  }
  return hash >>> 0
}
