import { extractSighashFromRawTx, calculateSighashFromComponents } from './sighashCalculator'
import { 
  parseBlockchairTSV, 
  detectBlockchairFileType, 
  convertToAnalyzerFormat,
  parseDERSignature as parseBlockchairDER
} from './blockchair-parser'

// Hexadecimal validation pattern
const HEX_PATTERN = /^[0-9a-fA-F]+$/

export interface ParsedTransaction {
  hash: string
  from: string
  to: string | null
  r: string
  s: string
  v: string
  blockNumber?: number
  timestamp?: number
  nonce?: number
}

export interface ParsedSignature {
  r: bigint
  s: bigint
  v: number
  hash: string
  address: string
  blockNumber?: number
  timestamp?: number
  txNonce?: number
  sighash?: string
  rawTx?: string
}

export interface ParseResult {
  signatures: ParsedSignature[]
  transactions: ParsedTransaction[]
  format: 'json' | 'csv' | 'text' | 'unknown'
  totalParsed: number
  parseErrors: string[]
}

function hexToBigInt(hex: string): bigint {
  if (!hex) return 0n
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleaned.length === 0) return 0n
  // Validate that the string contains only valid hexadecimal characters
  if (!HEX_PATTERN.test(cleaned)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Invalid hex string provided (non-hex characters detected)')
    }
    return 0n
  }
  try {
    return BigInt('0x' + cleaned)
  } catch {
    return 0n
  }
}

function parseJSONFormat(data: any): ParseResult {
  const signatures: ParsedSignature[] = []
  const transactions: ParsedTransaction[] = []
  const parseErrors: string[] = []

  let records: any[] = []

  if (Array.isArray(data)) {
    records = data
  } else if (data.transactions && Array.isArray(data.transactions)) {
    records = data.transactions
  } else if (data.result && Array.isArray(data.result)) {
    records = data.result
  } else if (typeof data === 'object') {
    records = [data]
  }

  records.forEach((record, idx) => {
    try {
      const r = record.r || record.signature?.r || record.sig?.r
      const s = record.s || record.signature?.s || record.sig?.s
      const v = record.v || record.signature?.v || record.sig?.v
      const hash = record.hash || record.transactionHash || record.txHash || record.tx_hash || `tx_${idx}`
      const from = record.from || record.sender || record.address || 'unknown'
      const rawTx = record.raw || record.rawTransaction || record.rawTx
      
      const nonce = record.nonce
      const gasPrice = record.gasPrice
      const gasLimit = record.gasLimit || record.gas
      const to = record.to
      const value = record.value
      const inputData = record.input || record.data
      const chainId = record.chainId

      if (r && s) {
        const rBig = hexToBigInt(r)
        const sBig = hexToBigInt(s)
        const vNum = typeof v === 'number' ? v : parseInt(v?.toString() || '0', 10)

        if (rBig > 0n && sBig > 0n) {
          let sighash: string | undefined
          
          if (rawTx) {
            try {
              extractSighashFromRawTx(rawTx).then(result => {
                sighash = result.sighash
              }).catch(() => {})
            } catch {}
          } else if (nonce !== undefined && gasPrice && gasLimit && to && value !== undefined) {
            try {
              calculateSighashFromComponents(
                nonce,
                gasPrice,
                gasLimit,
                to,
                value,
                inputData || '0x',
                chainId
              ).then(result => {
                sighash = result
              }).catch(() => {})
            } catch {}
          }
          
          signatures.push({
            r: rBig,
            s: sBig,
            v: vNum,
            hash,
            address: from,
            blockNumber: record.blockNumber || record.block_number || record.block,
            timestamp: record.timestamp || record.time,
            txNonce: record.nonce,
            sighash,
            rawTx
          })

          transactions.push({
            hash,
            from,
            to: record.to || null,
            r: r.toString(),
            s: s.toString(),
            v: v?.toString() || '0',
            blockNumber: record.blockNumber || record.block_number || record.block,
            timestamp: record.timestamp || record.time,
            nonce: record.nonce
          })
        } else {
          parseErrors.push(`Record ${idx}: Invalid r/s values`)
        }
      } else {
        parseErrors.push(`Record ${idx}: Missing r or s signature component`)
      }
    } catch (error) {
      parseErrors.push(`Record ${idx}: ${error instanceof Error ? error.message : 'Parse error'}`)
    }
  })

  return {
    signatures,
    transactions,
    format: 'json',
    totalParsed: signatures.length,
    parseErrors: parseErrors.slice(0, 50)
  }
}

function parseCSVFormat(content: string): ParseResult {
  const signatures: ParsedSignature[] = []
  const transactions: ParsedTransaction[] = []
  const parseErrors: string[] = []

  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) {
    return { signatures, transactions, format: 'csv', totalParsed: 0, parseErrors: ['Empty file'] }
  }

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
  
  const rIdx = headers.findIndex(h => h === 'r' || h.includes('signature') && h.includes('r'))
  const sIdx = headers.findIndex(h => h === 's' || h.includes('signature') && h.includes('s'))
  const vIdx = headers.findIndex(h => h === 'v')
  const hashIdx = headers.findIndex(h => h.includes('hash') || h === 'tx')
  const fromIdx = headers.findIndex(h => h === 'from' || h === 'address' || h === 'sender')
  const toIdx = headers.findIndex(h => h === 'to' || h === 'recipient')
  const blockIdx = headers.findIndex(h => h.includes('block'))
  const timeIdx = headers.findIndex(h => h.includes('time') || h.includes('timestamp'))

  if (rIdx === -1 || sIdx === -1) {
    return {
      signatures,
      transactions,
      format: 'csv',
      totalParsed: 0,
      parseErrors: ['CSV must have r and s columns']
    }
  }

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
      
      const r = cols[rIdx]
      const s = cols[sIdx]
      const v = vIdx >= 0 ? cols[vIdx] : '0'
      const hash = hashIdx >= 0 ? cols[hashIdx] : `tx_${i}`
      const from = fromIdx >= 0 ? cols[fromIdx] : 'unknown'
      const to = toIdx >= 0 ? cols[toIdx] : null

      if (r && s) {
        const rBig = hexToBigInt(r)
        const sBig = hexToBigInt(s)
        const vNum = parseInt(v, 10) || 0

        if (rBig > 0n && sBig > 0n) {
          signatures.push({
            r: rBig,
            s: sBig,
            v: vNum,
            hash,
            address: from,
            blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
            timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
          })

          transactions.push({
            hash,
            from,
            to,
            r,
            s,
            v,
            blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
            timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
          })
        }
      }
    } catch (error) {
      parseErrors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`)
    }
  }

  return {
    signatures,
    transactions,
    format: 'csv',
    totalParsed: signatures.length,
    parseErrors: parseErrors.slice(0, 50)
  }
}

/**
 * Parse TSV format data (tab-separated values)
 * Supports Blockchair-style inputs with signature data
 */
function parseTSVFormat(content: string): ParseResult {
  const signatures: ParsedSignature[] = []
  const transactions: ParsedTransaction[] = []
  const parseErrors: string[] = []

  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) {
    return { signatures, transactions, format: 'text', totalParsed: 0, parseErrors: ['Empty file'] }
  }

  // Check if this looks like a Blockchair format
  const firstLine = lines[0].toLowerCase()
  if (firstLine.includes('spending_signature') || 
      firstLine.includes('spending_witness') || 
      firstLine.includes('script_hex')) {
    // Use the Blockchair parser for proper signature extraction
    const fileType = detectBlockchairFileType(content)
    if (fileType === 'inputs') {
      const blockchairResult = parseBlockchairTSV(content, 'inputs')
      const parsedSigs = convertToAnalyzerFormat(blockchairResult.signatures)
      return {
        signatures: parsedSigs,
        transactions: parsedSigs.map(sig => ({
          hash: sig.hash,
          from: sig.address,
          to: null,
          r: sig.r.toString(16),
          s: sig.s.toString(16),
          v: sig.v.toString(),
          blockNumber: sig.blockNumber,
          timestamp: sig.timestamp
        })),
        format: 'text',
        totalParsed: parsedSigs.length,
        parseErrors: blockchairResult.parseErrors.slice(0, 50)
      }
    }
  }

  // Parse generic TSV with r, s columns
  const headers = lines[0].toLowerCase().split('\t').map(h => h.trim())
  
  const rIdx = headers.findIndex(h => h === 'r' || h.includes('signature') && h.includes('r'))
  const sIdx = headers.findIndex(h => h === 's' || h.includes('signature') && h.includes('s'))
  const vIdx = headers.findIndex(h => h === 'v')
  const hashIdx = headers.findIndex(h => h.includes('hash') || h === 'tx' || h.includes('transaction'))
  const fromIdx = headers.findIndex(h => h === 'from' || h === 'address' || h === 'sender' || h === 'recipient')
  const blockIdx = headers.findIndex(h => h.includes('block'))
  const timeIdx = headers.findIndex(h => h.includes('time') || h.includes('timestamp'))
  const sigHexIdx = headers.findIndex(h => h.includes('signature_hex') || h.includes('spending_signature'))

  // If we have r and s columns, parse them directly
  if (rIdx >= 0 && sIdx >= 0) {
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = lines[i].split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''))
        
        const r = cols[rIdx]
        const s = cols[sIdx]
        const v = vIdx >= 0 ? cols[vIdx] : '0'
        const hash = hashIdx >= 0 ? cols[hashIdx] : `tx_${i}`
        const from = fromIdx >= 0 ? cols[fromIdx] : 'unknown'

        if (r && s) {
          const rBig = hexToBigInt(r)
          const sBig = hexToBigInt(s)
          const vNum = parseInt(v, 10) || 0

          if (rBig > 0n && sBig > 0n) {
            signatures.push({
              r: rBig,
              s: sBig,
              v: vNum,
              hash,
              address: from,
              blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
              timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
            })

            transactions.push({
              hash,
              from,
              to: null,
              r,
              s,
              v,
              blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
              timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
            })
          }
        }
      } catch (error) {
        parseErrors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`)
      }
    }
  } 
  // If we have a signature_hex column, parse DER signatures
  else if (sigHexIdx >= 0) {
    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = lines[i].split('\t').map(c => c.trim())
        const sigHex = cols[sigHexIdx]
        const hash = hashIdx >= 0 ? cols[hashIdx] : `tx_${i}`
        const from = fromIdx >= 0 ? cols[fromIdx] : 'unknown'

        if (sigHex && sigHex.length > 10) {
          const parsed = parseBlockchairDER(sigHex)
          if (parsed) {
            signatures.push({
              r: parsed.r,
              s: parsed.s,
              v: parsed.sighashType,
              hash,
              address: from,
              blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
              timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
            })

            transactions.push({
              hash,
              from,
              to: null,
              r: parsed.r.toString(16),
              s: parsed.s.toString(16),
              v: parsed.sighashType.toString(),
              blockNumber: blockIdx >= 0 ? parseInt(cols[blockIdx]) : undefined,
              timestamp: timeIdx >= 0 ? parseInt(cols[timeIdx]) : undefined
            })
          }
        }
      } catch (error) {
        parseErrors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`)
      }
    }
  }

  return {
    signatures,
    transactions,
    format: 'text',
    totalParsed: signatures.length,
    parseErrors: parseErrors.slice(0, 50)
  }
}

function parseTextFormat(content: string): ParseResult {
  const signatures: ParsedSignature[] = []
  const transactions: ParsedTransaction[] = []
  const parseErrors: string[] = []

  const hexPattern = /0x[a-fA-F0-9]+/g
  const lines = content.split('\n')
  
  let currentTx: Partial<ParsedTransaction> = {}
  let lineIdx = 0

  for (const line of lines) {
    lineIdx++
    const trimmed = line.trim().toLowerCase()
    
    if (trimmed.includes('hash') || trimmed.includes('tx')) {
      if (currentTx.r && currentTx.s) {
        try {
          const rBig = hexToBigInt(currentTx.r)
          const sBig = hexToBigInt(currentTx.s)
          const vNum = parseInt(currentTx.v || '0', 10)

          if (rBig > 0n && sBig > 0n) {
            signatures.push({
              r: rBig,
              s: sBig,
              v: vNum,
              hash: currentTx.hash || `tx_${signatures.length}`,
              address: currentTx.from || 'unknown'
            })
            transactions.push(currentTx as ParsedTransaction)
          }
        } catch (e) {
          parseErrors.push(`Line ${lineIdx}: Failed to parse transaction`)
        }
      }
      currentTx = {}
      
      const matches = line.match(hexPattern)
      if (matches && matches[0]) {
        currentTx.hash = matches[0]
      }
    } else if (trimmed.includes('from') || trimmed.includes('sender') || trimmed.includes('address')) {
      const matches = line.match(hexPattern)
      if (matches && matches[0]) {
        currentTx.from = matches[0]
      }
    } else if (trimmed.includes('to') || trimmed.includes('recipient')) {
      const matches = line.match(hexPattern)
      if (matches && matches[0]) {
        currentTx.to = matches[0]
      }
    } else if (trimmed.includes(' r ') || trimmed.includes('r:') || trimmed.startsWith('r ')) {
      const matches = line.match(hexPattern)
      if (matches && matches[0]) {
        currentTx.r = matches[0]
      }
    } else if (trimmed.includes(' s ') || trimmed.includes('s:') || trimmed.startsWith('s ')) {
      const matches = line.match(hexPattern)
      if (matches && matches[0]) {
        currentTx.s = matches[0]
      }
    } else if (trimmed.includes(' v ') || trimmed.includes('v:') || trimmed.startsWith('v ')) {
      const matches = line.match(/\d+/)
      if (matches && matches[0]) {
        currentTx.v = matches[0]
      }
    } else {
      const hexMatches = line.match(hexPattern)
      if (hexMatches && hexMatches.length >= 2 && !currentTx.r && !currentTx.s) {
        currentTx.r = hexMatches[0]
        currentTx.s = hexMatches[1]
        if (hexMatches.length >= 3) {
          currentTx.v = hexMatches[2]
        }
      }
    }
  }

  if (currentTx.r && currentTx.s) {
    try {
      const rBig = hexToBigInt(currentTx.r)
      const sBig = hexToBigInt(currentTx.s)
      const vNum = parseInt(currentTx.v || '0', 10)

      if (rBig > 0n && sBig > 0n) {
        signatures.push({
          r: rBig,
          s: sBig,
          v: vNum,
          hash: currentTx.hash || `tx_${signatures.length}`,
          address: currentTx.from || 'unknown'
        })
        transactions.push(currentTx as ParsedTransaction)
      }
    } catch (e) {
      parseErrors.push(`Final transaction: Failed to parse`)
    }
  }

  return {
    signatures,
    transactions,
    format: 'text',
    totalParsed: signatures.length,
    parseErrors: parseErrors.slice(0, 50)
  }
}

export function parseTransactionData(content: string): ParseResult {
  const trimmed = content.trim()
  
  if (!trimmed) {
    return {
      signatures: [],
      transactions: [],
      format: 'unknown',
      totalParsed: 0,
      parseErrors: ['Empty content']
    }
  }

  // Try JSON first
  try {
    const data = JSON.parse(trimmed)
    return parseJSONFormat(data)
  } catch {
    // Not JSON, continue to other formats
  }

  // Get first line once and lowercase it for comparisons
  const firstLine = trimmed.split('\n')[0]
  const lowerFirstLine = firstLine.toLowerCase()

  // Check for TSV format (tab-separated values)
  // TSV is common for Blockchair dumps
  if (firstLine.includes('\t')) {
    // Check for Blockchair-style headers or generic TSV with signature data
    if (lowerFirstLine.includes('transaction') || 
        lowerFirstLine.includes('signature') ||
        lowerFirstLine.includes('spending') ||
        lowerFirstLine.includes('witness') ||
        lowerFirstLine.includes('script') ||
        lowerFirstLine.includes('block_id') ||
        (lowerFirstLine.includes('r') && lowerFirstLine.includes('s'))) {
      return parseTSVFormat(trimmed)
    }
  }

  // Check for CSV format (comma-separated)
  if (trimmed.includes(',') && (trimmed.includes('\n') || trimmed.includes('\r'))) {
    if (lowerFirstLine.includes('r') || lowerFirstLine.includes('s') || lowerFirstLine.includes('signature')) {
      return parseCSVFormat(trimmed)
    }
  }

  return parseTextFormat(trimmed)
}
