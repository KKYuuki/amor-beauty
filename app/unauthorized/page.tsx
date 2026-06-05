import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export const metadata = {
    title: "Unauthorized — InkSight",
    description: "You don't have permission to access this page",
}

export default function UnauthorizedPage() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
            <ShieldAlert className="w-16 h-16 text-red-400" />
            <h1 className="text-2xl font-semibold text-white">Access Denied</h1>
            <p className="text-white/60 text-center max-w-md">
                You don&apos;t have permission to access this page.
                If you believe this is an error, please contact your administrator.
            </p>
            <Link
                href="/"
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            >
                Back to Dashboard
            </Link>
        </div>
    )
}
