"use client"

import { NotificationContext } from "@/components/notifications"
import { UserRoleType } from "@/utils/types/auth"
import { XIcon, EyeIcon, EyeClosedIcon, UserPlusIcon } from "lucide-react"
import { motion } from "motion/react"
import { useContext, useState } from "react"
import { createUser } from "@/server/actions/profile"

interface CreateUserModalProps {
    onClose: () => void
    onSuccess: () => void
}

export default function CreateUserModal({ onClose, onSuccess }: CreateUserModalProps) {
    const { addNotification } = useContext(NotificationContext)

    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [role, setRole] = useState<UserRoleType>("staff")
    const [isLoading, setIsLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const checkPasswordRequirements = (password: string) => ({
        length: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    })
    const reqs = checkPasswordRequirements(password)
    const allRequirementsMet = Object.values(reqs).every(Boolean)

    const handleSubmit = async () => {
        if (!fullName.trim()) {
            addNotification("Full name is required", "ERROR", "Missing Name")
            return
        }
        if (!email || !email.includes("@")) {
            addNotification("Please enter a valid email address", "ERROR", "Invalid Email")
            return
        }
        if (!allRequirementsMet) {
            addNotification("Password does not meet all requirements", "ERROR", "Invalid Password")
            return
        }

        setIsLoading(true)

        try {
            const result = await createUser({
                full_name: fullName,
                email,
                password,
                role,
            })
            
            if (result.success) {
                addNotification(result.message, "SUCCESS")
                onSuccess()
            } else {
                addNotification(result.message, "ERROR", "Error")
                setIsLoading(false)
            }
        } catch (_error) {
            addNotification("An error occurred while creating the user", "ERROR", "Error")
            setIsLoading(false)
        }
    }

    return (
        <motion.div
            key='create-modal'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className='fixed top-1/2 left-1/2 -translate-1/2 bg-black/90 border-2 border-white/10 rounded-3xl px-4 py-5 flex flex-col gap-4 w-lg max-w-[calc(100%-1rem)] z-10 max-h-[90vh] overflow-y-auto'
        >
            <div className='flex flex-row gap-4 items-center justify-between font-bold'>
                <div className='flex items-center gap-2'>
                    <UserPlusIcon size={20} className='text-green-400' />
                    Create User
                </div>
                <button
                    title='Close'
                    type='button'
                    className='p-1 transition-colors rounded-md bg-transparent hover:bg-white/10 cursor-pointer'
                    onClick={onClose}
                >
                    <XIcon size={18} />
                </button>
            </div>

            <p className='text-sm text-white/60'>
                Create a new user account manually. The user will be able to sign in immediately with the provided credentials.
            </p>

            <div className='flex flex-col gap-4'>
                <label className='flex flex-col gap-1 font-semibold text-sm text-white/40'>
                    Full Name
                    <input
                        type='text'
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder='John Doe'
                        className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal transition-colors hover:bg-white/10'
                    />
                </label>

                <label className='flex flex-col gap-1 font-semibold text-sm text-white/40'>
                    Email Address
                    <input
                        type='email'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder='user@example.com'
                        className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal transition-colors hover:bg-white/10'
                    />
                </label>

                <label className='flex flex-col gap-1 font-semibold text-sm text-white/40'>
                    Role
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRoleType)}
                        className='bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal cursor-pointer transition-colors hover:bg-white/10'
                    >
                        <option value='admin'>Admin</option>
                        <option value='manager'>Manager</option>
                        <option value='staff'>Staff</option>
                        <option value='artist'>Artist</option>
                        <option value='piercer'>Piercer</option>
                        <option value='shoe_tech'>Shoe Tech</option>
                    </select>
                </label>

                <label className='flex flex-col gap-1 font-semibold text-sm text-white/40'>
                    Password
                    <div className='flex items-center gap-2'>
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder='Enter secure password'
                            className='flex-1 bg-white/5 border-2 border-white/10 rounded-lg px-2 py-1 text-white font-normal transition-colors hover:bg-white/10'
                        />
                        <button
                            type='button'
                            onClick={() => setShowPassword(!showPassword)}
                            className='text-white/60 hover:text-white transition-colors cursor-pointer'
                        >
                            {showPassword ? <EyeIcon size={18} /> : <EyeClosedIcon size={18} />}
                        </button>
                    </div>
                </label>

                {password.length > 0 && (
                    <div className='bg-white/5 border-2 border-white/10 rounded-lg px-3 py-2 flex flex-col gap-1'>
                        <span className='text-white/60 font-bold text-xs tracking-wider uppercase mb-1'>
                            Password Requirements
                        </span>
                        <ul className='flex flex-col gap-0.5'>
                            <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.length ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${reqs.length ? "bg-blue-400" : "bg-white/20"}`}></span>
                                At least 12 characters
                            </li>
                            <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.uppercase ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${reqs.uppercase ? "bg-blue-400" : "bg-white/20"}`}></span>
                                One uppercase letter
                            </li>
                            <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.lowercase ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${reqs.lowercase ? "bg-blue-400" : "bg-white/20"}`}></span>
                                One lowercase letter
                            </li>
                            <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.number ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${reqs.number ? "bg-blue-400" : "bg-white/20"}`}></span>
                                One number
                            </li>
                            <li className={`text-xs flex items-center gap-2 transition-colors ${reqs.special ? "text-blue-400 font-medium" : "text-white/40"}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${reqs.special ? "bg-blue-400" : "bg-white/20"}`}></span>
                                One special character
                            </li>
                        </ul>
                    </div>
                )}
            </div>

            <div className='flex flex-row gap-2 justify-end mt-2'>
                <button
                    title='Cancel'
                    type='button'
                    className='bg-white/5 px-4 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-white/10'
                    onClick={onClose}
                    disabled={isLoading}
                >
                    Cancel
                </button>
                <button
                    title='Create User'
                    type='button'
                    className='bg-green-400/20 px-4 py-1 font-semibold border-2 border-white/10 rounded-lg cursor-pointer transition-colors hover:bg-green-400/30 disabled:opacity-50 disabled:cursor-not-allowed'
                    onClick={handleSubmit}
                    disabled={isLoading || !allRequirementsMet || !fullName.trim() || !email.includes("@")}
                >
                    {isLoading ? "Creating..." : "Create User"}
                </button>
            </div>
        </motion.div>
    )
}
