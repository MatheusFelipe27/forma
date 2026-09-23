import { useCallback, useEffect, useRef, useState } from 'react'

type AsyncState<T> = {
  data: T | null
  loading: boolean
  error: unknown
}

export function useAsync<T>(run: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  const runRef = useRef(run)
  runRef.current = run

  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const data = await runRef.current()

      if (mounted.current) {
        setState({ data, loading: false, error: null })
      }

      return data
    } catch (error) {
      if (mounted.current) {
        setState((current) => ({ ...current, loading: false, error }))
      }

      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...state, reload }
}
