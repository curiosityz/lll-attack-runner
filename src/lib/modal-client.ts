/**
 * Modal Compute Client
 * 
 * Client for offloading compute-intensive LLL/BKZ operations to Modal serverless
 * to prevent browser freezing on large matrices.
 */

export interface ModalConfig {
  endpoint: string
  apiKey?: string
}

export interface LLLRequest {
  algorithm: 'lll'
  basis: number[][]
  delta: number
  captureSteps?: boolean
}

export interface BKZRequest {
  algorithm: 'bkz'
  basis: number[][]
  delta: number
  blockSize: number
  captureSteps?: boolean
}

export type ComputeRequest = LLLRequest | BKZRequest

export interface ComputeResult {
  success: boolean
  reducedBasis?: number[][]
  solutionVector?: number[]
  iterations?: number
  executionTime?: number
  algorithm?: string
  delta?: number
  blockSize?: number
  error?: string
}

export interface SignatureAnalysisRequest {
  signatures: Array<{
    r: string
    s: string
    z?: string
    address?: string
    blockNumber?: number
  }>
}

export interface SignatureAnalysisResult {
  success: boolean
  vulnerabilities?: {
    nonce_reuse: Array<{
      r_value: string
      count: number
      signatures: any[]
      severity: string
    }>
    biased_nonce: Array<{
      signature: any
      bit_length: number
      severity: string
    }>
    small_r: any[]
    related_nonce: any[]
  }
  total_signatures?: number
  nonce_reuse_count?: number
  biased_nonce_count?: number
  executionTime?: number
  error?: string
}

export class ModalComputeClient {
  private config: ModalConfig
  
  constructor(config: ModalConfig) {
    this.config = config
  }

  /**
   * Run lattice reduction (LLL or BKZ) on Modal
   */
  async runLatticeReduction(request: ComputeRequest): Promise<ComputeResult> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }

      const response = await fetch(`${this.config.endpoint}/compute_lattice_reduction`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Modal API error: ${response.status} - ${errorText}`)
      }

      const result: ComputeResult = await response.json()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: `Failed to run lattice reduction: ${message}`
      }
    }
  }

  /**
   * Analyze signatures for vulnerabilities on Modal
   */
  async analyzeSignatures(request: SignatureAnalysisRequest): Promise<SignatureAnalysisResult> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }

      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }

      const response = await fetch(`${this.config.endpoint}/analyze_signatures`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Modal API error: ${response.status} - ${errorText}`)
      }

      const result: SignatureAnalysisResult = await response.json()
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: `Failed to analyze signatures: ${message}`
      }
    }
  }

  /**
   * Check if Modal endpoint is accessible
   */
  async testConnection(): Promise<{ success: boolean; message: string; latency?: number }> {
    const startTime = Date.now()
    
    try {
      // Test with a small 2x2 matrix
      const testRequest: LLLRequest = {
        algorithm: 'lll',
        basis: [[2, 0], [0, 2]],
        delta: 0.99
      }

      const result = await this.runLatticeReduction(testRequest)
      const latency = Date.now() - startTime

      if (result.success) {
        return {
          success: true,
          message: 'Modal endpoint is accessible and working',
          latency
        }
      } else {
        return {
          success: false,
          message: result.error || 'Modal endpoint returned an error'
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        message: `Failed to connect to Modal: ${message}`
      }
    }
  }
}

// Singleton instance
let modalClientInstance: ModalComputeClient | null = null

export function getModalClient(config?: ModalConfig): ModalComputeClient {
  if (!modalClientInstance && config) {
    modalClientInstance = new ModalComputeClient(config)
  }
  if (!modalClientInstance) {
    throw new Error('Modal client not initialized. Provide config on first call.')
  }
  return modalClientInstance
}

export function resetModalClient(): void {
  modalClientInstance = null
}

// Default configuration (user should override this)
export const DEFAULT_MODAL_CONFIG: ModalConfig = {
  endpoint: 'https://your-modal-endpoint.modal.run',
  apiKey: undefined
}
