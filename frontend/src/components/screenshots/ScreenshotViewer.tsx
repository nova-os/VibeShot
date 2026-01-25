import { useEffect, useState } from 'react'
import { api, Screenshot, ScreenshotErrorsResponse, TestResultsResponse, JsError, NetworkError, TestResult } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateTime, formatFileSize, cn } from '@/lib/utils'

const VIEWPORT_ICONS: Record<string, string> = {
  mobile: 'smartphone',
  tablet: 'tablet',
  desktop: 'desktop_windows',
}

interface ScreenshotViewerProps {
  screenshotId: number
  onClose: () => void
}

export function ScreenshotViewer({ screenshotId, onClose }: ScreenshotViewerProps) {
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const [errorsData, setErrorsData] = useState<ScreenshotErrorsResponse | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [loadingErrors, setLoadingErrors] = useState(false)
  const [testResultsData, setTestResultsData] = useState<TestResultsResponse | null>(null)
  const [showTestResults, setShowTestResults] = useState(false)
  const [loadingTestResults, setLoadingTestResults] = useState(false)

  const totalErrors = Number(screenshot?.js_error_count || 0) + Number(screenshot?.network_error_count || 0)

  useEffect(() => {
    const loadScreenshot = async () => {
      try {
        const data = await api.getScreenshot(screenshotId)
        setScreenshot(data)
        // Show scroll hint for tall images
        if (data.height > data.width * 2) {
          setShowScrollHint(true)
          setTimeout(() => setShowScrollHint(false), 3000)
        }
      } catch (error) {
        console.error('Failed to load screenshot:', error)
      }
    }
    loadScreenshot()
  }, [screenshotId])

  // Load errors when panel is opened
  useEffect(() => {
    if (showErrors && !errorsData && !loadingErrors) {
      setLoadingErrors(true)
      api.getScreenshotErrors(screenshotId)
        .then(data => setErrorsData(data))
        .catch(err => console.error('Failed to load errors:', err))
        .finally(() => setLoadingErrors(false))
    }
  }, [showErrors, errorsData, screenshotId, loadingErrors])

  // Load test results when panel is opened
  useEffect(() => {
    if (showTestResults && !testResultsData && !loadingTestResults) {
      setLoadingTestResults(true)
      api.getScreenshotTestResults(screenshotId)
        .then(data => setTestResultsData(data))
        .catch(err => console.error('Failed to load test results:', err))
        .finally(() => setLoadingTestResults(false))
    }
  }, [showTestResults, testResultsData, screenshotId, loadingTestResults])

  // Load test results automatically on mount to get counts
  useEffect(() => {
    api.getScreenshotTestResults(screenshotId)
      .then(data => setTestResultsData(data))
      .catch(() => {}) // Silently fail - may not have any tests
  }, [screenshotId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showErrors) {
          setShowErrors(false)
        } else if (showTestResults) {
          setShowTestResults(false)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, showErrors, showTestResults])

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {screenshot?.viewport && (
            <Badge variant="default" className="capitalize">
              <span className="material-symbols-outlined text-sm mr-1">
                {VIEWPORT_ICONS[screenshot.viewport]}
              </span>
              {screenshot.viewport}
              {screenshot.viewport_width && ` (${screenshot.viewport_width}px)`}
            </Badge>
          )}
          {screenshot && (
            <>
              <span>{formatDateTime(screenshot.created_at)}</span>
              <span>{formatFileSize(screenshot.file_size)}</span>
              <span>{screenshot.width}×{screenshot.height}</span>
            </>
          )}
          
          {/* Error indicator button */}
          {totalErrors > 0 && (
            <Button
              variant={showErrors ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowErrors(!showErrors)
                if (!showErrors) setShowTestResults(false)
              }}
              className="gap-2"
            >
              <Icon name="warning" size="sm" />
              {totalErrors} Error{totalErrors !== 1 ? 's' : ''}
            </Button>
          )}
          
          {/* Test results indicator button */}
          {testResultsData && testResultsData.summary.total > 0 && (
            <Button
              variant={showTestResults ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowTestResults(!showTestResults)
                if (!showTestResults) setShowErrors(false)
              }}
              className={cn(
                "gap-2",
                testResultsData.summary.failed > 0 && !showTestResults && "border-destructive text-destructive hover:bg-destructive/10",
                testResultsData.summary.failed === 0 && !showTestResults && "border-green-500 text-green-500 hover:bg-green-500/10"
              )}
            >
              <Icon name={testResultsData.summary.failed > 0 ? "cancel" : "check_circle"} size="sm" />
              {testResultsData.summary.passed}/{testResultsData.summary.total} Tests
            </Button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Image */}
        <ScrollArea className={cn("flex-1 transition-all", (showErrors || showTestResults) && "flex-[2]")}>
          <div className="p-6 flex justify-center">
            <img
              src={api.getScreenshotImageUrl(screenshotId)}
              alt="Screenshot"
              className="max-w-full w-auto max-w-[1200px] rounded-lg shadow-2xl"
            />
          </div>
        </ScrollArea>

        {/* Errors Panel */}
        {showErrors && (
          <div className="w-[400px] border-l border-border bg-background/80 backdrop-blur flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold">Captured Errors</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowErrors(false)}>
                <Icon name="close" size="sm" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {loadingErrors ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon name="progress_activity" className="animate-spin mr-2" />
                    Loading errors...
                  </div>
                ) : errorsData ? (
                  <>
                    {/* JS Errors */}
                    {errorsData.jsErrors.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
                          <Icon name="code_off" size="sm" />
                          JavaScript Errors ({errorsData.jsErrors.length})
                        </h4>
                        <div className="space-y-4">
                          {errorsData.jsErrors.map((error: JsError) => (
                            <ErrorCard key={error.id} error={error} type="js" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Network Errors */}
                    {errorsData.networkErrors.length > 0 && (
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-medium text-orange-500 mb-2">
                          <Icon name="cloud_off" size="sm" />
                          Network Errors ({errorsData.networkErrors.length})
                        </h4>
                        <div className="space-y-4">
                          {errorsData.networkErrors.map((error: NetworkError) => (
                            <ErrorCard key={error.id} error={error} type="network" />
                          ))}
                        </div>
                      </div>
                    )}

                    {errorsData.totalErrors === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        No errors captured
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* Test Results Panel */}
        {showTestResults && (
          <div className="w-[400px] border-l border-border bg-background/80 backdrop-blur flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold">Test Results</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowTestResults(false)}>
                <Icon name="close" size="sm" />
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">
                {loadingTestResults ? (
                  <div className="flex items-center justify-center py-8">
                    <Icon name="progress_activity" className="animate-spin mr-2" />
                    Loading test results...
                  </div>
                ) : testResultsData ? (
                  <>
                    {/* Summary */}
                    <div className="flex items-center gap-4 p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-2 text-green-500">
                        <Icon name="check_circle" size="sm" />
                        <span className="font-semibold">{testResultsData.summary.passed} Passed</span>
                      </div>
                      {testResultsData.summary.failed > 0 && (
                        <div className="flex items-center gap-2 text-destructive">
                          <Icon name="cancel" size="sm" />
                          <span className="font-semibold">{testResultsData.summary.failed} Failed</span>
                        </div>
                      )}
                    </div>

                    {/* Test Results */}
                    <div className="space-y-3">
                      {testResultsData.testResults.map((result: TestResult) => (
                        <TestResultCard key={result.id} result={result} />
                      ))}
                    </div>

                    {testResultsData.summary.total === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        No tests were run for this screenshot
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scroll Hint */}
      {showScrollHint && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-muted/80 backdrop-blur px-4 py-2 rounded-md text-sm text-muted-foreground animate-pulse">
          <Icon name="keyboard_arrow_down" size="sm" className="inline" /> Scroll to see more
        </div>
      )}
    </div>
  )
}

interface ErrorCardProps {
  error: JsError | NetworkError
  type: 'js' | 'network'
}

function ErrorCard({ error, type }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(false)
  
  if (type === 'js') {
    const jsError = error as JsError
    return (
      <div 
        className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm cursor-pointer hover:bg-destructive/15 overflow-hidden"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="font-mono text-destructive break-all">{jsError.message}</div>
        {jsError.source && (
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {jsError.source}
            {jsError.lineNumber && `:${jsError.lineNumber}`}
            {jsError.columnNumber && `:${jsError.columnNumber}`}
          </div>
        )}
        {expanded && jsError.stack && (
          <div className="mt-2 overflow-x-auto scrollbar-thin scrollbar-thumb-border">
            <pre className="text-xs text-muted-foreground whitespace-pre bg-black/20 p-2 rounded w-fit">
              {jsError.stack}
            </pre>
          </div>
        )}
      </div>
    )
  }
  
  const networkError = error as NetworkError
  return (
    <div 
      className="bg-orange-500/10 border border-orange-500/20 rounded-md p-3 text-sm cursor-pointer hover:bg-orange-500/15"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        {networkError.statusCode && (
          <Badge variant="outline" className={cn(
            "text-xs",
            networkError.statusCode >= 500 ? "border-red-500 text-red-500" : "border-orange-500 text-orange-500"
          )}>
            {networkError.statusCode}
          </Badge>
        )}
        <span className="font-mono text-orange-600 dark:text-orange-400">{networkError.message}</span>
      </div>
      {networkError.requestUrl && (
        <div className={cn("text-xs text-muted-foreground mt-1", expanded ? "break-all" : "truncate")}>
          {networkError.requestMethod && <span className="font-semibold">{networkError.requestMethod} </span>}
          {networkError.requestUrl}
        </div>
      )}
      {networkError.resourceType && (
        <div className="text-xs text-muted-foreground mt-0.5">
          Resource: {networkError.resourceType}
        </div>
      )}
    </div>
  )
}

interface TestResultCardProps {
  result: TestResult
}

function TestResultCard({ result }: TestResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div 
      className={cn(
        "rounded-md p-3 text-sm cursor-pointer transition-colors",
        result.passed 
          ? "bg-green-500/10 border border-green-500/20 hover:bg-green-500/15" 
          : "bg-destructive/10 border border-destructive/20 hover:bg-destructive/15"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <Icon 
          name={result.passed ? "check_circle" : "cancel"} 
          size="sm" 
          className={result.passed ? "text-green-500" : "text-destructive"} 
        />
        <span className="font-medium">{result.testName}</span>
        {result.executionTimeMs !== null && (
          <span className="text-xs text-muted-foreground ml-auto">
            {result.executionTimeMs}ms
          </span>
        )}
      </div>
      
      {result.message && (
        <div className={cn(
          "mt-2 text-sm",
          result.passed ? "text-green-600 dark:text-green-400" : "text-destructive"
        )}>
          {result.message}
        </div>
      )}
      
      {expanded && result.testPrompt && (
        <div className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">
          <span className="font-medium">Test: </span>
          {result.testPrompt}
        </div>
      )}
    </div>
  )
}
