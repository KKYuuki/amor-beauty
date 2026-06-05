import { Metadata } from "next"
import ProfilePageClient from "./profilePage"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/utils/auth/permissions"
import { getArtistProfile, getProfile } from "@/server/actions/profile"
import { getUserPaymentMethods } from "@/server/actions/payment-methods"

export const metadata: Metadata = {
    title: "Profile",
    description: "Profile Page",
}

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
    const currentUser = await getCurrentUser()
    
    if (!currentUser) {
        redirect("/auth?returnTo=/profile")
    }

    const userProfile = await getProfile(currentUser.id)
    
    if (!userProfile) {
        redirect("/auth?returnTo=/profile")
    }

    const artistProfile = userProfile.access_flags?.includes("artist") 
        ? await getArtistProfile(userProfile.id)
        : null
    
    const paymentMethodsResult = await getUserPaymentMethods(userProfile.id)

    return (
        <div className='w-full h-max flex flex-col gap-4'>
            <h1 className='font-semibold text-3xl'>Profile</h1>
            <ProfilePageClient
                initialUserProfile={userProfile}
                initialArtistProfile={artistProfile}
                initialUserImages={[]}
                initialPaymentMethods={paymentMethodsResult.success ? paymentMethodsResult.data.methods : []}
            />
        </div>
    )
}
