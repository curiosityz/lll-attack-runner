import { AttackTemplate } from './types'

export const attackTemplates: AttackTemplate[] = [
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
  }
]
