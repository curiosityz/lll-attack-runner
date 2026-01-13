import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Play, Pause, SkipBack, SkipForward, ArrowsClockwise } from '@phosphor-icons/react'
import { LLLStep } from '@/lib/types'

interface VectorVisualizationProps {
  steps: LLLStep[]
  dimension: number
  onStepChange?: (step: number) => void
}

export function VectorVisualization({ steps, dimension, onStepChange }: VectorVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1000)

  useEffect(() => {
    setCurrentStep(0)
    setIsPlaying(false)
  }, [steps])

  useEffect(() => {
    if (onStepChange) {
      onStepChange(currentStep)
    }
  }, [currentStep, onStepChange])

  useEffect(() => {
    if (!svgRef.current || steps.length === 0) return

    const margin = { top: 20, right: 20, bottom: 40, left: 50 }
    const width = svgRef.current.clientWidth - margin.left - margin.right
    const height = svgRef.current.clientHeight - margin.top - margin.bottom

    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const step = steps[currentStep]
    const vectors = step.basis

    if (dimension === 2 && vectors[0].length === 2) {
      render2D(svg, vectors, step, width, height)
    } else {
      renderNorms(svg, vectors, step, width, height)
    }
  }, [currentStep, steps, dimension])

  useEffect(() => {
    if (!isPlaying) return

    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, playbackSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, steps.length, playbackSpeed])

  const render2D = (
    svg: d3.Selection<SVGGElement, unknown, null, undefined>,
    vectors: number[][],
    step: LLLStep,
    width: number,
    height: number
  ) => {
    const allValues = vectors.flat().map(Math.abs)
    const maxVal = Math.max(...allValues, 1)
    const scale = Math.min(width, height) / (maxVal * 2.5)

    const centerX = width / 2
    const centerY = height / 2

    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', centerY)
      .attr('y2', centerY)
      .attr('stroke', 'oklch(0.30 0.02 260)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')

    svg.append('line')
      .attr('x1', centerX)
      .attr('x2', centerX)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', 'oklch(0.30 0.02 260)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')

    const colors = [
      'oklch(0.75 0.15 200)',
      'oklch(0.65 0.18 145)',
      'oklch(0.70 0.20 280)',
      'oklch(0.75 0.18 60)'
    ]

    vectors.forEach((vector, i) => {
      const [x, y] = vector
      const endX = centerX + x * scale
      const endY = centerY - y * scale
      
      const isActive = i === step.k || (step.action === 'swap' && i === step.k - 1)
      const strokeWidth = isActive ? 3 : 2
      const opacity = isActive ? 1 : 0.7

      svg.append('line')
        .attr('x1', centerX)
        .attr('y1', centerY)
        .attr('x2', endX)
        .attr('y2', endY)
        .attr('stroke', colors[i % colors.length])
        .attr('stroke-width', strokeWidth)
        .attr('opacity', opacity)
        .attr('marker-end', `url(#arrow-${i})`)

      svg.append('defs')
        .append('marker')
        .attr('id', `arrow-${i}`)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', colors[i % colors.length])

      svg.append('circle')
        .attr('cx', endX)
        .attr('cy', endY)
        .attr('r', isActive ? 5 : 3)
        .attr('fill', colors[i % colors.length])
        .attr('opacity', opacity)

      const norm = Math.sqrt(x * x + y * y)
      svg.append('text')
        .attr('x', endX + 10)
        .attr('y', endY - 10)
        .attr('fill', colors[i % colors.length])
        .attr('font-size', '12px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(`v${i} (${norm.toFixed(2)})`)
    })
  }

  const renderNorms = (
    svg: d3.Selection<SVGGElement, unknown, null, undefined>,
    vectors: number[][],
    step: LLLStep,
    width: number,
    height: number
  ) => {
    const norms = vectors.map((v) => 
      Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))
    )

    const xScale = d3.scaleBand()
      .domain(vectors.map((_, i) => `v${i}`))
      .range([0, width])
      .padding(0.3)

    const yScale = d3.scaleLinear()
      .domain([0, Math.max(...norms) * 1.1])
      .range([height, 0])

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')

    svg.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .selectAll('text')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-family', 'JetBrains Mono, monospace')

    svg.selectAll('.domain, .tick line')
      .attr('stroke', 'oklch(0.30 0.02 260)')

    const colors = [
      'oklch(0.75 0.15 200)',
      'oklch(0.65 0.18 145)',
      'oklch(0.70 0.20 280)',
      'oklch(0.75 0.18 60)'
    ]

    svg.selectAll('.bar')
      .data(norms)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (_, i) => xScale(`v${i}`) || 0)
      .attr('y', (d) => yScale(d))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => height - yScale(d))
      .attr('fill', (_, i) => {
        const isActive = i === step.k || (step.action === 'swap' && i === step.k - 1)
        return isActive ? 'oklch(0.75 0.15 200)' : colors[i % colors.length]
      })
      .attr('opacity', (_, i) => {
        const isActive = i === step.k || (step.action === 'swap' && i === step.k - 1)
        return isActive ? 1 : 0.7
      })
      .attr('rx', 4)

    svg.selectAll('.norm-label')
      .data(norms)
      .enter()
      .append('text')
      .attr('class', 'norm-label')
      .attr('x', (_, i) => (xScale(`v${i}`) || 0) + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d) - 5)
      .attr('text-anchor', 'middle')
      .attr('fill', 'oklch(0.95 0 0)')
      .attr('font-size', '11px')
      .attr('font-family', 'JetBrains Mono, monospace')
      .text((d) => d.toFixed(2))
  }

  const handleStepChange = (value: number[]) => {
    setCurrentStep(value[0])
    setIsPlaying(false)
  }

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const handleReset = () => {
    setCurrentStep(0)
    setIsPlaying(false)
  }

  const handleStepForward = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
    setIsPlaying(false)
  }

  const handleStepBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
    setIsPlaying(false)
  }

  if (steps.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="text-center py-12">
          <ArrowsClockwise size={48} className="mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold mb-2">No Visualization Data</h3>
          <p className="text-xs text-muted-foreground">
            Run an attack to see vector transformations
          </p>
        </div>
      </Card>
    )
  }

  const currentStepData = steps[currentStep]

  return (
    <Card className="p-6 bg-card border-border space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Vector Transformation</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {currentStepData.description}
          </p>
        </div>
        <Badge 
          variant="outline"
          className={
            currentStepData.action === 'swap' 
              ? 'border-accent text-accent'
              : currentStepData.action === 'reduce'
              ? 'border-success text-success'
              : 'border-muted-foreground text-muted-foreground'
          }
        >
          {currentStepData.action === 'swap' ? 'Swap' : currentStepData.action === 'reduce' ? 'Reduce' : 'Complete'}
        </Badge>
      </div>

      <svg
        ref={svgRef}
        className="w-full bg-secondary/30 rounded-lg border border-border"
        style={{ height: '400px' }}
      />

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Step {currentStep + 1} of {steps.length}</span>
            <span className="text-muted-foreground">Iteration {currentStepData.iteration}</span>
          </div>
          <Slider
            value={[currentStep]}
            onValueChange={handleStepChange}
            min={0}
            max={steps.length - 1}
            step={1}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={currentStep === 0}
            >
              <SkipBack size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStepBack}
              disabled={currentStep === 0}
            >
              <SkipBack size={16} weight="fill" />
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStepForward}
              disabled={currentStep === steps.length - 1}
            >
              <SkipForward size={16} weight="fill" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Speed:</span>
            <div className="flex gap-1">
              {[2000, 1000, 500, 250].map((speed) => (
                <Button
                  key={speed}
                  variant={playbackSpeed === speed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlaybackSpeed(speed)}
                  className="px-2 text-xs"
                >
                  {speed === 2000 ? '0.5x' : speed === 1000 ? '1x' : speed === 500 ? '2x' : '4x'}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
