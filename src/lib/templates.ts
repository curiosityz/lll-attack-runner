import { AttackTemplate } from './types'

export const attackTemplates: AttackTemplate[] = [
  {
    id: 'simple-3x3',
    name: 'Simple 3×3 Example',
    description: 'A simple 3-dimensional lattice for learning LLL basics. Great for understanding the algorithm.',
    type: 'custom',
    basis: [
      [1, 1, 1],
      [-1, 0, 2],
      [3, 5, 6]
    ],
    delta: 0.75,
    expectedOutcome: 'Should produce a reduced basis with shorter, more orthogonal vectors'
  },
  {
    id: 'nearly-orthogonal',
    name: 'Nearly Orthogonal Basis',
    description: 'A basis that is already nearly orthogonal. LLL should converge quickly.',
    type: 'custom',
    basis: [
      [10, 1, 0],
      [0, 11, 1],
      [1, 0, 12]
    ],
    delta: 0.75,
    expectedOutcome: 'Quick convergence with minimal changes to the basis'
  },
  {
    id: 'svp-challenge',
    name: 'Shortest Vector Problem',
    description: 'Find the shortest non-zero vector in this lattice. Classic hard problem in lattice cryptography.',
    type: 'custom',
    basis: [
      [19, 2, 32, 46, 3],
      [15, 19, 6, 37, 1],
      [43, 15, 28, 20, 2],
      [17, 29, 11, 42, 5],
      [31, 11, 39, 8, 4]
    ],
    delta: 0.99,
    expectedOutcome: 'First vector in reduced basis should be the shortest vector'
  },
  {
    id: 'rsa-small-exponent',
    name: 'RSA Small Public Exponent',
    description: 'Attack on RSA with small public exponent using lattice reduction. Demonstrates recovering plaintext when e is small and message is short.',
    type: 'rsa',
    basis: [
      [1, 0, 12345],
      [0, 1, 67890],
      [0, 0, 100000]
    ],
    delta: 0.75,
    expectedOutcome: 'Should find a short vector revealing the plaintext message'
  },
  {
    id: 'rsa-coppersmith',
    name: 'RSA Coppersmith Attack',
    description: 'Coppersmith\'s attack for finding small roots of polynomials modulo N. Useful when partial message bits are known.',
    type: 'rsa',
    basis: [
      [1, 0, 0, 8192],
      [0, 1, 0, 16384],
      [0, 0, 1, 32768],
      [0, 0, 0, 65536]
    ],
    delta: 0.99,
    expectedOutcome: 'Reduced basis reveals polynomial roots containing plaintext bits'
  },
  {
    id: 'rsa-broadcast',
    name: 'RSA Broadcast Attack',
    description: 'Hastad\'s broadcast attack when same message sent to multiple recipients with small e=3.',
    type: 'rsa',
    basis: [
      [1, 0, 0, 11111],
      [0, 1, 0, 22222],
      [0, 0, 1, 33333],
      [0, 0, 0, 99999]
    ],
    delta: 0.75,
    expectedOutcome: 'Short vector corresponds to the common plaintext message'
  },
  {
    id: 'rsa-partial-key',
    name: 'RSA Partial Key Exposure',
    description: 'Attack when portions of the private key are exposed. Uses lattice to recover full key.',
    type: 'rsa',
    basis: [
      [2, 0, 0, 1234],
      [0, 2, 0, 5678],
      [0, 0, 2, 9012],
      [1, 1, 1, 10000]
    ],
    delta: 0.99,
    expectedOutcome: 'Reconstructs complete private key from partial information'
  },
  {
    id: 'subset-sum-basic',
    name: 'Subset Sum Problem',
    description: 'Classic subset sum problem converted to lattice form. Given a set of numbers, find a subset that sums to a target.',
    type: 'subset-sum',
    basis: [
      [2, 0, 0, 0, 1],
      [0, 2, 0, 0, 1],
      [0, 0, 2, 0, 1],
      [0, 0, 0, 2, 1],
      [3, 5, 8, 13, 0]
    ],
    delta: 0.75,
    expectedOutcome: 'Solution vector should indicate which elements to include in the subset'
  },
  {
    id: 'subset-sum-low-density',
    name: 'Low Density Subset Sum',
    description: 'Subset sum with low density (n/log₂(max element)). These are efficiently solvable with LLL.',
    type: 'subset-sum',
    basis: [
      [2, 0, 0, 0, 0, 17],
      [0, 2, 0, 0, 0, 23],
      [0, 0, 2, 0, 0, 31],
      [0, 0, 0, 2, 0, 47],
      [0, 0, 0, 0, 2, 59],
      [1, 1, 1, 1, 1, 0]
    ],
    delta: 0.99,
    expectedOutcome: 'Short vector reveals the subset selection (binary coefficients)'
  },
  {
    id: 'subset-sum-modular',
    name: 'Modular Subset Sum',
    description: 'Subset sum with modular constraint. Find subset summing to target modulo some value.',
    type: 'subset-sum',
    basis: [
      [1, 0, 0, 7, 100],
      [0, 1, 0, 11, 100],
      [0, 0, 1, 13, 100],
      [0, 0, 0, 17, 0],
      [0, 0, 0, 0, 200]
    ],
    delta: 0.75,
    expectedOutcome: 'Solution considering modular arithmetic constraints'
  },
  {
    id: 'knapsack-merkle-hellman',
    name: 'Merkle-Hellman Knapsack',
    description: 'Attack on the Merkle-Hellman knapsack cryptosystem using LLL. Demonstrates breaking this early public-key system.',
    type: 'knapsack',
    basis: [
      [1, 0, 0, 19],
      [0, 1, 0, 32],
      [0, 0, 1, 46],
      [0, 0, 0, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Reduced basis should reveal the private key structure'
  },
  {
    id: 'knapsack-superincreasing',
    name: 'Superincreasing Knapsack',
    description: 'Attack on superincreasing knapsack sequences. Each element exceeds sum of all previous.',
    type: 'knapsack',
    basis: [
      [2, 0, 0, 0, 2],
      [0, 2, 0, 0, 5],
      [0, 0, 2, 0, 11],
      [0, 0, 0, 2, 23],
      [1, 1, 1, 1, 0]
    ],
    delta: 0.75,
    expectedOutcome: 'Easily breakable structure revealed by reduction'
  },
  {
    id: 'knapsack-chor-rivest',
    name: 'Chor-Rivest Knapsack',
    description: 'Attack variant targeting Chor-Rivest cryptosystem using lattice techniques.',
    type: 'knapsack',
    basis: [
      [1, 0, 0, 0, 37],
      [0, 1, 0, 0, 41],
      [0, 0, 1, 0, 43],
      [0, 0, 0, 1, 47],
      [0, 0, 0, 0, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Breaks the algebraic structure of Chor-Rivest'
  },
  {
    id: 'cvp-basic',
    name: 'Closest Vector Problem',
    description: 'Find the lattice point closest to a given target vector. Fundamental problem in lattice cryptography.',
    type: 'cvp',
    basis: [
      [1, 0, 0, 15],
      [0, 1, 0, 22],
      [0, 0, 1, 37],
      [0, 0, 0, 1]
    ],
    delta: 0.99,
    expectedOutcome: 'Closest lattice point to the target (last column represents target)'
  },
  {
    id: 'cvp-embedding',
    name: 'CVP via Embedding Technique',
    description: 'CVP solved using embedding technique - augment lattice with target vector.',
    type: 'cvp',
    basis: [
      [10, 0, 0, 47],
      [0, 10, 0, 53],
      [0, 0, 10, 61],
      [0, 0, 0, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Short vector when projected gives CVP solution'
  },
  {
    id: 'cvp-bounded-distance',
    name: 'Bounded Distance Decoding',
    description: 'CVP variant where target is guaranteed to be within certain distance of lattice point.',
    type: 'cvp',
    basis: [
      [5, 0, 0, 23],
      [0, 5, 0, 29],
      [0, 0, 5, 31],
      [0, 0, 0, 10]
    ],
    delta: 0.75,
    expectedOutcome: 'Finds nearest codeword in error-correcting scenario'
  },
  {
    id: 'hnp-dsa',
    name: 'Hidden Number Problem (DSA)',
    description: 'Recover DSA/ECDSA private key from partial nonce information using lattice attack.',
    type: 'hnp',
    basis: [
      [1000, 0, 0, 157],
      [0, 1000, 0, 239],
      [0, 0, 1000, 341],
      [123, 456, 789, 10000]
    ],
    delta: 0.99,
    expectedOutcome: 'Reveals private key from biased or partial nonce leakage'
  },
  {
    id: 'hnp-ecdsa-biased',
    name: 'ECDSA Biased Nonces',
    description: 'Attack ECDSA when nonces have bias (e.g., leading zero bits). Multiple signatures needed.',
    type: 'hnp',
    basis: [
      [100, 0, 0, 0, 89],
      [0, 100, 0, 0, 97],
      [0, 0, 100, 0, 113],
      [0, 0, 0, 100, 127],
      [37, 41, 43, 47, 1000]
    ],
    delta: 0.99,
    expectedOutcome: 'Recovers secret key from multiple biased signatures'
  },
  {
    id: 'hnp-schnorr',
    name: 'Schnorr Signature Attack',
    description: 'HNP variant for Schnorr signatures when nonce reuse or bias occurs.',
    type: 'hnp',
    basis: [
      [500, 0, 0, 173],
      [0, 500, 0, 179],
      [0, 0, 500, 181],
      [71, 73, 79, 5000]
    ],
    delta: 0.99,
    expectedOutcome: 'Private key recovery from compromised nonces'
  },
  {
    id: 'ntru-key-recovery',
    name: 'NTRU Private Key Recovery',
    description: 'Attack NTRU encryption by finding short vectors corresponding to private key polynomials.',
    type: 'ntru',
    basis: [
      [1, 0, 0, 0, 251],
      [0, 1, 0, 0, 251],
      [0, 0, 1, 0, 251],
      [0, 0, 0, 1, 251],
      [1, -1, 1, -1, 0]
    ],
    delta: 0.99,
    expectedOutcome: 'Short polynomial vectors revealing NTRU private key'
  },
  {
    id: 'ntru-lattice',
    name: 'NTRU Public Key Lattice',
    description: 'Construct and reduce the lattice formed by NTRU public key to find short basis.',
    type: 'ntru',
    basis: [
      [7, 0, 0, 1],
      [0, 7, 0, -1],
      [0, 0, 7, 1],
      [3, 2, 5, 0]
    ],
    delta: 0.99,
    expectedOutcome: 'Reduced basis reveals structure exploitable for decryption'
  },
  {
    id: 'dsa-nonce-reuse',
    name: 'DSA Nonce Reuse',
    description: 'Classic attack when same nonce used for two different DSA signatures.',
    type: 'dsa',
    basis: [
      [1, 0, 12345],
      [0, 1, 67890],
      [0, 0, 100000]
    ],
    delta: 0.75,
    expectedOutcome: 'Private key directly recovered from nonce reuse'
  },
  {
    id: 'dsa-partial-nonce',
    name: 'DSA Partial Nonce Exposure',
    description: 'Attack when partial bits of nonces are leaked across multiple signatures.',
    type: 'dsa',
    basis: [
      [256, 0, 0, 0, 157],
      [0, 256, 0, 0, 163],
      [0, 0, 256, 0, 167],
      [0, 0, 0, 256, 173],
      [11, 13, 17, 19, 10000]
    ],
    delta: 0.99,
    expectedOutcome: 'Private key from partial nonce information across signatures'
  },
  {
    id: 'lwe-decrypt',
    name: 'Learning With Errors (LWE)',
    description: 'Solve LWE problem to recover secret vector. Foundation of many post-quantum schemes.',
    type: 'custom',
    basis: [
      [10, 0, 0, 3],
      [0, 10, 0, 5],
      [0, 0, 10, 7],
      [3, 7, 5, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Short vector revealing LWE secret in low-noise scenarios'
  },
  {
    id: 'ggh-cryptosystem',
    name: 'GGH Cryptosystem Attack',
    description: 'Attack Goldreich-Goldwasser-Halevi lattice-based encryption using LLL on public key.',
    type: 'custom',
    basis: [
      [7, 3, 2],
      [2, 9, 4],
      [3, 1, 8]
    ],
    delta: 0.99,
    expectedOutcome: 'Recover private key or decrypt messages without key'
  },
  {
    id: 'simultaneous-diophantine',
    name: 'Simultaneous Diophantine Approximation',
    description: 'Find integer combinations that approximate multiple rational numbers simultaneously.',
    type: 'custom',
    basis: [
      [1, 0, 0, 31415],
      [0, 1, 0, 27182],
      [0, 0, 1, 16180],
      [0, 0, 0, 100000]
    ],
    delta: 0.99,
    expectedOutcome: 'Integer relations between real numbers'
  },
  {
    id: 'integer-programming',
    name: 'Integer Programming via CVP',
    description: 'Solve small integer linear programming problems by reducing to CVP.',
    type: 'custom',
    basis: [
      [1, 0, 0, 7],
      [0, 1, 0, 9],
      [0, 0, 1, 13],
      [2, 3, 5, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Integer solution satisfying linear constraints'
  },
  {
    id: 'polynomial-factoring',
    name: 'Polynomial Factoring via Lattice',
    description: 'Factor polynomials over integers using lattice basis reduction techniques.',
    type: 'custom',
    basis: [
      [1, 0, 0, 5],
      [0, 1, 0, 7],
      [0, 0, 1, 11],
      [0, 0, 0, 100]
    ],
    delta: 0.99,
    expectedOutcome: 'Polynomial factors as short lattice vectors'
  },
  {
    id: 'high-dimension-svp',
    name: 'High Dimension SVP Challenge',
    description: 'Challenging higher-dimensional shortest vector problem. Tests algorithm limits.',
    type: 'custom',
    basis: [
      [13, 7, 11, 5, 17, 3],
      [19, 23, 2, 29, 3, 31],
      [37, 4, 41, 6, 43, 7],
      [47, 8, 9, 53, 10, 59],
      [61, 11, 67, 12, 71, 13],
      [73, 14, 15, 79, 16, 83]
    ],
    delta: 0.99,
    expectedOutcome: 'Shortest vector in higher dimension - may require many iterations'
  }
]
