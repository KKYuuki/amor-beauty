import { Metadata } from "next"
import authBg from "@/assets/auth.webp"
import Image from "next/image"
import SignIn from "@/components/auth/SignIn"
import logo from '@/public/icon.svg'
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/utils/auth/permissions"

export const metadata: Metadata = {
    title: "Auth",
    description: "Authentication Page",
}

export const dynamic = 'force-dynamic'

export default async function AuthPage() {
    const user = await getCurrentUser()
    
    // Redirect to home if already authenticated
    if (user) {
        redirect("/")
    }

    return (
        <div className='w-full h-full flex flex-col gap-4 relative pl-1'>
            <div className='flex-1 flex items-center justify-center px-4'>
                <SignIn />
            </div>
            <Image 
                src={logo} 
                alt='' 
                loading="eager" 
                className="absolute bottom-4 right-4 w-auto h-12" 
            />
            <div className='absolute w-full h-full top-1/2 left-1/2 -translate-1/2 -z-[1] bg-gradient-to-tr from-black to-black/30 from-40%'></div>
            <Image
                src={authBg}
                alt=''
                className='absolute w-full h-full -z-[2] top-1/2 left-1/2 -translate-1/2 rounded-md object-cover object-center'
                loading={"eager"}
            />
        </div>
    )
}
