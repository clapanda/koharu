'use client'

import { keepPreviousData, type QueryClient, useQuery } from '@tanstack/react-query'

import { getBlob } from '@/lib/api/default/default'
import { convertToBlob } from '@/lib/io/blobConvert'

const blobQueryOptions = (hash: string) => ({
  queryKey: ['blob', hash] as const,
  queryFn: async () => {
    const blob = await getBlob(hash)
    const buf = await (blob as Blob).arrayBuffer()
    return new Uint8Array(buf)
  },
  staleTime: Infinity,
  gcTime: 10 * 60 * 1000,
  structuralSharing: false as const,
})

/** Fetch blob bytes by hash. Keeps previous data as placeholder while loading. */
export function useBlobData(hash: string | undefined): Uint8Array | undefined {
  const { data } = useQuery({
    ...blobQueryOptions(hash ?? ''),
    enabled: !!hash,
    placeholderData: keepPreviousData,
  })
  return hash ? data : undefined
}

const BLOB_IMAGE_QUERY_KEY = 'blobImage'

const blobImageQueryOptions = (hash: string) => ({
  queryKey: [BLOB_IMAGE_QUERY_KEY, hash] as const,
  queryFn: async () => {
    const response = await getBlob(hash)
    const buf = await (response as Blob).arrayBuffer()
    const bytes = new Uint8Array(buf)
    const blob = await convertToBlob(bytes)
    const url = URL.createObjectURL(blob)
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to preload sprite'))
        img.src = url
      })
      return url
    } catch (error) {
      URL.revokeObjectURL(url)
      throw error
    }
  },
  staleTime: Infinity,
  gcTime: 10 * 60 * 1000,
  structuralSharing: false as const,
})

/**
 * Fetch blob, convert to displayable format, and preload — returns a
 * ready-to-paint object URL. Keeps the previous URL while a new one loads.
 */
export function useBlobImage(hash: string | undefined) {
  return useQuery({
    ...blobImageQueryOptions(hash ?? ''),
    enabled: !!hash,
    placeholderData: keepPreviousData,
  })
}

/**
 * React Query drops cached `blobImage` strings after `gcTime`, but browser
 * object URLs hold native image memory until explicitly revoked. Wire this
 * once on the shared QueryClient so sprite URLs are released when their cache
 * entries are evicted.
 */
export function installBlobImageUrlCleanup(queryClient: QueryClient): void {
  if (typeof window === 'undefined') return
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'removed') return
    const [kind] = event.query.queryKey
    if (kind !== BLOB_IMAGE_QUERY_KEY) return
    const data = event.query.state.data
    if (typeof data === 'string') URL.revokeObjectURL(data)
  })
}
