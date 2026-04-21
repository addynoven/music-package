import { describe, it, expect } from 'vitest'
import forge from 'node-forge'
import { decryptStreamUrl } from '../../../../src/sources/jiosaavn/decrypt'

function encryptForTest(plaintext: string): string {
  const cipher = forge.cipher.createCipher('DES-ECB', forge.util.createBuffer('38346591'))
  cipher.start({ iv: forge.util.createBuffer('00000000') })
  cipher.update(forge.util.createBuffer(plaintext))
  cipher.finish()
  return forge.util.encode64(cipher.output.getBytes())
}

describe('decryptStreamUrl', () => {
  it('round-trips: encrypt then decrypt returns original plaintext', () => {
    const original = 'https://aac.saavncdn.com/song_96.mp4?token=abc123'
    const encrypted = encryptForTest(original)
    expect(decryptStreamUrl(encrypted)).toBe(original)
  })

  it('handles a URL with _96 bitrate suffix', () => {
    const url = 'https://aac.saavncdn.com/Never_Gonna_Give_You_Up_96.mp4'
    const encrypted = encryptForTest(url)
    expect(decryptStreamUrl(encrypted)).toBe(url)
  })

  it('strips padding bytes from decrypted output', () => {
    const url = 'https://aac.saavncdn.com/short.mp4'
    const encrypted = encryptForTest(url)
    const result = decryptStreamUrl(encrypted)
    expect(result).toBe(url)
    expect(result).not.toMatch(/[\x00-\x08]/)
  })

  it('throws on invalid base64 input', () => {
    expect(() => decryptStreamUrl('not!!valid!!base64')).toThrow()
  })
})
