"use client"

import { UserProfile } from "@/utils/types/auth"
import { useContext, useState, useCallback, useEffect, useRef } from "react"
import {
    getArtistProfile,
    getProfile,
    updateArtistProfile,
    updateProfile,
    uploadProfileImage as uploadProfileImageAction,
} from "@/server/actions/profile"
import {
    getUserImages,
    deleteUserImage,
} from "@/server/actions/storage"
import { PencilLineIcon, SaveIcon, UserRoundIcon } from "lucide-react"
import {
    getUserPaymentMethods,
    createPaymentMethod,
    updatePaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
} from "@/server/actions/payment-methods"
import { UserPaymentMethod } from "@/utils/types/payroll"
import { CreditCardIcon, Trash2Icon, StarIcon, PlusIcon } from "lucide-react"
import { NotificationContext } from "@/components/notifications"
import { ArtistProfile } from "@/utils/types/general"
import Image from "next/image"
async function uploadProfileImage(file: File, userId: string): Promise<boolean | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('userId', userId)
    return uploadProfileImageAction(formData)
}
import { AnimatePresence, motion } from "motion/react"
import { ImageUploader } from "@/components/draganddrop"
import { SideBarContext } from "@/components/sidebar"
import { Image as ImageType } from "@/utils/types/storage"
import { CheckIcon, XIcon } from "lucide-react"
import PasskeyManager from "@/components/profile/PasskeyManager"

interface ProfilePageClientProps {
    initialUserProfile: UserProfile
    initialArtistProfile: ArtistProfile | null
    initialUserImages: ImageType[]
    initialPaymentMethods: UserPaymentMethod[]
}

export default function ProfilePageClient({
    initialUserProfile,
    initialArtistProfile,
    initialUserImages,
    initialPaymentMethods,
}: ProfilePageClientProps) {
    // Context
    const { addNotification } = useContext(NotificationContext)
    const { updateSidebar } = useContext(SideBarContext)

    // State
    const [userInfo, setUserInfo] = useState({
        ...initialUserProfile,
    } as UserProfile)

    const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(
        initialArtistProfile
    )
    const [userImages, setUserImages] = useState<ImageType[]>(initialUserImages)
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false)

    const [isEditProfile, setIsEditProfile] = useState(false)
    const [editImageModal, setEditImageModal] = useState(false)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
    const [avatarVersion, setAvatarVersion] = useState(0)

    // Ref for avoiding stale closures in callbacks
    const userInfoRef = useRef(userInfo)
    userInfoRef.current = userInfo

    // Effect to create and cleanup object URL for image preview
    useEffect(() => {
        if (imageFile) {
            const url = URL.createObjectURL(imageFile)
            setImagePreviewUrl(url)
            return () => URL.revokeObjectURL(url)
        }
        setImagePreviewUrl(null)
    }, [imageFile])

    // Payment methods state
    const [paymentMethods, setPaymentMethods] = useState<UserPaymentMethod[]>(initialPaymentMethods)
    const [showPaymentModal, setShowPaymentModal] = useState(false)
    const [editingPaymentMethod, setEditingPaymentMethod] = useState<UserPaymentMethod | null>(null)
    const [paymentFormData, setPaymentFormData] = useState<{
        type: 'CASH' | 'GCASH' | 'MAYA' | 'PAYMAYA' | 'BANK_TRANSFER'
        provider: string
        account_name: string
        account_number: string
        is_default: boolean
    }>({
        type: 'GCASH',
        provider: '',
        account_name: '',
        account_number: '',
        is_default: false,
    })

    // Handlers/Functions
    const fetchProfile = useCallback(async () => {
        const currentUserInfo = userInfoRef.current
        const freshProfile = await getProfile(currentUserInfo.id)
        if (freshProfile) {
            setUserInfo(freshProfile)
        }

        if (currentUserInfo.access_flags?.includes("artist")) {
            const artistData = await getArtistProfile(currentUserInfo.id)
            if (artistData) {
                setArtistProfile(artistData)
            } else {
                // Initialize empty if not found but has flag
                setArtistProfile({ id: currentUserInfo.id, bio: "", tags: "" })
            }

            // Fetch User Images using new action
            const imagesRes = await getUserImages(currentUserInfo.id)
            if (imagesRes.success) {
                setUserImages(imagesRes.data as unknown as ImageType[])
            }
        }
    }, [])

    async function editProfile() {
        const res = await updateProfile({
            userId: userInfo.id,
            profile: userInfo,
        })

        if (userInfo.access_flags?.includes("artist") && artistProfile) {
            await updateArtistProfile(userInfo.id, artistProfile)
        }

        if (!res) {
            addNotification("Error updating profile", "ERROR")
        }
        addNotification(
            "Profile updated successfully (refresh may be required)",
            "SUCCESS",
            "Profile Updated"
        )
        updateSidebar()
        setIsEditProfile(false)
    }

    // Render
    return (
        <>
            <AnimatePresence>
                {editImageModal && (
                    <motion.div
                        key='image-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed top-1/2 left-1/2 -translate-1/2 bg-card backdrop-blur-lg border-2 border-border rounded-md flex flex-col gap-2 p-4 w-full max-w-[calc(100svw-2rem)] md:max-w-2xl items-center'
                    >
                        <h1 className='font-semibold text-2xl'>
                            Change Profile Image
                        </h1>
                        {!imageFile ? (
                            <ImageUploader
                                onFileSelect={setImageFile}
                                accept='image/png, image/jpeg, image/jpg'
                                squareOnly
                            />
                        ) : (
                            <Image
                                src={imagePreviewUrl || ''}
                                alt='Profile Picture'
                                width={400}
                                height={400}
                                className='w-full max-w-1/2 md:max-w-48 h-auto aspect-square rounded-full'
                            />
                        )}
                        <div className='grid grid-cols-2 gap-2 w-full'>
                            <button
                                type='button'
                                className='w-full bg-card rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-muted active:bg-muted border-2 border-border font-semibold'
                                onClick={() => {
                                    setEditImageModal(false)
                                    setImageFile(null)
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type='button'
                                className='w-full bg-card rounded-md px-2 py-1 cursor-pointer transition-colors hover:bg-muted active:bg-muted border-2 border-border font-semibold'
                                onClick={async () => {
                                    if (!imageFile) {
                                        addNotification(
                                            "Please select an image",
                                            "WARNING"
                                        )
                                        return
                                    }
                                    const res = await uploadProfileImage(
                                        imageFile,
                                        userInfo.id
                                    )
                                    if (!res) {
                                        addNotification(
                                            "Error uploading image",
                                            "ERROR"
                                        )
                                        return
                                    }
                                    await fetchProfile()
                                    // Increment avatar version to force image refresh
                                    setAvatarVersion(v => v + 1)
                                    addNotification(
                                        "Image uploaded successfully",
                                        "SUCCESS"
                                    )
                                    updateSidebar()
                                    setEditImageModal(false)
                                    setImageFile(null)
                                }}
                            >
                                Upload
                            </button>
                        </div>
                    </motion.div>
                )}
                {isPhotoModalOpen && (
                    <motion.div
                        key='photo-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm p-4'
                        onClick={() => setIsPhotoModalOpen(false)}
                    >
                        <div
                            className='bg-black/80 border-2 border-border rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden'
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className='p-4 border-b border-border flex justify-between items-center'>
                                <h2 className='text-xl font-semibold'>
                                    Select Photos
                                </h2>
                                <button
                                    onClick={() => setIsPhotoModalOpen(false)}
                                    className='p-1 hover:bg-muted rounded-full transition-colors'
                                >
                                    <XIcon size={24} />
                                </button>
                            </div>
                            <div className='p-4 overflow-y-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                                {userImages
                                    .filter(
                                        (img) => !img.is_3d && !img.is_website
                                    )
                                    .map((img) => {
                                        const isSelected =
                                            artistProfile?.photos?.includes(
                                                img.id
                                            )
                                        return (
                                            <div
                                                key={img.id}
                                                className={`relative aspect-square cursor-pointer group rounded-md overflow-hidden border-2 transition-all ${isSelected ? "border-green-500" : "border-transparent hover:border-border0"}`}
                                                onClick={() => {
                                                    setArtistProfile((prev) => {
                                                        if (!prev) return null
                                                        const currentPhotos =
                                                            prev.photos || []

                                                        if (isSelected) {
                                                            return {
                                                                ...prev,
                                                                photos: currentPhotos.filter(
                                                                    (id) =>
                                                                        id !==
                                                                        img.id
                                                                ),
                                                            }
                                                        } else {
                                                            if (
                                                                currentPhotos.length >=
                                                                5
                                                            ) {
                                                                addNotification(
                                                                    "You can only select up to 5 photos",
                                                                    "WARNING"
                                                                )
                                                                return prev
                                                            }
                                                            return {
                                                                ...prev,
                                                                photos: [
                                                                    ...currentPhotos,
                                                                    img.id,
                                                                ],
                                                            }
                                                        }
                                                    })
                                                }}
                                            >
                                                <Image
                                                    src={img.url}
                                                    alt={img.name}
                                                    fill
                                                    className='object-cover'
                                                    sizes='(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw'
                                                />
                                                {isSelected && (
                                                    <div className='absolute top-2 right-2 bg-green-500 rounded-full p-1'>
                                                        <CheckIcon
                                                            size={16}
                                                            className='text-foreground'
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                            </div>
                            <div className='p-4 border-t border-border flex justify-end'>
                                <button
                                    className='bg-white text-black font-semibold px-4 py-2 rounded-md hover:bg-white/90 transition-colors'
                                    onClick={() => setIsPhotoModalOpen(false)}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
                {showPaymentModal && (
                    <motion.div
                        key='payment-modal'
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4'
                        onClick={() => setShowPaymentModal(false)}
                    >
                        <div
                            className='bg-black/90 border-2 border-border rounded-lg w-full max-w-md flex flex-col overflow-hidden'
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className='p-4 border-b border-border flex justify-between items-center'>
                                <h2 className='text-xl font-semibold'>
                                    {editingPaymentMethod ? 'Edit Payment Method' : 'Add Payment Method'}
                                </h2>
                                <button
                                    onClick={() => setShowPaymentModal(false)}
                                    className='p-1 hover:bg-muted rounded-full transition-colors'
                                >
                                    <XIcon size={24} />
                                </button>
                            </div>
                            <div className='p-4 flex flex-col gap-4'>
                                <div className='flex flex-col gap-1'>
                                    <label className='text-sm text-muted-foreground'>Type</label>
                                    <select
                                        value={paymentFormData.type}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, type: e.target.value as 'CASH' | 'GCASH' | 'MAYA' | 'PAYMAYA' | 'BANK_TRANSFER' })}
                                        className='bg-card border border-border rounded-md px-3 py-2 text-foreground'
                                    >
                                        <option value='GCASH'>GCash</option>
                                        <option value='MAYA'>Maya</option>
                                        <option value='PAYMAYA'>Paymaya</option>
                                        <option value='BANK_TRANSFER'>Bank Transfer</option>
                                        <option value='CASH'>Cash</option>
                                    </select>
                                </div>
                                <div className='flex flex-col gap-1'>
                                    <label className='text-sm text-muted-foreground'>Provider / Bank Name</label>
                                    <input
                                        type='text'
                                        value={paymentFormData.provider}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, provider: e.target.value })}
                                        placeholder='e.g., BDO, BPI, UnionBank'
                                        className='bg-card border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/70'
                                    />
                                </div>
                                <div className='flex flex-col gap-1'>
                                    <label className='text-sm text-muted-foreground'>Account Name</label>
                                    <input
                                        type='text'
                                        value={paymentFormData.account_name}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, account_name: e.target.value })}
                                        placeholder='Full name on account'
                                        className='bg-card border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/70'
                                    />
                                </div>
                                <div className='flex flex-col gap-1'>
                                    <label className='text-sm text-muted-foreground'>Account Number</label>
                                    <input
                                        type='text'
                                        value={paymentFormData.account_number}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, account_number: e.target.value })}
                                        placeholder='Account or mobile number'
                                        className='bg-card border border-border rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/70'
                                    />
                                </div>
                                <label className='flex items-center gap-2 cursor-pointer'>
                                    <input
                                        type='checkbox'
                                        checked={paymentFormData.is_default}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, is_default: e.target.checked })}
                                        className='w-4 h-4 rounded border-border bg-card text-blue-500 focus:ring-blue-500'
                                    />
                                    <span className='text-sm'>Set as default payment method</span>
                                </label>
                            </div>
                            <div className='p-4 border-t border-border flex justify-end gap-2'>
                                <button
                                    type='button'
                                    className='px-4 py-2 bg-card hover:bg-muted rounded-md transition-colors'
                                    onClick={() => setShowPaymentModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type='button'
                                    className='px-4 py-2 bg-white text-black font-semibold rounded-md hover:bg-white/90 transition-colors'
                                    onClick={async () => {
                                        if (editingPaymentMethod) {
                                            const res = await updatePaymentMethod(
                                                editingPaymentMethod.id,
                                                userInfo.id,
                                                paymentFormData
                                            )
                                            if (res.success) {
                                                const methodsRes = await getUserPaymentMethods(userInfo.id)
                                                if (methodsRes.success) {
                                                    setPaymentMethods(methodsRes.data.methods)
                                                }
                                                addNotification('Payment method updated', 'SUCCESS')
                                                setShowPaymentModal(false)
                                            } else {
                                                addNotification(res.error || 'Failed to update', 'ERROR')
                                            }
                                        } else {
                                            const res = await createPaymentMethod(userInfo.id, {
                                                user_id: userInfo.id,
                                                ...paymentFormData
                                            })
                                            if (res.success) {
                                                const methodsRes = await getUserPaymentMethods(userInfo.id)
                                                if (methodsRes.success) {
                                                    setPaymentMethods(methodsRes.data.methods)
                                                }
                                                addNotification('Payment method added', 'SUCCESS')
                                                setShowPaymentModal(false)
                                            } else {
                                                addNotification(res.error || 'Failed to create', 'ERROR')
                                            }
                                        }
                                    }}
                                >
                                    {editingPaymentMethod ? 'Save Changes' : 'Add Method'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            <div className='w-full flex gap-2 flex-col md:flex-row md:gap-4 items-center'>
                <div className='w-full max-w-1/2 md:max-w-48 h-auto aspect-square rounded-full flex items-center justify-center bg-card border-2 border-border overflow-clip'>
                    {userInfo.avatar_url ? (
                        <Image
                            src={`${userInfo.avatar_url}${userInfo.avatar_url.includes('?') ? '&' : '?'}v=${avatarVersion}`}
                            alt='Profile Picture'
                            width={400}
                            height={400}
                            className='w-full h-full rounded-full object-cover object-center'
                            loading={"eager"}
                            unoptimized
                        />
                    ) : (
                        <UserRoundIcon size={48} />
                    )}
                </div>
                <div className='w-full flex flex-col gap-2'>
                    <div className='flex flex-row gap-2'>
                        <button
                            className='bg-card border-2 border-border rounded-md py-1 px-2 cursor-pointer transition-colors hover:bg-muted active:bg-muted font-semibold'
                            type='button'
                            onClick={() => setEditImageModal(true)}
                        >
                            Upload Photo
                        </button>
                        {userInfo.avatar_url && (
                            <button
                                className='bg-red-300/30 hover:bg-red-300/50 active:hover:bg-red-300/80 cursor-pointer transition-colors border-2 border-border rounded-md py-1 px-2 font-semibold'
                                type='button'
                                onClick={async () => {
                                    // Extract image ID from URL
                                    const urlParts = userInfo.avatar_url?.split('/')
                                    const imageId = urlParts?.[urlParts.length - 1]?.split('.')[0]
                                    
                                    if (imageId) {
                                        await deleteUserImage(imageId, userInfo.id)
                                    }
                                    
                                    await fetchProfile()
                                    addNotification(
                                        "Profile image deleted successfully",
                                        "SUCCESS",
                                        "Profile Image Deleted"
                                    )
                                    setTimeout(() => {
                                        updateSidebar()
                                    }, 100)
                                }}
                            >
                                Remove Photo
                            </button>
                        )}
                    </div>
                    <div className='text-muted-foreground'>
                        At least a 1:1 ratio is recommended, preferably a
                        square. <br />
                        PNG or JPEG files are accepted.
                    </div>
                </div>
            </div>
            <div className='w-full bg-card border-2 border-border rounded-lg p-4 flex flex-col gap-2'>
                <div className='w-full flex flex-row gap-2 justify-between font-semibold text-lg md:text-xl items-start'>
                    Personal Information{" "}
                    {isEditProfile ? (
                        <button
                            type='button'
                            className='flex flex-row gap-1 items-center border-2 border-border px-3 py-1 font-semibold text-sm rounded-md cursor-pointer transition-colors w-max bg-green-300/30 hover:bg-green-300/50 active:hover:bg-green-300/80'
                            onClick={editProfile}
                        >
                            <SaveIcon size={18} />
                            Save
                        </button>
                    ) : (
                        <button
                            type='button'
                            className='flex flex-row gap-1 items-center border-2 border-border px-3 py-1 font-semibold text-sm rounded-md cursor-pointer transition-colors bg-card hover:bg-muted active:bg-muted'
                            onClick={() => setIsEditProfile(!isEditProfile)}
                        >
                            <PencilLineIcon size={18} />
                            Edit
                        </button>
                    )}
                </div>
                <div className='w-full gap-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4'>
                    <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                        Full Name
                        {isEditProfile ? (
                            <input
                                type='text'
                                aria-label='Full Name'
                                value={userInfo.full_name}
                                onChange={(e) =>
                                    setUserInfo({
                                        ...userInfo,
                                        full_name: e.target.value,
                                    })
                                }
                                className='text-foreground text-base font-semibold bg-card rounded-md py-1 px-2'
                            />
                        ) : (
                            <span className='text-foreground text-base font-semibold py-1 px-2'>
                                {userInfo.full_name}
                            </span>
                        )}
                    </div>
                    <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                        Email
                        <span className='text-foreground text-base font-semibold py-1 px-2'>
                            {userInfo.email}
                        </span>
                    </div>
                    <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                        Phone Number
                        {isEditProfile ? (
                            <input
                                type='text'
                                aria-label='phone_number'
                                placeholder='09123456789'
                                value={userInfo.phone_number || ""}
                                onChange={(e) =>
                                    setUserInfo({
                                        ...userInfo,
                                        phone_number: e.target.value,
                                    })
                                }
                                className='text-foreground text-base font-semibold bg-card rounded-md py-1 px-2'
                            />
                        ) : (
                            <span className='text-foreground text-base font-semibold py-1 px-2'>
                                {userInfo.phone_number || "-"}
                            </span>
                        )}
                    </div>
                    <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                        Instagram Handle
                        {isEditProfile ? (
                            <input
                                type='text'
                                aria-label='Instagram Handle'
                                placeholder='@username'
                                value={userInfo.instagram_handle || ""}
                                onChange={(e) =>
                                    setUserInfo({
                                        ...userInfo,
                                        instagram_handle: e.target.value,
                                    })
                                }
                                className='text-foreground text-base font-semibold bg-card rounded-md py-1 px-2'
                            />
                        ) : (
                            <a
                                href={`https://instagram.com/${userInfo.instagram_handle?.replaceAll(
                                    "@",
                                    ""
                                )}`}
                                className='text-foreground text-base font-semibold py-1 px-2'
                            >
                                {userInfo.instagram_handle
                                    ? userInfo.instagram_handle?.includes("@")
                                        ? userInfo.instagram_handle
                                        : `@${userInfo.instagram_handle}`
                                    : "-"}
                            </a>
                        )}
                    </div>
                </div>
            </div>

            <PasskeyManager />

            {/* Payment Methods Section */}
            <div className='w-full bg-card border-2 border-border rounded-lg p-4 flex flex-col gap-2'>
                <div className='w-full flex flex-row gap-2 justify-between font-semibold text-lg md:text-xl items-start'>
                    Payment Methods
                    <button
                        type='button'
                        className='flex flex-row gap-1 items-center border-2 border-border px-3 py-1 font-semibold text-sm rounded-md cursor-pointer transition-colors bg-card hover:bg-muted active:bg-muted'
                        onClick={() => {
                            setEditingPaymentMethod(null)
                            setPaymentFormData({
                                type: 'GCASH',
                                provider: '',
                                account_name: '',
                                account_number: '',
                                is_default: false,
                            })
                            setShowPaymentModal(true)
                        }}
                    >
                        <PlusIcon size={18} />
                        Add Method
                    </button>
                </div>
                <div className='w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2'>
                    {paymentMethods.length === 0 ? (
                        <div className='col-span-full text-center py-8 text-muted-foreground'>
                            <CreditCardIcon className='mx-auto mb-2' size={32} />
                            <p>No payment methods added yet</p>
                            <p className='text-sm'>Add a payment method to receive payouts</p>
                        </div>
                    ) : (
                        paymentMethods.map((method) => (
                            <div
                                key={method.id}
                                className={`relative bg-muted border-2 ${method.is_default ? 'border-yellow-500/50' : 'border-border'} rounded-lg p-4 flex flex-col gap-2`}
                            >
                                {method.is_default && (
                                    <div className='absolute top-2 right-2 text-yellow-500'>
                                        <StarIcon size={16} fill='currentColor' />
                                    </div>
                                )}
                                <div className='flex items-center gap-2'>
                                    <CreditCardIcon size={20} className='text-muted-foreground' />
                                    <span className='font-semibold'>{method.type}</span>
                                </div>
                                {method.provider && (
                                    <div className='text-sm text-muted-foreground'>
                                        Provider: <span className='text-foreground'>{method.provider}</span>
                                    </div>
                                )}
                                {method.account_name && (
                                    <div className='text-sm text-muted-foreground'>
                                        Name: <span className='text-foreground'>{method.account_name}</span>
                                    </div>
                                )}
                                {method.account_number && (
                                    <div className='text-sm text-muted-foreground'>
                                        Account: <span className='text-foreground'>{method.account_number}</span>
                                    </div>
                                )}
                                <div className='flex flex-wrap gap-2 mt-2'>
                                    {!method.is_default && (
                                        <button
                                            type='button'
                                            className='flex items-center gap-1 text-xs px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-md transition-colors'
                                            onClick={async () => {
                                                const res = await setDefaultPaymentMethod(method.id, userInfo.id)
                                                if (res.success) {
                                                    const methodsRes = await getUserPaymentMethods(userInfo.id)
                                                    if (methodsRes.success) {
                                                        setPaymentMethods(methodsRes.data.methods)
                                                    }
                                                    addNotification('Default payment method updated', 'SUCCESS')
                                                } else {
                                                    addNotification(res.error || 'Failed to set default', 'ERROR')
                                                }
                                            }}
                                        >
                                            <StarIcon size={12} />
                                            Set Default
                                        </button>
                                    )}
                                    <button
                                        type='button'
                                        className='flex items-center gap-1 text-xs px-2 py-1 bg-card hover:bg-muted rounded-md transition-colors'
                                        onClick={() => {
                                            setEditingPaymentMethod(method)
                                            setPaymentFormData({
                                                type: method.type,
                                                provider: method.provider || '',
                                                account_name: method.account_name || '',
                                                account_number: method.account_number || '',
                                                is_default: method.is_default,
                                            })
                                            setShowPaymentModal(true)
                                        }}
                                    >
                                        <PencilLineIcon size={12} />
                                        Edit
                                    </button>
                                    <button
                                        type='button'
                                        className='flex items-center gap-1 text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md transition-colors'
                                        onClick={async () => {
                                            if (confirm('Are you sure you want to delete this payment method?')) {
                                                const res = await deletePaymentMethod(method.id, userInfo.id)
                                                if (res.success) {
                                                    const methodsRes = await getUserPaymentMethods(userInfo.id)
                                                    if (methodsRes.success) {
                                                        setPaymentMethods(methodsRes.data.methods)
                                                    }
                                                    addNotification('Payment method deleted', 'SUCCESS')
                                                } else {
                                                    addNotification(res.error || 'Failed to delete', 'ERROR')
                                                }
                                            }
                                        }}
                                    >
                                        <Trash2Icon size={12} />
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>


            {userInfo.access_flags?.includes("artist") && (
                <div className='w-full bg-card border-2 border-border rounded-lg p-4 flex flex-col gap-2'>
                    <div className='w-full flex flex-row gap-2 justify-between font-semibold text-lg md:text-xl items-start'>
                        Artist Profile
                    </div>
                    <div className='w-full gap-2 grid grid-cols-1'>
                        <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                            Bio
                            {isEditProfile ? (
                                <textarea
                                    aria-label='Bio'
                                    value={artistProfile?.bio || ""}
                                    onChange={(e) =>
                                        setArtistProfile((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      bio: e.target.value,
                                                  }
                                                : {
                                                      id: userInfo.id,
                                                      bio: e.target.value,
                                                      tags: "",
                                                  }
                                        )
                                    }
                                    className='text-foreground text-base font-semibold bg-card rounded-md py-1 px-2 min-h-[100px]'
                                />
                            ) : (
                                <span className='text-foreground text-base font-semibold py-1 px-2 whitespace-pre-wrap'>
                                    {artistProfile?.bio || "No bio set"}
                                </span>
                            )}
                        </div>
                        <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                            Tags (comma separated)
                            {isEditProfile ? (
                                <input
                                    type='text'
                                    aria-label='Tags'
                                    value={artistProfile?.tags || ""}
                                    onChange={(e) =>
                                        setArtistProfile((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      tags: e.target.value,
                                                  }
                                                : {
                                                      id: userInfo.id,
                                                      bio: "",
                                                      tags: e.target.value,
                                                  }
                                        )
                                    }
                                    className='text-foreground text-base font-semibold bg-card rounded-md py-1 px-2'
                                />
                            ) : (
                                <span className='text-foreground text-base font-semibold py-1 px-2 flex flex-row gap-2'>
                                    {!artistProfile?.tags
                                        ? "No tags set"
                                        : renderTags({
                                              tags: artistProfile.tags,
                                          })}
                                </span>
                            )}
                        </div>
                        <div className='flex flex-col gap-1 text-left text-sm text-muted-foreground font-medium'>
                            Photos
                            <div className='flex flex-wrap gap-2 mt-1'>
                                {artistProfile?.photos?.map((photoId) => {
                                    const img = userImages.find(
                                        (i) => i.id === photoId
                                    )
                                    if (!img) return null
                                    return (
                                        <div
                                            key={photoId}
                                            className='relative w-20 h-20 rounded-md overflow-hidden border border-border group'
                                        >
                                            <Image
                                                src={img.url}
                                                alt={img.name}
                                                fill
                                                className='object-cover'
                                            />
                                            {isEditProfile && (
                                                <button
                                                    type='button'
                                                    onClick={() => {
                                                        setArtistProfile(
                                                            (prev) => {
                                                                if (!prev)
                                                                    return null
                                                                return {
                                                                    ...prev,
                                                                    photos: prev.photos?.filter(
                                                                        (id) =>
                                                                            id !==
                                                                            photoId
                                                                    ),
                                                                }
                                                            }
                                                        )
                                                    }}
                                                    className='absolute top-0 right-0 bg-red-500/80 hover:bg-red-500 p-0.5 rounded-bl-md transition-colors opacity-0 group-hover:opacity-100'
                                                    title='Remove photo'
                                                >
                                                    <XIcon
                                                        size={14}
                                                        className='text-foreground'
                                                    />
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                                {isEditProfile && (
                                    <button
                                        type='button'
                                        onClick={() =>
                                            setIsPhotoModalOpen(true)
                                        }
                                        className='w-20 h-20 rounded-md border-2 border-dashed border-border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground/70 hover:text-foreground'
                                    >
                                        + Add
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            

        </>
    )
}

function renderTags({ tags }: { tags: string }) {
    const tagsArray = tags.split(",").map((tag) => tag.trim())
    return tagsArray.map((tag, idx) => (
        <span
            key={`${tag}-${idx}`}
            className='text-foreground text-base font-semibold px-3 bg-blue-400/20 rounded-full select-none'
        >
            {tag}
        </span>
    ))
}
