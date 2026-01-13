import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/card'
import { LLLStep } from '@/lib/types'

interface OrthogonalityChartProps {
  steps: LLLStep[]
}

function calculateOrthogonality(basis: number[][]): number {
  if (basis.length < 2) return 1

  let totalOrthogonality = 0
  let pairCount = 0

  for (let i = 0; i < basis.length; i++) {
    for (let j = i + 1; j < basis.length; j++) {
      const v1 = basis[i]
      const v2 = basis[j]
      
      const dot = v1.reduce((sum, val, idx) => sum + val * v2[idx], 0)
      const norm1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0))
      const norm2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0))
      
      if (norm1 > 0 && norm2 > 0) {
        const cosine = Math.abs(dot / (norm1 * norm2))
        totalOrthogonality += (1 - cosine)
        pairCount++
      }
    }
  }

  return pairCount > 0 ? totalOrthogonality / pairCount : 1
}

function calculateAverageNorm(basis: number[][]): number {
  const norms = basis.map(v => 
    Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))
  )
  return norms.reduce((sum, n) => sum + n, 0) / norms.length
}

export function OrthogonalityChart({ steps }: OrthogonalityChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || steps.length === 0) return

    const margin = { top: 20, right: 80, bottom: 40, left: 60 }
    const width = svgRef.current.clientWidth - margin.left - margin.right
    const height = svgRef.current.clientHeight - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const orthogonalityData = steps.map((step) => ({
      iteration: step.iteration,
      orthogonality: calculateOrthogonality(step.basis),
      avgNorm: calculateAverageNorm(step.basis),
      action: step.action
    }))

    const xScale = d3.scaleLinear()
      .domain([0, steps.length - 1])
      .range([0, width])

    const yScaleOrthogonality = d3.scaleLinear()
      .domain([0, 1])
      .range([height, 0])

    const maxNorm = d3.max(orthogonalityData, d => d.avgNorm) || 1
    const yScaleNorm = d3.scaleLinear()
      .domain([0, maxNorm * 1.1])
      .range([height, 0])

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(Math.min(10, steps.length)))
      .selectAll('text')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')

    svg.append('g')
      .call(d3.axisLeft(yScaleOrthogonality).ticks(5))
      .selectAll('text')
      .attr('fill', 'oklch(0.75 0.15 200)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')

    svg.append('g')
      .attr('transform', `translate(${width},0)`)
      .call(d3.axisRight(yScaleNorm).ticks(5))
      .selectAll('text')
      .attr('fill', 'oklch(0.65 0.18 145)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')

    svg.selectAll('.domain, .tick line')
      .attr('stroke', 'oklch(0.30 0.02 260)')

    svg.append('text')
      .attr('x', -height / 2)
      .attr('y', -40)
      .attr('transform', 'rotate(-90)')
      .attr('text-anchor', 'middle')
      .attr('fill', 'oklch(0.75 0.15 200)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px')
      .text('Orthogonality')

    svg.append('text')
      .attr('x', width + 50)
      .attr('y', height / 2)
      .attr('transform', `rotate(-90, ${width + 50}, ${height / 2})`)
      .attr('text-anchor', 'middle')
      .attr('fill', 'oklch(0.65 0.18 145)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px')
      .text('Avg Norm')

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', height + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px')
      .text('Step')

    const orthogonalityLine = d3.line<typeof orthogonalityData[0]>()
      .x((_, i) => xScale(i))
      .y(d => yScaleOrthogonality(d.orthogonality))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(orthogonalityData)
      .attr('fill', 'none')
      .attr('stroke', 'oklch(0.75 0.15 200)')
      .attr('stroke-width', 2.5)
      .attr('d', orthogonalityLine)

    const normLine = d3.line<typeof orthogonalityData[0]>()
      .x((_, i) => xScale(i))
      .y(d => yScaleNorm(d.avgNorm))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(orthogonalityData)
      .attr('fill', 'none')
      .attr('stroke', 'oklch(0.65 0.18 145)')
      .attr('stroke-width', 2.5)
      .attr('d', normLine)

    orthogonalityData.forEach((d, i) => {
      if (d.action === 'swap') {
        svg.append('circle')
          .attr('cx', xScale(i))
          .attr('cy', yScaleOrthogonality(d.orthogonality))
          .attr('r', 4)
          .attr('fill', 'oklch(0.75 0.15 200)')
          .attr('stroke', 'oklch(0.15 0.02 260)')
          .attr('stroke-width', 2)
      }
    })

    const legend = svg.append('g')
      .attr('transform', `translate(10, 10)`)

    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 0)
      .attr('y2', 0)
      .attr('stroke', 'oklch(0.75 0.15 200)')
      .attr('stroke-width', 2.5)

    legend.append('text')
      .attr('x', 25)
      .attr('y', 0)
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text('Orthogonality')

    legend.append('line')
      .attr('x1', 0)
      .attr('x2', 20)
      .attr('y1', 15)
      .attr('y2', 15)
      .attr('stroke', 'oklch(0.65 0.18 145)')
      .attr('stroke-width', 2.5)

    legend.append('text')
      .attr('x', 25)
      .attr('y', 15)
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '10px')
      .text('Avg Vector Norm')

  }, [steps])

  if (steps.length === 0) return null

  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-sm font-semibold mb-4">Reduction Progress</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Orthogonality increases and norms decrease as the algorithm progresses
      </p>
      <svg
        ref={svgRef}
        className="w-full bg-secondary/30 rounded-lg border border-border"
        style={{ height: '300px' }}
      />
    </Card>
  )
}
