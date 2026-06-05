"use client"
import { redirect } from "next/navigation"
import { useEffect, useState } from "react"

export default function NotFound() {
    const [timer, setTimer] = useState(4)
    useEffect(() => {
        if (timer > 0) {
            setTimeout(() => {
                setTimer(timer - 1)
            }, 1000)
        } else {
            setTimeout(() => {
                redirect("/")
            }, 1000)
        }
    }, [timer])

    return (
        <div className='w-full h-full flex items-center justify-center'>
            <h1 className=' text-xl sm:text-2xl md:text-3xl lg:text-4xl select-none text-center'>
                404 - Page Not Found <br />
                Redirecting in {timer}
            </h1>
        </div>
    )
}
