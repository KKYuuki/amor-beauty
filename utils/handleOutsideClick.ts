'use client'

export default function HandleOutsideClick(
    node: HTMLElement,
    closeModal: () => void
) {
    function handleOutsideClick(event: MouseEvent) {
        if (!(event.target instanceof Node)) {
            return
        }
        if (node && !node.contains(event.target)) {
            closeModal()
            document.removeEventListener(
                "click",
                handleOutsideClick
            )
        }
    }

    document.addEventListener(
        "click",
        handleOutsideClick
    )

    return () => {
        document.removeEventListener(
            "click",
            handleOutsideClick
        )
    }
}