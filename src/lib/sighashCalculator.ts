export interface RawTransaction {
  version?: number
  nonce?: number
  gasPrice?: string
  gasLimit?: string
  to?: string
  value?: string
  data?: string
  chainId?: number
  
  vin?: Array<{
    txid: string
    vout: number
    scriptSig?: string
    sequence?: number
  }>
  vout?: Array<{
    value: number
    scriptPubKey?: string
  }>
  locktime?: number
}

export interface TransactionWithSighash {
  rawTx: string
  sighash: string
  txType: 'ethereum' | 'bitcoin'
  r?: string
  s?: string
  v?: number
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API not available')
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer)
  return new Uint8Array(hashBuffer)
}

async function doubleSha256(data: Uint8Array): Promise<Uint8Array> {
  const hash1 = await sha256(data)
  return await sha256(hash1)
}

function keccak256(data: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x00000001, 0x00008082, 0x0000808a, 0x80008000,
    0x0000808b, 0x80000001, 0x80008081, 0x00008009,
    0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
    0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
    0x00008002, 0x00000080, 0x0000800a, 0x8000000a,
    0x80008081, 0x00008080, 0x80000001, 0x80008008
  ])

  const state = new Uint32Array(50)
  const temp = new Uint8Array(200)
  
  const blockSize = 136
  let offset = 0
  
  for (let i = 0; i < data.length; i += blockSize) {
    const block = data.slice(i, i + blockSize)
    for (let j = 0; j < block.length; j++) {
      temp[j] ^= block[j]
    }
    
    if (block.length === blockSize || i + blockSize >= data.length) {
      for (let x = 0; x < 25; x++) {
        state[x] = temp[x * 4] | (temp[x * 4 + 1] << 8) | (temp[x * 4 + 2] << 16) | (temp[x * 4 + 3] << 24)
      }
      
      for (let round = 0; round < 24; round++) {
        const C = new Uint32Array(5)
        for (let x = 0; x < 5; x++) {
          C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]
        }
        
        const D = new Uint32Array(5)
        for (let x = 0; x < 5; x++) {
          D[x] = C[(x + 4) % 5] ^ ((C[(x + 1) % 5] << 1) | (C[(x + 1) % 5] >>> 31))
        }
        
        for (let x = 0; x < 5; x++) {
          for (let y = 0; y < 5; y++) {
            state[x + y * 5] ^= D[x]
          }
        }
        
        state[0] ^= K[round]
      }
      
      for (let x = 0; x < 25; x++) {
        temp[x * 4] = state[x] & 0xff
        temp[x * 4 + 1] = (state[x] >>> 8) & 0xff
        temp[x * 4 + 2] = (state[x] >>> 16) & 0xff
        temp[x * 4 + 3] = (state[x] >>> 24) & 0xff
      }
    }
  }
  
  return temp.slice(0, 32)
}

function rlpEncode(data: any): Uint8Array {
  if (typeof data === 'string') {
    const bytes = hexToBytes(data)
    if (bytes.length === 1 && bytes[0] < 128) {
      return bytes
    }
    return new Uint8Array([...encodeLength(bytes.length, 128), ...bytes])
  }
  
  if (Array.isArray(data)) {
    const encodedItems = data.map(item => rlpEncode(item))
    const totalLength = encodedItems.reduce((sum, item) => sum + item.length, 0)
    const prefix = encodeLength(totalLength, 192)
    
    const result = new Uint8Array(prefix.length + totalLength)
    result.set(prefix, 0)
    let offset = prefix.length
    for (const item of encodedItems) {
      result.set(item, offset)
      offset += item.length
    }
    return result
  }
  
  return new Uint8Array(0)
}

function encodeLength(length: number, offset: number): Uint8Array {
  if (length < 56) {
    return new Uint8Array([offset + length])
  }
  
  const hexLength = length.toString(16)
  const lengthBytes = hexToBytes(hexLength.length % 2 ? '0' + hexLength : hexLength)
  return new Uint8Array([offset + 55 + lengthBytes.length, ...lengthBytes])
}

export async function calculateEthereumSighash(tx: RawTransaction): Promise<string> {
  const fields = [
    tx.nonce ? '0x' + tx.nonce.toString(16) : '0x',
    tx.gasPrice || '0x',
    tx.gasLimit || '0x',
    tx.to || '0x',
    tx.value || '0x',
    tx.data || '0x',
  ]
  
  if (tx.chainId) {
    fields.push('0x' + tx.chainId.toString(16))
    fields.push('0x')
    fields.push('0x')
  }
  
  const encoded = rlpEncode(fields)
  const hash = keccak256(encoded)
  return bytesToHex(hash)
}

function serializeBitcoinInt(n: number): Uint8Array {
  const bytes = new Uint8Array(4)
  bytes[0] = n & 0xff
  bytes[1] = (n >>> 8) & 0xff
  bytes[2] = (n >>> 16) & 0xff
  bytes[3] = (n >>> 24) & 0xff
  return bytes
}

function writeVarInt(n: number): Uint8Array {
  if (n < 0xfd) {
    return new Uint8Array([n])
  } else if (n <= 0xffff) {
    return new Uint8Array([0xfd, n & 0xff, (n >>> 8) & 0xff])
  } else if (n <= 0xffffffff) {
    return new Uint8Array([0xfe, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])
  } else {
    return new Uint8Array([0xff, n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff, 0, 0, 0, 0])
  }
}

export async function calculateBitcoinSighash(
  tx: RawTransaction,
  inputIndex: number,
  scriptPubKey: string,
  hashType: number = 1
): Promise<string> {
  const buffer: Uint8Array[] = []
  
  buffer.push(serializeBitcoinInt(tx.version || 1))
  
  if (!tx.vin || tx.vin.length === 0) {
    throw new Error('Bitcoin transaction must have inputs')
  }
  
  buffer.push(writeVarInt(tx.vin.length))
  
  for (let i = 0; i < tx.vin.length; i++) {
    const input = tx.vin[i]
    
    const txidBytes = hexToBytes(input.txid).reverse()
    buffer.push(txidBytes)
    
    buffer.push(serializeBitcoinInt(input.vout))
    
    if (i === inputIndex) {
      const scriptBytes = hexToBytes(scriptPubKey)
      buffer.push(writeVarInt(scriptBytes.length))
      buffer.push(scriptBytes)
    } else {
      buffer.push(new Uint8Array([0]))
    }
    
    buffer.push(serializeBitcoinInt(input.sequence || 0xffffffff))
  }
  
  if (!tx.vout || tx.vout.length === 0) {
    buffer.push(writeVarInt(0))
  } else {
    buffer.push(writeVarInt(tx.vout.length))
    
    for (const output of tx.vout) {
      const valueBytes = new Uint8Array(8)
      const value = output.value || 0
      for (let i = 0; i < 8; i++) {
        valueBytes[i] = (value >>> (i * 8)) & 0xff
      }
      buffer.push(valueBytes)
      
      const scriptBytes = hexToBytes(output.scriptPubKey || '')
      buffer.push(writeVarInt(scriptBytes.length))
      buffer.push(scriptBytes)
    }
  }
  
  buffer.push(serializeBitcoinInt(tx.locktime || 0))
  
  buffer.push(serializeBitcoinInt(hashType))
  
  const totalLength = buffer.reduce((sum, b) => sum + b.length, 0)
  const serialized = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of buffer) {
    serialized.set(chunk, offset)
    offset += chunk.length
  }
  
  const hash = await doubleSha256(serialized)
  return bytesToHex(hash)
}

export async function extractSighashFromRawTx(rawTxHex: string): Promise<TransactionWithSighash> {
  const txBytes = hexToBytes(rawTxHex)
  
  const isEthereum = txBytes.length > 0 && (
    (txBytes[0] >= 0xc0) ||
    (rawTxHex.includes('gasPrice') || rawTxHex.includes('nonce'))
  )
  
  if (isEthereum) {
    try {
      const decoded = decodeRLPTransaction(rawTxHex)
      const sighash = await calculateEthereumSighash(decoded)
      
      return {
        rawTx: rawTxHex,
        sighash,
        txType: 'ethereum',
        r: decoded.r,
        s: decoded.s,
        v: decoded.v
      }
    } catch (error) {
      console.error('Error decoding Ethereum transaction:', error)
      throw error
    }
  } else {
    try {
      const decoded = decodeBitcoinTransaction(rawTxHex)
      const sighash = await calculateBitcoinSighash(decoded, 0, '')
      
      return {
        rawTx: rawTxHex,
        sighash,
        txType: 'bitcoin'
      }
    } catch (error) {
      console.error('Error decoding Bitcoin transaction:', error)
      throw error
    }
  }
}

function decodeRLPTransaction(rawTx: string): any {
  const bytes = hexToBytes(rawTx)
  const decoded = rlpDecode(bytes)
  
  if (!Array.isArray(decoded) || decoded.length < 9) {
    throw new Error('Invalid RLP encoded transaction')
  }
  
  return {
    nonce: decoded[0] ? parseInt(bytesToHex(decoded[0] as Uint8Array), 16) : 0,
    gasPrice: bytesToHex(decoded[1] as Uint8Array),
    gasLimit: bytesToHex(decoded[2] as Uint8Array),
    to: bytesToHex(decoded[3] as Uint8Array),
    value: bytesToHex(decoded[4] as Uint8Array),
    data: bytesToHex(decoded[5] as Uint8Array),
    v: decoded[6] ? parseInt(bytesToHex(decoded[6] as Uint8Array), 16) : 0,
    r: bytesToHex(decoded[7] as Uint8Array),
    s: bytesToHex(decoded[8] as Uint8Array),
    chainId: decoded.length > 9 && decoded[9] ? parseInt(bytesToHex(decoded[9] as Uint8Array), 16) : undefined
  }
}

function rlpDecode(bytes: Uint8Array): any {
  if (bytes.length === 0) return new Uint8Array(0)
  
  const prefix = bytes[0]
  
  if (prefix < 128) {
    return bytes.slice(0, 1)
  }
  
  if (prefix <= 183) {
    const length = prefix - 128
    return bytes.slice(1, 1 + length)
  }
  
  if (prefix <= 191) {
    const lengthOfLength = prefix - 183
    const length = parseInt(bytesToHex(bytes.slice(1, 1 + lengthOfLength)), 16)
    return bytes.slice(1 + lengthOfLength, 1 + lengthOfLength + length)
  }
  
  if (prefix <= 247) {
    const length = prefix - 192
    const data = bytes.slice(1, 1 + length)
    return decodeRLPList(data)
  }
  
  const lengthOfLength = prefix - 247
  const length = parseInt(bytesToHex(bytes.slice(1, 1 + lengthOfLength)), 16)
  const data = bytes.slice(1 + lengthOfLength, 1 + lengthOfLength + length)
  return decodeRLPList(data)
}

function decodeRLPList(bytes: Uint8Array): any[] {
  const result: any[] = []
  let offset = 0
  
  while (offset < bytes.length) {
    const item = rlpDecode(bytes.slice(offset))
    result.push(item)
    
    const prefix = bytes[offset]
    if (prefix < 128) {
      offset += 1
    } else if (prefix <= 183) {
      offset += 1 + (prefix - 128)
    } else if (prefix <= 191) {
      const lengthOfLength = prefix - 183
      const length = parseInt(bytesToHex(bytes.slice(offset + 1, offset + 1 + lengthOfLength)), 16)
      offset += 1 + lengthOfLength + length
    } else if (prefix <= 247) {
      offset += 1 + (prefix - 192)
    } else {
      const lengthOfLength = prefix - 247
      const length = parseInt(bytesToHex(bytes.slice(offset + 1, offset + 1 + lengthOfLength)), 16)
      offset += 1 + lengthOfLength + length
    }
  }
  
  return result
}

function decodeBitcoinTransaction(rawTx: string): RawTransaction {
  const bytes = hexToBytes(rawTx)
  let offset = 0
  
  const version = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
  offset += 4
  
  const [vinCount, vinCountSize] = readVarInt(bytes.slice(offset))
  offset += vinCountSize
  
  const vin: Array<{ txid: string; vout: number; scriptSig?: string; sequence?: number }> = []
  
  for (let i = 0; i < vinCount; i++) {
    const txid = bytesToHex(bytes.slice(offset, offset + 32).reverse())
    offset += 32
    
    const vout = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    offset += 4
    
    const [scriptLen, scriptLenSize] = readVarInt(bytes.slice(offset))
    offset += scriptLenSize
    
    const scriptSig = bytesToHex(bytes.slice(offset, offset + scriptLen))
    offset += scriptLen
    
    const sequence = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    offset += 4
    
    vin.push({ txid, vout, scriptSig, sequence })
  }
  
  const [voutCount, voutCountSize] = readVarInt(bytes.slice(offset))
  offset += voutCountSize
  
  const vout: Array<{ value: number; scriptPubKey?: string }> = []
  
  for (let i = 0; i < voutCount; i++) {
    let value = 0
    for (let j = 0; j < 8; j++) {
      value += bytes[offset + j] << (j * 8)
    }
    offset += 8
    
    const [scriptLen, scriptLenSize] = readVarInt(bytes.slice(offset))
    offset += scriptLenSize
    
    const scriptPubKey = bytesToHex(bytes.slice(offset, offset + scriptLen))
    offset += scriptLen
    
    vout.push({ value, scriptPubKey })
  }
  
  const locktime = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
  
  return { version, vin, vout, locktime }
}

function readVarInt(bytes: Uint8Array): [number, number] {
  const first = bytes[0]
  
  if (first < 0xfd) {
    return [first, 1]
  } else if (first === 0xfd) {
    return [bytes[1] | (bytes[2] << 8), 3]
  } else if (first === 0xfe) {
    return [bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24), 5]
  } else {
    return [bytes[1] | (bytes[2] << 8) | (bytes[3] << 16) | (bytes[4] << 24), 9]
  }
}

export async function calculateSighashFromComponents(
  nonce: number | string,
  gasPrice: string,
  gasLimit: string,
  to: string,
  value: string,
  data: string,
  chainId?: number
): Promise<string> {
  const tx: RawTransaction = {
    nonce: typeof nonce === 'string' ? parseInt(nonce) : nonce,
    gasPrice,
    gasLimit,
    to,
    value,
    data,
    chainId
  }
  
  return await calculateEthereumSighash(tx)
}

export function validateSighash(sighash: string, r: string, s: string): boolean {
  try {
    const zBigInt = BigInt(sighash)
    const rBigInt = BigInt(r)
    const sBigInt = BigInt(s)
    
    const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')
    
    if (zBigInt <= 0n || zBigInt >= SECP256K1_N) {
      return false
    }
    
    if (rBigInt <= 0n || rBigInt >= SECP256K1_N) {
      return false
    }
    
    if (sBigInt <= 0n || sBigInt >= SECP256K1_N) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}
