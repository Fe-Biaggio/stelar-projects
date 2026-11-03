declare module 'zzfx' {
  export function zzfx(...params: (number | undefined)[]): AudioBufferSourceNode;
  export const ZZFX: { audioContext: AudioContext; volume: number };
}
