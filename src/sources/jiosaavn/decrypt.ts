import forge from 'node-forge'

const KEY = '38346591'
const IV  = '00000000'
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

export function decryptStreamUrl(encryptedBase64: string): string {
  if (!BASE64_RE.test(encryptedBase64.trim())) {
    throw new Error(`Invalid base64 input: ${encryptedBase64}`)
  }
  const encrypted = forge.util.decode64(encryptedBase64)
  const decipher = forge.cipher.createDecipher('DES-ECB', forge.util.createBuffer(KEY))
  decipher.start({ iv: forge.util.createBuffer(IV) })
  decipher.update(forge.util.createBuffer(encrypted))
  decipher.finish()
  return decipher.output.getBytes()
}
