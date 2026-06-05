'use client'

import { RefObject, useEffect, useRef, useCallback } from 'react'

export default function useOutsideClick<T extends HTMLElement>(
    ref: RefObject<T | null>,                 // accepts null safely
    onOutsideClick: () => void,
    enabled: boolean = true
): () => void {
    const cbRef = useRef(onOutsideClick)
    cbRef.current = onOutsideClick

    const handlerRef = useRef<(e: Event) => void | null>(null)

    const remove = useCallback(() => {
        if (handlerRef.current) {
            document.removeEventListener('pointerdown', handlerRef.current as EventListener)
            handlerRef.current = null
        }
    }, [])

    useEffect(() => {
        if (!enabled || !ref?.current) {
            remove()
            return
        }

        const handlePointerDown = (event: Event) => {
            const target = event.target
            if (!(target instanceof Node)) return
            if (!ref.current) return
            if (ref.current.contains(target)) return
            cbRef.current()
        }

        handlerRef.current = handlePointerDown
        document.addEventListener('pointerdown', handlePointerDown)

        return () => remove()
    }, [ref, enabled, remove])

    return remove
}
