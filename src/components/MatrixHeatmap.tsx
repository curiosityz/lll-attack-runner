import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/card'
import { LLLStep } from '@/lib/types'

interface MatrixHeatmapProps {
  steps: LLLStep[]
  currentStep: number
}

export function MatrixHeatmap({ steps, currentStep }: MatrixHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || steps.length === 0) return

    const margin = { top: 30, right: 20, bottom: 30, left: 50 }
    const width = svgRef.current.clientWidth - margin.left - margin.right
    const height = svgRef.current.clientHeight - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const step = steps[currentStep]
    const matrix = step.basis

    if (matrix.length === 0) return

    const numRows = matrix.length
    const numCols = matrix[0].length

    const cellWidth = Math.min(width / numCols, 60)
    const cellHeight = Math.min(height / numRows, 60)

    const allValues = matrix.flat().map(Math.abs)
    const maxVal = Math.max(...allValues, 1)

    const colorScale = d3.scaleSequential(d3.interpolateViridis)
      .domain([0, maxVal])

    const rows = svg.selectAll('.row')
      .data(matrix)
      .enter()
      .append('g')
      .attr('class', 'row')
      .attr('transform', (_, i) => `translate(0,${i * cellHeight})`)

    rows.each(function(rowData, rowIndex) {
      const row = d3.select(this)
      
      row.selectAll('.cell')
        .data(rowData)
        .enter()
        .append('rect')
        .attr('class', 'cell')
        .attr('x', (_, colIndex) => colIndex * cellWidth)
        .attr('width', cellWidth - 2)
        .attr('height', cellHeight - 2)
        .attr('fill', (d) => colorScale(Math.abs(d)))
        .attr('stroke', 'oklch(0.20 0.02 260)')
        .attr('stroke-width', 1)
        .attr('rx', 3)
        .attr('opacity', () => {
          const isActive = rowIndex === step.k || (step.action === 'swap' && rowIndex === step.k - 1)
          return isActive ? 1 : 0.7
        })

      row.selectAll('.cell-text')
        .data(rowData)
        .enter()
        .append('text')
        .attr('class', 'cell-text')
        .attr('x', (_, colIndex) => colIndex * cellWidth + cellWidth / 2)
        .attr('y', cellHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('fill', (d) => Math.abs(d) > maxVal / 2 ? 'oklch(0.95 0 0)' : 'oklch(0.30 0.02 260)')
        .attr('font-size', `${Math.min(cellWidth / 4, 12)}px`)
        .attr('font-family', 'JetBrains Mono, monospace')
        .attr('font-weight', '500')
        .text((d) => {
          if (Math.abs(d) < 1e-10) return '0'
          if (Number.isInteger(d)) return d.toString()
          return d.toFixed(1)
        })
    })

    svg.selectAll('.row-label')
      .data(matrix)
      .enter()
      .append('text')
      .attr('class', 'row-label')
      .attr('x', -10)
      .attr('y', (_, i) => i * cellHeight + cellHeight / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', (_, i) => {
        const isActive = i === step.k || (step.action === 'swap' && i === step.k - 1)
        return isActive ? 'oklch(0.75 0.15 200)' : 'oklch(0.65 0.02 260)'
      })
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-weight', (_, i) => {
        const isActive = i === step.k || (step.action === 'swap' && i === step.k - 1)
        return isActive ? '700' : '400'
      })
      .text((_, i) => `v${i}`)

    svg.selectAll('.col-label')
      .data(matrix[0])
      .enter()
      .append('text')
      .attr('class', 'col-label')
      .attr('x', (_, i) => i * cellWidth + cellWidth / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .attr('fill', 'oklch(0.65 0.02 260)')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((_, i) => `x${i}`)

  }, [currentStep, steps])

  if (steps.length === 0) return null

  return (
    <Card className="p-6 bg-card border-border">
      <h3 className="text-sm font-semibold mb-4">Matrix State</h3>
      <div className="flex justify-center">
        <svg
          ref={svgRef}
          className="w-full bg-secondary/30 rounded-lg border border-border"
          style={{ height: '300px', maxWidth: '600px' }}
        />
      </div>
    </Card>
  )
}
